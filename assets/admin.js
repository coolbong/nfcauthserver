'use strict';

const SUPABASE_URL = 'https://jklfqmbaubvnbrbuhzak.supabase.co';
// 공개용 anon 키. 테이블은 service_role 전용이고 관리 기능은 admin 함수가 관리자 JWT로만 허용한다.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprbGZxbWJhdWJ2bmJyYnVoemFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5NzI5ODUsImV4cCI6MjEwNzU0ODk4NX0.0ctdDzKsvS9nOCyOfmI72PTNx4iyLXihLBEYuXdUzBc';
const ADMIN_API = `${SUPABASE_URL}/functions/v1/admin`;

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true },
});

const $ = (id) => document.getElementById(id);
const state = { tags: [], session: null };

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

const formatDate = (value) => (value ? new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '없음');
const tagTitle = (tag) => (tag.product_info && tag.product_info.cardName) || tag.tag_name;

function flash(message, kind = 'ok') {
  const box = $('flash');
  box.textContent = message;
  box.className = `notice ${kind}`;
  box.hidden = false;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => { box.hidden = true; }, 5000);
}

async function api(path, options = {}) {
  const { data } = await client.auth.getSession();
  if (!data.session) {
    showLogin();
    throw new Error('로그인이 필요합니다.');
  }
  const res = await fetch(`${ADMIN_API}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${data.session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch { /* 본문 없음 */ }
  if (res.status === 401) {
    await client.auth.signOut();
    showLogin('로그인이 만료되었습니다. 다시 로그인하세요.');
  }
  if (!res.ok || !body || body.success !== true) {
    throw new Error((body && body.message) || `요청이 실패했습니다. (HTTP ${res.status})`);
  }
  return body;
}

// ── 로그인 ──
function showLogin(message) {
  $('appView').hidden = true;
  $('loginView').hidden = false;
  $('loginError').hidden = !message;
  if (message) $('loginError').textContent = message;
  $('email').focus();
}

async function showApp(session) {
  state.session = session;
  $('whoEmail').textContent = session.user.email;
  $('loginView').hidden = true;
  $('appView').hidden = false;
  showView('tags');
  await loadTags();
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) return showLogin('이메일과 비밀번호를 입력하세요.');
  $('loginButton').disabled = true;
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  $('loginButton').disabled = false;
  if (error) return showLogin('이메일 또는 비밀번호가 올바르지 않습니다.');
  if (data.user.app_metadata?.role !== 'admin') {
    await client.auth.signOut();
    return showLogin('관리자 권한이 없는 계정입니다.');
  }
  $('password').value = '';
  await showApp(data.session);
});

$('logoutButton').addEventListener('click', async () => {
  await client.auth.signOut();
  showLogin();
});

// ── 화면 전환 ──
function showView(name) {
  $('tagsView').hidden = name !== 'tags';
  $('detailView').hidden = name !== 'detail';
  $('auditView').hidden = name !== 'audit';
  document.querySelectorAll('[data-view]').forEach((b) => {
    if (b.dataset.view === (name === 'detail' ? 'tags' : name)) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.view === 'audit') return loadAudit();
  showView('tags');
  loadTags();
}));

// ── 카드 목록 ──
function renderSkeleton(container, count) {
  container.replaceChildren(...Array.from({ length: count }, () => el('div', { class: 'skeleton', 'aria-hidden': 'true' })));
}

async function loadTags() {
  renderSkeleton($('tagList'), 4);
  try {
    state.tags = (await api('/tags')).tags;
    renderTags();
  } catch (err) {
    $('tagList').replaceChildren(el('p', { class: 'notice error', text: err.message }));
  }
}

function renderTags() {
  const query = $('search').value.trim().toLowerCase();
  const status = $('statusFilter').value;
  const tags = state.tags.filter((t) => (!status || t.status === status)
    && (!query || `${tagTitle(t)} ${t.tag_name} ${t.uid}`.toLowerCase().includes(query)));
  if (!tags.length) {
    $('tagList').replaceChildren(el('div', { class: 'empty', text: state.tags.length ? '조건에 맞는 카드가 없습니다.' : '등록된 카드가 없습니다.' }));
    return;
  }
  $('tagList').replaceChildren(...tags.map((tag) => el('button', { class: 'row', type: 'button', onclick: () => openDetail(tag.uid) },
    el('span', { class: 'name', text: tagTitle(tag) }),
    el('span', { class: `pill ${tag.status}`, text: tag.status }),
    el('span', { class: 'meta' },
      el('span', { class: 'mono', text: tag.uid }),
      el('span', { text: `카운터 ${tag.last_counter}` }),
      el('span', { text: `인증 ${tag.total_scans}회` }),
      el('span', { text: `키 ${tag.key_index}` })),
  )));
}

$('search').addEventListener('input', renderTags);
$('statusFilter').addEventListener('change', renderTags);

// ── 카드 상세 ──
async function openDetail(uid) {
  showView('detail');
  const view = $('detailView');
  view.replaceChildren(el('div', { class: 'skeleton', 'aria-hidden': 'true' }), el('div', { class: 'skeleton', 'aria-hidden': 'true' }));
  try {
    const { tag, logs } = await api(`/tags/${encodeURIComponent(uid)}`);
    renderDetail(tag, logs);
  } catch (err) {
    view.replaceChildren(backButton(), el('p', { class: 'notice error', text: err.message }));
  }
}

function backButton() {
  return el('div', {}, el('button', { class: 'btn quiet', type: 'button', text: '← 목록으로', onclick: () => { showView('tags'); loadTags(); } }));
}

function infoRows(info) {
  return Object.entries(info || {}).map(([key, value]) => ({
    key,
    type: typeof value === 'number' ? 'number' : typeof value === 'string' ? 'string' : 'json',
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

function renderKvEditor(container, rows) {
  const draw = () => {
    container.replaceChildren(...rows.map((row, index) => el('div', { class: 'kv-row' },
      el('span', { class: 'key mono', text: row.key }),
      el('input', {
        class: `input ${row.type === 'json' ? 'mono' : ''}`, value: row.value, 'aria-label': row.key,
        oninput: (e) => { rows[index].value = e.target.value; },
      }),
      el('button', { class: 'btn quiet', type: 'button', 'aria-label': `${row.key} 삭제`, text: '삭제', onclick: () => { rows.splice(index, 1); draw(); } }),
    )), el('div', { class: 'kv-row' },
      el('input', { class: 'input mono', id: 'newKey', placeholder: '새 항목 이름', 'aria-label': '새 항목 이름' }),
      el('input', { class: 'input', id: 'newValue', placeholder: '값', 'aria-label': '새 항목 값' }),
      el('button', {
        class: 'btn', type: 'button', text: '추가',
        onclick: () => {
          const key = $('newKey').value.trim();
          if (!key || rows.some((r) => r.key === key)) return flash(key ? `이미 있는 항목입니다: ${key}` : '항목 이름을 입력하세요.', 'error');
          rows.push({ key, type: 'string', value: $('newValue').value });
          draw();
        },
      })));
  };
  draw();
}

function rowsToObject(rows) {
  const result = {};
  for (const row of rows) {
    if (row.type === 'number') {
      const n = Number(row.value);
      if (row.value.trim() === '' || Number.isNaN(n)) throw new Error(`${row.key}는 숫자여야 합니다.`);
      result[row.key] = n;
    } else if (row.type === 'json') {
      try { result[row.key] = JSON.parse(row.value); } catch { throw new Error(`${row.key}의 JSON 형식이 올바르지 않습니다.`); }
    } else {
      result[row.key] = row.value;
    }
  }
  return result;
}

function logResult(log) {
  const cls = log.result_code === 'SUCCESS' ? 'ok-text' : log.result_code.startsWith('ADMIN') ? 'warn-text' : 'bad-text';
  return el('span', { class: cls, text: log.result_code });
}

function renderDetail(tag, logs) {
  const rows = infoRows(tag.product_info);
  const kv = el('div', { class: 'kv' });
  const nameInput = el('input', { class: 'input', id: 'tagName', value: tag.tag_name, maxlength: '100' });
  const statusSelect = el('select', { class: 'input', id: 'tagStatus' },
    ...['ACTIVE', 'SUSPENDED', 'REVOKED'].map((s) => el('option', { value: s, text: s, selected: s === tag.status })));
  const counterInput = el('input', { class: 'input', id: 'counterValue', type: 'number', min: String(tag.last_counter), max: '16777215', value: String(tag.last_counter) });

  const save = async (button) => {
    let productInfo;
    try { productInfo = rowsToObject(rows); } catch (err) { return flash(err.message, 'error'); }
    button.disabled = true;
    try {
      const { tag: updated } = await api(`/tags/${encodeURIComponent(tag.uid)}`, {
        method: 'PATCH',
        body: JSON.stringify({ tag_name: nameInput.value.trim(), status: statusSelect.value, product_info: productInfo }),
      });
      flash(`${tagTitle(updated)} 정보를 저장했습니다.`);
      await openDetail(tag.uid);
    } catch (err) {
      flash(err.message, 'error');
      button.disabled = false;
    }
  };

  $('detailView').replaceChildren(
    backButton(),
    el('section', { class: 'panel' },
      el('div', {},
        el('h2', { text: tagTitle(tag) }),
        el('p', { class: 'mono muted', text: tag.uid })),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { class: 'muted', text: '카운터' }), el('b', { text: String(tag.last_counter) })),
        el('div', { class: 'stat' }, el('span', { class: 'muted', text: '인증 횟수' }), el('b', { text: `${tag.total_scans}회` })),
        el('div', { class: 'stat' }, el('span', { class: 'muted', text: '최초 인증' }), el('b', { text: formatDate(tag.first_verified_at) })),
        el('div', { class: 'stat' }, el('span', { class: 'muted', text: '키 번호' }), el('b', { text: String(tag.key_index) })))),
    el('section', { class: 'panel', 'aria-labelledby': 'editTitle' },
      el('h2', { id: 'editTitle', text: '정보 수정' }),
      el('div', { class: 'field' }, el('label', { for: 'tagName', text: '카드명 (tag_name)' }), nameInput),
      el('div', { class: 'field' }, el('label', { for: 'tagStatus', text: '상태' }), statusSelect),
      el('div', { class: 'field' }, el('label', { text: '제품 정보 (product_info)' }), kv),
      el('div', { class: 'actions' }, el('button', { class: 'btn primary', type: 'button', text: '저장', onclick: (e) => save(e.currentTarget) }))),
    el('section', { class: 'panel danger-zone', 'aria-labelledby': 'counterTitle' },
      el('h2', { id: 'counterTitle', text: '카운터 관리' }),
      el('p', { class: 'muted', text: '리셋하면 이미 사용된 링크가 다시 정품으로 통과합니다. 카운터 지정은 현재 값 이상으로만 할 수 있습니다.' }),
      el('div', { class: 'field' }, el('label', { for: 'counterValue', text: '카운터 지정' }), counterInput),
      el('div', { class: 'actions' },
        el('button', { class: 'btn', type: 'button', text: '카운터 지정', onclick: () => setCounter(tag, counterInput.value) }),
        el('button', { class: 'btn danger', type: 'button', text: '카운터 리셋', onclick: () => resetCounter(tag) }))),
    el('section', { class: 'panel', 'aria-labelledby': 'logTitle' },
      el('h2', { id: 'logTitle', text: '최근 인증 기록 (50건)' }),
      logs.length
        ? el('div', { class: 'scroll' }, el('table', { class: 'table' },
          el('thead', {}, el('tr', {}, el('th', { text: '시각' }), el('th', { text: '결과' }), el('th', { text: '카운터' }))),
          el('tbody', {}, ...logs.map((log) => el('tr', {},
            el('td', { text: formatDate(log.scanned_at) }), el('td', {}, logResult(log)), el('td', { class: 'mono', text: String(log.counter) }))))))
        : el('div', { class: 'empty', text: '아직 인증 기록이 없습니다.' })),
  );
  renderKvEditor(kv, rows);
}

// ── 카운터 ──
function confirmWithCode({ title, text, label, code }) {
  return new Promise((resolve) => {
    const dialog = $('confirmDialog');
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    $('confirmLabel').textContent = label;
    $('confirmInput').value = '';
    $('confirmOk').disabled = true;
    $('confirmInput').oninput = () => { $('confirmOk').disabled = $('confirmInput').value.trim().toUpperCase() !== code; };
    dialog.onclose = () => resolve(dialog.returnValue === 'ok' && $('confirmInput').value.trim().toUpperCase() === code);
    dialog.showModal();
    $('confirmInput').focus();
  });
}

async function resetCounter(tag) {
  const code = tag.uid.slice(-6);
  const ok = await confirmWithCode({
    title: '카운터를 0으로 리셋할까요',
    text: `${tagTitle(tag)}의 카운터와 인증 횟수가 0이 되고, 이미 사용된 링크가 다시 정품으로 통과합니다.`,
    label: `확인을 위해 UID 끝 6자리(${code})를 입력하세요`,
    code,
  });
  if (!ok) return;
  try {
    await api(`/tags/${encodeURIComponent(tag.uid)}/reset`, { method: 'POST' });
    flash(`${tagTitle(tag)}의 카운터를 0으로 리셋했습니다.`);
    await openDetail(tag.uid);
  } catch (err) {
    flash(err.message, 'error');
  }
}

async function setCounter(tag, raw) {
  const counter = Number(raw);
  if (!Number.isInteger(counter) || counter < tag.last_counter || counter > 16777215) {
    return flash(`카운터는 ${tag.last_counter} 이상 16777215 이하의 정수여야 합니다.`, 'error');
  }
  try {
    await api(`/tags/${encodeURIComponent(tag.uid)}/counter`, { method: 'POST', body: JSON.stringify({ counter }) });
    flash(`${tagTitle(tag)}의 카운터를 ${counter}로 지정했습니다.`);
    await openDetail(tag.uid);
  } catch (err) {
    flash(err.message, 'error');
  }
}

// ── 변경 기록 ──
const ACTION_LABEL = { UPDATE_TAG: '정보 수정', RESET_COUNTER: '카운터 리셋', SET_COUNTER: '카운터 지정' };

function describeChange(log) {
  if (log.action !== 'UPDATE_TAG') return `${log.before?.last_counter ?? '?'} → ${log.after?.last_counter ?? '?'}`;
  const changed = ['tag_name', 'status', 'product_info'].filter((k) => JSON.stringify(log.before?.[k]) !== JSON.stringify(log.after?.[k]));
  return changed.length ? `${changed.join(', ')} 변경` : '변경 없음';
}

async function loadAudit() {
  showView('audit');
  renderSkeleton($('auditBody'), 3);
  try {
    const { logs } = await api('/audit');
    if (!logs.length) return $('auditBody').replaceChildren(el('div', { class: 'empty', text: '아직 변경 기록이 없습니다.' }));
    $('auditBody').replaceChildren(el('table', { class: 'table' },
      el('thead', {}, el('tr', {}, ...['시각', '작업', '카드', '내용', '관리자'].map((h) => el('th', { text: h })))),
      el('tbody', {}, ...logs.map((log) => el('tr', {},
        el('td', { text: formatDate(log.created_at) }),
        el('td', { text: ACTION_LABEL[log.action] || log.action }),
        el('td', { class: 'mono', title: log.uid, text: `…${log.uid.slice(-8)}` }),
        el('td', { text: describeChange(log) }),
        el('td', { text: log.actor_email }))))));
  } catch (err) {
    $('auditBody').replaceChildren(el('p', { class: 'notice error', text: err.message }));
  }
}

// ── 비밀번호 변경 ──
$('passwordButton').addEventListener('click', () => {
  $('newPassword').value = '';
  $('passwordError').hidden = true;
  $('passwordDialog').showModal();
});

$('passwordSave').addEventListener('click', async () => {
  const password = $('newPassword').value;
  const fail = (message) => { $('passwordError').textContent = message; $('passwordError').hidden = false; };
  if (password.length < 16) return fail('비밀번호는 16자 이상이어야 합니다.');
  $('passwordSave').disabled = true;
  const { error } = await client.auth.updateUser({ password });
  $('passwordSave').disabled = false;
  if (error) return fail(`비밀번호를 바꾸지 못했습니다. ${error.message}`);
  $('passwordDialog').close();
  flash('비밀번호를 변경했습니다.');
});

// ── 시작 ──
client.auth.getSession().then(({ data }) => {
  if (data.session && data.session.user.app_metadata?.role === 'admin') showApp(data.session);
  else showLogin();
});
