import PocketBase from 'pocketbase';

// La app siempre se sirve desde el mismo origen que PocketBase (Caddy
// proxea /api y /_ a PocketBase, y sirve el resto de este build estático).
// Si algún día hiciera falta apuntar a otro origen (ej. abrir el build
// localmente), se puede pisar con VITE_PB_URL en tiempo de build.
const pbUrl = import.meta.env.VITE_PB_URL || window.location.origin;

export const pb = new PocketBase(pbUrl);

// autoCancellation cancela requests duplicados al mismo endpoint; en una
// SPA con varias vistas pidiendo datos en paralelo da falsos "autocancelled",
// así que lo desactivamos y manejamos nosotros cuándo recargar.
pb.autoCancellation(false);
