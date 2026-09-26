import { Op } from 'sequelize';
import { sequelize } from './config/database';
import {
  BudgetAllocation,
  BudgetCycle,
  BudgetCycleAllocation,
  Category,
  FixedExpense,
  FixedExpenseOccurrence,
  Policy,
  PolicyBookmark,
  PolicyCalendarEvent,
  Transaction,
  User,
  UserFinanceSetting,
} from './models';
import { BudgetCycleService } from './services/budgetCycleService';
import { ReportService } from './services/reportService';
import { addDays, dateOnly, daysInclusive, parseDateOnly } from './utils/dates';
import { newId } from './utils/ids';
import { CATEGORY_CATALOG, CATEGORY_IDS } from './constants/categoryCatalog';
import { DEFAULT_BUDGET_PLAN, allocationTypeForCategory, budgetCategoryName, spendabilityForCategory } from './constants/budgetPlan';

const seedUserId = '00000000-0000-4000-8000-000000000001';
const legacySeedCategoryIds = ['식비', '카페', '교통', '저축', '투자', '통신', '구독', '급여'].map((name) => `seed-${name}`);

const dateAtOrAfterCycleStart = (today: Date, cycleStart: Date, daysAgo: number) => {
  const candidate = addDays(today, -daysAgo);
  return dateOnly(candidate < cycleStart ? cycleStart : candidate);
};

async function clearSeedData() {
  const fixedExpenses = await FixedExpense.findAll({ where: { userId: seedUserId }, attributes: ['id'] });
  const fixedExpenseIds = fixedExpenses.map((expense: any) => expense.id);
  const cycles = await BudgetCycle.findAll({ where: { userId: seedUserId }, attributes: ['id'] });
  const cycleIds = cycles.map((cycle: any) => cycle.id);

  await PolicyBookmark.destroy({ where: { userId: seedUserId } });
  await PolicyCalendarEvent.destroy({ where: { userId: seedUserId } });
  await Transaction.destroy({ where: { userId: seedUserId } });
  if (fixedExpenseIds.length) await FixedExpenseOccurrence.destroy({ where: { fixedExpenseId: { [Op.in]: fixedExpenseIds } } });
  await FixedExpense.destroy({ where: { userId: seedUserId } });
  if (cycleIds.length) await BudgetCycleAllocation.destroy({ where: { budgetCycleId: { [Op.in]: cycleIds } } });
  await BudgetCycle.destroy({ where: { userId: seedUserId } });
  await BudgetAllocation.destroy({ where: { userId: seedUserId } });
  await Category.destroy({ where: { id: { [Op.in]: legacySeedCategoryIds } } });
  await Policy.destroy({ where: { title: { [Op.startsWith]: '[SEED]' } } });
  await User.destroy({ where: { id: seedUserId } });
}

async function main() {
  await sequelize.sync({ alter: false });
  await clearSeedData();

  const user = await User.create({ id: seedUserId, email: 'seed@example.local', nickname: 'MVP Seed', age: 25, region: '광주', timezone: 'Asia/Seoul' });
  await UserFinanceSetting.create({ userId: user.id, salaryAmount: '2500000', salaryDay: 1, reportingStartDay: 1 });

  const categories: Record<string, string> = {};
  for (const category of CATEGORY_CATALOG) {
    await Category.upsert({ ...category, ownerUserId: null, sourceCategoryId: null, parentCategoryId: category.parentCategoryId ?? null });
    categories[category.name] = category.id;
  }
  await Category.update({ isActive: false }, { where: { ownerUserId: null, id: { [Op.notIn]: CATEGORY_CATALOG.map((category) => category.id) } } });
  categories['카페'] = CATEGORY_IDS.EXPENSE_FOOD_CAFE;
  categories['구독'] = CATEGORY_IDS.EXPENSE_LIVING_SUBSCRIPTION;

  for (const allocation of DEFAULT_BUDGET_PLAN) {
    await BudgetAllocation.create({
      id: newId(),
      userId: user.id,
      categoryId: allocation.categoryId,
      name: budgetCategoryName(allocation.categoryId),
      allocationType: allocationTypeForCategory(allocation.categoryId),
      percentage: allocation.percentage,
      spendability: spendabilityForCategory(allocation.categoryId),
    });
  }

  const today = new Date();
  const cycle = await new BudgetCycleService().ensureCurrentCycle(user.id, today);
  if (!cycle) throw new Error('Seed budget cycle was not created');
  const cycleStart = parseDateOnly(String(cycle.startDate).slice(0, 10));
  const cycleEnd = parseDateOnly(String(cycle.endDate).slice(0, 10));
  const transactions = [
    { amount: 12000, categoryId: categories['식사'], daysAgo: 6, title: '아침 식사', consumptionEvaluation: 'GOOD' },
    { amount: 1550, categoryId: categories['대중교통'], daysAgo: 6, title: '지하철 이용', consumptionEvaluation: 'NORMAL' },
    { amount: 18900, categoryId: categories['생필품'], daysAgo: 5, title: '세제와 휴지 구매', consumptionEvaluation: 'GOOD' },
    { amount: 4500, categoryId: categories['카페'], daysAgo: 5, title: '커피', consumptionEvaluation: 'NORMAL' },
    { amount: 10500, categoryId: categories['식사'], daysAgo: 4, title: '점심 도시락', consumptionEvaluation: 'GOOD' },
    { amount: 6800, categoryId: categories['약국'], daysAgo: 4, title: '약국 구매', consumptionEvaluation: 'GOOD' },
    { amount: 1550, categoryId: categories['대중교통'], daysAgo: 3, title: '버스 이용', consumptionEvaluation: 'GOOD' },
    { amount: 5500, categoryId: categories['통신비'], daysAgo: 3, title: '데이터 충전', consumptionEvaluation: 'NORMAL' },
    { amount: 23000, categoryId: categories['식사'], daysAgo: 2, title: '저녁 외식', consumptionEvaluation: 'REGRETTABLE' },
    { amount: 3900, categoryId: categories['생필품'], daysAgo: 2, title: '생수 구매', consumptionEvaluation: 'GOOD' },
    { amount: 15000, categoryId: categories['운동'], daysAgo: 1, title: '헬스장 일일권', consumptionEvaluation: 'NORMAL' },
    { amount: 3100, categoryId: categories['대중교통'], daysAgo: 1, title: '대중교통 이용', consumptionEvaluation: 'GOOD' },
    { amount: 8500, categoryId: categories['식사'], daysAgo: 0, title: '점심 식사', consumptionEvaluation: 'NORMAL' },
    { amount: 12900, categoryId: categories['생필품'], daysAgo: 0, title: '문구 구매', consumptionEvaluation: 'REGRETTABLE' },
    { amount: 10900, categoryId: categories['구독'], daysAgo: 0, title: '음악 스트리밍 구독', consumptionEvaluation: 'BAD' },
  ];
  const weeklyDailyTotals = new Map<number, number>();
  for (const transaction of transactions) weeklyDailyTotals.set(transaction.daysAgo, (weeklyDailyTotals.get(transaction.daysAgo) ?? 0) + transaction.amount);
  if (weeklyDailyTotals.size !== 7 || [...weeklyDailyTotals.values()].some((amount) => amount > 50000)) {
    throw new Error('Seed transactions must cover the last 7 days with a daily expense total of 50,000 won or less');
  }
  for (const transaction of transactions) {
    await Transaction.create({
      id: newId(),
      userId: user.id,
      budgetCycleId: cycle.id,
      categoryId: transaction.categoryId,
      type: 'EXPENSE',
      amount: String(transaction.amount),
      occurredAt: dateAtOrAfterCycleStart(today, cycleStart, transaction.daysAgo),
      merchantOrTitle: `[SEED] ${transaction.title}`,
      consumptionEvaluation: transaction.consumptionEvaluation,
      source: 'MANUAL',
      status: 'CONFIRMED',
      userEdited: false,
    });
  }

  const fixedExpenses = [
    { categoryId: categories['통신비'], name: '[SEED] 휴대폰 요금', amount: 50000, daysUntilDue: 6 },
  ];
  for (const fixed of fixedExpenses) {
    const candidateDueDate = dateOnly(addDays(today, fixed.daysUntilDue));
    const dueDate = candidateDueDate > dateOnly(cycleEnd) ? dateOnly(cycleEnd) : candidateDueDate;
    const fixedExpense = await FixedExpense.create({
      id: newId(),
      userId: user.id,
      categoryId: fixed.categoryId,
      name: fixed.name,
      expectedAmount: String(fixed.amount),
      billingDay: Number(dueDate.slice(-2)),
      recurrenceType: 'MONTHLY',
      startDate: dateOnly(cycleStart),
      active: true,
    });
    await FixedExpenseOccurrence.create({ id: newId(), fixedExpenseId: fixedExpense.id, dueDate, expectedAmount: String(fixed.amount), status: 'SCHEDULED' });
  }

  for (let i = 1; i <= 6; i++) {
    await Policy.create({
      id: newId(),
      title: `[SEED] 청년정책 샘플 ${i}`,
      provider: 'MVP Seed',
      providerType: i % 2 ? 'GOVERNMENT' : 'LOCAL_GOVERNMENT',
      category: ['주거', '취업', '금융', '교육'][i % 4],
      summary: '개발 확인용 샘플 정책입니다.',
      description: '실제 정책이 아닌 로컬 개발용 mock 데이터입니다.',
      ageMin: 19,
      ageMax: 39,
      region: i % 2 ? '전국' : '서울',
      applicationUrl: 'https://example.com/mock-application',
      sourceUrl: 'https://example.com/mock-source',
    });
  }

  const result = (await new ReportService().context(user.id, today)).result;
  const expectedRemaining = 1002800;
  const expectedRecommended = Math.floor(expectedRemaining / daysInclusive(today, cycleEnd));
  const checks = {
    savingBudgetAmount: result.savingBudgetAmount === 500000,
    investmentBudgetAmount: result.investmentBudgetAmount === 250000,
    fixedExpenseBudgetAmount: result.fixedExpenseBudgetAmount === 625000,
    usableBudgetAmount: result.usableBudgetAmount === 1125000,
    variableExpenseAmount: result.variableExpenseAmount === 122200,
    fixedExpenseAmount: result.fixedExpenseAmount === 16400,
    remainingUsableAmount: result.remainingUsableAmount === expectedRemaining,
    todayRecommendedAmount: result.todayRecommendedAmount === expectedRecommended,
  };
  if (Object.values(checks).some((passed) => !passed)) {
    throw new Error(`Daily budget seed verification failed: ${JSON.stringify({ expected: { expectedRemaining, expectedRecommended }, actual: result, checks })}`);
  }

}

main()
  .catch(() => { process.exitCode = 1; })
  .finally(() => sequelize.close());
