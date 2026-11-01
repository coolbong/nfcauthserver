// supabase/functions/auth/index.ts
// v2 NFC Authentication 보안 인증 엔드포인트 (/functions/v2/auth 또는 /v1/auth)
// 단일 파라미터 BER-TLV (DF61: id, DF62: otp, DF63: count) 파싱 및 RFC 4226 HOTP 동적 검증
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import {
  parseAuthTlv,
  verifyHotp,
  decryptNfcKeyFromDb,
  hexToBytes
} from './crypto.ts';
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
  }

  const url = new URL(req.url);
  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  const format = url.searchParams.get('format') || (req.headers.get('accept')?.includes('application/json') ? 'json' : 'html');

  // 응답 헬퍼 함수
  const sendResponse = (
    statusCode: number,
    resultCode: 'SUCCESS' | 'COUNTER_REPLAY' | 'INVALID_OTP' | 'TAG_NOT_FOUND' | 'TAG_INACTIVE' | 'BAD_REQUEST' | 'SERVER_ERROR',
    data: {
      message?: string;
      uid?: string;
      counter?: number;
      otp?: string;
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
          version: 'v2',
          authType: 'HOTP',
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
      uid: data.uid,
      counter: data.counter,
      otp: data.otp,
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

  try {
    // 1. 단일 TLV 파라미터 추출 (GET / POST 다중 포맷 유연 지원)
    let rawTlv: string | null = null;

    if (req.method === 'GET') {
      // 쿼리 파라미터에서 추출: ?data=..., ?tlv=..., ?p=..., ?param=...
      rawTlv = url.searchParams.get('data') ||
               url.searchParams.get('tlv') ||
               url.searchParams.get('p') ||
               url.searchParams.get('param') ||
               url.searchParams.get('d') ||
               url.searchParams.get('q');

      // 파라미터 키를 지정하지 않고 ?DF61... 형태로 넘겨진 경우
      if (!rawTlv) {
        for (const [key, value] of url.searchParams.entries()) {
          if (key.toLowerCase() === 'format') continue;
          if (key.toUpperCase().startsWith('DF61') || key.toUpperCase().includes('DF61')) {
            rawTlv = key;
            break;
          } else if (value.toUpperCase().startsWith('DF61') || value.toUpperCase().includes('DF61')) {
            rawTlv = value;
            break;
          }
        }
      }

      // format 파라미터 이외의 다른 단일 파라미터가 있을 경우 fallback
      if (!rawTlv) {
        for (const [key, value] of url.searchParams.entries()) {
          if (key.toLowerCase() === 'format') continue;
          if (value && /^[0-9A-Fa-f]{6,}$/.test(value)) {
            rawTlv = value;
            break;
          } else if (key && /^[0-9A-Fa-f]{6,}$/.test(key)) {
            rawTlv = key;
            break;
          }
        }
      }
    } else if (req.method === 'POST') {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await req.json().catch(() => ({}));
        rawTlv = body.data || body.tlv || body.p || body.param || body.payload || (typeof body === 'string' ? body : null);
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await req.formData().catch(() => null);
        if (formData) {
          rawTlv = (formData.get('data') || formData.get('tlv') || formData.get('p') || formData.get('param')) as string;
        }
      } else {
        // text/plain 또는 raw body
        const textBody = await req.text().catch(() => '');
        rawTlv = textBody.trim();
      }
    }

    if (!rawTlv || rawTlv.trim().length === 0) {
      return sendResponse(400, 'BAD_REQUEST', {
        message: 'TLV 파라미터가 전달되지 않았습니다. (예: ?data=DF610704DE5F1EACC040DF62040001E240DF6303000001)'
      });
    }

    // 2. BER-TLV 파싱 (DF61: id, DF62: otp, DF63: count)
    let parsedPayload;
    try {
      parsedPayload = parseAuthTlv(rawTlv);
    } catch (parseErr: unknown) {
      const err = parseErr as Error;
      return sendResponse(400, 'BAD_REQUEST', {
        message: `TLV 파싱 실패: ${err.message}`
      });
    }

    const { id, otp, counter } = parsedPayload;

    // 3. DB에서 태그 마스터 정보 조회
    const { data: tag, error: fetchError } = await supabase
      .from('nfc_tags')
      .select('uid, tag_name, key_index, last_counter, status, product_info, total_scans, first_verified_at')
      .ilike('uid', id)
      .maybeSingle();

    if (fetchError) {
      console.error('Database fetch error:', fetchError);
      return sendResponse(500, 'SERVER_ERROR', { message: '데이터베이스 조회 중 오류가 발생했습니다.' });
    }

    if (!tag) {
      // 미등록 태그 로그 기록
      await supabase.rpc('verify_and_log_nfc_scan', {
        p_uid: id,
        p_key_index: 0,
        p_counter: counter,
        p_received_mac: `OTP:${otp}`,
        p_is_valid: false,
        p_result_code: 'TAG_NOT_FOUND',
        p_client_ip: clientIp,
        p_user_agent: userAgent
      });
      return sendResponse(404, 'TAG_NOT_FOUND', { uid: id, counter, otp });
    }

    if (tag.status !== 'ACTIVE') {
      await supabase.rpc('verify_and_log_nfc_scan', {
        p_uid: id,
        p_key_index: tag.key_index,
        p_counter: counter,
        p_received_mac: `OTP:${otp}`,
        p_is_valid: false,
        p_result_code: 'TAG_INACTIVE',
        p_client_ip: clientIp,
        p_user_agent: userAgent
      });
      return sendResponse(403, 'TAG_INACTIVE', { uid: id, counter, otp, tagName: tag.tag_name });
    }

    // 4. 카운터 검증 (리플레이 공격 방어)
    if (counter <= tag.last_counter) {
      await supabase.rpc('verify_and_log_nfc_scan', {
        p_uid: id,
        p_key_index: tag.key_index,
        p_counter: counter,
        p_received_mac: `OTP:${otp}`,
        p_is_valid: false,
        p_result_code: 'COUNTER_REPLAY',
        p_client_ip: clientIp,
        p_user_agent: userAgent
      });

      return sendResponse(409, 'COUNTER_REPLAY', {
        uid: id,
        counter,
        otp,
        tagName: tag.tag_name,
        totalScans: tag.total_scans,
        firstVerifiedAt: tag.first_verified_at,
        productInfo: tag.product_info
      });
    }

    // 5. DB에서 해당 인덱스의 암호화된 키 정보 조회
    const { data: keyRecord, error: keyError } = await supabase
      .from('nfc_keys')
      .select('key_index, encrypted_key, key_iv, key_tag, status')
      .eq('key_index', tag.key_index)
      .maybeSingle();

    if (keyError || !keyRecord) {
      console.error('Key record not found for index:', tag.key_index, keyError);
      return sendResponse(500, 'SERVER_ERROR', { message: `키 인덱스(#${tag.key_index})를 찾을 수 없습니다.` });
    }

    if (keyRecord.status !== 'ACTIVE') {
      return sendResponse(403, 'TAG_INACTIVE', { message: `키(#${tag.key_index})가 비활성화 상태입니다.` });
    }

    // 6. DB의 암호화된 키를 KEK로 일시 복호화
    let plainNfcKeyHex: string;
    try {
      plainNfcKeyHex = await decryptNfcKeyFromDb(
        keyRecord.encrypted_key,
        keyRecord.key_iv,
        keyRecord.key_tag,
        masterKek
      );
    } catch (decryptErr) {
      console.error('Key decryption error (KEK mismatch):', decryptErr);
      return sendResponse(500, 'SERVER_ERROR', { message: '보안 키 복호화에 실패했습니다 (KEK 설정 확인 필요).' });
    }

    // 7. RFC 4226 HOTP 일치 여부 검증
    const keyBytes = hexToBytes(plainNfcKeyHex);
    const hotpValidation = verifyHotp(keyBytes, counter, otp);

    if (!hotpValidation.isValid) {
      await supabase.rpc('verify_and_log_nfc_scan', {
        p_uid: id,
        p_key_index: tag.key_index,
        p_counter: counter,
        p_received_mac: `OTP:${otp}`,
        p_is_valid: false,
        p_result_code: 'INVALID_OTP',
        p_client_ip: clientIp,
        p_user_agent: userAgent
      });

      return sendResponse(401, 'INVALID_OTP', {
        uid: id,
        counter,
        otp,
        tagName: tag.tag_name,
        message: 'HOTP 일회용 비밀번호 검증에 실패했습니다. (불일치)'
      });
    }

    // 8. 검증 성공 -> 원자적 카운터 및 로그 갱신 (PostgreSQL Stored Procedure)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('verify_and_log_nfc_scan', {
      p_uid: id,
      p_key_index: tag.key_index,
      p_counter: counter,
      p_received_mac: `OTP:${otp}`,
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
      return sendResponse(409, code, {
        uid: id,
        counter,
        otp,
        tagName: tag.tag_name,
        totalScans: tag.total_scans,
        firstVerifiedAt: tag.first_verified_at,
        productInfo: tag.product_info
      });
    }

    // 9. 정품 인증 완료 성공 응답!
    return sendResponse(200, 'SUCCESS', {
      uid: id,
      counter,
      otp,
      tagName: verification.tag_name,
      totalScans: verification.total_scans,
      firstVerifiedAt: verification.first_verified_at,
      productInfo: verification.product_info
    });

  } catch (err: unknown) {
    const error = err as Error;
    console.error('Unhandled server error in auth function:', error);
    return sendResponse(500, 'SERVER_ERROR', { message: error.message || '서버 오류가 발생했습니다.' });
  }
});
