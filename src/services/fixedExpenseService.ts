import { FixedExpense, FixedExpenseOccurrence, Transaction } from '../models';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { lastDayOfMonth, dateOnly } from '../utils/dates';
import { AppError } from '../utils/errors';
import { newId } from '../utils/ids';

export class FixedExpenseService {
  async reservedAmount(userId: string, startDate: Date, endDate: Date): Promise<number> {
    const occurrences = await FixedExpenseOccurrence.findAll({ where: { dueDate: { [Op.gte]: dateOnly(startDate), [Op.lte]: dateOnly(endDate) }, status: 'SCHEDULED' }, include: [{ model: FixedExpense, as: 'fixedExpense', where: { userId }, required: true }] });
    return occurrences.reduce((sum, occurrence) => sum + Number(occurrence.expectedAmount), 0);
  }

  async create(userId: string, data: { categoryId: string; name: string; expectedAmount: number; billingDay: number; recurrenceType: 'MONTHLY' | 'YEARLY'; startDate: Date; endDate?: Date }) {
    return sequelize.transaction(async (transaction) => {
      const fixedExpense = await FixedExpense.create({ ...data, id: newId(), userId, expectedAmount: String(data.expectedAmount), startDate: dateOnly(data.startDate), endDate: data.endDate ? dateOnly(data.endDate) : null }, { transaction });
      const count = data.recurrenceType === 'MONTHLY' ? 12 : 3; const occurrences: any[] = [];
      for (let index = 0; index < count; index++) {
        const monthOffset = data.recurrenceType === 'MONTHLY' ? index : index * 12;
        const year = data.startDate.getUTCFullYear() + Math.floor((data.startDate.getUTCMonth() + monthOffset) / 12);
        const month = (data.startDate.getUTCMonth() + monthOffset) % 12;
        const dueDate = new Date(Date.UTC(year, month, Math.min(data.billingDay, lastDayOfMonth(year, month))));
        if (data.endDate && dueDate > data.endDate) break;
        occurrences.push({ id: newId(), fixedExpenseId: fixedExpense.id, dueDate: dateOnly(dueDate), expectedAmount: String(data.expectedAmount), status: 'SCHEDULED' });
      }
      if (occurrences.length) await FixedExpenseOccurrence.bulkCreate(occurrences, { transaction });
      return fixedExpense;
    });
  }

  async matchOccurrence(userId: string, occurrenceId: string, transactionId: string) {
    const occurrence = await FixedExpenseOccurrence.findOne({ where: { id: occurrenceId }, include: [{ model: FixedExpense, as: 'fixedExpense', where: { userId }, required: true }] });
    if (!occurrence) throw new AppError('NOT_FOUND', 'Fixed expense occurrence not found', 404);
    const transaction = await Transaction.findOne({ where: { id: transactionId, userId } });
    if (!transaction) throw new AppError('NOT_FOUND', 'Transaction not found', 404);
    await occurrence.update({ matchedTransactionId: transactionId, status: 'PAID' });
    return occurrence;
  }
}
