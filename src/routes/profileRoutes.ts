import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { userProfileSchema } from '../validators/schemas';
import * as controller from '../controllers/profileController';

export const profileRoutes = Router();
profileRoutes.use(authMiddleware);
profileRoutes.get('/', controller.getProfile);
profileRoutes.put('/', validate(userProfileSchema), controller.updateProfile);
