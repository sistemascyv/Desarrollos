import { useEffect, useState, type FormEvent } from 'react';
import type { Ruta, Tramo, Vehiculo, Cliente } from '../../types';
import { money } from '../../lib/format';

const MONTO_FIELDS_FOR_TOTAL = [
  'peajes', 'gastos_varios', 'comida_viaje', 'comida_internacional',
  'entrega_retiro_sfco', 'interrupcion', 'cyd_manual', 'control_gral', 'descanso',
] as const;

interface FormState {
  tractor: string;
  dia_salida: string;
  hora_salida: string;
  dia_llegada: string;
  hora_llegada: string;
  origen: string;
  destino: string;
  cliente: string;
  peajes: number;
  gastos_varios: number;
  km_alargue: number;
  comida_viaje: number;
  comida_internacional: number;
  entrega_retiro_sfco: number;
  interrupcion: number;
  cyd_manual: number;
  control_gral: number;
  descanso: number;
  vale_nro: string;
  vale_importe: number;
  km_recorridos: number;
  km_dobles: number;
  permanencia: number;
  cruce_frontera: number;
  es_posicionamiento: boolean;
  control: boolean;
}

const EMPTY: FormState = {
  tractor: '', dia_salida: '', hora_salida: '', dia_llegada: '', hora_llegada: '',
  origen: '', destino: '', cliente: '', peajes: 0, gastos_varios: 0, km_alargue: 0,
  comida_viaje: 0, comida_internacional: 0, entrega_retiro_sfco: 0, interrupcion: 0,
  cyd_manual: 0, control_gral: 0, descanso: 0, vale_nro: '', vale_importe: 0,
  km_recorridos: 0, km_dobles: 0, permanencia: 0, cruce_frontera: 0,
  es_posicionamiento: false, control: false,
};

function fromTramo(t: Tramo): FormState {
  return {
    tractor: t.tractor || '',
    dia_salida: t.dia_salida || '',
    hora_salida: t.hora_salida || '',
    dia_llegada: t.dia_llegada || '',
    hora_llegada: t.hora_llegada || '',
    origen: t.origen || '',
    destino: t.destino || '',
    cliente: t.cliente || '',
    peajes: t.peajes || 0,
    gastos_varios: t.gastos_varios || 0,
    km_alargue: t.km_alargue || 0,
    comida_viaje: t.comida_viaje || 0,
    comida_internacional: t.comida_internacional || 0,
    entrega_retiro_sfco: t.entrega_retiro_sfco || 0,
    interrupcion: t.interrupcion || 0,
    cyd_manual: t.cyd_manual || 0,
    control_gral: t.control_gral || 0,
    descanso: t.descanso || 0,
    vale_nro: t.vale_nro || '',
    vale_importe: t.vale_importe || 0,
    km_recorridos: t.km_recorridos || 0,
    km_dobles: t.km_dobles || 0,
    permanencia: t.permanencia || 0,
    cruce_frontera: t.cruce_frontera || 0,
    es_posicionamiento: !!t.es_posicionamiento,
    control: !!t.control,
  };
}

interface Props {
  tramo: Tramo | null;
  vehiculos: Vehiculo[];
  clientes: Cliente[];
  rutas: Ruta[];
  onClose: () => void;
  onSubmit: (data: Partial<Tramo> & { mes: string }) => Promise<void>;
}

export function TramoModal({ tramo, vehiculos, clientes, rutas, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<FormState>(() =>
    tramo ? fromTramo(tramo) : { ...EMPTY, dia_salida: new Date().toISOString().slice(0, 10) },
  );
  const [rutaQuick, setRutaQuick] = useState('');

  useEffect(() => {
    setForm(tramo ? fromTramo(tramo) : { ...EMPTY, dia_salida: new Date().toISOString().slice(0, 10) });
    setRutaQuick('');
  }, [tramo]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const total = MONTO_FIELDS_FOR_TOTAL.reduce((s, f) => s + (Number(form[f]) || 0), 0);

  function applyRutaQuick(id: string) {
    setRutaQuick(id);
    const r = rutas.find((x) => x.id === id);
    if (!r) return;
    setForm((f) => ({ ...f, origen: r.origen, destino: r.destino, cliente: r.cliente || f.cliente }));
  }

  function onPosicionamientoChange(checked: boolean) {
    setForm((f) => ({ ...f, es_posicionamiento: checked, cliente: checked ? 'T' : f.cliente }));
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!form.dia_salida) return;
    const mes = form.dia_salida.slice(0, 7);
    const data: Partial<Tramo> & { mes: string } = {
      ...form,
      cliente: form.cliente || (form.es_posicionamiento ? 'T' : '-'),
      total_gastos: total,
      mes,
    };
    await onSubmit(data);
  }

  return (
    <div className="modal-bg open">
      <div className="modal">
        <span className="close-x" onClick={onClose}>✕</span>
        <h3>{tramo ? 'Editar tramo' : 'Nuevo tramo'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="grid2">
            <fieldset>
              <legend>Viaje</legend>
              <div className="row">
                <div className="field">
                  <label>Tractor</label>
                  <input list="dlVehiculos" value={form.tractor} onChange={(e) => set('tractor', e.target.value)} placeholder="T130" />
                </div>
                <div className="field">
                  <label>Cliente</label>
                  <input list="dlClientes" value={form.cliente} onChange={(e) => set('cliente', e.target.value)} placeholder='"-" si vacío, "T" si posicionamiento' />
                </div>
              </div>
              <div className="row">
                <div className="field"><label>Día salida</label><input type="date" value={form.dia_salida} onChange={(e) => set('dia_salida', e.target.value)} /></div>
                <div className="field"><label>Hora salida</label><input type="time" value={form.hora_salida} onChange={(e) => set('hora_salida', e.target.value)} /></div>
              </div>
              <div className="row">
                <div className="field"><label>Día llegada</label><input type="date" value={form.dia_llegada} onChange={(e) => set('dia_llegada', e.target.value)} /></div>
                <div className="field"><label>Hora llegada</label><input type="time" value={form.hora_llegada} onChange={(e) => set('hora_llegada', e.target.value)} /></div>
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label>Ruta rápida (opcional)</label>
                  <select value={rutaQuick} onChange={(e) => applyRutaQuick(e.target.value)}>
                    <option value="">— elegir para autocompletar —</option>
                    {rutas.map((r) => (
                      <option key={r.id} value={r.id}>{r.origen} → {r.destino}{r.cliente ? ` (${r.cliente})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row">
                <div className="field" style={{ flex: 1 }}><label>Origen</label><input list="dlOrigenes" value={form.origen} onChange={(e) => set('origen', e.target.value)} /></div>
                <div className="field" style={{ flex: 1 }}><label>Destino</label><input list="dlDestinos" value={form.destino} onChange={(e) => set('destino', e.target.value)} /></div>
              </div>
              <div className="row">
                <div className="field"><label><input type="checkbox" checked={form.es_posicionamiento} onChange={(e) => onPosicionamientoChange(e.target.checked)} /> Es posicionamiento (Carga = "T")</label></div>
                <div className="field"><label><input type="checkbox" checked={form.control} onChange={(e) => set('control', e.target.checked)} /> Control</label></div>
              </div>
            </fieldset>
            <fieldset>
              <legend>Km y estadía</legend>
              <div className="row">
                <div className="field"><label>Km recorridos</label><input type="number" value={form.km_recorridos} onChange={(e) => set('km_recorridos', Number(e.target.value))} /></div>
                <div className="field"><label>Km dobles</label><input type="number" value={form.km_dobles} onChange={(e) => set('km_dobles', Number(e.target.value))} /></div>
              </div>
              <div className="row">
                <div className="field"><label>Km alargue</label><input type="number" value={form.km_alargue} onChange={(e) => set('km_alargue', Number(e.target.value))} /></div>
                <div className="field"><label>Permanencia (noches)</label><input type="number" value={form.permanencia} onChange={(e) => set('permanencia', Number(e.target.value))} /></div>
              </div>
              <div className="row">
                <div className="field"><label>Cruce frontera</label><input type="number" value={form.cruce_frontera} onChange={(e) => set('cruce_frontera', Number(e.target.value))} /></div>
              </div>
            </fieldset>
          </div>

          <fieldset>
            <legend>Gastos ($)</legend>
            <div className="row">
              <div className="field"><label>Peajes</label><input type="number" step="0.01" value={form.peajes} onChange={(e) => set('peajes', Number(e.target.value))} /></div>
              <div className="field"><label>Gastos varios</label><input type="number" step="0.01" value={form.gastos_varios} onChange={(e) => set('gastos_varios', Number(e.target.value))} /></div>
              <div className="field"><label>Comida viaje</label><input type="number" step="0.01" value={form.comida_viaje} onChange={(e) => set('comida_viaje', Number(e.target.value))} /></div>
              <div className="field"><label>Comida internacional</label><input type="number" step="0.01" value={form.comida_internacional} onChange={(e) => set('comida_internacional', Number(e.target.value))} /></div>
            </div>
            <div className="row">
              <div className="field"><label>Entrega/Retiro SFCO</label><input type="number" step="0.01" value={form.entrega_retiro_sfco} onChange={(e) => set('entrega_retiro_sfco', Number(e.target.value))} /></div>
              <div className="field"><label>Interrupción</label><input type="number" step="0.01" value={form.interrupcion} onChange={(e) => set('interrupcion', Number(e.target.value))} /></div>
              <div className="field"><label>CyD manual</label><input type="number" step="0.01" value={form.cyd_manual} onChange={(e) => set('cyd_manual', Number(e.target.value))} /></div>
              <div className="field"><label>Control gral</label><input type="number" step="0.01" value={form.control_gral} onChange={(e) => set('control_gral', Number(e.target.value))} /></div>
            </div>
            <div className="row">
              <div className="field"><label>Descanso</label><input type="number" step="0.01" value={form.descanso} onChange={(e) => set('descanso', Number(e.target.value))} /></div>
            </div>
            <div className="hint">Total gastos (calculado): <strong>{money(total)}</strong></div>
          </fieldset>

          <fieldset>
            <legend>Vale</legend>
            <div className="row">
              <div className="field"><label>Vale N°</label><input value={form.vale_nro} onChange={(e) => set('vale_nro', e.target.value)} /></div>
              <div className="field"><label>Vale importe</label><input type="number" step="0.01" value={form.vale_importe} onChange={(e) => set('vale_importe', Number(e.target.value))} /></div>
            </div>
          </fieldset>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
            <button type="submit">Guardar tramo</button>
          </div>
        </form>
      </div>

      <datalist id="dlVehiculos">{vehiculos.map((v) => <option key={v.id} value={v.codigo} />)}</datalist>
      <datalist id="dlClientes">{clientes.map((c) => <option key={c.id} value={c.nombre} />)}</datalist>
      <datalist id="dlOrigenes">{[...new Set(rutas.map((r) => r.origen))].map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="dlDestinos">{[...new Set(rutas.map((r) => r.destino))].map((d) => <option key={d} value={d} />)}</datalist>
    </div>
  );
}
