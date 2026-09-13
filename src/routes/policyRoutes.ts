import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validation';
import { policyQuerySchema, policySyncSchema, policyCalendarEventSchema } from '../validators/schemas';
import * as controller from '../controllers/policyController';

export const policyRoutes = Router();
policyRoutes.get('/', validateQuery(policyQuerySchema), controller.listPolicies);
policyRoutes.post('/sync', authMiddleware, validate(policySyncSchema), controller.syncPolicies);
policyRoutes.post('/enrich-all', authMiddleware, controller.enrichAll);
policyRoutes.post('/:id/enrich', authMiddleware, controller.enrich);
policyRoutes.get('/recommended', authMiddleware, controller.recommended);
policyRoutes.get('/bookmarks', authMiddleware, controller.bookmarks);
policyRoutes.get('/calendar', authMiddleware, controller.calendarEvents);
policyRoutes.get('/:id', controller.getPolicy);
policyRoutes.post('/:id/bookmark', authMiddleware, controller.bookmark);
policyRoutes.delete('/:id/bookmark', authMiddleware, controller.removeBookmark);
policyRoutes.post('/:id/calendar', authMiddleware, validate(policyCalendarEventSchema), controller.addCalendarEvent);
policyRoutes.delete('/:id/calendar', authMiddleware, controller.removeCalendarEvent);
