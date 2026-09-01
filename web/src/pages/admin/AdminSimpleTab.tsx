import { useEffect, useState, type ReactNode } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import type { BaseRecord } from '../../types';

export interface ColumnDef<T> {
  field: keyof T;
  label: string;
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

export function AdminSimpleTab<T extends BaseRecord & { activo: boolean }>({
  title, collection, columns, searchFields, form, version, onChanged,
}: Props<T>) {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<T[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  async function load() {
    try {
      const list = await pb.collection(collection).getFullList<T>({ sort: '-created' });
      setItems(list);
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

  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter((item) => searchFields.some((f) => String(item[f] ?? '').toLowerCase().includes(q))) : items;

  return (
    <div className="card">
      <h2>{title}</h2>
      {form}
      <div className="admin-toolbar">
        <input type="text" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="count-badge">
          {filtered.length}{q ? ` de ${items.length}` : ''} {filtered.length === 1 ? 'registro' : 'registros'}
        </span>
      </div>
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
              <tr><td className="empty" colSpan={columns.length + 2}>Sin registros todavía.</td></tr>
            )}
            {items.length > 0 && filtered.length === 0 && (
              <tr><td className="empty" colSpan={columns.length + 2}>No hay resultados para "{search}".</td></tr>
            )}
            {filtered.map((item) => {
              const inactivo = item.activo === false;
              return (
                <tr key={item.id} className={inactivo ? 'inactivo' : ''}>
                  {columns.map((c, i) => (
                    <td key={String(c.field)} className={i === 0 ? 'admin-name' : ''}>
                      {String(item[c.field] ?? '') || (i === 0 ? '—' : '')}
                    </td>
                  ))}
                  <td>{inactivo ? <span className="badge">Inactivo</span> : <span className="badge" style={{ color: 'var(--ok)', borderColor: 'var(--ok)' }}>Activo</span>}</td>
                  <td className="actions-cell">
                    <button className="small secondary" onClick={() => toggleActivo(item.id, !inactivo)}>{inactivo ? 'Reactivar' : 'Desactivar'}</button>
                    <button className="small danger" onClick={() => remove(item.id)}>Borrar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

