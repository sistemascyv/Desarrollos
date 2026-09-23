export function money(n: unknown): string {
  const v = Number(n) || 0;
  return v.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
}

export function isoDate(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function uid(): string {
  return 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

// PocketBase manda "created"/"updated" con espacio ("2026-09-22 12:34:56.789Z")
// en vez del "T" que exige ISO 8601 -- lo normalizamos antes de crear el
// Date. Además, toLocaleString('es-AR') sin opciones devuelve reloj de 12
// horas SIN indicar a.m./p.m. en este entorno (13:31 se mostraba "01:31"),
// así que forzamos 24 horas explícitamente.
export function fechaHora(pbDate: string | undefined | null): string {
  return pbDate ? new Date(pbDate.replace(' ', 'T')).toLocaleString('es-AR', { hour12: false }) : '';
}

// Para campos PocketBase type:"date" (sin hora real, ej "2026-09-23 00:00:00.000Z").
// A diferencia de fechaHora(), nunca construye un Date -- así se evita que la
// conversión a horario de Argentina (UTC-3) corra el día para atrás cuando el
// valor guardado está a medianoche UTC.
export function fechaSola(pbDate: string | undefined | null): string {
  if (!pbDate) return '';
  const [y, m, d] = pbDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
