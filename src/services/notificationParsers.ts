import { CATEGORY_IDS } from '../constants/categoryCatalog';

export type NotificationEventType = 'CARD_APPROVAL' | 'CARD_CANCEL' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'CASH_WITHDRAWAL' | 'BALANCE' | 'STATEMENT' | 'UNKNOWN';
export type NotificationParseStatus = 'PARSED' | 'REVIEW_REQUIRED' | 'IGNORED';

export type NotificationParserInput = {
  packageName: string;
  title: string;
  content: string;
  timestamp: number;
};

export type ParsedNotification = {
  eventType: NotificationEventType;
  amount: number | null;
  occurredAt: string | null;
  merchant: string | null;
  categoryId: string | null;
  confidence: number;
  parseStatus: NotificationParseStatus;
};

type NotificationTemplate = {
  app: string;
  eventPatterns: Array<{ type: NotificationEventType; pattern: RegExp }>;
  amountPatterns: RegExp[];
  merchantPatterns: RegExp[];
  categoryRules: Array<{ pattern: RegExp; categoryId: string }>;
};

const genericAmountPatterns = [
  /(?:승인금액|결제금액|이용금액|출금금액|거래금액)\s*[:：]?\s*([\d,]+)\s*원/i,
  /([\d,]+)\s*원\s*\(?\s*(?:일시불|할부|승인|결제)/i,
];

const genericMerchantPatterns = [
  /(?:\d{1,4}[./-]\d{1,2}\s+)?\d{1,2}:\d{2}\s+(.+?)(?=\s+(?:잔액|누적|한도|가용|승인번호|카드번호)(?:\s|$)|$)/i,
];

const commonCategoryRules = [
  { pattern: /스타벅스|이디야|투썸|커피|카페/i, categoryId: CATEGORY_IDS.EXPENSE_FOOD_CAFE },
  { pattern: /배달|배민|요기요|쿠팡이츠/i, categoryId: CATEGORY_IDS.EXPENSE_FOOD_DELIVERY },
  { pattern: /술집|호프|주점|맥주|소주/i, categoryId: CATEGORY_IDS.EXPENSE_FOOD_ALCOHOL },
  { pattern: /편의점|gs25|cu|세븐일레븐|이마트24/i, categoryId: CATEGORY_IDS.EXPENSE_FOOD_CONVENIENCE },
  { pattern: /과자|간식|디저트|베이커리|아이스크림/i, categoryId: CATEGORY_IDS.EXPENSE_FOOD_SNACK },
  { pattern: /식당|레스토랑|구내식당|점심|저녁|아침/i, categoryId: CATEGORY_IDS.EXPENSE_FOOD_MEAL },
  { pattern: /마트|장보기|쿠팡|마켓컬리|이마트|홈플러스/i, categoryId: CATEGORY_IDS.EXPENSE_LIVING_GROCERY },
  { pattern: /택시|카카오택시|타다/i, categoryId: CATEGORY_IDS.EXPENSE_TRANSPORT_TAXI },
  { pattern: /주유|고속도로|하이패스/i, categoryId: CATEGORY_IDS.EXPENSE_TRANSPORT_FUEL },
  { pattern: /주차/i, categoryId: CATEGORY_IDS.EXPENSE_TRANSPORT_PARKING },
  { pattern: /정비|세차|타이어|차량관리/i, categoryId: CATEGORY_IDS.EXPENSE_TRANSPORT_MAINTENANCE },
  { pattern: /기차|철도|시외버스|고속버스/i, categoryId: CATEGORY_IDS.EXPENSE_TRANSPORT_INTERCITY },
  { pattern: /버스|지하철|교통/i, categoryId: CATEGORY_IDS.EXPENSE_TRANSPORT_PUBLIC },
  { pattern: /통신|휴대폰|인터넷|iptv|sk텔레콤|kt|lg유플러스/i, categoryId: CATEGORY_IDS.EXPENSE_COMMUNICATION },
  { pattern: /월세|임대료|주거/i, categoryId: CATEGORY_IDS.EXPENSE_HOUSING },
  { pattern: /관리비|전기|가스|수도|공과금/i, categoryId: CATEGORY_IDS.EXPENSE_LIVING_UTILITIES },
  { pattern: /약국|약방/i, categoryId: CATEGORY_IDS.EXPENSE_HEALTH_PHARMACY },
  { pattern: /병원|의원|치과|한의원/i, categoryId: CATEGORY_IDS.EXPENSE_HEALTH_HOSPITAL },
  { pattern: /헬스|필라테스|요가|운동/i, categoryId: CATEGORY_IDS.EXPENSE_HEALTH_EXERCISE },
];

const template = (app: string, eventPatterns: NotificationTemplate['eventPatterns']): NotificationTemplate => ({
  app,
  eventPatterns,
  amountPatterns: genericAmountPatterns,
  merchantPatterns: genericMerchantPatterns,
  categoryRules: commonCategoryRules,
});

// Add or update one entry here when a provider changes its notification format.
export const NOTIFICATION_PARSER_TEMPLATES: Record<string, NotificationTemplate> = {
  'com.shcard.smartpay': template('SHINHAN_CARD', [
    { type: 'CARD_CANCEL', pattern: /승인취소|매입취소|결제취소|취소|환불/i },
    { type: 'CARD_APPROVAL', pattern: /체크승인|카드승인|승인|결제/i },
  ]),
  'com.kbcard.kmotion': template('KB_CARD', [
    { type: 'CARD_CANCEL', pattern: /승인취소|매입취소|결제취소|취소|환불/i },
    { type: 'CARD_APPROVAL', pattern: /카드승인|승인|결제/i },
  ]),
  'com.kbcard.kbpay': template('KB_PAY', [
    { type: 'CARD_CANCEL', pattern: /승인취소|매입취소|결제취소|취소|환불/i },
    { type: 'CARD_APPROVAL', pattern: /카드승인|승인|결제/i },
  ]),
  'com.kakaobank.channel': template('KAKAO_BANK', [
    { type: 'BALANCE', pattern: /잔액|잔고/i },
    { type: 'TRANSFER_IN', pattern: /입금|받았|들어왔/i },
    { type: 'TRANSFER_OUT', pattern: /출금|이체|보냈|빠져나/i },
  ]),
  'viva.republica.toss': template('TOSS', [
    { type: 'CARD_CANCEL', pattern: /승인취소|결제취소|취소|환불/i },
    { type: 'TRANSFER_IN', pattern: /입금|받았|들어왔/i },
    { type: 'TRANSFER_OUT', pattern: /출금|이체|결제|보냈|빠져나/i },
    { type: 'CARD_APPROVAL', pattern: /카드승인|승인|결제/i },
  ]),
};

const toKoreaDate = (timestamp: number) => {
  const date = new Date(timestamp + 9 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
};

const toNumber = (value: string) => Number(value.replace(/,/g, ''));

function extractAmount(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return toNumber(match[1]);
  }
  const candidates = [...text.matchAll(/([\d,]+)\s*원/g)].filter((match) => {
    const prefix = text.slice(Math.max(0, (match.index ?? 0) - 8), match.index ?? 0);
    return !/(잔액|잔여|한도|누적|누계)/i.test(prefix);
  });
  return candidates[0]?.[1] ? toNumber(candidates[0][1]) : null;
}

function extractDate(text: string, timestamp: number) {
  const full = text.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
  if (full) return `${full[1]}-${full[2].padStart(2, '0')}-${full[3].padStart(2, '0')}`;
  const short = text.match(/(?:^|\s)(\d{1,2})[./-](\d{1,2})(?:\s+\d{1,2}:\d{2})?/);
  if (short) {
    const year = toKoreaDate(timestamp).slice(0, 4);
    return `${year}-${short[1].padStart(2, '0')}-${short[2].padStart(2, '0')}`;
  }
  return toKoreaDate(timestamp);
}

function extractMerchant(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const merchant = match?.[1]?.trim().replace(/[.,]$/, '');
    if (merchant && !/^(잔액|누적|한도|승인번호)/i.test(merchant)) return merchant;
  }
  return null;
}

export function parseNotification(input: NotificationParserInput): ParsedNotification {
  const text = `${input.title} ${input.content}`.replace(/\s+/g, ' ').trim();
  const parser = NOTIFICATION_PARSER_TEMPLATES[input.packageName];
  const eventType = parser?.eventPatterns.find((item) => item.pattern.test(text))?.type ?? (
    /취소|환불/i.test(text) ? 'CARD_CANCEL' : /승인|결제/i.test(text) ? 'CARD_APPROVAL' : /잔액|잔고/i.test(text) ? 'BALANCE' : 'UNKNOWN'
  );
  if (eventType === 'BALANCE' || eventType === 'STATEMENT' || eventType === 'UNKNOWN') {
    return { eventType, amount: null, occurredAt: null, merchant: null, categoryId: null, confidence: 0.2, parseStatus: 'IGNORED' };
  }
  const amount = extractAmount(text, parser?.amountPatterns ?? genericAmountPatterns);
  const occurredAt = extractDate(text, input.timestamp);
  const merchant = extractMerchant(input.content, parser?.merchantPatterns ?? genericMerchantPatterns);
  const categoryId = merchant ? (parser?.categoryRules ?? commonCategoryRules).find((rule) => rule.pattern.test(merchant))?.categoryId ?? null : null;
  const confidence = Math.min(0.99, 0.35 + (amount ? 0.3 : 0) + (occurredAt ? 0.2 : 0) + (merchant ? 0.1 : 0) + (categoryId ? 0.09 : 0));
  return { eventType, amount, occurredAt, merchant, categoryId, confidence, parseStatus: amount && occurredAt ? 'PARSED' : 'REVIEW_REQUIRED' };
}
