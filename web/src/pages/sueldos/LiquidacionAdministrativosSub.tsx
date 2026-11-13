import { useEffect, useRef, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { NOMBRES_MESES } from '../../lib/format';
import { procesarPeriodo, calcularLiquidacionSueldoMensual, type LiquidacionSueldoMensual } from '../fichadas/motor';
import type { Chofer, FichadasEmpresa, FichadasFeriado, FichadasLegajo, FichadasMarca, FichadasNovedad, HistorialLegajo } from '../../types';

export function LiquidacionAdministrativosSub() {
  const toast = useToast();
  const now = useRef(new Date());
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [legajoId, setLegajoId] = useState('');
  const [anio, setAnio] = useState(String(now.current.getFullYear()));
  const [mes, setMes] = useState(String(now.current.getMonth() + 1).padStart(2, '0'));
  const [calculando, setCalculando] = useState(false);
  const [resultado, setResultado] = useState<LiquidacionSueldoMensual | null>(null);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [todos, choferes] = await Promise.all([
          pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ filter: 'estado = true', sort: 'nombre', expand: 'categoria' }),
          pb.collection('choferes').getFullList<Chofer>({ filter: 'activo = true' }),
        ]);
        const legajosDeChofer = new Set(choferes.map((c) => c.legajo).filter(Boolean));
        setLegajos(todos.filter((l) => !legajosDeChofer.has(l.id)));
      } catch (e) {
        toast('No se pudieron cargar los legajos: ' + (e instanceof Error ? e.message : ''), 'err');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function calcular() {
    if (!legajoId) { toast('Elegí un legajo.', 'warn'); return; }
    setCalculando(true);
    setResultado(null);
    setAviso('');
    try {
      const anioMes = anio + '-' + mes;
      const legajo = legajos.find((l) => l.id === legajoId);
      if (!legajo) { setAviso('Legajo no encontrado.'); return; }
      if (!legajo.fecha_alta) { setAviso('Este legajo no tiene fecha de alta cargada (Personal → Empleados).'); return; }
      if (!legajo.basico) { setAviso('Este legajo no tiene un básico cargado (Personal → Empleados).'); return; }
      const categoria = legajo.expand?.categoria;
      if (!categoria) { setAviso('Este legajo no tiene una categoría de convenio asignada (Personal → Empleados).'); return; }

      const diasDelMes = new Date(Number(anio), Number(mes), 0).getDate();
      const desde = anioMes + '-01';
      const hasta = anioMes + '-' + String(diasDelMes).padStart(2, '0');

      const [legajosTodos, marcas, novedades, feriados, empresas, historial] = await Promise.all([
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ expand: 'empresa,horario' }),
        pb.collection('fichadas_marcas').getFullList<FichadasMarca>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_novedades').getFullList<FichadasNovedad>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ filter: pb.filter('fecha >= {:d} && fecha <= {:h}', { d: desde, h: hasta }) }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>(),
        pb.collection('fichadas_legajo_historial').getFullList<HistorialLegajo>(),
      ]);
      const legajosAjustados = legajosTodos.map((l) => ((l.estado || l.fecha_baja) ? l : { ...l, horas_extra_fijas: null }));
      const empresaNombrePorId = new Map(empresas.map((e) => [e.id, e.nombre]));
      const { resultados } = procesarPeriodo({
        legajos: legajosAjustados, marcas, novedades, feriados, historial, empresaNombrePorId, desde, hasta,
      });

      const minutosExtra = resultados.filter((r) => r.idLegajo === legajoId).reduce((acc, r) => acc + r.hE, 0);
      const horasExtraMes = minutosExtra / 60;

      const calc = calcularLiquidacionSueldoMensual({
        basico: legajo.basico, fechaAlta: legajo.fecha_alta, categoria, horasExtraMes, anioMes,
      });
      if (!calc) { setAviso('No se pudo calcular (revisá la fecha de alta del legajo).'); return; }
      setResultado(calc);
    } catch (e) {
      toast('No se pudo calcular la liquidación: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCalculando(false);
    }
  }

  return (
    <div className="card">
      <div className="hint">Básico + horas extra reales del mes + antigüedad − descuentos = neto. Solo legajos que no son choferes (los choferes se liquidan en la pestaña "Liquidación — Choferes").</div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="field" style={{ minWidth: 220 }}>
          <label>Legajo</label>
          <select value={legajoId} onChange={(e) => setLegajoId(e.target.value)}>
            <option value="">— elegir —</option>
            {legajos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
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
        <button onClick={calcular} disabled={calculando || !legajoId}>{calculando ? 'Calculando…' : 'Calcular'}</button>
      </div>

      {aviso && <div className="hint" style={{ marginTop: 14, color: 'var(--warn)' }}>{aviso}</div>}

      {resultado && (
        <div style={{ marginTop: 16 }}>
          <div className="summary-grid summary-grid-compact" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="lbl">Básico</div><div className="val">{resultado.basico.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Horas extra ({resultado.horasExtraMes.toFixed(1)} hs)</div><div className="val">{resultado.montoHorasExtra.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Antigüedad ({resultado.antiguedadPct}%)</div><div className="val">{resultado.montoAntiguedad.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Bruto</div><div className="val">{resultado.bruto.toLocaleString('es-AR')}</div></div>
            <div className="stat"><div className="lbl">Neto</div><div className="val">{resultado.neto.toLocaleString('es-AR')}</div></div>
          </div>

          <h3 style={{ fontSize: 13, color: 'var(--navy)' }}>Descuentos</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Concepto</th><th className="num">Monto</th></tr></thead>
              <tbody>
                <tr><td>Jubilación</td><td className="num">{resultado.descuentoJubilacion.toLocaleString('es-AR')}</td></tr>
                <tr><td>Ley 19032</td><td className="num">{resultado.descuentoLey19032.toLocaleString('es-AR')}</td></tr>
                <tr><td>Obra Social</td><td className="num">{resultado.descuentoObraSocial.toLocaleString('es-AR')}</td></tr>
                <tr><td>ANSSAL</td><td className="num">{resultado.descuentoAnsal.toLocaleString('es-AR')}</td></tr>
                <tr><td>Cuota Sindical</td><td className="num">{resultado.descuentoCuotaSindical.toLocaleString('es-AR')}</td></tr>
                <tr><td>Seguro de Sepelio</td><td className="num">{resultado.descuentoSeguroSepelio.toLocaleString('es-AR')}</td></tr>
                <tr><td><strong>Total descuentos</strong></td><td className="num"><strong>{resultado.totalDescuentos.toLocaleString('es-AR')}</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
