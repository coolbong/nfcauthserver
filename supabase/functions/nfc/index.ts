// supabase/functions/nfc/index.ts
// NTAG 424 DNA NFC 보안 인증 엔드포인트 (/v1/nfc)
// DB 키 암호화(Envelope Encryption), 다중 키(Key Index), 3B/6B 카운터 지원
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { verifyNtag424Mac, decryptNfcKeyFromDb } from './crypto.ts';
import { renderVerificationPage } from './views.ts';

// Supabase 클라이언트 초기화
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const defaultKek = '0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF';
const masterKek = Deno.env.get('NFC_KEK') || defaultKek;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

Deno.serve(async (req: Request) => {
  // CORS 프리플라이트 처리
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
  }

  const url = new URL(req.url);
  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  // 1. 파라미터 추출
  const uidRaw = url.searchParams.get('uid');
  const cntRaw = url.searchParams.get('cnt') || url.searchParams.get('ctr');
  const macRaw = url.searchParams.get('mac') || url.searchParams.get('c');
  const kidRaw = url.searchParams.get('kid') || url.searchParams.get('kno') || url.searchParams.get('k');
  const format = url.searchParams.get('format') || (req.headers.get('accept')?.includes('application/json') ? 'json' : 'html');

  // 응답 헬퍼 함수
  const sendResponse = (
    statusCode: number,
    resultCode: 'SUCCESS' | 'COUNTER_REPLAY' | 'INVALID_MAC' | 'TAG_NOT_FOUND' | 'TAG_INACTIVE' | 'BAD_REQUEST' | 'SERVER_ERROR',
    data: {
      message?: string;
      uid?: string;
      counter?: number;
      tagName?: string;
      totalScans?: number;
      firstVerifiedAt?: string | null;
      productInfo?: Record<string, unknown> | null;
    } = {}
  ) => {
    if (format === 'json') {
      const jsonHeaders = new Headers({
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*'
      });
      return new Response(
        JSON.stringify({
          success: resultCode === 'SUCCESS',
          resultCode,
          ...data
        }),
        {
          status: statusCode,
          headers: jsonHeaders
        }
      );
    }

    const html = renderVerificationPage({
      resultCode,
      uid: data.uid || uidRaw || undefined,
      counter: data.counter,
      tagName: data.tagName,
      totalScans: data.totalScans,
      firstVerifiedAt: data.firstVerifiedAt,
      productInfo: data.productInfo,
      errorMessage: data.message
    });

    const htmlHeaders = new Headers({
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'access-control-allow-origin': '*'
    });

    return new Response(html, {
      status: statusCode,
      headers: htmlHeaders
    });
  };

  // 2. 필수 파라미터 검사
  if (!uidRaw || !cntRaw || !macRaw) {
    return sendResponse(400, 'BAD_REQUEST', {
      message: '필수 파라미터(uid, cnt, mac)가 누락되었습니다.'
    });
  }

  const uid = uidRaw.trim().toLowerCase();
  const cnt = cntRaw.trim();
  const mac = macRaw.trim().toUpperCase();
  const urlKeyIndex = kidRaw ? parseInt(kidRaw, 10) : null;

  if (!/^[0-9a-f]{14}$/i.test(uid)) {
    return sendResponse(400, 'BAD_REQUEST', {
      message: 'UID 형식이 올바르지 않습니다 (14자리 Hex 필요).'
    });
  }

  // 3바이트(6자리 Hex) 카운터 필수 검사
  if (!/^[0-9a-f]{6}$/i.test(cnt)) {
    return sendResponse(400, 'BAD_REQUEST', {
      message: '카운터 형식이 올바르지 않습니다 (6자리 Hex / 3바이트 필요).'
    });
  }

  if (!/^[0-9a-f]{16}$/i.test(mac) && !/^[0-9a-f]{32}$/i.test(mac)) {
    return sendResponse(400, 'BAD_REQUEST', {
      message: 'MAC 형식이 올바르지 않습니다 (16자리 또는 32자리 Hex 필요).'
    });
  }

  try {
    // 3. DB에서 태그 마스터 정보 조회
    const { data: tag, error: fetchError } = await supabase
      .from('nfc_tags')
      .select('uid, tag_name, key_index, last_counter, status, product_info, total_scans, first_verified_at')
      .eq('uid', uid)
      .maybeSingle();

    if (fetchError) {
      console.error('Database fetch error:', fetchError);
      return sendResponse(500, 'SERVER_ERROR', { message: '데이터베이스 조회 중 오류가 발생했습니다.' });
    }

    if (!tag) {
      await supabase.rpc('verify_and_log_nfc_scan', {
        p_uid: uid,
        p_key_index: urlKeyIndex || 0,
        p_counter: 0,
        p_received_mac: mac,
        p_is_valid: false,
        p_result_code: 'TAG_NOT_FOUND',
        p_client_ip: clientIp,
        p_user_agent: userAgent
      });
      return sendResponse(404, 'TAG_NOT_FOUND', { uid });
    }

    if (tag.status !== 'ACTIVE') {
      await supabase.rpc('verify_and_log_nfc_scan', {
        p_uid: uid,
        p_key_index: tag.key_index,
        p_counter: 0,
        p_received_mac: mac,
        p_is_valid: false,
        p_result_code: 'TAG_INACTIVE',
        p_client_ip: clientIp,
        p_user_agent: userAgent
      });
      return sendResponse(403, 'TAG_INACTIVE', { uid, tagName: tag.tag_name });
    }

    // 4. 적용할 키 인덱스 결정
    const effectiveKeyIndex = (urlKeyIndex !== null && !isNaN(urlKeyIndex)) ? urlKeyIndex : tag.key_index;

    // 5. DB에서 해당 인덱스의 암호화된 키 정보 조회
    const { data: keyRecord, error: keyError } = await supabase
      .from('nfc_keys')
      .select('key_index, encrypted_key, key_iv, key_tag, status')
      .eq('key_index', effectiveKeyIndex)
      .maybeSingle();

    if (keyError || !keyRecord) {
      console.error('Key record not found for index:', effectiveKeyIndex, keyError);
      return sendResponse(500, 'SERVER_ERROR', { message: `키 인덱스(#${effectiveKeyIndex})를 찾을 수 없습니다.` });
    }

    if (keyRecord.status !== 'ACTIVE') {
      return sendResponse(403, 'TAG_INACTIVE', { message: `키(#${effectiveKeyIndex})가 비활성화 상태입니다.` });
    }

    // 6. DB의 암호화된 키를 KEK로 일시 복호화
    let plainNtagKeyHex: string;
    try {
      plainNtagKeyHex = await decryptNfcKeyFromDb(
        keyRecord.encrypted_key,
        keyRecord.key_iv,
        keyRecord.key_tag,
        masterKek
      );
    } catch (decryptErr) {
      console.error('Key decryption error (KEK mismatch):', decryptErr);
      return sendResponse(500, 'SERVER_ERROR', { message: '보안 키 복호화에 실패했습니다 (KEK 설정 확인 필요).' });
    }

    // 7. NTAG 424 DNA 암호학적 CMAC 서명 검증
    const cryptoResult = verifyNtag424Mac(uid, cnt, mac, plainNtagKeyHex);

    if (!cryptoResult.isValid) {
      await supabase.rpc('verify_and_log_nfc_scan', {
        p_uid: uid,
        p_key_index: effectiveKeyIndex,
        p_counter: cryptoResult.counter,
        p_received_mac: mac,
        p_is_valid: false,
        p_result_code: 'INVALID_MAC',
        p_client_ip: clientIp,
        p_user_agent: userAgent
      });

      return sendResponse(401, 'INVALID_MAC', {
        uid,
        counter: cryptoResult.counter,
        tagName: tag.tag_name,
        message: '태그 암호화 서명이 일치하지 않습니다.'
      });
    }

    // 8. 원자적 카운터 검증 및 갱신 (PostgreSQL Stored Procedure)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('verify_and_log_nfc_scan', {
      p_uid: uid,
      p_key_index: effectiveKeyIndex,
      p_counter: cryptoResult.counter,
      p_received_mac: mac,
      p_is_valid: true,
      p_result_code: 'SUCCESS',
      p_client_ip: clientIp,
      p_user_agent: userAgent
    });

    if (rpcError) {
      console.error('RPC Execution error:', rpcError);
      return sendResponse(500, 'SERVER_ERROR', { message: '인증 트랜잭션 처리 중 오류가 발생했습니다.' });
    }

    const verification = rpcResult && rpcResult[0] ? rpcResult[0] : null;

    if (!verification || !verification.success) {
      const code = verification?.result_code || 'COUNTER_REPLAY';
      if (code === 'COUNTER_REPLAY') {
        return sendResponse(409, 'COUNTER_REPLAY', {
          uid,
          counter: cryptoResult.counter,
          tagName: tag.tag_name,
          totalScans: tag.total_scans,
          firstVerifiedAt: tag.first_verified_at,
          productInfo: tag.product_info
        });
      }
      return sendResponse(400, code, { uid, message: code });
    }

    // 9. 모든 검증 성공 (정품 인증 완료!)
    return sendResponse(200, 'SUCCESS', {
      uid,
      counter: cryptoResult.counter,
      tagName: verification.tag_name,
      totalScans: verification.total_scans,
      firstVerifiedAt: verification.first_verified_at,
      productInfo: verification.product_info
    });

  } catch (err: unknown) {
    const error = err as Error;
    console.error('Unhandled server error:', error);
    return sendResponse(500, 'SERVER_ERROR', { message: error.message || '서버 오류가 발생했습니다.' });
  }
});
