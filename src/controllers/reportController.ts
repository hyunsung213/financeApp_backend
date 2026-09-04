import type { Request, Response } from 'express';
import { ReportService } from '../services/reportService';
import { jsonSafe } from '../utils/serialize';

const service = new ReportService(); const uid = (req: Request) => req.authUser!.id;
export async function summary(req: Request, res: Response) { res.json({ success: true, data: jsonSafe(await service.summary(uid(req), String(req.query.startDate || '') || undefined, String(req.query.endDate || '') || undefined)) }); }
export async function daily(req: Request, res: Response) { res.json({ success: true, data: jsonSafe(await service.dailyReport(uid(req), String(req.query.startDate || '') || undefined, String(req.query.endDate || '') || undefined)) }); }
export async function monthly(req: Request, res: Response) { res.json({ success: true, data: jsonSafe(await service.monthly(uid(req))) }); }
export async function categories(req: Request, res: Response) { res.json({ success: true, data: jsonSafe(await service.categories(uid(req), String(req.query.startDate || '') || undefined, String(req.query.endDate || '') || undefined)) }); }
export async function pace(req: Request, res: Response) { res.json({ success: true, data: jsonSafe(await service.pace(uid(req))) }); }
