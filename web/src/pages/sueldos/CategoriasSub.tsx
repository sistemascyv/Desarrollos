import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { cambiarBasicoLegajo } from '../../lib/basicoHistorial';
import type { FichadasCategoria, FichadasLegajo } from '../../types';

const CAMPOS_PCT: { key: keyof FormCategoria; label: string }[] = [
  { key: 'pct_jubilacion', label: 'Jubilación %' },
  { key: 'pct_ley19032', label: 'Ley 19032 %' },
  { key: 'pct_obra_social', label: 'Obra Social %' },
  { key: 'pct_ansal', label: 'ANSSAL %' },
  { key: 'pct_cuota_sindical', label: 'Cuota Sindical %' },
  { key: 'pct_seguro_sepelio', label: 'Seguro de Sepelio %' },
];

interface FormCategoria {
  nombre: string;
  basico_sugerido: string;
  plus_vacacional: string;
  divisor_mensual: string;
  pct_jubilacion: string;
  pct_ley19032: string;
  pct_obra_social: string;
  pct_ansal: string;
  pct_cuota_sindical: string;
  pct_seguro_sepelio: string;
}

const CAMPOS_NUMERICOS: (keyof FormCategoria)[] = [
  'plus_vacacional', 'divisor_mensual', 'pct_jubilacion', 'pct_ley19032',
  'pct_obra_social', 'pct_ansal', 'pct_cuota_sindical', 'pct_seguro_sepelio',
];

const FORM_VACIO: FormCategoria = {
  nombre: '', basico_sugerido: '', plus_vacacional: '', divisor_mensual: '24',
  pct_jubilacion: '11', pct_ley19032: '3', pct_obra_social: '2.55',
  pct_ansal: '0.45', pct_cuota_sindical: '3', pct_seguro_sepelio: '1.5',
};

export function CategoriasSub() {
  const toast = useToast();
  const confirm = useConfirm();
  const [categorias, setCategorias] = useState<FichadasCategoria[]>([]);
  const [form, setForm] = useState<FormCategoria>(FORM_VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [basicoSugeridoOriginal, setBasicoSugeridoOriginal] = useState<number | null>(null);
  const [vigenciaDesde, setVigenciaDesde] = useState('');
  const [aplicandoCascada, setAplicandoCascada] = useState(false);

  async function cargar() {
    try {
      const c = await pb.collection('fichadas_categorias').getFullList<FichadasCategoria>({ sort: 'nombre' });
      setCategorias(c);
    } catch (e) {
      toast('No se pudieron cargar las categorías: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }
  useEffect(() => { cargar(); }, []);

  function construirPayload(): Record<string, number | string> | null {
    const nombre = form.nombre.trim();
    if (!nombre) { toast('Ponele un nombre a la categoría.', 'warn'); return null; }
    const numericos: Record<string, number> = {};
    for (const campo of CAMPOS_NUMERICOS) {
      const txt = form[campo].trim();
      if (!txt) { toast(`Completá el valor de "${campo}".`, 'warn'); return null; }
      const n = Number(txt.replace(',', '.'));
      if (!isFinite(n)) { toast(`Revisá el valor de "${campo}".`, 'warn'); return null; }
      if (campo === 'divisor_mensual' ? n <= 0 : n < 0) { toast(`Revisá el valor de "${campo}".`, 'warn'); return null; }
      numericos[campo] = n;
    }
    const basicoTxt = form.basico_sugerido.trim();
    if (basicoTxt) {
      const basico = Number(basicoTxt.replace(',', '.'));
      if (!isFinite(basico) || basico < 0) { toast('Revisá el valor de "Básico sugerido".', 'warn'); return null; }
      numericos.basico_sugerido = basico;
    }
    return { nombre, ...numericos };
  }

  async function crear() {
    const payload = construirPayload();
    if (!payload) return;
    try {
      await pb.collection('fichadas_categorias').create(payload);
      setForm(FORM_VACIO);
      cargar();
      toast('Categoría creada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  function abrirEdicion(c: FichadasCategoria) {
    setEditandoId(c.id);
    setForm({
      nombre: c.nombre,
      basico_sugerido: c.basico_sugerido ? String(c.basico_sugerido) : '',
      plus_vacacional: String(c.plus_vacacional),
      divisor_mensual: String(c.divisor_mensual),
      pct_jubilacion: String(c.pct_jubilacion),
      pct_ley19032: String(c.pct_ley19032),
      pct_obra_social: String(c.pct_obra_social),
      pct_ansal: String(c.pct_ansal),
      pct_cuota_sindical: String(c.pct_cuota_sindical),
      pct_seguro_sepelio: String(c.pct_seguro_sepelio),
    });
    setBasicoSugeridoOriginal(c.basico_sugerido || null);
    setVigenciaDesde('');
  }

  async function guardarEdicion() {
    if (!editandoId) return;
    const payload = construirPayload();
    if (!payload) return;
    const basicoNuevo = (typeof payload.basico_sugerido === 'number' && payload.basico_sugerido) ? payload.basico_sugerido : null;
    const cambioBasico = basicoNuevo !== basicoSugeridoOriginal;
    if (cambioBasico && !vigenciaDesde) {
      toast('Completá "Vigente desde" — el Básico sugerido cambió y hay que propagarlo a los legajos de esta categoría.', 'warn');
      return;
    }
    setAplicandoCascada(cambioBasico);
    try {
      await pb.collection('fichadas_categorias').update(editandoId, payload);
      if (cambioBasico && basicoNuevo != null) {
        const legajosDeCategoria = await pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({
          filter: pb.filter('categoria = {:c}', { c: editandoId }),
        });
        let actualizados = 0;
        const errores: string[] = [];
        for (const l of legajosDeCategoria) {
          try {
            const resultado = await cambiarBasicoLegajo({
              legajoId: l.id, categoriaId: editandoId, basicoSugerido: basicoNuevo, vigenciaDesde,
            });
            if (resultado.ok) actualizados++;
            else errores.push(l.nombre + ': ' + resultado.error);
          } catch (e) {
            errores.push(l.nombre + ': ' + (e instanceof Error ? e.message : String(e)));
          }
        }
        if (errores.length) {
          const detalle = errores.slice(0, 3).join(' · ') + (errores.length > 3 ? ` · y ${errores.length - 3} más` : '');
          toast(`Categoría actualizada. ${actualizados} legajo(s) actualizados, ${errores.length} con error: ${detalle}`, 'warn');
        } else {
          toast(`Categoría actualizada. ${actualizados} legajo(s) actualizados con el nuevo básico.`, 'ok');
        }
      } else {
        toast('Categoría actualizada.', 'ok');
      }
      setEditandoId(null);
      setForm(FORM_VACIO);
      setBasicoSugeridoOriginal(null);
      setVigenciaDesde('');
      cargar();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setAplicandoCascada(false);
    }
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setBasicoSugeridoOriginal(null);
    setVigenciaDesde('');
  }

  async function eliminar(id: string) {
    if (!(await confirm('¿Eliminar esta categoría? Los legajos que la tengan asignada quedan sin categoría.', 'Eliminar categoría'))) return;
    try {
      await pb.collection('fichadas_categorias').delete(id);
      cargar();
      toast('Eliminada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <div className="card">
      <div className="hint">Categorías de convenio — cada una con su Plus Vacacional, divisor y % de descuentos, usados al liquidar vacaciones. El Básico sugerido es el básico real: al cambiarlo acá, se propaga automáticamente a todos los legajos de esta categoría desde la fecha "Vigente desde" que indiques.</div>
      <h3 style={{ fontSize: 13, color: 'var(--brand-dark)', margin: '14px 0 8px' }}>{editandoId ? 'Editar categoría' : 'Nueva categoría'}</h3>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="field"><label>Nombre</label><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Administ 2da" /></div>
        <div className="field"><label>Básico sugerido ($, opcional)</label><input value={form.basico_sugerido} onChange={(e) => setForm({ ...form, basico_sugerido: e.target.value })} style={{ width: 130 }} /></div>
        {editandoId && (
          <div className="field">
            <label>Vigente desde (si cambiás el Básico sugerido)</label>
            <input type="date" value={vigenciaDesde} onChange={(e) => setVigenciaDesde(e.target.value)} style={{ width: 140 }} />
          </div>
        )}
        <div className="field"><label>Plus Vacacional ($/día)</label><input value={form.plus_vacacional} onChange={(e) => setForm({ ...form, plus_vacacional: e.target.value })} style={{ width: 110 }} /></div>
        <div className="field"><label>Divisor mensual</label><input value={form.divisor_mensual} onChange={(e) => setForm({ ...form, divisor_mensual: e.target.value })} style={{ width: 90 }} /></div>
        {CAMPOS_PCT.map((c) => (
          <div className="field" key={c.key}>
            <label>{c.label}</label>
            <input value={form[c.key]} onChange={(e) => setForm({ ...form, [c.key]: e.target.value })} style={{ width: 90 }} />
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {editandoId ? (
          <>
            <button onClick={guardarEdicion} disabled={aplicandoCascada}>{aplicandoCascada ? 'Aplicando a legajos…' : 'Guardar'}</button>
            <button className="secondary" onClick={cancelarEdicion}>Cancelar</button>
          </>
        ) : (
          <button onClick={crear}>Crear categoría</button>
        )}
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--brand-dark)', margin: '18px 0 8px' }}>Categorías ({categorias.length})</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Básico sug.</th><th>Plus Vac.</th><th>Divisor</th><th>Jubil.</th><th>Ley 19032</th><th>Obra Soc.</th><th>ANSSAL</th><th>Sindical</th><th>Sepelio</th><th></th></tr></thead>
          <tbody>
            {categorias.map((c) => (
              <tr key={c.id}>
                <td className="admin-name">{c.nombre}</td>
                <td className="num">{c.basico_sugerido || '—'}</td>
                <td className="num">{c.plus_vacacional}</td>
                <td className="num">{c.divisor_mensual}</td>
                <td className="num">{c.pct_jubilacion}%</td>
                <td className="num">{c.pct_ley19032}%</td>
                <td className="num">{c.pct_obra_social}%</td>
                <td className="num">{c.pct_ansal}%</td>
                <td className="num">{c.pct_cuota_sindical}%</td>
                <td className="num">{c.pct_seguro_sepelio}%</td>
                <td>
                  <button className="small secondary" onClick={() => abrirEdicion(c)}>Editar</button>
                  <button className="small danger" onClick={() => eliminar(c.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {categorias.length === 0 && <div className="empty" style={{ marginTop: 16 }}>Sin categorías cargadas.</div>}
    </div>
  );
}
