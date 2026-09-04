import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as controller from '../controllers/reportController';

export const reportRoutes = Router(); reportRoutes.use(authMiddleware);
reportRoutes.get('/summary', controller.summary);
reportRoutes.get('/daily', controller.daily);
reportRoutes.get('/monthly', controller.monthly);
reportRoutes.get('/categories', controller.categories);
reportRoutes.get('/pace', controller.pace);
