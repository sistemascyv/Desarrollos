import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { parsearTxtReloj, type MarcaParseada } from './motor';
import type { FichadasEmpresa, FichadasFeriado, FichadasLegajo } from '../../types';

function readFileAsText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsText(file);
  });
}

export function CargaTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [cargando, setCargando] = useState(false);
  const [resumen, setResumen] = useState<{ importadas: number; duplicadas: number; sinLegajo: number; invalidas: number; total: number } | null>(null);

  const [feriados, setFeriados] = useState<FichadasFeriado[]>([]);
  const [feriadoFecha, setFeriadoFecha] = useState('');
  const [feriadoNombre, setFeriadoNombre] = useState('');

  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [empresas, setEmpresas] = useState<FichadasEmpresa[]>([]);
  const [novModo, setNovModo] = useState<'empleado' | 'area'>('empleado');
  const [novLegajo, setNovLegajo] = useState('');
  const [novArea, setNovArea] = useState('');
  const [novDesde, setNovDesde] = useState('');
  const [novHasta, setNovHasta] = useState('');
  const [novTexto, setNovTexto] = useState('');
  const [aplicandoNovedad, setAplicandoNovedad] = useState(false);

  useEffect(() => {
    cargarFeriados();
    cargarListas();
  }, []);

  async function cargarFeriados() {
    try {
      const items = await pb.collection('fichadas_feriados').getFullList<FichadasFeriado>({ sort: '-fecha' });
      setFeriados(items);
    } catch (e) {
      toast('No se pudieron cargar los feriados: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function cargarListas() {
    try {
      const [l, e] = await Promise.all([
        pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre', filter: 'estado = true' }),
        pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
      ]);
      setLegajos(l);
      setEmpresas(e);
      if (l.length) setNovLegajo(l[0].id);
      if (e.length) setNovArea(e[0].id);
    } catch (e) {
      toast('No se pudieron cargar empleados/áreas: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function subirArchivos(files: FileList | null) {
    if (!files || !files.length) return;
    setCargando(true);
    setResumen(null);
    try {
      let todas: MarcaParseada[] = [];
      for (const file of Array.from(files)) {
        const texto = await readFileAsText(file);
        todas = todas.concat(parsearTxtReloj(texto, file.name));
      }
      if (!todas.length) {
        toast('No se encontraron líneas de fichadas reconocibles en el/los archivo(s).', 'warn');
        return;
      }
      const res = await pb.send<{ importadas: number; duplicadas: number; sinLegajo: number; invalidas: number; total: number }>(
        '/api/fichadas/marcas/importar',
        { method: 'POST', body: { marcas: todas } }
      );
      setResumen(res);
      toast(`Importación lista: ${res.importadas} marcas nuevas.`, 'ok');
    } catch (e) {
      toast('No se pudo importar: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setCargando(false);
    }
  }

  async function agregarFeriado() {
    if (!feriadoFecha) { toast('Elegí una fecha.', 'warn'); return; }
    try {
      await pb.collection('fichadas_feriados').create({ fecha: feriadoFecha, nombre: feriadoNombre.trim() || 'Feriado' });
      setFeriadoFecha('');
      setFeriadoNombre('');
      cargarFeriados();
    } catch (e) {
      toast('No se pudo agregar el feriado: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function quitarFeriado(id: string) {
    if (!(await confirm('¿Quitar este feriado?', 'Quitar feriado'))) return;
    try {
      await pb.collection('fichadas_feriados').delete(id);
      cargarFeriados();
    } catch (e) {
      toast('No se pudo quitar: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function aplicarNovedad() {
    if (!novDesde || !novHasta || !novTexto.trim()) { toast('Completá el rango de fechas y el motivo.', 'warn'); return; }
    const idsLegajo = novModo === 'area'
      ? legajos.filter((l) => l.empresa === novArea).map((l) => l.id)
      : [novLegajo];
    if (!idsLegajo.length || !idsLegajo[0]) { toast('No hay empleados para aplicar.', 'warn'); return; }

    setAplicandoNovedad(true);
    try {
      const fechas: string[] = [];
      for (let d = new Date(novDesde + 'T00:00:00'); d <= new Date(novHasta + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
        fechas.push(d.toISOString().slice(0, 10));
      }
      for (const idLegajo of idsLegajo) {
        for (const fecha of fechas) {
          // upsert: si ya hay una novedad ese día para ese legajo, la reemplaza
          let existente: { id: string } | null = null;
          try {
            existente = await pb.collection('fichadas_novedades').getFirstListItem(
              pb.filter('legajo = {:l} && fecha = {:f}', { l: idLegajo, f: fecha })
            );
          } catch { /* no existía */ }
          if (existente) {
            await pb.collection('fichadas_novedades').update(existente.id, { texto: novTexto.trim() });
          } else {
            await pb.collection('fichadas_novedades').create({ legajo: idLegajo, fecha, texto: novTexto.trim() });
          }
        }
      }
      toast('Novedad aplicada.', 'ok');
      setNovTexto('');
    } catch (e) {
      toast('No se pudo aplicar la novedad: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setAplicandoNovedad(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Cargar fichadas del reloj</h2>
        <div className="hint">
          Subí uno o varios archivos .txt tal como los descarga el reloj biométrico — se combinan solos.
          El nombre del archivo determina el depósito (incluí "cordoba", "rosario", "buenos_aires" o "san_francisco" en el nombre).
          Las líneas duplicadas (misma tarjeta+fecha+hora) o que ya estaban cargadas de una importación anterior se descartan automáticamente.
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input type="file" accept=".txt,.bak" multiple disabled={cargando} onChange={(e) => subirArchivos(e.target.files)} />
        </div>
        {cargando && <div className="hint" style={{ marginTop: 8 }}>Importando…</div>}
        {resumen && (
          <div className="summary-grid summary-grid-compact" style={{ marginTop: 14 }}>
            <div className="stat"><div className="lbl">Nuevas</div><div className="val">{resumen.importadas}</div></div>
            <div className="stat"><div className="lbl">Ya estaban cargadas</div><div className="val">{resumen.duplicadas}</div></div>
            <div className="stat"><div className="lbl">Tarjeta sin empleado</div><div className="val">{resumen.sinLegajo}</div></div>
            <div className="stat"><div className="lbl">Líneas inválidas</div><div className="val">{resumen.invalidas}</div></div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Feriados</h2>
        <div className="hint">Un feriado se aplica a todos los empleados automáticamente — ese día, si no hay marcas, no cuenta como ausencia sin justificar.</div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field"><label>Fecha</label><input type="date" value={feriadoFecha} onChange={(e) => setFeriadoFecha(e.target.value)} /></div>
          <div className="field" style={{ flex: 2 }}><label>Nombre (opcional)</label><input value={feriadoNombre} onChange={(e) => setFeriadoNombre(e.target.value)} placeholder="Ej: Día de la Bandera" /></div>
          <button onClick={agregarFeriado}>Agregar feriado</button>
        </div>
        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          {feriados.length === 0 && <div className="hint">Sin feriados cargados todavía.</div>}
          {feriados.map((f) => (
            <span key={f.id} className="tag tag-extra" style={{ marginRight: 6, marginBottom: 6 }}>
              {f.fecha} — {f.nombre}
              <button className="small secondary" style={{ marginLeft: 6, padding: '0 6px' }} onClick={() => quitarFeriado(f.id)}>✕</button>
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Asignar novedad (justificación de un rango de fechas)</h2>
        <div className="hint">Aplicá un motivo (vacaciones, licencia, etc.) a un empleado o a toda un área en un rango de fechas — esos días dejan de contar como ausencia sin justificar.</div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Aplicar a</label>
            <select value={novModo} onChange={(e) => setNovModo(e.target.value as 'empleado' | 'area')}>
              <option value="empleado">Un empleado</option>
              <option value="area">Toda un área</option>
            </select>
          </div>
          {novModo === 'empleado' ? (
            <div className="field" style={{ flex: 2 }}>
              <label>Empleado</label>
              <select value={novLegajo} onChange={(e) => setNovLegajo(e.target.value)}>
                {legajos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </div>
          ) : (
            <div className="field" style={{ flex: 2 }}>
              <label>Área</label>
              <select value={novArea} onChange={(e) => setNovArea(e.target.value)}>
                {empresas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          )}
          <div className="field"><label>Desde</label><input type="date" value={novDesde} onChange={(e) => setNovDesde(e.target.value)} /></div>
          <div className="field"><label>Hasta</label><input type="date" value={novHasta} onChange={(e) => setNovHasta(e.target.value)} /></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div className="field" style={{ flex: 2 }}><label>Motivo</label><input value={novTexto} onChange={(e) => setNovTexto(e.target.value)} placeholder="Ej: vacaciones" /></div>
          <button disabled={aplicandoNovedad} onClick={aplicarNovedad}>{aplicandoNovedad ? 'Aplicando…' : 'Aplicar'}</button>
        </div>
      </div>
    </>
  );
}
