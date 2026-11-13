import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import type { SueldosTarifaViaje } from '../../types';

interface FormTarifa {
  nombre: string;
  valor: string;
}

const FORM_VACIO: FormTarifa = { nombre: '', valor: '' };

export function TarifasViajeSub() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tarifas, setTarifas] = useState<SueldosTarifaViaje[]>([]);
  const [form, setForm] = useState<FormTarifa>(FORM_VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  async function cargar() {
    try {
      const t = await pb.collection('sueldos_tarifas_viaje').getFullList<SueldosTarifaViaje>({ sort: 'nombre' });
      setTarifas(t);
    } catch (e) {
      toast('No se pudieron cargar las tarifas de viaje: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }
  useEffect(() => { cargar(); }, []);

  function construirPayload(): Record<string, number | string> | null {
    const nombre = form.nombre.trim();
    if (!nombre) { toast('Ponele un nombre a la tarifa.', 'warn'); return null; }
    const txt = form.valor.trim();
    if (!txt) { toast('Completá el valor.', 'warn'); return null; }
    const n = Number(txt.replace(',', '.'));
    if (!isFinite(n) || n < 0) { toast('Revisá el valor.', 'warn'); return null; }
    return { nombre, valor: n };
  }

  async function crear() {
    const payload = construirPayload();
    if (!payload) return;
    try {
      await pb.collection('sueldos_tarifas_viaje').create(payload);
      setForm(FORM_VACIO);
      cargar();
      toast('Tarifa creada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function abrirEdicion(t: SueldosTarifaViaje) {
    setEditandoId(t.id);
    setForm({ nombre: t.nombre, valor: String(t.valor) });
  }

  async function guardarEdicion() {
    if (!editandoId) return;
    const payload = construirPayload();
    if (!payload) return;
    try {
      await pb.collection('sueldos_tarifas_viaje').update(editandoId, payload);
      setEditandoId(null);
      setForm(FORM_VACIO);
      cargar();
      toast('Tarifa actualizada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(FORM_VACIO);
  }

  async function eliminar(id: string) {
    if (!(await confirm('¿Eliminar esta tarifa de viaje?', 'Eliminar tarifa'))) return;
    try {
      await pb.collection('sueldos_tarifas_viaje').delete(id);
      cargar();
      toast('Eliminada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <div className="card">
      <div className="hint">Tarifas de viaje — valores que no dependen de la categoría del chofer (se actualizan con cada aumento de la escala).</div>
      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '14px 0 8px' }}>{editandoId ? 'Editar tarifa' : 'Nueva tarifa'}</h3>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="field"><label>Nombre</label><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Cruce de frontera" style={{ width: 280 }} /></div>
        <div className="field"><label>Valor ($)</label><input value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} style={{ width: 110 }} /></div>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {editandoId ? (
          <>
            <button onClick={guardarEdicion}>Guardar</button>
            <button className="secondary" onClick={cancelarEdicion}>Cancelar</button>
          </>
        ) : (
          <button onClick={crear}>Crear tarifa</button>
        )}
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Tarifas ({tarifas.length})</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Valor</th><th></th></tr></thead>
          <tbody>
            {tarifas.map((t) => (
              <tr key={t.id}>
                <td className="admin-name">{t.nombre}</td>
                <td className="num">{t.valor}</td>
                <td>
                  <button className="small secondary" onClick={() => abrirEdicion(t)}>Editar</button>
                  <button className="small danger" onClick={() => eliminar(t.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tarifas.length === 0 && <div className="empty" style={{ marginTop: 16 }}>Sin tarifas cargadas.</div>}
    </div>
  );
}
