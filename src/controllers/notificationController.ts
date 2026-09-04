import type { Request, Response } from 'express';
import { NotificationService } from '../services/notificationService';
import { jsonSafe } from '../utils/serialize';

const service = new NotificationService();

export async function ingestNotification(req: Request, res: Response) {
  const result = await service.ingest(req.authUser!.id, req.body);
  res.status(result.duplicate ? 409 : 201).json({
    success: !result.duplicate,
    data: {
      eventId: result.notification.get('eventId'),
      status: result.notification.get('status'),
      duplicate: result.duplicate,
      eventType: result.parsed.eventType,
      parsed: result.parsed,
      transactionId: result.transaction?.get('id') ?? result.notification.get('transactionId') ?? null,
    },
    ...(result.duplicate ? { error: { code: 'DUPLICATE_NOTIFICATION', message: 'Notification has already been received' } } : {}),
  });
}
