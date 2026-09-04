import { UniqueConstraintError } from 'sequelize';
import { env } from '../config/env';
import { NotificationInbox, Transaction } from '../models';
import { BudgetCycleService } from './budgetCycleService';
import { parseDateOnly } from '../utils/dates';
import { CATEGORY_IDS } from '../constants/categoryCatalog';
import { parseNotification } from './notificationParsers';
import { AppError } from '../utils/errors';
import { newId } from '../utils/ids';

const allowedPackages = new Set(env.NOTIFICATION_ALLOWED_PACKAGES.split(',').map((value) => value.trim()).filter(Boolean));

export type NotificationInput = {
  eventId: string;
  packageName: string;
  title: string;
  content: string;
  timestamp: number;
  source: 'ANDROID_NOTIFICATION';
};

export class NotificationService {
  private cycles = new BudgetCycleService();

  async ingest(userId: string, input: NotificationInput) {
    if (!allowedPackages.has(input.packageName)) {
      throw new AppError('UNSUPPORTED_NOTIFICATION_PACKAGE', 'Notification package is not allowed', 400);
    }
    if (!input.title.trim() && !input.content.trim()) {
      throw new AppError('EMPTY_NOTIFICATION', 'Notification title or content is required', 400);
    }

    const parsed = parseNotification(input);
    const existing = await NotificationInbox.findOne({ where: { userId, eventId: input.eventId } });
    if (existing?.get('transactionId')) return { notification: existing, transaction: null, parsed, duplicate: true };

    try {
      const notification = existing ?? await NotificationInbox.create({
          id: newId(),
          userId,
          ...input,
          title: input.title.trim(),
          content: input.content.trim(),
          timestamp: String(input.timestamp),
          status: 'RECEIVED',
          eventType: parsed.eventType,
          parsedAmount: parsed.amount === null ? null : String(parsed.amount),
          parsedOccurredAt: parsed.occurredAt,
          parsedMerchant: parsed.merchant,
          parsedCategoryId: parsed.categoryId,
          parseConfidence: parsed.confidence,
          parseStatus: parsed.parseStatus,
        });
      let transaction = null;
      if (parsed.eventType === 'CARD_APPROVAL' && parsed.amount && parsed.occurredAt) {
        const cycle = await this.cycles.findOrCreateForDate(userId, parseDateOnly(parsed.occurredAt));
        transaction = await Transaction.create({
          id: newId(),
          userId,
          budgetCycleId: cycle!.id,
          notificationId: notification.get('id'),
          categoryId: parsed.categoryId ?? CATEGORY_IDS.EXPENSE_UNCLASSIFIED,
          type: 'EXPENSE',
          amount: String(parsed.amount),
          occurredAt: parsed.occurredAt,
          merchantOrTitle: parsed.merchant ?? (input.title.trim() || '자동 수집 지출'),
          memo: 'Android 알림 자동 등록',
          source: 'AUTO',
          status: parsed.confidence >= 0.9 && parsed.categoryId ? 'CONFIRMED' : 'PENDING',
          userEdited: false,
        });
        await notification.update({ transactionId: transaction.get('id'), status: 'PROCESSED', parseStatus: 'PARSED' });
      }
      return { notification, transaction, parsed, duplicate: false };
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const concurrent = await NotificationInbox.findOne({ where: { userId, eventId: input.eventId } });
        if (concurrent) return { notification: concurrent, transaction: null, parsed, duplicate: true };
      }
      throw error;
    }
  }
}
