import { currentCycleRange, dateOnly, nextSalaryDate } from '../src/utils/dates';

test('uses Asia/Seoul date boundaries for daily budget and salary cycles', () => {
  // 00:30 KST on 2026-09-26. UTC-based logic previously treated this as 2026-09-25.
  const koreaEarlyMorning = new Date('2026-09-25T15:30:00.000Z');

  expect(dateOnly(koreaEarlyMorning)).toBe('2026-09-26');
  expect(dateOnly(nextSalaryDate(koreaEarlyMorning, 25))).toBe('2026-10-25');
  expect(dateOnly(currentCycleRange(koreaEarlyMorning, 25).startDate)).toBe('2026-09-25');
});
