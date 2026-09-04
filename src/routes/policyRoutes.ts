import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { policyQuerySchema, policySyncSchema } from '../validators/schemas';
import * as controller from '../controllers/policyController';

export const policyRoutes = Router();
policyRoutes.get('/', validate(policyQuerySchema), controller.listPolicies);
policyRoutes.post('/sync', authMiddleware, validate(policySyncSchema), controller.syncPolicies);
policyRoutes.get('/recommended', authMiddleware, controller.recommended);
policyRoutes.get('/bookmarks', authMiddleware, controller.bookmarks);
policyRoutes.get('/:id', controller.getPolicy);
policyRoutes.post('/:id/bookmark', authMiddleware, controller.bookmark);
policyRoutes.delete('/:id/bookmark', authMiddleware, controller.removeBookmark);
