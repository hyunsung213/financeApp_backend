import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { categoryPatchSchema, categorySchema } from '../validators/schemas';
import * as controller from '../controllers/categoryController';

export const categoryRoutes = Router(); categoryRoutes.use(authMiddleware);
categoryRoutes.get('/', controller.listCategories);
categoryRoutes.get('/tree', controller.listCategoryTree);
categoryRoutes.post('/', validate(categorySchema), controller.createCategory);
categoryRoutes.patch('/:id', validate(categoryPatchSchema), controller.updateCategory);
categoryRoutes.delete('/:id', controller.deleteCategory);
