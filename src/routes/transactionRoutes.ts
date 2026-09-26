import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { refundSchema, transactionPatchSchema, transactionSchema } from '../validators/schemas';
import * as controller from '../controllers/transactionController';

export const transactionRoutes = Router();
transactionRoutes.use(authMiddleware);
transactionRoutes.post('/', validate(transactionSchema), controller.createTransaction);
transactionRoutes.get('/', controller.listTransactions);
transactionRoutes.get('/:id', controller.getTransaction);
transactionRoutes.patch('/:id', validate(transactionPatchSchema), controller.updateTransaction);
transactionRoutes.patch('/:id/refund', validate(refundSchema), controller.addRefund);
transactionRoutes.delete('/:id', controller.deleteTransaction);
