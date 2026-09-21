import { ClientResponseError } from 'pocketbase';
import { pb } from './pb';

export interface QueueOp {
  qid: string;
  type: 'create' | 'update' | 'delete';
  collection: string;
  id?: string;
  data?: Record<string, unknown>;
  // id provisorio del registro que se creó sin conexión, para poder corregir o
  // sacar de la cola ese mismo "create" si el usuario lo edita/borra antes de
  // que se sincronice.
  tmpId?: string;
  label?: string; // qué es, para mostrárselo al usuario si hay que revisarlo
  intentos?: number; // reintentos ante errores 5xx
}

export interface RejectedOp extends QueueOp {
  error: string;
}

const QUEUE_KEY = 'cyv_pending_queue';
const REJECTED_KEY = 'cyv_rejected_queue';
const MAX_INTENTOS = 5;

function leer<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function escribir(key: string, valor: unknown[]) {
  localStorage.setItem(key, JSON.stringify(valor));
  window.dispatchEvent(new Event('cyv-queue-changed'));
}

function nuevoQid() {
  return 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

export function getQueue(): QueueOp[] {
  // las operaciones guardadas antes de esta versión no tienen qid
  let cambio = false;
  const q = leer<QueueOp>(QUEUE_KEY).map((op) => {
    if (op.qid) return op;
    cambio = true;
    return { ...op, qid: nuevoQid() };
  });
  if (cambio) localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  return q;
}

export function getRejected(): RejectedOp[] {
  return leer<RejectedOp>(REJECTED_KEY);
}

export function queueOp(op: Omit<QueueOp, 'qid'>): QueueOp {
  const completa: QueueOp = { ...op, qid: nuevoQid() };
  escribir(QUEUE_KEY, [...getQueue(), completa]);
  return completa;
}

// El usuario editó un registro que todavía está pendiente de crearse: en vez de
// encolar un "update" contra un id que el servidor no conoce (fallaría para
// siempre), se corrige el "create" que ya está en la cola.
export function amendQueuedCreate(tmpId: string, data: Record<string, unknown>): boolean {
  const q = getQueue();
  const i = q.findIndex((o) => o.type === 'create' && o.tmpId === tmpId);
  if (i < 0) return false;
  q[i] = { ...q[i], data };
  escribir(QUEUE_KEY, q);
  return true;
}

// Idem al borrar: si el "create" todavía no salió, alcanza con sacarlo de la cola.
export function removeQueuedCreate(tmpId: string): boolean {
  const q = getQueue();
  const resto = q.filter((o) => !(o.type === 'create' && o.tmpId === tmpId));
  if (resto.length === q.length) return false;
  escribir(QUEUE_KEY, resto);
  return true;
}

export function discardRejected(qid: string) {
  escribir(REJECTED_KEY, getRejected().filter((o) => o.qid !== qid));
}

export function retryRejected(qid: string) {
  const rechazadas = getRejected();
  const op = rechazadas.find((o) => o.qid === qid);
  if (!op) return;
  const { error: _error, ...sinError } = op;
  localStorage.setItem(REJECTED_KEY, JSON.stringify(rechazadas.filter((o) => o.qid !== qid)));
  escribir(QUEUE_KEY, [...getQueue(), { ...sinError, intentos: 0 }]);
}

// Sin conexión de verdad (no llegó al servidor). Cualquier otro error es una
// respuesta del servidor (400/403/404/…): reintentar no lo arregla, y decirle al
// usuario "sin conexión" sería mentirle.
export function esErrorDeRed(e: unknown): boolean {
  return e instanceof ClientResponseError && e.status === 0;
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof ClientResponseError) {
    const data = e.response?.data as Record<string, { message?: string }> | undefined;
    const detalle = data ? Object.entries(data).map(([campo, v]) => `${campo}: ${v?.message ?? ''}`).join('; ') : '';
    const base = (e.response?.message as string | undefined) || e.message;
    return detalle ? `${base} (${detalle})` : base;
  }
  return e instanceof Error ? e.message : String(e);
}

function quitar(qid: string) {
  escribir(QUEUE_KEY, getQueue().filter((o) => o.qid !== qid));
}

function rechazar(op: QueueOp, error: string) {
  localStorage.setItem(REJECTED_KEY, JSON.stringify([...getRejected(), { ...op, error }]));
  quitar(op.qid);
}

async function ejecutar(op: QueueOp) {
  if (op.type === 'create') await pb.collection(op.collection).create(op.data!);
  else if (op.type === 'update') await pb.collection(op.collection).update(op.id!, op.data!);
  else await pb.collection(op.collection).delete(op.id!);
}

export interface FlushResult {
  ok: number;
  failed: number;
}

async function sincronizar(): Promise<FlushResult> {
  if (!navigator.onLine) return { ok: 0, failed: getQueue().length };
  let ok = 0;
  const saltadas = new Set<string>(); // fallaron con 5xx en esta pasada: se reintentan en la próxima
  for (;;) {
    // se relee la cola en cada vuelta: lo que el usuario encole mientras se
    // sincroniza no se pisa (antes se sobrescribía la cola entera al final).
    const op = getQueue().find((o) => !saltadas.has(o.qid));
    if (!op) break;
    try {
      await ejecutar(op);
      quitar(op.qid);
      ok++;
    } catch (e) {
      if (esErrorDeRed(e)) break; // sigue sin conexión: se conserva todo
      const status = e instanceof ClientResponseError ? e.status : 0;
      if (op.type === 'delete' && status === 404) { quitar(op.qid); ok++; continue; } // ya no existe: objetivo cumplido
      if (status >= 500 || status === 429) {
        const intentos = (op.intentos || 0) + 1;
        if (intentos >= MAX_INTENTOS) rechazar(op, `El servidor falló ${MAX_INTENTOS} veces seguidas: ${mensajeDeError(e)}`);
        else escribir(QUEUE_KEY, getQueue().map((o) => (o.qid === op.qid ? { ...o, intentos } : o)));
        saltadas.add(op.qid);
        continue;
      }
      rechazar(op, mensajeDeError(e));
    }
  }
  if (ok > 0) window.dispatchEvent(new CustomEvent('cyv-queue-flushed', { detail: { ok } }));
  return { ok, failed: getQueue().length };
}

let enCurso: Promise<FlushResult> | null = null;

// Una sola sincronización a la vez (entre pestañas también, con Web Locks):
// el intervalo de 30s y el "Sincronizar ahora" podían correr en paralelo y
// ejecutar dos veces las mismas operaciones.
export function flushQueue(): Promise<FlushResult> {
  if (enCurso) return enCurso;
  const correr = navigator.locks
    ? navigator.locks.request('cyv-flush-queue', { ifAvailable: true }, async (lock) => (lock ? sincronizar() : { ok: 0, failed: getQueue().length }))
    : sincronizar();
  enCurso = Promise.resolve(correr).finally(() => { enCurso = null; });
  return enCurso;
}
