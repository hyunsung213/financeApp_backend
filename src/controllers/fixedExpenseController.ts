import type { Request, Response } from 'express';
import { FixedExpense, FixedExpenseOccurrence } from '../models';
import { FixedExpenseService } from '../services/fixedExpenseService';
import { parseDateOnly } from '../utils/dates';
import { jsonSafe } from '../utils/serialize';

const service = new FixedExpenseService(); const uid = (req: Request) => req.authUser!.id;
export async function listFixedExpenses(req: Request, res: Response) { const data = await FixedExpense.findAll({ where: { userId: uid(req), active: true }, include: [{ model: FixedExpenseOccurrence, as: 'occurrences' }] }); res.json({ success: true, data: jsonSafe(data) }); }
export async function createFixedExpense(req: Request, res: Response) { const data = await service.create(uid(req), { ...req.body, startDate: parseDateOnly(req.body.startDate), endDate: req.body.endDate ? parseDateOnly(req.body.endDate) : undefined }); res.status(201).json({ success: true, data: jsonSafe(data) }); }
export async function matchOccurrence(req: Request, res: Response) { const data = await service.matchOccurrence(uid(req), String(req.params.occurrenceId), req.body.transactionId); res.json({ success: true, data: jsonSafe(data) }); }
