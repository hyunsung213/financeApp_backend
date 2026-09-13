import { deadlineLabel, fallbackPolicyPresentation } from '../src/services/policyPresentationService';

test('creates a safe fallback presentation from policy source fields', () => {
  expect(fallbackPolicyPresentation({
    title: '청년 자산형성 지원사업',
    summary: '월 최대 50만원 저축 시 정부 매칭 지원',
    category: '금융',
    ageMin: 19,
    ageMax: 34,
    region: '전국',
    applicationStartDate: '2026-06-22',
    applicationEndDate: '2026-07-31',
  })).toMatchObject({
    badgeText: '청년금융 PICK',
    headline: '청년 자산형성 지원사업',
    targetText: '만 19~34세 · 전국',
    applicationText: '신청기간 2026.06.22 ~ 2026.07.31 신청',
  });
});

test('calculates a live deadline label from the source application end date', () => {
  expect(deadlineLabel('2026-09-26', new Date('2026-09-12T00:00:00.000Z'))).toBe('D-14');
  expect(deadlineLabel('2026-09-12', new Date('2026-09-12T00:00:00.000Z'))).toBe('D-DAY');
  expect(deadlineLabel('2026-09-11', new Date('2026-09-12T00:00:00.000Z'))).toBe('마감');
});
