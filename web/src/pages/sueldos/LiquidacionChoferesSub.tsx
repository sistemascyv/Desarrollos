import { useEffect, useRef, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { NOMBRES_MESES } from '../../lib/format';
import type { Chofer, Tramo, SueldosTarifaViaje, FichadasFeriado } from '../../types';

const NOMBRE_TARIFA_KM = 'Kilometros recorridos (por km)';
const NOMBRE_TARIFA_KM120 = 'Kilometros zona 1,20 (por km)';
const NOMBRE_TARIFA_PERM_REMUN = 'Permanencia remunerativa (por dia y persona)';
const NOMBRE_TARIFA_PERM_VIAT = 'Permanencia viaticos (por dia y persona)';
const NOMBRE_TARIFA_CRUCE = 'Cruce de frontera (por cada cruce)';
const NOMBRE_TARIFA_AGUAS = 'Aguas y Gaseosas (FALTA CONFIRMAR VALOR)';
const NOMBRE_TARIFA_FERIADOS = 'Feriados (FALTA CONFIRMAR VALOR)';

interface ItemVariable {
  concepto: string;
  cantidad: number;
  tarifa: number | null; // null = tarifa no encontrada por nombre
  monto: number;
}

interface Resultado {
  basico: number;
  categoriaNombre: string;
  items: ItemVariable[];
  cydManual: number;
  variable: number;
  bruto: number;
  descuentos: { label: string; pct: number; monto: number }[];
  totalDescuentos: number;
  neto: number;
}

export function LiquidacionChoferesSub() {
  const toast = useToast();
  const now = useRef(new Date());
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [choferId, setChoferId] = useState('');
  const [anio, setAnio] = useState(String(now.current.getFullYear()));
  const [mes, setMes] = useState(String(now.current.getMonth() + 1).padStart(2, '0'));
  const [calculando, setCalculando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    pb.collection('choferes').getFullList<Chofer>({ filter: 'activo = true', sort: 'nombre' })
      .then(setChoferes)
      .catch((e) => toast('No se pudieron cargar los choferes: ' + (e instanceof Error ? e.message : ''), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function calcular() {
    if (!choferId) { toast('Elegí un chofer.', 'warn'); return; }
    setCalculando(true);
    setResultado(null);
    setAviso('');
    try {
      const mesStr = anio + '-' + mes;
      const chofer = await pb.collection('choferes').getOne<Chofer>(choferId, { expand: 'legajo,legajo.categoria' });
      const legajo = chofer.expand?.legajo;
      if (!legajo) { setAviso('Este chofer todavía no tiene un legajo vinculado (Administración → Choferes).'); return; }
      const categoria = legajo.expand?.categoria;
      if (!legajo.basico) { setAviso('El legajo vinculado no tiene un básico cargado (Personal → Empleados).'); return; }
      if (!categoria) { setAviso('El legajo vinculado no tiene una categoría de convenio asignada (Personal → Empleados).'); return; }

      const [tarifas, feriados, tramos] = await Promise.all([
        pb.collection('sueldos_tarifas_viaje').getFullList<SueldosTarifaViaje>(),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>(),
        pb.collection('tramos').getFullList<Tramo>({ filter: pb.filter('chofer = {:chofer} && mes = {:mes}', { chofer: choferId, mes: mesStr }) }),
      ]);

      const tarifaPorNombre = new Map(tarifas.map((t) => [t.nombre, t.valor]));
      const fechasFeriado = new Set(feriados.map((f) => f.fecha));

      const sumar = (campo: 'km_recorridos' | 'km_alargue' | 'km_zona_120' | 'permanencia' | 'cruce_frontera' | 'cyd_manual') =>
        tramos.reduce((acc, t) => acc + (t[campo] || 0), 0);

      const kmTotal = sumar('km_recorridos') + sumar('km_alargue');
      const km120Total = sumar('km_zona_120');
      const permanenciaTotal = sumar('permanencia');
      const cruceTotal = sumar('cruce_frontera');
      const aguasGaseosasCant = tramos.filter((t) => t.es_aguas_gaseosas).length;
      const feriadosCant = tramos.filter((t) => fechasFeriado.has(t.dia_salida)).length;
      const cydManual = sumar('cyd_manual');

      function item(concepto: string, cantidad: number, nombreTarifa: string): ItemVariable {
        const tarifa = tarifaPorNombre.has(nombreTarifa) ? tarifaPorNombre.get(nombreTarifa)! : null;
        return { concepto, cantidad, tarifa, monto: tarifa !== null ? cantidad * tarifa : 0 };
      }

      const items: ItemVariable[] = [
        item('Kilómetros recorridos', kmTotal, NOMBRE_TARIFA_KM),
        item('Kilómetros zona 1,20', km120Total, NOMBRE_TARIFA_KM120),
        item('Permanencia (remunerativa)', permanenciaTotal, NOMBRE_TARIFA_PERM_REMUN),
        item('Permanencia (viáticos)', permanenciaTotal, NOMBRE_TARIFA_PERM_VIAT),
        item('Cruce de frontera', cruceTotal, NOMBRE_TARIFA_CRUCE),
        item('Aguas y Gaseosas', aguasGaseosasCant, NOMBRE_TARIFA_AGUAS),
        item('Feriados trabajados', feriadosCant, NOMBRE_TARIFA_FERIADOS),
      ];
      const tarifasFaltantes = items.filter((i) => i.tarifa === null).map((i) => i.concepto);
      if (tarifasFaltantes.length) {
        toast('No se encontró la tarifa de: ' + tarifasFaltantes.join(', ') + ' (revisá los nombres en Sueldos → Tarifas de viaje).', 'warn');
      }

      const variable = items.reduce((acc, i) => acc + i.monto, 0) + cydManual;
      const basico = legajo.basico;
      const bruto = basico + variable;

      const descuentosDef: { label: string; pct: number }[] = [
        { label: 'Jubilación', pct: categoria.pct_jubilacion },
        { label: 'Ley 19032', pct: categoria.pct_ley19032 },
        { label: 'Obra Social', pct: categoria.pct_obra_social },
        { label: 'ANSSAL', pct: categoria.pct_ansal },
        { label: 'Cuota Sindical', pct: categoria.pct_cuota_sindical },
        { label: 'Seguro de Sepelio', pct: categoria.pct_seguro_sepelio },
      ];
      const descuentos = descuentosDef.map((d) => ({ ...d, monto: bruto * (d.pct / 100) }));
      const totalDescuentos = descuentos.reduce((acc, d) => acc + d.monto, 0);
      const neto = bruto - totalDescuentos;

      setResultado({ basico, categoriaNombre: categoria.nombre, items, cydManual, variable, bruto, descuentos, totalDescuentos, neto });
    } catch (e) {
      toast('No se pudo calcular la liquidación: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCalculando(false);
    }
  }

  return (
    <div className="card">
      <div className="hint">
        Básico + variable (km, permanencia, cruce de frontera, Aguas y Gaseosas, feriados trabajados, CyD manual) − descuentos = neto.
        No incluye antigüedad todavía.
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="field" style={{ minWidth: 220 }}>
          <label>Chofer</label>
          <select value={choferId} onChange={(e) => setChoferId(e.target.value)}>
            <option value="">— elegir —</option>
            {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Mes</label>
          <select value={mes} onChange={(e) => setMes(e.target.value)}>
            {NOMBRES_MESES.map((label, i) => <option key={label} value={String(i + 1).padStart(2, '0')}>{label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Año</label>
          <input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} style={{ width: 90 }} />
        </div>
        <button onClick={calcular} disabled={calculando || !choferId}>{calculando ? 'Calculando…' : 'Calcular'}</button>
      </div>

      {aviso && <div className="hint" style={{ marginTop: 14, color: 'var(--warn)' }}>{aviso}</div>}

      {resultado && (
        <div style={{ marginTop: 16 }}>
          <div className="summary-grid summary-grid-compact" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="lbl">Básico ({resultado.categoriaNombre})</div><div className="val">{resultado.basico.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Variable</div><div className="val">{resultado.variable.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Bruto</div><div className="val">{resultado.bruto.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Neto</div><div className="val">{resultado.neto.toLocaleString('es-AR')}</div></div>
          </div>

          <h3 style={{ fontSize: 13, color: 'var(--navy)' }}>Variable del mes</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Concepto</th><th className="num">Cantidad</th><th className="num">Tarifa</th><th className="num">Monto</th></tr></thead>
              <tbody>
                {resultado.items.map((i) => (
                  <tr key={i.concepto}>
                    <td>{i.concepto}</td>
                    <td className="num">{i.cantidad.toLocaleString('es-AR')}</td>
                    <td className="num">{i.tarifa !== null ? i.tarifa.toLocaleString('es-AR') : 'Sin tarifa'}</td>
                    <td className="num">{i.monto.toLocaleString('es-AR')}</td>
                  </tr>
                ))}
                <tr><td>CyD manual (ya cargado por tramo)</td><td></td><td></td><td className="num">{resultado.cydManual.toLocaleString('es-AR')}</td></tr>
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: 13, color: 'var(--navy)', marginTop: 14 }}>Descuentos</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Concepto</th><th className="num">%</th><th className="num">Monto</th></tr></thead>
              <tbody>
                {resultado.descuentos.map((d) => (
                  <tr key={d.label}>
                    <td>{d.label}</td>
                    <td className="num">{d.pct}%</td>
                    <td className="num">{d.monto.toLocaleString('es-AR')}</td>
                  </tr>
                ))}
                <tr><td><strong>Total descuentos</strong></td><td></td><td className="num"><strong>{resultado.totalDescuentos.toLocaleString('es-AR')}</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
