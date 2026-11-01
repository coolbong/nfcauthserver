// supabase/functions/auth/views.ts
// v2 TLV + HOTP 인증 모바일 최적화 웹페이지 뷰 템플릿
export interface ViewParams {
  resultCode: 'SUCCESS' | 'COUNTER_REPLAY' | 'INVALID_OTP' | 'TAG_NOT_FOUND' | 'TAG_INACTIVE' | 'BAD_REQUEST' | 'SERVER_ERROR';
  uid?: string;
  counter?: number;
  otp?: string;
  tagName?: string;
  totalScans?: number;
  firstVerifiedAt?: string | null;
  productInfo?: Record<string, unknown> | null;
  errorMessage?: string;
}

export function renderVerificationPage(params: ViewParams): string {
  const isSuccess = params.resultCode === 'SUCCESS';
  const isReplay = params.resultCode === 'COUNTER_REPLAY';
  const isInvalidOtp = params.resultCode === 'INVALID_OTP';
  const isNotFound = params.resultCode === 'TAG_NOT_FOUND';

  let themeColor = '#10b981'; // green
  let badgeTitle = '정품 인증 완료';
  let badgeSubtitle = 'NFC 보안 칩 HOTP(RFC 4226) 암호화 검증을 통해 정품임이 확인되었습니다.';
  let iconSvg = `
    <svg class="icon icon-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  `;

  if (isReplay) {
    themeColor = '#f59e0b'; // amber
    badgeTitle = '복제 의심 경고 (재전송 감지)';
    badgeSubtitle = '이전에 이미 사용된 일회용 카운터입니다. 복제 카드로 인한 리플레이 공격일 수 있습니다.';
    iconSvg = `
      <svg class="icon icon-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    `;
  } else if (isInvalidOtp) {
    themeColor = '#ef4444'; // red
    badgeTitle = '위조 의심 경고 (OTP 불일치)';
    badgeSubtitle = 'NFC 하드웨어 칩에서 생성된 동적 일회용 비밀번호(HOTP)가 일치하지 않습니다. 복제 또는 위조된 태그입니다.';
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
    badgeSubtitle = '시스템 DB에 등록되지 않은 태그입니다. 관리자 또는 발급 담당자에게 문의하세요.';
    iconSvg = `
      <svg class="icon icon-neutral" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    `;
  } else if (!isSuccess) {
    themeColor = '#ef4444';
    badgeTitle = '인증 오류 (' + params.resultCode + ')';
    badgeSubtitle = params.errorMessage || '요청 처리 중 오류가 발생했습니다.';
    iconSvg = `
      <svg class="icon icon-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    `;
  }

  const pInfo = params.productInfo || {};
  const brand = (pInfo['brand'] as string) || 'NFC Authentication';
  const model = (pInfo['model'] as string) || params.tagName || 'NFC-HOTP-SecureCard';
  const serialNumber = (pInfo['serialNumber'] as string) || (params.uid ? `SN-${params.uid.toUpperCase().slice(-8)}` : 'N/A');
  const uidUpper = (params.uid || '').toUpperCase();
  const formattedUid = uidUpper.match(/.{1,2}/g)?.join(':') || uidUpper;

  const firstDateStr = params.firstVerifiedAt
    ? new Date(params.firstVerifiedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    : '방금 전';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${badgeTitle} - NFC HOTP Authentication v2</title>
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
      padding: 24px 16px;
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
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
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
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid ${themeColor};
      color: ${themeColor};
    }
    .icon {
      width: 44px;
      height: 44px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #ffffff;
    }
    .subtitle {
      font-size: 13.5px;
      color: #94a3b8;
      line-height: 1.55;
      margin-bottom: 24px;
    }
    .info-box {
      background: #0f172a;
      border-radius: 18px;
      padding: 16px 18px;
      margin-bottom: 24px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      text-align: left;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      text-align: right;
    }
    .badge-v2 {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
      margin-bottom: 12px;
      letter-spacing: 1px;
    }
    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="badge-v2">v2 AUTH • TLV + HOTP</div>
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
          <span class="info-label">시리얼 번호</span>
          <span class="info-value" style="color: #fbbf24;">${serialNumber}</span>
        </div>
        <div class="info-row">
          <span class="info-label">하드웨어 ID (DF61)</span>
          <span class="info-value">${formattedUid || 'N/A'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">보안 카운터 (DF63)</span>
          <span class="info-value">#${params.counter ?? 'N/A'}</span>
        </div>
        ${params.otp ? `
        <div class="info-row">
          <span class="info-label">인증 OTP (DF62)</span>
          <span class="info-value" style="color: #38bdf8;">${params.otp}</span>
        </div>
        ` : ''}
        ${params.totalScans !== undefined ? `
        <div class="info-row">
          <span class="info-label">총 인증 횟수</span>
          <span class="info-value">${params.totalScans}회</span>
        </div>
        ` : ''}
        <div class="info-row">
          <span class="info-label">최초 인증 일시</span>
          <span class="info-value">${firstDateStr}</span>
        </div>
      </div>

      <div class="footer">
        <p>NFC Authentication v2 • RFC 4226 HOTP &amp; BER-TLV</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
