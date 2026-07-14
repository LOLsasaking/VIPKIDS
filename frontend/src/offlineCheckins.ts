import { storage } from '@/src/utils/storage';

const QUEUE_KEY = 'vipkids_offline_checkins';

export type QueuedCheckin = {
  id: string;
  data: {
    child_id: string;
    event_type: string;
    message?: string;
    address?: string;
  };
  queued_at: string;
};

export function isLikelyOffline(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('network request failed')
    || message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('internet connection')
    || message.includes('unable to reach the secure service')
    || message.includes('secure service did not respond');
}

export async function clearQueuedCheckins() {
  await storage.removeItem(QUEUE_KEY);
}

export async function getQueuedCheckins(): Promise<QueuedCheckin[]> {
  const raw = await storage.getItem(QUEUE_KEY, '[]');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function queueCheckin(data: QueuedCheckin['data']) {
  const queue = await getQueuedCheckins();
  queue.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, data, queued_at: new Date().toISOString() });
  await storage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return queue.length;
}

export async function flushQueuedCheckins(send: (data: QueuedCheckin['data']) => Promise<unknown>) {
  const queue = await getQueuedCheckins();
  const remaining: QueuedCheckin[] = [];
  let synced = 0;

  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];
    try {
      await send(item.data);
      synced += 1;
    } catch (error) {
      remaining.push(...queue.slice(index));
      break;
    }
  }

  await storage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  return { synced, remaining };
}
