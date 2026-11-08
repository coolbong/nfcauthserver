// supabase/functions/admin/index.ts
// 카드 관리자 API (/functions/v1/admin). 관리자(app_metadata.role === 'admin')만 호출할 수 있다.
import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  { auth: { persistSession: false } }
);

const ALLOWED_ORIGINS = new Set([
  'https://nfcauth.vercel.app',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

const TAG_STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'REVOKED']);
const MAX_PRODUCT_INFO_BYTES = 8 * 1024;
const MAX_COUNTER = 0xFFFFFF;
const UID_PATTERN = /^[0-9A-F]{14,64}$/;

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  return {
    ...(ALLOWED_ORIGINS.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
    'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders(req) },
  });
}

async function requireAdmin(req: Request): Promise<User> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', '로그인이 필요합니다.');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'UNAUTHENTICATED', '로그인이 만료되었거나 유효하지 않습니다.');
  if (data.user.app_metadata?.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', '관리자 권한이 없습니다.');
  return data.user;
}

function parseUid(raw: string): string {
  const uid = decodeURIComponent(raw).trim().toUpperCase();
  if (!UID_PATTERN.test(uid)) throw new HttpError(400, 'INVALID_UID', 'UID 형식이 올바르지 않습니다.');
  return uid;
}

function validateImageUrl(value: unknown) {
  if (value === undefined || value === null || value === '') return;
  if (typeof value !== 'string') throw new HttpError(400, 'INVALID_FIELD', 'imageUrl은 문자열이어야 합니다.');
  if (/^assets\/[A-Za-z0-9_\-/]+\.(jpg|jpeg|png|webp)$/.test(value)) return;
  try {
    if (new URL(value).protocol === 'https:') return;
  } catch { /* fall through */ }
  throw new HttpError(400, 'INVALID_FIELD', 'imageUrl은 assets/ 아래 이미지나 https 주소만 허용합니다.');
}

function parseTagPatch(body: Record<string, unknown>) {
  const allowed = new Set(['tag_name', 'status', 'product_info']);
  const unknown = Object.keys(body).filter((k) => !allowed.has(k));
  if (unknown.length) throw new HttpError(400, 'INVALID_FIELD', `수정할 수 없는 항목입니다: ${unknown.join(', ')}`);

  const { tag_name, status, product_info } = body;
  if (tag_name !== undefined && (typeof tag_name !== 'string' || !tag_name.trim() || tag_name.length > 100)) {
    throw new HttpError(400, 'INVALID_FIELD', '카드명은 1자 이상 100자 이하여야 합니다.');
  }
  if (status !== undefined && (typeof status !== 'string' || !TAG_STATUSES.has(status))) {
    throw new HttpError(400, 'INVALID_FIELD', '상태는 ACTIVE, SUSPENDED, REVOKED 중 하나여야 합니다.');
  }
  if (product_info !== undefined) {
    if (product_info === null || typeof product_info !== 'object' || Array.isArray(product_info)) {
      throw new HttpError(400, 'INVALID_FIELD', 'product_info는 JSON 객체여야 합니다.');
    }
    if (new TextEncoder().encode(JSON.stringify(product_info)).length > MAX_PRODUCT_INFO_BYTES) {
      throw new HttpError(400, 'INVALID_FIELD', 'product_info는 8KB 이하여야 합니다.');
    }
    validateImageUrl((product_info as Record<string, unknown>).imageUrl);
  }
  if (tag_name === undefined && status === undefined && product_info === undefined) {
    throw new HttpError(400, 'INVALID_FIELD', '수정할 항목이 없습니다.');
  }
  return {
    p_tag_name: typeof tag_name === 'string' ? tag_name.trim() : null,
    p_status: status ?? null,
    p_product_info: product_info ?? null,
  };
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch { /* fall through */ }
  throw new HttpError(400, 'INVALID_JSON', '요청 본문은 JSON 객체여야 합니다.');
}

async function callRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (!error) return data;
  if (error.message.includes('TAG_NOT_FOUND')) throw new HttpError(404, 'TAG_NOT_FOUND', '등록되지 않은 UID입니다.');
  if (error.message.includes('COUNTER_OUT_OF_RANGE')) {
    throw new HttpError(400, 'COUNTER_OUT_OF_RANGE', '카운터는 현재 값 이상, 16777215 이하로만 지정할 수 있습니다.');
  }
  console.error(`${name} 실패:`, error);
  throw new HttpError(500, 'SERVER_ERROR', '처리 중 오류가 발생했습니다.');
}

async function route(req: Request, user: User): Promise<unknown> {
  const path = new URL(req.url).pathname.replace(/^.*\/admin/, '') || '/';
  const actor = { p_actor_id: user.id, p_actor_email: user.email || user.id };

  if (req.method === 'GET' && path === '/tags') {
    const { data, error } = await supabase
      .from('nfc_tags')
      .select('uid, tag_name, key_index, last_counter, total_scans, status, product_info, first_verified_at, updated_at')
      .order('created_at');
    if (error) throw new HttpError(500, 'SERVER_ERROR', '카드 목록을 불러오지 못했습니다.');
    return { tags: data };
  }

  if (req.method === 'GET' && path === '/audit') {
    const { data, error } = await supabase
      .from('admin_audit_logs')
      .select('id, actor_email, action, uid, before, after, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new HttpError(500, 'SERVER_ERROR', '감사 로그를 불러오지 못했습니다.');
    return { logs: data };
  }

  const tagRoute = path.match(/^\/tags\/([^/]+)(\/reset|\/counter)?$/);
  if (!tagRoute) throw new HttpError(404, 'NOT_FOUND', '지원하지 않는 경로입니다.');
  const uid = parseUid(tagRoute[1]);
  const action = tagRoute[2];

  if (req.method === 'GET' && !action) {
    const [tag, logs] = await Promise.all([
      supabase
        .from('nfc_tags')
        .select('uid, tag_name, key_index, last_counter, total_scans, status, product_info, first_verified_at, created_at, updated_at')
        .eq('uid', uid)
        .maybeSingle(),
      supabase
        .from('nfc_scan_logs')
        .select('id, counter, is_valid, result_code, scanned_at')
        .eq('uid', uid)
        .order('scanned_at', { ascending: false })
        .limit(50),
    ]);
    if (tag.error || logs.error) throw new HttpError(500, 'SERVER_ERROR', '카드 정보를 불러오지 못했습니다.');
    if (!tag.data) throw new HttpError(404, 'TAG_NOT_FOUND', '등록되지 않은 UID입니다.');
    return { tag: tag.data, logs: logs.data };
  }

  if (req.method === 'PATCH' && !action) {
    const patch = parseTagPatch(await readJson(req));
    return { tag: await callRpc('admin_update_tag', { p_uid: uid, ...patch, ...actor }) };
  }

  if (req.method === 'POST' && action === '/reset') {
    return { tag: await callRpc('admin_reset_tag', { p_uid: uid, ...actor }) };
  }

  if (req.method === 'POST' && action === '/counter') {
    const { counter } = await readJson(req);
    if (!Number.isInteger(counter) || (counter as number) < 0 || (counter as number) > MAX_COUNTER) {
      throw new HttpError(400, 'COUNTER_OUT_OF_RANGE', '카운터는 0 이상 16777215 이하의 정수여야 합니다.');
    }
    return { tag: await callRpc('admin_set_counter', { p_uid: uid, p_counter: counter, ...actor }) };
  }

  throw new HttpError(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청입니다.');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    const user = await requireAdmin(req);
    return json(req, 200, { success: true, ...(await route(req, user) as Record<string, unknown>) });
  } catch (err) {
    if (err instanceof HttpError) return json(req, err.status, { success: false, code: err.code, message: err.message });
    console.error('admin 함수 오류:', err);
    return json(req, 500, { success: false, code: 'SERVER_ERROR', message: '서버 오류가 발생했습니다.' });
  }
});
