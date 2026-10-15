// supabase/functions/nfc/views.ts
// 스마트폰 브라우저에 표시할 모바일 최적화 반응형 정품 인증 결과 웹페이지 템플릿

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
  const model = (pInfo['model'] as string) || params.tagName || '정품 인증 제품';
  const serialNumber = (pInfo['serialNumber'] as string) || (params.uid ? `SN-${params.uid.toUpperCase().slice(-8)}` : 'N/A');
  const supportUrl = (pInfo['supportUrl'] as string) || '#';

  const firstDateStr = params.firstVerifiedAt 
    ? new Date(params.firstVerifiedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) 
    : '방금 전';

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
      transition: opacity 0.2s;
    }
    .action-btn:hover {
      opacity: 0.9;
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

      <a href="${supportUrl}" class="action-btn">
        ${isSuccess ? '제품 상세 및 보증서 확인' : '고객센터 문의하기'}
      </a>

      <div class="footer">
        <p>보안 인증 프로토콜: NFC Dynamic Messaging (AES-128 CMAC)</p>
        <div class="tech-badge">
          <span>🔒 AES-128 CMAC Crypto Engine</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
