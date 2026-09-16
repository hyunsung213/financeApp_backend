import type { Request, Response } from 'express';
import { Op } from 'sequelize';
import { BudgetCycleService } from '../services/budgetCycleService';
import { Category, Transaction } from '../models';
import { parseDateOnly, dateOnly } from '../utils/dates';
import { AppError } from '../utils/errors';
import { jsonSafe } from '../utils/serialize';
import { newId } from '../utils/ids';

const cycleService = new BudgetCycleService(); const uid = (req: Request) => req.authUser!.id;
const ownedCategory = (categoryId: string, userId: string) => Category.findOne({ where: { id: categoryId, [Op.or]: [{ ownerUserId: userId }, { ownerUserId: null }] } });

// Columns listTransactions is allowed to sort by (query-string controlled,
// so this must stay a fixed whitelist rather than interpolating q.sort
// directly into the ORDER BY clause).
const SORTABLE_COLUMNS = new Set(['occurredAt', 'consumptionEvaluationUpdatedAt', 'createdAt']);

export async function createTransaction(req: Request, res: Response) { const cycle = await cycleService.findOrCreateForDate(uid(req), parseDateOnly(req.body.occurredAt)); if (!(await ownedCategory(req.body.categoryId, uid(req)))) throw new AppError('INVALID_CATEGORY', 'Category not found', 400); const data = await Transaction.create({ ...req.body, id: newId(), userId: uid(req), budgetCycleId: cycle!.id, amount: String(req.body.amount), occurredAt: req.body.occurredAt, userEdited: true, ...(req.body.consumptionEvaluation ? { consumptionEvaluationUpdatedAt: new Date() } : {}) }); res.status(201).json({ success: true, data: jsonSafe(data) }); }
export async function listTransactions(req: Request, res: Response) {
  const q = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(q.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(q.limit ?? 50)));
  // `evaluation` accepts a comma-separated list, e.g. evaluation=REGRETTABLE,BAD
  const evaluations = q.evaluation ? q.evaluation.split(',').map((v) => v.trim()).filter(Boolean) : undefined;
  const where: any = {
    userId: uid(req),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(evaluations && evaluations.length ? { consumptionEvaluation: { [Op.in]: evaluations } } : {}),
  };
  if (q.startDate || q.endDate) where.occurredAt = { ...(q.startDate ? { [Op.gte]: q.startDate } : {}), ...(q.endDate ? { [Op.lte]: q.endDate } : {}) };
  const sortColumn = q.sort && SORTABLE_COLUMNS.has(q.sort) ? q.sort : 'occurredAt';
  const sortOrder = q.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const [data, total] = await Promise.all([Transaction.findAll({ where, include: [{ model: Category, as: 'category' }], order: [[sortColumn, sortOrder]], offset: (page - 1) * limit, limit }), Transaction.count({ where })]);
  res.json({ success: true, data: { items: jsonSafe(data), page, limit, total } });
}
export async function getTransaction(req: Request, res: Response) { const data = await Transaction.findOne({ where: { id: String(req.params.id), userId: uid(req) }, include: [{ model: Category, as: 'category' }] }); if (!data) throw new AppError('NOT_FOUND', 'Transaction not found', 404); res.json({ success: true, data: jsonSafe(data) }); }
export async function updateTransaction(req: Request, res: Response) {
  const item = await Transaction.findOne({ where: { id: String(req.params.id), userId: uid(req) } });
  if (!item) throw new AppError('NOT_FOUND', 'Transaction not found', 404);
  if (req.body.categoryId && !(await ownedCategory(req.body.categoryId, uid(req)))) throw new AppError('INVALID_CATEGORY', 'Category not found', 400);
  // Only bump consumptionEvaluationUpdatedAt when the evaluation actually
  // changes value - the edit screen always resends the current evaluation
  // alongside unrelated field edits (amount, memo, ...), and those must not
  // be mistaken for a fresh "아쉬운 소비" evaluation moment.
  const evaluationChanged = req.body.consumptionEvaluation !== undefined && req.body.consumptionEvaluation !== item.get('consumptionEvaluation');
  const data = await item.update({ ...req.body, ...(req.body.amount !== undefined ? { amount: String(req.body.amount) } : {}), ...(req.body.occurredAt ? { occurredAt: dateOnly(parseDateOnly(req.body.occurredAt)) } : {}), ...(evaluationChanged ? { consumptionEvaluationUpdatedAt: req.body.consumptionEvaluation ? new Date() : null } : {}), userEdited: true });
  res.json({ success: true, data: jsonSafe(data) });
}
export async function deleteTransaction(req: Request, res: Response) { const result = await Transaction.destroy({ where: { id: String(req.params.id), userId: uid(req) } }); if (!result) throw new AppError('NOT_FOUND', 'Transaction not found', 404); res.json({ success: true, data: { deleted: true } }); }
