// Lo que devuelve pb_hooks/pressa.pb.js, ya aplanado desde la respuesta
// cruda de la API de Pressa (ver ese hook para el mapeo completo).
export interface VehiculoPressa {
  id: string;
  alias: string;
  patente: string;
  marca: string;
  modelo: string;
  estado: string;
  estadoColor: string | null;
  velocidad: number;
  km: number;
  lat: number | null;
  lng: number | null;
  direccion: string;
  actualizado: number | null; // unix seconds
  temperaturas: number[];
  bateriaAux: number | null;
  bateriaPrincipal: number | null;
}

export interface PuntoRuta {
  lat: number;
  lng: number;
  timestamp: number | null;
  velocidad: number;
}

export const num = (n: number, d = 0) => n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function formatoFecha(unixSeconds: number | null): string {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toLocaleString('es-AR');
}

export function haceCuanto(unixSeconds: number | null): string {
  if (!unixSeconds) return '—';
  const seg = Math.floor(Date.now() / 1000) - unixSeconds;
  if (seg < 60) return 'recién';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  return `hace ${Math.floor(seg / 86400)} d`;
}
