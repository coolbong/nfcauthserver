// supabase/functions/nfc/views.ts
// 스마트폰 브라우저에 표시할 모바일 최적화 반응형 정품 인증 결과 웹페이지 템플릿
// 및 디지털 정품 보증서(Certificate of Authenticity) 연동

export interface ViewParams {
  resultCode: 'SUCCESS' | 'COUNTER_REPLAY' | 'INVALID_MAC' | 'TAG_NOT_FOUND' | 'TAG_INACTIVE' | 'BAD_REQUEST' | 'SERVER_ERROR';
  uid?: string;
  counter?: number;
  tagName?: string;
  totalScans?: number;
  firstVerifiedAt?: string | null;
  productInfo?: Record<string, unknown> | null;
  errorMessage?: string;
}

export function renderVerificationPage(params: ViewParams): string {
  const isSuccess = params.resultCode === 'SUCCESS';
  const isReplay = params.resultCode === 'COUNTER_REPLAY';
  const isInvalidMac = params.resultCode === 'INVALID_MAC';
  const isNotFound = params.resultCode === 'TAG_NOT_FOUND';

  let themeColor = '#10b981'; // green
  let badgeTitle = '정품 인증 완료';
  let badgeSubtitle = 'NFC 보안 칩 암호화 검증을 통해 정품임이 확인되었습니다.';
  let iconSvg = `
    <svg class="icon icon-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  `;

  if (isReplay) {
    themeColor = '#f59e0b'; // amber
    badgeTitle = '복제 의심 경고 (재전송 감지)';
    badgeSubtitle = '이전에 이미 사용된 보안 카운터입니다. 브라우저 새로고침이 아니라면 불법 복제된 태그일 수 있습니다.';
    iconSvg = `
      <svg class="icon icon-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    `;
  } else if (isInvalidMac) {
    themeColor = '#ef4444'; // red
    badgeTitle = '위조 의심 경고 (서명 불일치)';
    badgeSubtitle = 'NFC 보안 암호화 서명(CMAC)이 일치하지 않습니다. 위조품이거나 훼손된 태그입니다.';
    iconSvg = `
      <svg class="icon icon-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    `;
  } else if (isNotFound) {
    themeColor = '#64748b'; // slate
    badgeTitle = '미등록 태그';
    badgeSubtitle = '시스템에 등록되지 않은 NFC 태그입니다. 관리자 또는 판매처에 문의하세요.';
    iconSvg = `
      <svg class="icon icon-neutral" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    `;
  } else if (!isSuccess) {
    themeColor = '#ef4444';
    badgeTitle = '인증 요청 오류';
    badgeSubtitle = params.errorMessage || '요청 파라미터가 올바르지 않거나 처리 중 오류가 발생했습니다.';
    iconSvg = `
      <svg class="icon icon-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    `;
  }

  // 제품 정보 포맷
  const pInfo = params.productInfo || {};
  const brand = (pInfo['brand'] as string) || 'NFC Authentication';
  const model = (pInfo['model'] as string) || params.tagName || 'NFC-AUTH-PoC';
  const serialNumber = (pInfo['serialNumber'] as string) || (params.uid ? `SN-${params.uid.toUpperCase().slice(-8)}` : 'N/A');
  const uidUpper = (params.uid || '').toUpperCase();
  const formattedUid = uidUpper.match(/.{1,2}/g)?.join(':') || uidUpper;
  const docSuffix = uidUpper.replace(/[^0-9A-F]/g, '').slice(-8);

  const firstDateStr = params.firstVerifiedAt 
    ? new Date(params.firstVerifiedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) 
    : '방금 전';

  const now = new Date();
  const expDate = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());
  const expStr = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, '0')}-${String(expDate.getDate()).padStart(2, '0')}`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${badgeTitle} - NFC Authentication</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px 16px;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      width: 100%;
      max-width: 440px;
      margin: auto 0;
    }
    .card {
      background: #1e293b;
      border-radius: 24px;
      padding: 32px 24px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.08);
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 6px;
      background: ${themeColor};
    }
    .icon-wrapper {
      width: 84px;
      height: 84px;
      border-radius: 50%;
      margin: 0 auto 20px auto;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${themeColor}1a;
      border: 2px solid ${themeColor}4d;
      animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .icon {
      width: 44px;
      height: 44px;
      stroke: ${themeColor};
    }
    @keyframes popIn {
      0% { transform: scale(0.6); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #ffffff;
    }
    .subtitle {
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .info-box {
      background: #0f172a;
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 24px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      text-align: left;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 13px;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      color: #64748b;
      font-weight: 500;
    }
    .info-value {
      color: #f1f5f9;
      font-weight: 600;
      text-align: right;
      word-break: break-all;
    }
    .pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      background: ${themeColor}26;
      color: ${themeColor};
      border: 1px solid ${themeColor}4d;
    }
    .action-btn {
      display: block;
      width: 100%;
      background: ${themeColor};
      color: #0f172a;
      font-weight: 700;
      font-size: 15px;
      padding: 14px;
      border-radius: 14px;
      text-decoration: none;
      transition: opacity 0.2s, transform 0.1s;
      border: none;
      cursor: pointer;
    }
    .action-btn:active {
      transform: scale(0.98);
    }
    .footer {
      margin-top: 24px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    .tech-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      font-size: 11px;
      color: #475569;
    }

    /* 디지털 정품 보증서 모달 */
    .cert-modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(4, 7, 15, 0.85);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      z-index: 9999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px 14px;
      overflow-y: auto;
    }
    .cert-modal-container {
      width: 100%;
      max-width: 480px;
      margin: auto;
      position: relative;
    }
    .cert-modal-close-btn {
      position: absolute;
      top: -14px;
      right: -10px;
      width: 36px;
      height: 36px;
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      color: #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 10;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    .cert-card {
      background: linear-gradient(180deg, #131b2e 0%, #0c1220 100%);
      border-radius: 20px;
      padding: 30px 22px;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 30px rgba(245, 158, 11, 0.12);
      position: relative;
      overflow: hidden;
      border: 2px solid #b45309;
      outline: 1px solid rgba(245, 158, 11, 0.5);
      outline-offset: -7px;
      text-align: left;
    }
    .corner-decor {
      position: absolute;
      width: 20px;
      height: 20px;
      border-color: #fbbf24;
      pointer-events: none;
    }
    .corner-tl { top: 12px; left: 12px; border-top: 2px solid #fbbf24; border-left: 2px solid #fbbf24; }
    .corner-tr { top: 12px; right: 12px; border-top: 2px solid #fbbf24; border-right: 2px solid #fbbf24; }
    .corner-bl { bottom: 12px; left: 12px; border-bottom: 2px solid #fbbf24; border-left: 2px solid #fbbf24; }
    .corner-br { bottom: 12px; right: 12px; border-bottom: 2px solid #fbbf24; border-right: 2px solid #fbbf24; }

    .cert-header { text-align: center; margin-bottom: 18px; }
    .cert-emblem {
      width: 56px; height: 56px; margin: 0 auto 10px auto;
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(245, 158, 11, 0.25) 0%, rgba(245, 158, 11, 0.05) 70%, transparent 100%);
      border: 1px solid rgba(245, 158, 11, 0.4);
    }
    .cert-emblem svg { width: 32px; height: 32px; fill: none; stroke: #fbbf24; }
    .cert-title-eng {
      font-size: 13px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase;
      background: linear-gradient(135deg, #fef08a 0%, #f59e0b 50%, #d97706 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 4px;
    }
    .cert-title-kor { font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 4px; }
    .cert-subtitle { font-size: 11px; color: #94a3b8; }

    .cert-meta-bar {
      display: flex; justify-content: space-between; align-items: center;
      background: rgba(255, 255, 255, 0.04); border-radius: 10px;
      padding: 8px 12px; margin-bottom: 16px; border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .cert-num { font-size: 11px; color: #cbd5e1; font-family: monospace; }
    .cert-num strong { color: #fbbf24; }
    .status-badge {
      display: inline-flex; align-items: center; gap: 5px;
      background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399; padding: 3px 8px; border-radius: 16px; font-size: 11px; font-weight: 700;
    }
    .status-badge::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: #10b981; }

    .spec-section {
      background: rgba(15, 23, 42, 0.6); border-radius: 12px; padding: 12px 14px;
      border: 1px solid rgba(255, 255, 255, 0.06); margin-bottom: 14px;
    }
    .spec-header {
      font-size: 11px; font-weight: 700; color: #fbbf24; text-transform: uppercase;
      letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;
    }
    .spec-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.04); font-size: 12px;
    }
    .spec-row:last-child { border-bottom: none; }
    .spec-label { color: #94a3b8; }
    .spec-val { color: #f8fafc; font-weight: 600; text-align: right; }
    .spec-val.mono { font-family: monospace; color: #38bdf8; }

    .warranty-section {
      background: rgba(245, 158, 11, 0.04); border: 1px solid rgba(245, 158, 11, 0.2);
      border-radius: 12px; padding: 12px 14px; margin-bottom: 16px;
    }
    .warranty-title { font-size: 12px; font-weight: 700; color: #fbbf24; margin-bottom: 6px; }
    .warranty-text { font-size: 11px; color: #cbd5e1; line-height: 1.5; margin-bottom: 8px; }
    .warranty-period-box {
      display: flex; justify-content: space-between; align-items: center;
      background: rgba(0, 0, 0, 0.35); padding: 8px 12px; border-radius: 8px; font-size: 11px;
    }
    .warranty-period-val { color: #34d399; font-weight: 700; }

    .cert-footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
    .seal-wrapper { width: 72px; height: 72px; flex-shrink: 0; }
    .signature-wrapper { flex-grow: 1; text-align: right; }
    .barcode-svg { width: 120px; height: 26px; margin-bottom: 4px; opacity: 0.85; }
    .sign-title { font-size: 10px; color: #94a3b8; }
    .sign-name { font-size: 12px; font-weight: 700; color: #f8fafc; font-style: italic; }
    .sign-auth { font-size: 9px; color: #64748b; }

    .cert-modal-actions { display: flex; gap: 10px; margin-top: 14px; }
    .cert-action-btn {
      flex: 1; display: inline-flex; align-items: center; justify-content: center;
      gap: 6px; padding: 12px 14px; border-radius: 12px; font-size: 13px; font-weight: 600;
      cursor: pointer; border: none; text-decoration: none;
    }
    .cert-action-btn.secondary { background: #1e293b; color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1); }
    .cert-action-btn.primary { background: linear-gradient(135deg, #f59e0b, #d97706); color: #0f172a; }

    @media print {
      body * { visibility: hidden; }
      .cert-card, .cert-card * { visibility: visible; }
      .cert-card {
        position: absolute; left: 0; top: 0; width: 100% !important;
        background: #ffffff !important; color: #000000 !important;
        border: 2px solid #b45309 !important;
      }
      .cert-title-eng { -webkit-text-fill-color: #b45309 !important; color: #b45309 !important; }
      .cert-title-kor, .spec-val, .sign-name { color: #000000 !important; }
      .spec-section, .cert-meta-bar { background: #f8fafc !important; border: 1px solid #e2e8f0 !important; }
      .warranty-section { background: #fffbeb !important; border: 1px solid #fde68a !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="icon-wrapper">
        ${iconSvg}
      </div>
      <h1>${badgeTitle}</h1>
      <p class="subtitle">${badgeSubtitle}</p>

      <div class="info-box">
        <div class="info-row">
          <span class="info-label">브랜드</span>
          <span class="info-value">${brand}</span>
        </div>
        <div class="info-row">
          <span class="info-label">제품명</span>
          <span class="info-value">${model}</span>
        </div>
        <div class="info-row">
          <span class="info-label">정품 시리얼</span>
          <span class="info-value">${serialNumber}</span>
        </div>
        ${params.uid ? `
        <div class="info-row">
          <span class="info-label">NFC 태그 UID</span>
          <span class="info-value" style="font-family: monospace;">${params.uid.toUpperCase()}</span>
        </div>
        ` : ''}
        ${params.counter !== undefined ? `
        <div class="info-row">
          <span class="info-label">보안 탭 카운터</span>
          <span class="info-value"><span class="pill">#${params.counter}</span></span>
        </div>
        ` : ''}
        ${params.totalScans ? `
        <div class="info-row">
          <span class="info-label">인증 횟수</span>
          <span class="info-value">${params.totalScans}회 인증됨</span>
        </div>
        ` : ''}
        ${params.firstVerifiedAt ? `
        <div class="info-row">
          <span class="info-label">최초 인증 일시</span>
          <span class="info-value">${firstDateStr}</span>
        </div>
        ` : ''}
      </div>

      ${isSuccess ? `
      <button onclick="document.getElementById('certModal').style.display='flex'; document.body.style.overflow='hidden';" class="action-btn" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; cursor: pointer;">
        제품 상세 및 디지털 정품 보증서 확인
      </button>
      ` : `
      <a href="mailto:security@example.com?subject=NFC%20Inquiry" class="action-btn">고객센터 문의하기</a>
      `}

      <div class="footer">
        <p>보안 인증 프로토콜: NFC Dynamic Messaging (AES-128 CMAC)</p>
        <div class="tech-badge">
          <span>🔒 AES-128 CMAC Crypto Engine</span>
        </div>
      </div>
    </div>
  </div>

  ${isSuccess ? `
  <!-- 디지털 정품 보증서 팝업 모달 -->
  <div class="cert-modal-overlay" id="certModal">
    <div class="cert-modal-container">
      <button class="cert-modal-close-btn" onclick="document.getElementById('certModal').style.display='none'; document.body.style.overflow='';" title="닫기">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div class="cert-card">
        <div class="corner-decor corner-tl"></div>
        <div class="corner-decor corner-tr"></div>
        <div class="corner-decor corner-bl"></div>
        <div class="corner-decor corner-br"></div>

        <div class="cert-header">
          <div class="cert-emblem">
            <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <path d="M9 12l2 2 4-4"></path>
            </svg>
          </div>
          <div class="cert-title-eng">Certificate of Authenticity</div>
          <h2 class="cert-title-kor">디지털 정품 보증서</h2>
          <p class="cert-subtitle">Official Digital Warranty &amp; Cryptographic Security Record</p>
        </div>

        <div class="cert-meta-bar">
          <div class="cert-num">문서번호: <strong>CERT-2026-${docSuffix}</strong></div>
          <div class="status-badge">정품 보증 유효</div>
        </div>

        <div class="spec-section">
          <div class="spec-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
            <span>제품 사양 및 보안 식별 정보</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">제품명</span>
            <span class="spec-val">${params.tagName || model}</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">브랜드</span>
            <span class="spec-val">${brand}</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">모델명</span>
            <span class="spec-val">${model}</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">시리얼 번호</span>
            <span class="spec-val mono">${serialNumber}</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">하드웨어 칩 UID</span>
            <span class="spec-val mono">${formattedUid}</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">보안 탭 카운터</span>
            <span class="spec-val" style="color: #fbbf24;">#${params.counter || 1} (Dynamic CMAC Verified)</span>
          </div>
          <div class="spec-row">
            <span class="spec-label">인증 알고리즘</span>
            <span class="spec-val" style="font-size: 11px; color: #94a3b8;">AES-128 CMAC (ISO/IEC 9797-1)</span>
          </div>
        </div>

        <div class="warranty-section">
          <div class="warranty-title">공식 품질 보증 규정</div>
          <p class="warranty-text">
            본 인증서는 위조 방지 고유 보안 IC 칩과 실시간 암호화 서명이 탑재된 제품임을 보증합니다. 인증된 제품에 한하여 아래 보증 기간 동안 품질 및 보안 무결성을 보증합니다.
          </p>
          <div class="warranty-period-box">
            <span style="color: #94a3b8;">무상 보증 기간</span>
            <span class="warranty-period-val">발급일로부터 2년 (${expStr} 까지)</span>
          </div>
        </div>

        <div class="cert-footer">
          <div class="seal-wrapper">
            <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;">
              <defs>
                <radialGradient id="edgeSealGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#fef08a" />
                  <stop offset="60%" stop-color="#f59e0b" />
                  <stop offset="100%" stop-color="#b45309" />
                </radialGradient>
              </defs>
              <circle cx="50" cy="50" r="46" fill="url(#edgeSealGrad)" stroke="#fef08a" stroke-width="1.5" />
              <circle cx="50" cy="50" r="39" fill="none" stroke="#78350f" stroke-width="1" stroke-dasharray="2,2" />
              <circle cx="50" cy="50" r="36" fill="#1e293b" />
              <g transform="translate(36, 32)">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
              </g>
              <text x="50" y="70" font-size="7" font-weight="900" fill="#fef08a" text-anchor="middle" letter-spacing="1">GENUINE</text>
            </svg>
          </div>

          <div class="signature-wrapper">
            <svg class="barcode-svg" viewBox="0 0 140 30" preserveAspectRatio="none">
              <rect x="0" y="0" width="3" height="30" fill="#cbd5e1" />
              <rect x="6" y="0" width="2" height="30" fill="#cbd5e1" />
              <rect x="12" y="0" width="4" height="30" fill="#cbd5e1" />
              <rect x="20" y="0" width="2" height="30" fill="#cbd5e1" />
              <rect x="26" y="0" width="5" height="30" fill="#cbd5e1" />
              <rect x="36" y="0" width="2" height="30" fill="#cbd5e1" />
              <rect x="42" y="0" width="4" height="30" fill="#cbd5e1" />
              <rect x="52" y="0" width="3" height="30" fill="#cbd5e1" />
              <rect x="60" y="0" width="2" height="30" fill="#cbd5e1" />
              <rect x="68" y="0" width="5" height="30" fill="#cbd5e1" />
              <rect x="78" y="0" width="2" height="30" fill="#cbd5e1" />
              <rect x="86" y="0" width="4" height="30" fill="#cbd5e1" />
              <rect x="96" y="0" width="3" height="30" fill="#cbd5e1" />
              <rect x="104" y="0" width="2" height="30" fill="#cbd5e1" />
              <rect x="112" y="0" width="5" height="30" fill="#cbd5e1" />
              <rect x="122" y="0" width="2" height="30" fill="#cbd5e1" />
              <rect x="130" y="0" width="4" height="30" fill="#cbd5e1" />
            </svg>
            <div class="sign-title">보안 인증 책임관 (Digital Signature)</div>
            <div class="sign-name">NFC Security Authority</div>
            <div class="sign-auth">Cryptographic Certificate Validation Team</div>
          </div>
        </div>
      </div>

      <div class="cert-modal-actions">
        <button onclick="window.print()" class="cert-action-btn secondary">
          <span>보증서 인쇄/저장</span>
        </button>
        <button onclick="document.getElementById('certModal').style.display='none'; document.body.style.overflow='';" class="cert-action-btn primary">
          <span>확인 완료 (닫기)</span>
        </button>
      </div>
    </div>
  </div>
  ` : ''}
</body>
</html>`;
}
