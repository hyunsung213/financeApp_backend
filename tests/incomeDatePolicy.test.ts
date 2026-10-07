import { assertIncomeNotInFuture } from '../src/services/budgetCycleService';
import { parseDateOnly } from '../src/utils/dates';

// "now" is 2026-10-07 14:00 KST (05:00 UTC); dates are KST calendar days.
const now = new Date('2026-10-07T05:00:00.000Z');
const on = (value: string) => parseDateOnly(value);

describe('income effective-date policy', () => {
  it('accepts income dated in the past', () => {
    expect(() => assertIncomeNotInFuture('INCOME', on('2026-10-01'), now)).not.toThrow();
    expect(() => assertIncomeNotInFuture('INCOME', on('2025-12-31'), now)).not.toThrow();
  });

  it('accepts income dated today (KST)', () => {
    expect(() => assertIncomeNotInFuture('INCOME', on('2026-10-07'), now)).not.toThrow();
    // 2026-10-07 23:30 KST is still the 7th in Korea even though it is the 7th 14:30 UTC...
    expect(() => assertIncomeNotInFuture('INCOME', on('2026-10-07'), new Date('2026-10-07T14:30:00.000Z'))).not.toThrow();
    // ...and 2026-10-06 23:30 KST is the 6th, so an income on the 7th is still future then.
    expect(() => assertIncomeNotInFuture('INCOME', on('2026-10-07'), new Date('2026-10-06T14:30:00.000Z'))).toThrow(expect.objectContaining({ code: 'FUTURE_INCOME_NOT_ALLOWED', status: 400 }));
  });

  it('rejects income dated after today, whether tomorrow or far ahead', () => {
    expect(() => assertIncomeNotInFuture('INCOME', on('2026-10-08'), now)).toThrow(expect.objectContaining({ code: 'FUTURE_INCOME_NOT_ALLOWED', status: 400 }));
    expect(() => assertIncomeNotInFuture('INCOME', on('2026-10-20'), now)).toThrow(expect.objectContaining({ code: 'FUTURE_INCOME_NOT_ALLOWED' }));
    expect(() => assertIncomeNotInFuture('INCOME', on('2099-01-01'), now)).toThrow(expect.objectContaining({ code: 'FUTURE_INCOME_NOT_ALLOWED' }));
  });

  it('leaves expenses and savings alone (Home only counts them from their date)', () => {
    expect(() => assertIncomeNotInFuture('EXPENSE', on('2026-10-20'), now)).not.toThrow();
    expect(() => assertIncomeNotInFuture('SAVING', on('2026-10-20'), now)).not.toThrow();
  });
});
