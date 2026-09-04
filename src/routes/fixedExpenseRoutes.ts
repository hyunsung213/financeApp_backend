import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { fixedExpenseSchema } from '../validators/schemas';
import * as controller from '../controllers/fixedExpenseController';

export const fixedExpenseRoutes = Router(); fixedExpenseRoutes.use(authMiddleware);
fixedExpenseRoutes.get('/', controller.listFixedExpenses);
fixedExpenseRoutes.post('/', validate(fixedExpenseSchema), controller.createFixedExpense);
fixedExpenseRoutes.post('/occurrences/:occurrenceId/match', controller.matchOccurrence);
