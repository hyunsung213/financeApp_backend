import { DataTypes, type Sequelize } from 'sequelize';
import { sequelize } from '../config/database';

const enumType = (...values: string[]) => DataTypes.ENUM(...values);
const timestamps = { timestamps: true, createdAt: 'createdAt', updatedAt: 'updatedAt' };

export const User = sequelize.define<any>('User', {
  id: { type: DataTypes.UUID, primaryKey: true, allowNull: false }, email: { type: DataTypes.STRING, allowNull: false, unique: true }, nickname: DataTypes.STRING, age: DataTypes.INTEGER, region: DataTypes.STRING,
  timezone: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Asia/Seoul' },
}, { tableName: 'User', ...timestamps });

export const UserFinanceSetting = sequelize.define<any>('UserFinanceSetting', {
  userId: { type: DataTypes.UUID, primaryKey: true, allowNull: false }, salaryAmount: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }, salaryDay: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 25 }, reportingStartDay: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
}, { tableName: 'UserFinanceSetting', ...timestamps });

export const BudgetAllocation = sequelize.define<any>('BudgetAllocation', {
  id: { type: DataTypes.STRING, primaryKey: true }, userId: { type: DataTypes.UUID, allowNull: false }, categoryId: DataTypes.STRING, name: { type: DataTypes.STRING, allowNull: false }, allocationType: { type: enumType('SAVING', 'INVESTMENT', 'FIXED_LIVING', 'FLEXIBLE', 'TRANSPORT', 'COMMUNICATION', 'SUBSCRIPTION', 'HOUSING', 'FOOD', 'OTHER'), allowNull: false }, percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: false }, spendability: { type: enumType('LOCKED', 'RESERVED', 'FLEXIBLE'), allowNull: false }, active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: 'BudgetAllocation', ...timestamps, indexes: [{ fields: ['userId', 'active'] }] });

export const BudgetCycle = sequelize.define<any>('BudgetCycle', {
  id: { type: DataTypes.STRING, primaryKey: true }, userId: { type: DataTypes.UUID, allowNull: false }, startDate: { type: DataTypes.DATEONLY, allowNull: false }, endDate: { type: DataTypes.DATEONLY, allowNull: false }, salarySnapshot: { type: DataTypes.BIGINT, allowNull: false }, plannedSavingAmount: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }, plannedInvestmentAmount: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }, plannedFlexibleAmount: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }, plannedReservedAmount: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }, status: { type: enumType('UPCOMING', 'ACTIVE', 'CLOSED'), allowNull: false, defaultValue: 'UPCOMING' },
}, { tableName: 'BudgetCycle', ...timestamps, indexes: [{ unique: true, fields: ['userId', 'startDate'] }, { fields: ['userId', 'startDate', 'endDate'] }] });

export const BudgetCycleAllocation = sequelize.define<any>('BudgetCycleAllocation', {
  id: { type: DataTypes.STRING, primaryKey: true }, budgetCycleId: { type: DataTypes.STRING, allowNull: false }, allocationId: { type: DataTypes.STRING, allowNull: false }, categoryId: DataTypes.STRING, name: { type: DataTypes.STRING, allowNull: false }, percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: false }, amount: { type: DataTypes.BIGINT, allowNull: false }, spendability: { type: enumType('LOCKED', 'RESERVED', 'FLEXIBLE'), allowNull: false },
}, { tableName: 'BudgetCycleAllocation', timestamps: false, indexes: [{ unique: true, fields: ['budgetCycleId', 'allocationId'] }] });

export const Category = sequelize.define<any>('Category', {
  id: { type: DataTypes.STRING, primaryKey: true }, ownerUserId: DataTypes.UUID, sourceCategoryId: DataTypes.STRING, parentCategoryId: DataTypes.STRING, name: { type: DataTypes.STRING, allowNull: false }, type: { type: enumType('EXPENSE', 'INCOME', 'SAVING'), allowNull: false }, purposeType: { type: enumType('GENERAL', 'SAVING', 'INVESTMENT'), allowNull: false, defaultValue: 'GENERAL' }, isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: 'Category', ...timestamps, indexes: [{ fields: ['ownerUserId', 'isActive'] }] });

export const Transaction = sequelize.define<any>('Transaction', {
  id: { type: DataTypes.STRING, primaryKey: true }, userId: { type: DataTypes.UUID, allowNull: false }, budgetCycleId: DataTypes.STRING, categoryId: { type: DataTypes.STRING, allowNull: false }, notificationId: DataTypes.STRING, type: { type: enumType('EXPENSE', 'INCOME', 'SAVING'), allowNull: false }, amount: { type: DataTypes.BIGINT, allowNull: false }, refundedAmount: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }, occurredAt: { type: DataTypes.DATEONLY, allowNull: false }, merchantOrTitle: { type: DataTypes.STRING, allowNull: false }, memo: DataTypes.STRING, consumptionEvaluation: { type: enumType('GOOD', 'NORMAL', 'REGRETTABLE', 'BAD'), allowNull: true }, source: { type: enumType('MANUAL', 'AUTO', 'RECEIPT', 'FIXED'), allowNull: false, defaultValue: 'MANUAL' }, status: { type: enumType('CONFIRMED', 'PENDING', 'EXCLUDED'), allowNull: false, defaultValue: 'CONFIRMED' }, userEdited: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'Transaction', ...timestamps, indexes: [{ fields: ['userId', 'occurredAt'] }, { fields: ['userId', 'budgetCycleId'] }, { fields: ['userId', 'status', 'occurredAt'] }, { unique: true, fields: ['notificationId'] }] });

export const FixedExpense = sequelize.define<any>('FixedExpense', {
  id: { type: DataTypes.STRING, primaryKey: true }, userId: { type: DataTypes.UUID, allowNull: false }, categoryId: { type: DataTypes.STRING, allowNull: false }, name: { type: DataTypes.STRING, allowNull: false }, expectedAmount: { type: DataTypes.BIGINT, allowNull: false }, billingDay: { type: DataTypes.INTEGER, allowNull: false }, recurrenceType: { type: enumType('MONTHLY', 'YEARLY'), allowNull: false }, startDate: { type: DataTypes.DATEONLY, allowNull: false }, endDate: DataTypes.DATEONLY, active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: 'FixedExpense', ...timestamps, indexes: [{ fields: ['userId'] }] });

export const FixedExpenseOccurrence = sequelize.define<any>('FixedExpenseOccurrence', {
  id: { type: DataTypes.STRING, primaryKey: true }, fixedExpenseId: { type: DataTypes.STRING, allowNull: false }, dueDate: { type: DataTypes.DATEONLY, allowNull: false }, expectedAmount: { type: DataTypes.BIGINT, allowNull: false }, status: { type: enumType('SCHEDULED', 'PAID', 'SKIPPED', 'CANCELLED'), allowNull: false, defaultValue: 'SCHEDULED' }, matchedTransactionId: { type: DataTypes.STRING, unique: true },
}, { tableName: 'FixedExpenseOccurrence', timestamps: false, indexes: [{ fields: ['fixedExpenseId', 'dueDate'] }] });

export const NotificationInbox = sequelize.define<any>('NotificationInbox', {
  id: { type: DataTypes.STRING, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  eventId: { type: DataTypes.STRING(255), allowNull: false },
  packageName: { type: DataTypes.STRING(255), allowNull: false },
  title: { type: DataTypes.STRING(500), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
  timestamp: { type: DataTypes.BIGINT, allowNull: false },
  source: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'ANDROID_NOTIFICATION' },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'RECEIVED' },
  eventType: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'UNKNOWN' },
  parsedAmount: DataTypes.BIGINT,
  parsedOccurredAt: DataTypes.DATEONLY,
  parsedMerchant: DataTypes.STRING(255),
  parsedCategoryId: DataTypes.STRING(255),
  parseConfidence: DataTypes.DECIMAL(5, 4),
  parseStatus: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'REVIEW_REQUIRED' },
  transactionId: DataTypes.STRING(255),
}, { tableName: 'NotificationInbox', ...timestamps, indexes: [{ unique: true, fields: ['userId', 'eventId'] }, { fields: ['userId', 'createdAt'] }, { fields: ['userId', 'parseStatus'] }] });

export const Policy = sequelize.define<any>('Policy', {
  id: { type: DataTypes.STRING, primaryKey: true }, title: { type: DataTypes.STRING, allowNull: false }, provider: { type: DataTypes.STRING, allowNull: false }, providerType: { type: enumType('GOVERNMENT', 'LOCAL_GOVERNMENT', 'PUBLIC', 'PRIVATE'), allowNull: false }, category: { type: DataTypes.STRING, allowNull: false }, summary: { type: DataTypes.STRING, allowNull: false }, description: { type: DataTypes.TEXT, allowNull: false }, ageMin: DataTypes.INTEGER, ageMax: DataTypes.INTEGER, region: DataTypes.STRING, applicationStartDate: DataTypes.DATEONLY, applicationEndDate: DataTypes.DATEONLY, applicationUrl: { type: DataTypes.TEXT, allowNull: false }, sourceUrl: { type: DataTypes.TEXT, allowNull: false }, dataCollectedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, presentation: DataTypes.JSONB, presentationGeneratedAt: DataTypes.DATE, presentationVersion: DataTypes.STRING(32), presentationSourceHash: DataTypes.STRING(64), presentationProvider: DataTypes.STRING(32),
}, { tableName: 'Policy', ...timestamps, indexes: [{ fields: ['category'] }, { fields: ['applicationEndDate'] }, { fields: ['region'] }] });

export const PolicyBookmark = sequelize.define<any>('PolicyBookmark', {
  id: { type: DataTypes.STRING, primaryKey: true }, userId: { type: DataTypes.UUID, allowNull: false }, policyId: { type: DataTypes.STRING, allowNull: false }, createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'PolicyBookmark', timestamps: false, indexes: [{ unique: true, fields: ['userId', 'policyId'] }] });

export const PolicyCalendarEvent = sequelize.define<any>('PolicyCalendarEvent', {
  id: { type: DataTypes.STRING, primaryKey: true }, userId: { type: DataTypes.UUID, allowNull: false }, policyId: { type: DataTypes.STRING, allowNull: false }, eventDate: { type: DataTypes.DATEONLY, allowNull: false }, note: DataTypes.STRING, createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { tableName: 'PolicyCalendarEvent', timestamps: false, indexes: [{ fields: ['userId', 'eventDate'] }] });

User.hasOne(UserFinanceSetting, { foreignKey: 'userId', as: 'financeSetting' }); UserFinanceSetting.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(BudgetAllocation, { foreignKey: 'userId', as: 'allocations' }); BudgetAllocation.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(BudgetCycle, { foreignKey: 'userId', as: 'cycles' }); BudgetCycle.belongsTo(User, { foreignKey: 'userId', as: 'user' });
BudgetCycle.hasMany(BudgetCycleAllocation, { foreignKey: 'budgetCycleId', as: 'allocations' }); BudgetCycleAllocation.belongsTo(BudgetCycle, { foreignKey: 'budgetCycleId', as: 'budgetCycle' }); BudgetCycleAllocation.belongsTo(BudgetAllocation, { foreignKey: 'allocationId', as: 'allocation' });
User.hasMany(Category, { foreignKey: 'ownerUserId', as: 'categories' }); Category.belongsTo(User, { foreignKey: 'ownerUserId', as: 'owner' }); Category.belongsTo(Category, { foreignKey: 'parentCategoryId', as: 'parent' }); Category.hasMany(Category, { foreignKey: 'parentCategoryId', as: 'children' });
User.hasMany(Transaction, { foreignKey: 'userId', as: 'transactions' }); Transaction.belongsTo(User, { foreignKey: 'userId', as: 'user' }); Transaction.belongsTo(BudgetCycle, { foreignKey: 'budgetCycleId', as: 'budgetCycle' }); BudgetCycle.hasMany(Transaction, { foreignKey: 'budgetCycleId', as: 'transactions' }); Transaction.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' }); Category.hasMany(Transaction, { foreignKey: 'categoryId', as: 'transactions' });
User.hasMany(FixedExpense, { foreignKey: 'userId', as: 'fixedExpenses' }); FixedExpense.belongsTo(User, { foreignKey: 'userId', as: 'user' }); FixedExpense.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' }); Category.hasMany(FixedExpense, { foreignKey: 'categoryId', as: 'fixedExpenses' }); FixedExpense.hasMany(FixedExpenseOccurrence, { foreignKey: 'fixedExpenseId', as: 'occurrences' }); FixedExpenseOccurrence.belongsTo(FixedExpense, { foreignKey: 'fixedExpenseId', as: 'fixedExpense' }); FixedExpenseOccurrence.belongsTo(Transaction, { foreignKey: 'matchedTransactionId', as: 'matchedTransaction' }); Transaction.hasOne(FixedExpenseOccurrence, { foreignKey: 'matchedTransactionId', as: 'matchedOccurrence' });
User.hasMany(NotificationInbox, { foreignKey: 'userId', as: 'notificationInbox' }); NotificationInbox.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Policy.hasMany(PolicyBookmark, { foreignKey: 'policyId', as: 'bookmarks' }); PolicyBookmark.belongsTo(Policy, { foreignKey: 'policyId', as: 'policy' }); User.hasMany(PolicyBookmark, { foreignKey: 'userId', as: 'policyBookmarks' }); PolicyBookmark.belongsTo(User, { foreignKey: 'userId', as: 'user' }); Policy.hasMany(PolicyCalendarEvent, { foreignKey: 'policyId', as: 'calendarEvents' }); PolicyCalendarEvent.belongsTo(Policy, { foreignKey: 'policyId', as: 'policy' }); User.hasMany(PolicyCalendarEvent, { foreignKey: 'userId', as: 'policyCalendarEvents' }); PolicyCalendarEvent.belongsTo(User, { foreignKey: 'userId', as: 'user' });

export const models = { User, UserFinanceSetting, BudgetAllocation, BudgetCycle, BudgetCycleAllocation, Category, Transaction, FixedExpense, FixedExpenseOccurrence, NotificationInbox, Policy, PolicyBookmark, PolicyCalendarEvent };
export type ModelMap = typeof models;
export function initializeModels(_connection: Sequelize = sequelize) { return models; }
