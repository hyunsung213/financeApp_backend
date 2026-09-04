import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { categorySchema } from '../validators/schemas';
import * as controller from '../controllers/categoryController';

export const categoryRoutes = Router(); categoryRoutes.use(authMiddleware);
categoryRoutes.get('/', controller.listCategories);
categoryRoutes.post('/', validate(categorySchema), controller.createCategory);
