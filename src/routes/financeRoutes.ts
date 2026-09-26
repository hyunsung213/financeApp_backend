import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { allocationSchema, budgetPlanSchema, financeSettingSchema } from '../validators/schemas';
import * as controller from '../controllers/financeController';

export const financeRoutes = Router();
financeRoutes.use(authMiddleware);
financeRoutes.get('/setting', controller.getFinanceSetting);
financeRoutes.put('/setting', validate(financeSettingSchema), controller.upsertFinanceSetting);
financeRoutes.get('/budget-plan', controller.getBudgetPlan);
financeRoutes.put('/budget-plan', validate(budgetPlanSchema), controller.upsertBudgetPlan);
financeRoutes.get('/allocations', controller.listAllocations);
financeRoutes.post('/allocations', validate(allocationSchema), controller.createAllocation);
financeRoutes.patch('/allocations/:id', validate(allocationSchema.partial()), controller.updateAllocation);
