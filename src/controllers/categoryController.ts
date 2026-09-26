import type { Request, Response } from 'express';
import { CategoryService } from '../services/categoryService';
import { jsonSafe } from '../utils/serialize';

const uid = (req: Request) => req.authUser!.id;
const service = new CategoryService();
export async function listCategories(req: Request, res: Response) { res.json({ success: true, data: jsonSafe(await service.list(uid(req))) }); }
export async function listCategoryTree(req: Request, res: Response) { res.json({ success: true, data: jsonSafe(await service.tree(uid(req))) }); }
export async function createCategory(req: Request, res: Response) { res.status(201).json({ success: true, data: jsonSafe(await service.create(uid(req), req.body)) }); }
export async function updateCategory(req: Request, res: Response) { res.json({ success: true, data: jsonSafe(await service.update(uid(req), String(req.params.id), req.body)) }); }
export async function deleteCategory(req: Request, res: Response) { res.json({ success: true, data: jsonSafe(await service.remove(uid(req), String(req.params.id))) }); }
