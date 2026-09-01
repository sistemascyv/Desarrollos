import { pb } from './pb';

export interface QueueOp {
  type: 'create' | 'update' | 'delete';
  collection: string;
  id?: string;
  data?: Record<string, unknown>;
}

const QUEUE_KEY = 'cyv_pending_queue';

export function getQueue(): QueueOp[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function setQueue(q: QueueOp[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  window.dispatchEvent(new Event('cyv-queue-changed'));
}

export function queueOp(op: QueueOp) {
  const q = getQueue();
  q.push(op);
  setQueue(q);
}

export async function flushQueue(): Promise<{ ok: number; failed: number }> {
  if (!navigator.onLine) return { ok: 0, failed: getQueue().length };
  const q = getQueue();
  if (q.length === 0) return { ok: 0, failed: 0 };

  const remaining: QueueOp[] = [];
  let ok = 0;
  for (const op of q) {
    try {
      if (op.type === 'create') {
        await pb.collection(op.collection).create(op.data!);
      } else if (op.type === 'update') {
        await pb.collection(op.collection).update(op.id!, op.data!);
      } else if (op.type === 'delete') {
        await pb.collection(op.collection).delete(op.id!);
      }
      ok++;
    } catch {
      remaining.push(op);
    }
  }
  setQueue(remaining);
  return { ok, failed: remaining.length };
}
