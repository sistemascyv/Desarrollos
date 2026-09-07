import { useEffect, useState, type ReactNode } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import type { BaseRecord } from '../../types';

export interface ColumnDef<T> {
  field: keyof T;
  label: string;
  type?: 'text' | 'number'; // default 'text' — controla el input al editar
}

interface Props<T extends BaseRecord & { activo: boolean }> {
  title: string;
  collection: string;
  columns: ColumnDef<T>[];
  searchFields: (keyof T)[];
  form: ReactNode;
  version: number;
  onChanged: () => void;
}

const PAGE_SIZE = 50;

export function AdminSimpleTab<T extends BaseRecord & { activo: boolean }>({
  title, collection, columns, searchFields, form, version, onChanged,
}: Props<T>) {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<T[]>([]);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<'todos' | 'activos' | 'inactivos'>('todos');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);

  // Volver a la página 1 cuando cambia la búsqueda o el filtro de estado
  // (si no, uno puede quedar viendo una "página 5" que ya no existe).
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, estado]);

  useEffect(() => {
    // Se tipea letra a letra en el buscador — esperamos un toque antes de
    // pegarle al servidor para no mandar un pedido por cada tecla.
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, page, search, estado]);

  async function load() {
    try {
      const parts: string[] = [];
      const q = search.trim();
      if (q) {
        const or = searchFields.map((f) => pb.filter(`${String(f)} ~ {:q}`, { q })).join(' || ');
        parts.push(`(${or})`);
      }
      if (estado === 'activos') parts.push('activo = true');
      if (estado === 'inactivos') parts.push('activo = false');

      // Paginado en el servidor en vez de traer todo el listado: con
      // colecciones grandes (rutas tiene miles) traer todo de una y
      // re-pedirlo entero después de cada alta/edición hacía que cargar
      // la pantalla y tipear una ruta nueva se sintiera lento.
      const result = await pb.collection(collection).getList<T>(page, PAGE_SIZE, {
        sort: String(columns[0].field),
        filter: parts.join(' && '),
      });
      setItems(result.items);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
    } catch (e) {
      toast(`No se pudo cargar ${collection}: ` + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function toggleActivo(id: string, currentlyActive: boolean) {
    try {
      await pb.collection(collection).update(id, { activo: !currentlyActive });
      await load();
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function startEdit(item: T) {
    setEditingId(item.id);
    const d: Record<string, string> = {};
    columns.forEach((c) => { d[String(c.field)] = String(item[c.field] ?? ''); });
    setDraft(d);
  }

  async function saveEdit(id: string) {
    try {
      const payload: Record<string, unknown> = {};
      for (const c of columns) {
        const raw = draft[String(c.field)] ?? '';
        payload[String(c.field)] = c.type === 'number' ? (raw.trim() === '' ? null : Number(raw)) : raw;
      }
      await pb.collection(collection).update(id, payload);
      setEditingId(null);
      await load();
      onChanged();
      toast('Guardado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function remove(id: string) {
    if (!(await confirm('¿Borrar este registro? Esta acción no se puede deshacer.', 'Borrar registro'))) return;
    try {
      await pb.collection(collection).delete(id);
      await load();
      onChanged();
      toast('Borrado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="admin-toolbar">
        <input type="text" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
          <option value="todos">Todos</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </select>
        <span className="count-badge">
          {totalItems} {totalItems === 1 ? 'registro' : 'registros'}
        </span>
        <button className="small secondary" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancelar' : '+ Agregar'}</button>
      </div>
      {showForm && <div style={{ marginTop: 10 }}>{form}</div>}
      <div className="table-wrap" style={{ maxHeight: '50vh', marginTop: 10 }}>
        <table>
          <thead>
            <tr>
              {columns.map((c) => <th key={String(c.field)}>{c.label}</th>)}
              <th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td className="empty" colSpan={columns.length + 2}>{search || estado !== 'todos' ? 'No hay resultados.' : 'Sin registros todavía.'}</td></tr>
            )}
            {items.map((item) => {
              const inactivo = item.activo === false;
              const editing = editingId === item.id;
              return (
                <tr key={item.id} className={inactivo ? 'inactivo' : ''}>
                  {columns.map((c, i) => (
                    <td key={String(c.field)} className={i === 0 ? 'admin-name' : ''}>
                      {editing ? (
                        <input
                          type={c.type === 'number' ? 'number' : 'text'}
                          value={draft[String(c.field)] ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, [String(c.field)]: e.target.value }))}
                        />
                      ) : (
                        String(item[c.field] ?? '') || (i === 0 ? '—' : '')
                      )}
                    </td>
                  ))}
                  <td>{inactivo ? <span className="badge">Inactivo</span> : <span className="badge" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>Activo</span>}</td>
                  <td className="actions-cell">
                    {editing ? (
                      <>
                        <button className="small" onClick={() => saveEdit(item.id)}>Guardar</button>
                        <button className="small secondary" onClick={() => setEditingId(null)}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button className="small secondary" onClick={() => startEdit(item)}>Editar</button>
                        <button className="small secondary" onClick={() => toggleActivo(item.id, !inactivo)}>{inactivo ? 'Reactivar' : 'Desactivar'}</button>
                        <button className="small danger" onClick={() => remove(item.id)}>Borrar</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="admin-toolbar" style={{ marginTop: 10 }}>
          <button className="small secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
          <span>Página {page} de {totalPages}</span>
          <button className="small secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente →</button>
        </div>
      )}
    </div>
  );
}
