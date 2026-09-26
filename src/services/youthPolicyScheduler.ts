import cron from 'node-cron';
import { env } from '../config/env';
import { PolicyService } from './policyService';

export function startYouthPolicyScheduler(policyService = new PolicyService()) {
  if (!env.POLICY_SYNC_SCHEDULER_ENABLED || env.NODE_ENV === 'test') return () => undefined;

  let running = false;
  const task = cron.schedule(env.POLICY_SYNC_CRON, async () => {
    if (running) return;
    running = true;
    try {
      await policyService.syncAllFromYouthPolicyApi({ display: env.POLICY_SYNC_PAGE_SIZE });
    } catch {
      // The next scheduled run retries the synchronization.
    } finally {
      running = false;
    }
  }, { timezone: env.POLICY_SYNC_TIMEZONE, noOverlap: true });

  return () => task.stop();
}
