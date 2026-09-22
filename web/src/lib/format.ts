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
// en vez del "T" que exige ISO 8601. Algunos navegadores lo aceptan igual,
// otros lo interpretan como hora LOCAL en vez de UTC -- mismo dato, hora
// mostrada corrida. Este helper lo normaliza antes de crear el Date.
export function fechaHora(pbDate: string | undefined | null): string {
  return pbDate ? new Date(pbDate.replace(' ', 'T')).toLocaleString('es-AR') : '';
}
