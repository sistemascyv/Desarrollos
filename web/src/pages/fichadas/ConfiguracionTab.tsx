import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { useConfirm } from '../../lib/ConfirmContext';
import { hhmmAMinutos, fmtDur } from './motor';
import type { DiaHorario, FichadasEmpresa, FichadasHorario, FichadasLegajo } from '../../types';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const SUB_TABS = [
  { id: 'empleados', label: 'Empleados' },
  { id: 'horario_personal', label: 'Horario personalizado' },
  { id: 'plantillas', label: 'Plantillas de horario' },
  { id: 'areas', label: 'Áreas' },
] as const;
type SubTabId = typeof SUB_TABS[number]['id'];

export function ConfiguracionTab() {
  const [subTab, setSubTab] = useState<SubTabId>('empleados');
  const [empresas, setEmpresas] = useState<FichadasEmpresa[]>([]);
  const [horarios, setHorarios] = useState<FichadasHorario[]>([]);
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [tick, setTick] = useState(0);
  const refrescar = () => setTick((t) => t + 1);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [e, h, l] = await Promise.all([
          pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
          pb.collection('fichadas_horarios').getFullList<FichadasHorario>({ sort: 'nombre' }),
          pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre' }),
        ]);
        setEmpresas(e); setHorarios(h); setLegajos(l);
      } catch (err) {
        toast('No se pudo cargar la configuración: ' + (err instanceof Error ? err.message : ''), 'err');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <div className="card">
      <h2>Configuración</h2>
      <div className="hint">Empleados nuevos, cambios de horario, plantillas y áreas — sin depender de un nuevo export de CINTIA.</div>
      <div className="row" style={{ marginTop: 12 }}>
        {SUB_TABS.map((t) => (
          <button key={t.id} className={subTab === t.id ? 'small' : 'small secondary'} onClick={() => setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        {subTab === 'empleados' && <EmpleadosSub empresas={empresas} horarios={horarios} legajos={legajos} onChanged={refrescar} />}
        {subTab === 'horario_personal' && <HorarioPersonalSub legajos={legajos} onChanged={refrescar} />}
        {subTab === 'plantillas' && <PlantillasSub horarios={horarios} legajos={legajos} onChanged={refrescar} />}
        {subTab === 'areas' && <AreasSub empresas={empresas} legajos={legajos} onChanged={refrescar} />}
      </div>
    </div>
  );
}

// ---------- Empleados ----------

function EmpleadosSub({ empresas, horarios, legajos, onChanged }: { empresas: FichadasEmpresa[]; horarios: FichadasHorario[]; legajos: FichadasLegajo[]; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [nroLegajo, setNroLegajo] = useState('');
  const [nroTarjeta, setNroTarjeta] = useState('');
  const [nombre, setNombre] = useState('');
  const [empresa, setEmpresa] = useState(empresas[0]?.id || '');
  const [horario, setHorario] = useState(horarios[0]?.id || '');

  useEffect(() => { if (!empresa && empresas[0]) setEmpresa(empresas[0].id); }, [empresas, empresa]);
  useEffect(() => { if (!horario && horarios[0]) setHorario(horarios[0].id); }, [horarios, horario]);

  async function agregar() {
    if (!nroTarjeta.trim() || !nombre.trim()) { toast('Completá al menos N° Tarjeta y Nombre.', 'warn'); return; }
    try {
      await pb.collection('fichadas_legajos').create({
        nro_legajo: nroLegajo.trim(), nro_tarjeta: nroTarjeta.trim(), nombre: nombre.trim().toUpperCase(),
        empresa: empresa || null, horario: horario || null, estado: true,
      });
      setNroLegajo(''); setNroTarjeta(''); setNombre('');
      onChanged();
      toast('Empleado agregado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function editar(id: string, campo: string, valor: string | boolean) {
    try {
      await pb.collection('fichadas_legajos').update(id, { [campo]: valor });
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function eliminar(id: string) {
    if (!(await confirm('¿Eliminar este empleado? Mejor usar "Inactivo" si solo dejó de trabajar, para no perder su historial de fichadas.', 'Eliminar empleado'))) return;
    try {
      await pb.collection('fichadas_legajos').delete(id);
      onChanged();
      toast('Eliminado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <>
      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 8px' }}>Agregar empleado nuevo</h3>
      <div className="row">
        <div className="field"><label>N° Legajo</label><input value={nroLegajo} onChange={(e) => setNroLegajo(e.target.value)} /></div>
        <div className="field"><label>N° Tarjeta</label><input value={nroTarjeta} onChange={(e) => setNroTarjeta(e.target.value)} placeholder="Suele ser igual al legajo" /></div>
        <div className="field" style={{ flex: 2 }}><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="APELLIDO NOMBRE" /></div>
        <div className="field"><label>Área</label><select value={empresa} onChange={(e) => setEmpresa(e.target.value)}>{empresas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
        <div className="field"><label>Horario</label><select value={horario} onChange={(e) => setHorario(e.target.value)}>{horarios.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}</select></div>
        <button onClick={agregar}>Agregar</button>
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Empleados cargados ({legajos.length})</h3>
      <div className="table-wrap" style={{ maxHeight: '50vh' }}>
        <table>
          <thead><tr><th>Legajo</th><th>Tarjeta</th><th>Nombre</th><th>Área</th><th>Horario</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {legajos.map((l) => (
              <tr key={l.id} className={!l.estado ? 'inactivo' : ''}>
                <td>{l.nro_legajo}</td>
                <td>{l.nro_tarjeta}</td>
                <td className="admin-name">{l.nombre}</td>
                <td>
                  <select value={l.empresa || ''} onChange={(e) => editar(l.id, 'empresa', e.target.value)}>
                    {empresas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </td>
                <td>
                  <select value={l.horario || ''} onChange={(e) => editar(l.id, 'horario', e.target.value)}>
                    {horarios.map((h) => <option key={h.id} value={h.id}>{h.nombre}</option>)}
                  </select>
                </td>
                <td>
                  <select value={l.estado ? '1' : '0'} onChange={(e) => editar(l.id, 'estado', e.target.value === '1')}>
                    <option value="1">Activo</option>
                    <option value="0">Inactivo</option>
                  </select>
                </td>
                <td><button className="small danger" onClick={() => eliminar(l.id)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------- edición de 7 días (compartida por Horario personalizado y Plantillas) ----------

function EditorDias({ diasIniciales, onGuardar, guardando }: { diasIniciales: DiaHorario[]; onGuardar: (dias: DiaHorario[]) => void; guardando: boolean }) {
  const toast = useToast();
  const [libre, setLibre] = useState<boolean[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = diasIniciales.find((d) => d.dia === i + 1);
    return !f || !f.trabaja || !f.pares.length;
  }));
  const [cortado, setCortado] = useState<boolean[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = diasIniciales.find((d) => d.dia === i + 1);
    return (f?.pares.length ?? 0) > 1;
  }));
  const [entrada, setEntrada] = useState<string[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = diasIniciales.find((d) => d.dia === i + 1);
    return f?.pares[0] ? fmtDur(f.pares[0][0]) : '';
  }));
  const [salida, setSalida] = useState<string[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = diasIniciales.find((d) => d.dia === i + 1);
    return f?.pares[0] ? fmtDur(f.pares[0][1]) : '';
  }));
  const [entrada2, setEntrada2] = useState<string[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = diasIniciales.find((d) => d.dia === i + 1);
    return f?.pares[1] ? fmtDur(f.pares[1][0]) : '';
  }));
  const [salida2, setSalida2] = useState<string[]>(() => DIAS_SEMANA.map((_, i) => {
    const f = diasIniciales.find((d) => d.dia === i + 1);
    return f?.pares[1] ? fmtDur(f.pares[1][1]) : '';
  }));

  function guardar() {
    const dias: DiaHorario[] = [];
    for (let i = 0; i < 7; i++) {
      if (libre[i]) { dias.push({ dia: i + 1, trabaja: false, pares: [] }); continue; }
      const e = hhmmAMinutos(entrada[i]);
      const s = hhmmAMinutos(salida[i]);
      if (e === null || s === null) { toast(`Revisá el horario del ${DIAS_SEMANA[i]} (formato HH:MM).`, 'warn'); return; }
      const pares: [number, number][] = [[e, s]];
      if (cortado[i]) {
        const e2 = hhmmAMinutos(entrada2[i]);
        const s2 = hhmmAMinutos(salida2[i]);
        if (e2 === null || s2 === null) { toast(`Revisá el segundo turno del ${DIAS_SEMANA[i]} (formato HH:MM).`, 'warn'); return; }
        pares.push([e2, s2]);
      }
      dias.push({ dia: i + 1, trabaja: true, pares });
    }
    onGuardar(dias);
  }

  return (
    <>
      {DIAS_SEMANA.map((nombre, i) => (
        <div key={nombre} style={{ marginBottom: 10 }}>
          <div className="row" style={{ alignItems: 'center' }}>
            <div style={{ flex: '0 0 90px', fontWeight: 600, fontSize: 12 }}>{nombre}</div>
            <div className="field"><label>Entrada</label><input value={entrada[i]} disabled={libre[i]} placeholder="HH:MM" onChange={(e) => setEntrada((a) => a.map((v, idx) => idx === i ? e.target.value : v))} /></div>
            <div className="field"><label>Salida</label><input value={salida[i]} disabled={libre[i]} placeholder="HH:MM" onChange={(e) => setSalida((a) => a.map((v, idx) => idx === i ? e.target.value : v))} /></div>
            <label style={{ fontSize: 12, fontWeight: 400 }}>
              <input type="checkbox" checked={libre[i]} onChange={(e) => setLibre((a) => a.map((v, idx) => idx === i ? e.target.checked : v))} /> No trabaja
            </label>
            {!libre[i] && (
              <label style={{ fontSize: 12, fontWeight: 400 }}>
                <input type="checkbox" checked={cortado[i]} onChange={(e) => setCortado((a) => a.map((v, idx) => idx === i ? e.target.checked : v))} /> Turno cortado
              </label>
            )}
          </div>
          {!libre[i] && cortado[i] && (
            <div className="row" style={{ alignItems: 'center', marginTop: 4 }}>
              <div style={{ flex: '0 0 90px' }} />
              <div className="field"><label>Entrada (2)</label><input value={entrada2[i]} placeholder="HH:MM" onChange={(e) => setEntrada2((a) => a.map((v, idx) => idx === i ? e.target.value : v))} /></div>
              <div className="field"><label>Salida (2)</label><input value={salida2[i]} placeholder="HH:MM" onChange={(e) => setSalida2((a) => a.map((v, idx) => idx === i ? e.target.value : v))} /></div>
            </div>
          )}
        </div>
      ))}
      <button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar días'}</button>
      <div className="hint" style={{ marginTop: 6 }}>"Turno cortado" agrega un segundo Entrada/Salida ese día (ej: entra a la mañana, sale, vuelve a la tarde).</div>
    </>
  );
}

// ---------- Horario personalizado (por empleado) ----------

function HorarioPersonalSub({ legajos, onChanged }: { legajos: FichadasLegajo[]; onChanged: () => void }) {
  const toast = useToast();
  const [idLegajo, setIdLegajo] = useState(legajos[0]?.id || '');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (!idLegajo && legajos[0]) setIdLegajo(legajos[0].id); }, [legajos, idLegajo]);

  const legajo = legajos.find((l) => l.id === idLegajo);
  const diasActuales = legajo?.dias_personalizados ?? legajo?.expand?.horario?.dias ?? [];

  async function guardar(dias: DiaHorario[]) {
    setGuardando(true);
    try {
      await pb.collection('fichadas_legajos').update(idLegajo, { dias_personalizados: dias });
      toast('Horario guardado.', 'ok');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  async function quitarPersonalizado() {
    setGuardando(true);
    try {
      await pb.collection('fichadas_legajos').update(idLegajo, { dias_personalizados: null });
      toast('Vuelve a usar el horario de la plantilla.', 'ok');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <div className="row">
        <div className="field" style={{ flex: 2 }}>
          <label>Empleado</label>
          <select value={idLegajo} onChange={(e) => setIdLegajo(e.target.value)}>
            {legajos.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
        {legajo?.dias_personalizados != null && (
          <div className="field" style={{ flex: '0 0 auto', alignSelf: 'end' }}>
            <button className="small secondary" onClick={quitarPersonalizado} disabled={guardando}>Volver a usar la plantilla</button>
          </div>
        )}
      </div>
      {legajo && (
        <div style={{ marginTop: 14 }} key={idLegajo}>
          <EditorDias diasIniciales={diasActuales} onGuardar={guardar} guardando={guardando} />
        </div>
      )}
    </>
  );
}

// ---------- Plantillas de horario ----------

function PlantillasSub({ horarios, legajos, onChanged }: { horarios: FichadasHorario[]; legajos: FichadasLegajo[]; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [nombreNueva, setNombreNueva] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    if (!nombreNueva.trim()) { toast('Ponele un nombre a la plantilla.', 'warn'); return; }
    try {
      const rec = await pb.collection('fichadas_horarios').create<FichadasHorario>({
        nombre: nombreNueva.trim(),
        dias: Array.from({ length: 7 }, (_, i) => ({ dia: i + 1, trabaja: false, pares: [] })),
      });
      setNombreNueva('');
      onChanged();
      setEditando(rec.id);
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function eliminar(id: string, usados: number) {
    if (usados > 0) { toast(`No se puede eliminar: ${usados} empleado(s) todavía usan esta plantilla. Reasignalos primero desde Empleados.`, 'warn'); return; }
    if (!(await confirm('¿Eliminar esta plantilla de horario?', 'Eliminar plantilla'))) return;
    try {
      await pb.collection('fichadas_horarios').delete(id);
      onChanged();
      toast('Eliminada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function guardarDias(dias: DiaHorario[]) {
    if (!editando) return;
    setGuardando(true);
    try {
      await pb.collection('fichadas_horarios').update(editando, { dias });
      toast('Plantilla guardada.', 'ok');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  const horarioEditando = horarios.find((h) => h.id === editando);

  return (
    <>
      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 8px' }}>Nueva plantilla</h3>
      <div className="row">
        <div className="field" style={{ flex: 2 }}><label>Nombre</label><input value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} placeholder="Ej: Corrido - Entrada 09:00" /></div>
        <button onClick={crear}>Crear (después definís los días)</button>
      </div>

      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Plantillas ({horarios.length})</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Empleados que la usan</th><th></th></tr></thead>
          <tbody>
            {horarios.map((h) => {
              const usados = legajos.filter((l) => l.horario === h.id).length;
              return (
                <tr key={h.id}>
                  <td className="admin-name">{h.nombre}</td>
                  <td>{usados}</td>
                  <td>
                    <button className="small secondary" onClick={() => setEditando(editando === h.id ? null : h.id)}>{editando === h.id ? 'Cerrar' : 'Editar días'}</button>
                    <button className="small danger" onClick={() => eliminar(h.id, usados)}>Eliminar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {horarioEditando && (
        <div style={{ marginTop: 14 }} key={horarioEditando.id}>
          <h3 style={{ fontSize: 13, color: 'var(--navy)' }}>Días de "{horarioEditando.nombre}"</h3>
          <EditorDias diasIniciales={horarioEditando.dias} onGuardar={guardarDias} guardando={guardando} />
        </div>
      )}
    </>
  );
}

// ---------- Áreas ----------

function AreasSub({ empresas, legajos, onChanged }: { empresas: FichadasEmpresa[]; legajos: FichadasLegajo[]; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [nombreNueva, setNombreNueva] = useState('');

  async function crear() {
    if (!nombreNueva.trim()) { toast('Ponele un nombre al área.', 'warn'); return; }
    try {
      await pb.collection('fichadas_empresas').create({ nombre: nombreNueva.trim() });
      setNombreNueva('');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function renombrar(id: string, nombre: string) {
    try {
      await pb.collection('fichadas_empresas').update(id, { nombre });
      onChanged();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  async function eliminar(id: string, usados: number) {
    if (usados > 0) { toast(`No se puede eliminar: ${usados} empleado(s) pertenecen a esta área. Reasignalos primero desde Empleados.`, 'warn'); return; }
    if (!(await confirm('¿Eliminar esta área?', 'Eliminar área'))) return;
    try {
      await pb.collection('fichadas_empresas').delete(id);
      onChanged();
      toast('Eliminada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <>
      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '0 0 8px' }}>Nueva área</h3>
      <div className="row">
        <div className="field" style={{ flex: 2 }}><label>Nombre</label><input value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} placeholder="Ej: DEPOSITO NUEVO" /></div>
        <button onClick={crear}>Agregar</button>
      </div>
      <h3 style={{ fontSize: 13, color: 'var(--navy)', margin: '18px 0 8px' }}>Áreas ({empresas.length})</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Empleados</th><th></th></tr></thead>
          <tbody>
            {empresas.map((a) => {
              const usados = legajos.filter((l) => l.empresa === a.id).length;
              return (
                <tr key={a.id}>
                  <td><input defaultValue={a.nombre} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== a.nombre) renombrar(a.id, e.target.value.trim()); }} /></td>
                  <td>{usados}</td>
                  <td><button className="small danger" onClick={() => eliminar(a.id, usados)}>Eliminar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
