import type { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Category } from '../models';
import { jsonSafe } from '../utils/serialize';
import { newId } from '../utils/ids';

const uid = (req: Request) => req.authUser!.id;
export async function listCategories(req: Request, res: Response) { const data = await Category.findAll({ where: { isActive: true, [Op.or]: [{ ownerUserId: null }, { ownerUserId: uid(req) }] }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] }); res.json({ success: true, data: jsonSafe(data) }); }
export async function createCategory(req: Request, res: Response) { const data = await Category.create({ ...req.body, id: newId(), ownerUserId: uid(req) }); res.status(201).json({ success: true, data: jsonSafe(data) }); }
