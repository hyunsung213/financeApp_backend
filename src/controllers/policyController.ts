import type { Request, Response } from 'express';
import { PolicyService } from '../services/policyService';
import { jsonSafe } from '../utils/serialize';

const service = new PolicyService(); const uid = (req: Request) => req.authUser!.id;
export async function listPolicies(req: Request, res: Response) { const q = (res.locals.validatedQuery ?? req.query) as any; res.json({ success: true, data: await service.list(q) }); }
export async function syncPolicies(req: Request, res: Response) { res.json({ success: true, data: await service.syncFromYouthPolicyApi(req.body) }); }
export async function enrich(req: Request, res: Response) { res.json({ success: true, data: await service.enrich(String(req.params.id)) }); }
export async function enrichAll(_req: Request, res: Response) { res.json({ success: true, data: await service.enrichAll() }); }
export async function recommended(req: Request, res: Response) { res.json({ success: true, data: jsonSafe(await service.recommended(uid(req))) }); }
export async function getPolicy(req: Request, res: Response) { res.json({ success: true, data: await service.get(String(req.params.id)) }); }
export async function bookmark(req: Request, res: Response) { res.status(201).json({ success: true, data: await service.bookmark(uid(req), String(req.params.id)) }); }
export async function removeBookmark(req: Request, res: Response) { await service.removeBookmark(uid(req), String(req.params.id)); res.json({ success: true, data: { deleted: true } }); }
export async function bookmarks(req: Request, res: Response) { res.json({ success: true, data: await service.bookmarks(uid(req)) }); }
export async function addCalendarEvent(req: Request, res: Response) { res.status(201).json({ success: true, data: await service.addCalendarEvent(uid(req), String(req.params.id), String(req.body.eventDate)) }); }
export async function removeCalendarEvent(req: Request, res: Response) { await service.removeCalendarEvent(uid(req), String(req.params.id)); res.json({ success: true, data: { deleted: true } }); }
export async function calendarEvents(req: Request, res: Response) { res.json({ success: true, data: await service.calendarEvents(uid(req)) }); }
