import { transactionPatchSchema, transactionSchema } from '../src/validators/schemas';

const requiredTransaction = {
  categoryId: 'expense-food',
  type: 'EXPENSE',
  amount: 12000,
  occurredAt: '2026-09-13',
  merchantOrTitle: '점심',
};

describe('transaction consumptionEvaluation validation', () => {
  it('allows omitting consumptionEvaluation', () => {
    expect(transactionSchema.parse(requiredTransaction).consumptionEvaluation).toBeUndefined();
  });

  it.each(['GOOD', 'NORMAL', 'REGRETTABLE', 'BAD'])('accepts %s', (consumptionEvaluation) => {
    expect(transactionSchema.parse({ ...requiredTransaction, consumptionEvaluation }).consumptionEvaluation).toBe(consumptionEvaluation);
  });

  it('allows clearing an existing evaluation with null in PATCH', () => {
    expect(transactionPatchSchema.parse({ consumptionEvaluation: null }).consumptionEvaluation).toBeNull();
  });

  it('rejects an unsupported evaluation', () => {
    expect(() => transactionSchema.parse({ ...requiredTransaction, consumptionEvaluation: 'EXCELLENT' })).toThrow();
  });
});
