import { parseNotification } from '../src/services/notificationParsers';

test('parses a Shinhan card approval notification into an expense', () => {
  const result = parseNotification({
    packageName: 'com.shcard.smartpay',
    title: '[신한체크승인]',
    content: '홍*동 12,000원(일시불) 08/31 14:30 스타벅스강남점 잔액 150,000원',
    timestamp: Date.parse('2026-08-31T14:30:00+09:00'),
  });

  expect(result).toMatchObject({
    eventType: 'CARD_APPROVAL',
    amount: 12000,
    occurredAt: '2026-08-31',
    merchant: '스타벅스강남점',
    categoryId: 'core.expense.food.cafe',
    parseStatus: 'PARSED',
  });
});

test('does not convert a balance notification into a transaction', () => {
  const result = parseNotification({
    packageName: 'com.kakaobank.channel',
    title: '카카오뱅크 잔액 안내',
    content: '현재 잔액 150,000원',
    timestamp: Date.parse('2026-08-31T14:30:00+09:00'),
  });

  expect(result.eventType).toBe('BALANCE');
  expect(result.amount).toBeNull();
  expect(result.parseStatus).toBe('IGNORED');
});
