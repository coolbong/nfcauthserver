const COPY = {
  genuine: { title: '정품입니다', detail: '등록된 정품 포토카드입니다.' },
  recheck: { title: '다시 탭해 주세요', detail: '이미 사용된 링크입니다. 카드를 직접 탭하면 다시 확인할 수 있습니다.' },
  rejected: { title: '정품으로 확인되지 않았습니다', detail: '칩의 서명이 등록 정보와 맞지 않습니다. 구매처에 문의해 주세요.' },
  unavailable: { title: '확인할 수 없습니다', detail: '연결 상태를 확인한 뒤 카드를 다시 탭해 주세요.' },
};

const KIND_BY_RESULT = {
  SUCCESS: 'genuine',
  COUNTER_REPLAY: 'recheck',
  INVALID_MAC: 'rejected',
  INVALID_OTP: 'rejected',
  TAG_NOT_FOUND: 'rejected',
  TAG_INACTIVE: 'rejected',
};

export async function getVerdict() {
  const query = location.search.slice(1);
  if (!query) return { kind: 'unavailable', ...COPY.unavailable, verifiedAt: new Date() };
  try {
    const res = await fetch(`/auth?${query}`);
    const data = await res.json();
    const kind = KIND_BY_RESULT[data.resultCode] ?? 'unavailable';
    return { kind, ...COPY[kind], card: data.productInfo ?? null, verifiedAt: new Date() };
  } catch {
    return { kind: 'unavailable', ...COPY.unavailable, verifiedAt: new Date() };
  }
}

export const cardTitle = (c) => `${c.year} ${c.album}`;
export const cardSub = (c) => `${c.artist} #${c.cardNumber}`;
export const clock = (d) => d.toLocaleTimeString('ko-KR', { hour12: false });
export const dateTime = (d) => d.toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' });
