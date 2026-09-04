import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { notificationSchema } from '../validators/schemas';
import * as controller from '../controllers/notificationController';

export const notificationRoutes = Router();
notificationRoutes.use(authMiddleware);
notificationRoutes.post('/', validate(notificationSchema), controller.ingestNotification);
