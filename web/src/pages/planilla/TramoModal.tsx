import { useEffect, useState, type FormEvent } from 'react';
import type { Ruta, Tramo, Vehiculo, Cliente } from '../../types';
import { money, monthLabel } from '../../lib/format';
import { useToast } from '../../lib/ToastContext';

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
  litros_consumidos: number;
  litros_intermedios: number;
  litros_equipo_frio: number;
  es_posicionamiento: boolean;
  control: boolean;
}

type NumKey = { [K in keyof FormState]: FormState[K] extends number ? K : never }[keyof FormState];

// Ninguno de estos admite valores negativos.
const NUM_LABELS: Record<NumKey, string> = {
  peajes: 'Peajes', gastos_varios: 'Gastos varios', km_alargue: 'Km alargue',
  comida_viaje: 'Comida viaje', comida_internacional: 'Comida internacional',
  entrega_retiro_sfco: 'Entrega/Retiro SFCO', interrupcion: 'Interrupción', cyd_manual: 'CyD manual',
  control_gral: 'Control gral', descanso: 'Descanso', vale_importe: 'Vale importe',
  km_recorridos: 'Km recorridos', km_dobles: 'Km dobles', permanencia: 'Permanencia',
  cruce_frontera: 'Cruce frontera', litros_consumidos: 'Litros consumidos',
  litros_intermedios: 'Repostaje en ruta', litros_equipo_frio: 'Equipo frío',
};

const EMPTY: FormState = {
  tractor: '', dia_salida: '', hora_salida: '', dia_llegada: '', hora_llegada: '',
  origen: '', destino: '', cliente: '', peajes: 0, gastos_varios: 0, km_alargue: 0,
  comida_viaje: 0, comida_internacional: 0, entrega_retiro_sfco: 0, interrupcion: 0,
  cyd_manual: 0, control_gral: 0, descanso: 0, vale_nro: '', vale_importe: 0,
  km_recorridos: 0, km_dobles: 0, permanencia: 0, cruce_frontera: 0,
  litros_consumidos: 0, litros_intermedios: 0, litros_equipo_frio: 0,
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
    litros_consumidos: t.litros_consumidos || 0,
    litros_intermedios: t.litros_intermedios || 0,
    litros_equipo_frio: t.litros_equipo_frio || 0,
    es_posicionamiento: !!t.es_posicionamiento,
    control: !!t.control,
  };
}

// "T79" -> "T079": los códigos de flota son T + 3 dígitos, y el reporte de
// Combustible tenía que corregir esto a mano porque se cargaba de las dos formas.
function normalizarTractor(txt: string): string {
  const t = txt.trim().toUpperCase();
  const m = t.match(/^T(\d{1,3})$/);
  return m ? 'T' + m[1].padStart(3, '0') : t;
}

function nochesEntre(desde: string, hasta: string): number {
  if (!desde || !hasta) return 0;
  const d = Date.parse(desde + 'T00:00:00Z');
  const h = Date.parse(hasta + 'T00:00:00Z');
  return Number.isNaN(d) || Number.isNaN(h) ? 0 : Math.max(0, Math.round((h - d) / 86400000));
}

function validar(f: FormState, mesesCerrados: Set<string>): string | null {
  if (!f.dia_salida) return 'Falta el día de salida.';
  const mes = f.dia_salida.slice(0, 7);
  if (mesesCerrados.has(mes)) return `${monthLabel(mes)} está cerrado: un admin tiene que reabrirlo para cargar tramos en ese mes.`;
  if (f.dia_llegada && f.dia_llegada < f.dia_salida) return 'El día de llegada es anterior al día de salida.';
  if (f.dia_llegada && f.dia_llegada === f.dia_salida && f.hora_salida && f.hora_llegada && f.hora_llegada < f.hora_salida) {
    return 'La hora de llegada es anterior a la de salida (mismo día).';
  }
  for (const k of Object.keys(NUM_LABELS) as NumKey[]) {
    if (!Number.isFinite(f[k])) return `${NUM_LABELS[k]}: valor inválido.`;
    if (f[k] < 0) return `${NUM_LABELS[k]} no puede ser negativo.`;
  }
  return null;
}

// Campo numérico que se puede vaciar (el 0 no queda pegado) y no acepta negativos.
function Num({ label, value, onChange, step }: { label: string; value: number; onChange: (n: number) => void; step?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        min={0}
        step={step}
        placeholder="0"
        value={value === 0 ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
    </div>
  );
}

interface Props {
  tramo: Tramo | null;
  vehiculos: Vehiculo[];
  clientes: Cliente[];
  rutas: Ruta[];
  mesesCerrados: Set<string>;
  onClose: () => void;
  onSubmit: (data: Partial<Tramo> & { mes: string }) => Promise<void>;
}

export function TramoModal({ tramo, vehiculos, clientes, rutas, mesesCerrados, onClose, onSubmit }: Props) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() =>
    tramo ? fromTramo(tramo) : { ...EMPTY, dia_salida: new Date().toISOString().slice(0, 10) },
  );
  const [rutaQuick, setRutaQuick] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setForm(tramo ? fromTramo(tramo) : { ...EMPTY, dia_salida: new Date().toISOString().slice(0, 10) });
    setRutaQuick('');
  }, [tramo]);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !guardando) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, guardando]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const total = Math.round(MONTO_FIELDS_FOR_TOTAL.reduce((s, f) => s + (Number(form[f]) || 0), 0) * 100) / 100;
  const nochesSugeridas = nochesEntre(form.dia_salida, form.dia_llegada);
  const tractorNorm = normalizarTractor(form.tractor);
  const tractorConocido = !tractorNorm || vehiculos.some((v) => v.codigo.toUpperCase() === tractorNorm);

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
    if (guardando) return;
    const error = validar(form, mesesCerrados);
    if (error) { toast(error, 'warn'); return; }
    const mes = form.dia_salida.slice(0, 7);
    const data: Partial<Tramo> & { mes: string } = {
      ...form,
      tractor: tractorNorm,
      cliente: form.cliente || (form.es_posicionamiento ? 'T' : '-'),
      total_gastos: total,
      mes,
    };
    setGuardando(true);
    try {
      await onSubmit(data);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-bg open">
      <div className="modal" role="dialog" aria-modal="true" aria-label={tramo ? 'Editar tramo' : 'Nuevo tramo'}>
        <span className="close-x" onClick={() => { if (!guardando) onClose(); }}>✕</span>
        <h3>{tramo ? 'Editar tramo' : 'Nuevo tramo'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="grid2">
            <fieldset>
              <legend>Viaje</legend>
              <div className="row">
                <div className="field">
                  <label>Tractor</label>
                  <input list="dlVehiculos" value={form.tractor} onChange={(e) => set('tractor', e.target.value)} onBlur={() => set('tractor', tractorNorm)} placeholder="T130" />
                  {!tractorConocido && <div className="hint" style={{ color: 'var(--warn)' }}>No está en la lista de vehículos activos.</div>}
                </div>
                <div className="field">
                  <label>Cliente</label>
                  <input list="dlClientes" value={form.cliente} onChange={(e) => set('cliente', e.target.value)} placeholder='"-" si vacío, "T" si posicionamiento' />
                </div>
              </div>
              <div className="row">
                <div className="field"><label>Día salida</label><input type="date" required value={form.dia_salida} onChange={(e) => set('dia_salida', e.target.value)} /></div>
                <div className="field"><label>Hora salida</label><input type="time" value={form.hora_salida} onChange={(e) => set('hora_salida', e.target.value)} /></div>
              </div>
              <div className="row">
                <div className="field"><label>Día llegada</label><input type="date" min={form.dia_salida || undefined} value={form.dia_llegada} onChange={(e) => set('dia_llegada', e.target.value)} /></div>
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
                <Num label="Km recorridos" value={form.km_recorridos} onChange={(n) => set('km_recorridos', n)} />
                <Num label="Km dobles" value={form.km_dobles} onChange={(n) => set('km_dobles', n)} />
              </div>
              <div className="row">
                <Num label="Km alargue" value={form.km_alargue} onChange={(n) => set('km_alargue', n)} />
                <Num label="Permanencia (noches)" value={form.permanencia} onChange={(n) => set('permanencia', n)} />
              </div>
              {nochesSugeridas > 0 && nochesSugeridas !== form.permanencia && (
                <div className="hint">
                  Por las fechas de salida y llegada serían {nochesSugeridas} noche{nochesSugeridas === 1 ? '' : 's'}.{' '}
                  <a className="link" onClick={() => set('permanencia', nochesSugeridas)}>Usar ese valor</a>
                </div>
              )}
              <div className="row">
                <Num label="Cruce frontera" value={form.cruce_frontera} onChange={(n) => set('cruce_frontera', n)} />
              </div>
            </fieldset>
          </div>

          <fieldset>
            <legend>Combustible (litros)</legend>
            <div className="row">
              <Num label="Consumidos" step="0.01" value={form.litros_consumidos} onChange={(n) => set('litros_consumidos', n)} />
              <Num label="Repostaje en ruta" step="0.01" value={form.litros_intermedios} onChange={(n) => set('litros_intermedios', n)} />
              <Num label="Equipo frío" step="0.01" value={form.litros_equipo_frio} onChange={(n) => set('litros_equipo_frio', n)} />
            </div>
            <div className="hint">Se usan en el reporte de Consumo de Combustible — dejar vacío si no aplica.</div>
          </fieldset>

          <fieldset>
            <legend>Gastos ($)</legend>
            <div className="row">
              <Num label="Peajes" step="0.01" value={form.peajes} onChange={(n) => set('peajes', n)} />
              <Num label="Gastos varios" step="0.01" value={form.gastos_varios} onChange={(n) => set('gastos_varios', n)} />
              <Num label="Comida viaje" step="0.01" value={form.comida_viaje} onChange={(n) => set('comida_viaje', n)} />
              <Num label="Comida internacional" step="0.01" value={form.comida_internacional} onChange={(n) => set('comida_internacional', n)} />
            </div>
            <div className="row">
              <Num label="Entrega/Retiro SFCO" step="0.01" value={form.entrega_retiro_sfco} onChange={(n) => set('entrega_retiro_sfco', n)} />
              <Num label="Interrupción" step="0.01" value={form.interrupcion} onChange={(n) => set('interrupcion', n)} />
              <Num label="CyD manual" step="0.01" value={form.cyd_manual} onChange={(n) => set('cyd_manual', n)} />
              <Num label="Control gral" step="0.01" value={form.control_gral} onChange={(n) => set('control_gral', n)} />
            </div>
            <div className="row">
              <Num label="Descanso" step="0.01" value={form.descanso} onChange={(n) => set('descanso', n)} />
            </div>
            <div className="hint">Total gastos (calculado): <strong>{money(total)}</strong></div>
          </fieldset>

          <fieldset>
            <legend>Vale</legend>
            <div className="row">
              <div className="field"><label>Vale N°</label><input value={form.vale_nro} onChange={(e) => set('vale_nro', e.target.value)} /></div>
              <Num label="Vale importe" step="0.01" value={form.vale_importe} onChange={(n) => set('vale_importe', n)} />
            </div>
          </fieldset>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" className="secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
            <button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar tramo'}</button>
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
