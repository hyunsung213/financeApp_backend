import type { Request, Response } from 'express';
import { User } from '../models';
import { AppError } from '../utils/errors';
import { jsonSafe } from '../utils/serialize';

const userId = (req: Request) => req.authUser!.id;

export async function getProfile(req: Request, res: Response) {
  const profile = await User.findByPk(userId(req), { attributes: ['id', 'email', 'nickname', 'age', 'region', 'timezone'] });
  if (!profile) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
  res.json({ success: true, data: jsonSafe(profile) });
}

export async function updateProfile(req: Request, res: Response) {
  const profile = await User.findByPk(userId(req));
  if (!profile) throw new AppError('USER_NOT_FOUND', 'User not found', 404);
  // Only fields present in the request are written, so a nickname-only update
  // leaves age/region untouched (and vice versa).
  const { nickname, age, region } = req.body;
  const changes = Object.fromEntries(Object.entries({ nickname, age, region }).filter(([, value]) => value !== undefined));
  await profile.update(changes);
  res.json({ success: true, data: jsonSafe(profile) });
}
