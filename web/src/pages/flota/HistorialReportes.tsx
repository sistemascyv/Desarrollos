import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useAuth } from '../../lib/AuthContext';
import type { ReporteArchivo } from '../../types';

// Historial de archivos subidos a los reportes de Flota (Combustible,
// Cubiertas) — guarda los datos ya parseados, así "Ver" los vuelve a
// mostrar sin necesidad de re-subir el archivo original.
export function HistorialReportes({
  tipo,
  refreshKey,
  onCargar,
}: {
  tipo: ReporteArchivo['tipo'];
  refreshKey: number;
  onCargar: (datos: unknown[], nombreArchivo: string) => void;
}) {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<ReporteArchivo[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await pb.collection('reportes_archivo').getList<ReporteArchivo>(1, 15, {
          filter: pb.filter('tipo = {:t}', { t: tipo }),
          sort: '-created',
          expand: 'usuario',
        });
        setItems(r.items);
      } catch { /* sin historial disponible, no bloquea el reporte */ }
    })();
  }, [tipo, refreshKey]);

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este archivo del historial?')) return;
    try {
      await pb.collection('reportes_archivo').delete(id);
      setItems((cur) => cur.filter((i) => i.id !== id));
    } catch { /* ignore */ }
  }

  if (items.length === 0) return null;

  return (
    <div className="card">
      <h2>Historial de archivos cargados</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Archivo</th><th>Cargado por</th><th>Fecha</th><th></th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td className="admin-name">{it.nombre_archivo}</td>
                <td>{it.expand?.usuario?.nombre || it.expand?.usuario?.username || '—'}</td>
                <td>{new Date(it.created).toLocaleString('es-AR')}</td>
                <td>
                  <button className="small" onClick={() => onCargar(it.datos as unknown[], it.nombre_archivo)}>Ver</button>
                  {' '}
                  {isAdmin && <button className="small danger" onClick={() => eliminar(it.id)}>Eliminar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
