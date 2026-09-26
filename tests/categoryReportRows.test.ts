import { buildCategoryReportRows } from '../src/services/categoryReportRows';

const food = { name: '식비', parentCategoryId: null };
const meal = { name: '식사', parentCategoryId: 'core.expense.food' };
const cafe = { name: '카페', parentCategoryId: 'core.expense.food' };

describe('buildCategoryReportRows', () => {
  // The legacy shape from the live data: one 20,000원 transaction saved directly on 식비.
  const transactions = [
    { amount: '64000', categoryId: 'core.expense.food.meal', category: meal },
    { amount: 20000, categoryId: 'core.expense.food', category: food },
    { amount: 14500, categoryId: 'core.expense.food.cafe', category: cafe },
  ];

  it('still returns transactions saved directly on a 대분류 (legacy data stays readable)', () => {
    const legacy = buildCategoryReportRows(transactions).find((row) => row.categoryId === 'core.expense.food');
    expect(legacy).toMatchObject({ category: '식비', parentCategoryId: null, amount: 20000, transactionCount: 1 });
  });

  it('adds categoryId/parentCategoryId without changing the existing fields', () => {
    const meals = buildCategoryReportRows(transactions).find((row) => row.categoryId === 'core.expense.food.meal');
    expect(meals).toEqual({ categoryId: 'core.expense.food.meal', category: '식사', parentCategoryId: 'core.expense.food', amount: 64000, transactionCount: 1, percentage: expect.any(Number) });
  });

  it('keeps totals and percentages', () => {
    const rows = buildCategoryReportRows(transactions);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(98500);
    expect(rows.reduce((sum, row) => sum + row.transactionCount, 0)).toBe(3);
    expect(rows.reduce((sum, row) => sum + row.percentage, 0)).toBeCloseTo(100, 6);
  });

  it('merges transactions of the same category into one row, and keeps same-named categories apart', () => {
    const rows = buildCategoryReportRows([
      { amount: 1000, categoryId: 'a', category: { name: '기타', parentCategoryId: 'x' } },
      { amount: 500, categoryId: 'a', category: { name: '기타', parentCategoryId: 'x' } },
      { amount: 700, categoryId: 'b', category: { name: '기타', parentCategoryId: 'y' } },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.categoryId === 'a')).toMatchObject({ amount: 1500, transactionCount: 2 });
  });

  it('falls back to 기타 / null parent when the category row is missing, and to 0% for an empty total', () => {
    expect(buildCategoryReportRows([{ amount: 300, categoryId: 'gone', category: null }])[0]).toMatchObject({ category: '기타', parentCategoryId: null, percentage: 100 });
    expect(buildCategoryReportRows([])).toEqual([]);
    expect(buildCategoryReportRows([{ amount: 0, categoryId: 'z', category: meal }])[0].percentage).toBe(0);
  });
});
