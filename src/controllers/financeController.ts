import type { Request, Response } from 'express';
import { BudgetAllocation, UserFinanceSetting } from '../models';
import { AppError } from '../utils/errors';
import { jsonSafe } from '../utils/serialize';
import { newId } from '../utils/ids';

const userId = (req: Request) => req.authUser!.id;
const percentageTotal = (items: any[]) => Math.round(items.reduce((sum, item) => sum + Number(item.percentage), 0) * 100) === 10000;

export async function getFinanceSetting(req: Request, res: Response) { const data = await UserFinanceSetting.findByPk(userId(req)); res.json({ success: true, data: jsonSafe(data) }); }
export async function upsertFinanceSetting(req: Request, res: Response) { const [data, created] = await UserFinanceSetting.findOrCreate({ where: { userId: userId(req) }, defaults: { ...req.body, userId: userId(req), salaryAmount: String(req.body.salaryAmount) } }); if (!created) await data.update({ ...req.body, salaryAmount: String(req.body.salaryAmount) }); res.json({ success: true, data: jsonSafe(data) }); }
export async function listAllocations(req: Request, res: Response) { const data = await BudgetAllocation.findAll({ where: { userId: userId(req) }, order: [['createdAt', 'ASC']] }); res.json({ success: true, data: jsonSafe(data) }); }
export async function createAllocation(req: Request, res: Response) { const uid = userId(req); const data = await BudgetAllocation.create({ ...req.body, userId: uid, id: newId() }); const active = await BudgetAllocation.findAll({ where: { userId: uid, active: true } }); if (!percentageTotal(active)) { await data.destroy(); throw new AppError('INVALID_ALLOCATION_TOTAL', 'Active allocation percentages must total 100', 400); } res.status(201).json({ success: true, data: jsonSafe(data) }); }
export async function updateAllocation(req: Request, res: Response) { const item = await BudgetAllocation.findOne({ where: { id: String(req.params.id), userId: userId(req) } }); if (!item) throw new AppError('NOT_FOUND', 'Allocation not found', 404); const previous = item.toJSON(); await item.update(req.body); const active = await BudgetAllocation.findAll({ where: { userId: userId(req), active: true } }); if (!percentageTotal(active)) { await item.update(previous); throw new AppError('INVALID_ALLOCATION_TOTAL', 'Active allocation percentages must total 100', 400); } res.json({ success: true, data: jsonSafe(item) }); }
