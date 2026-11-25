import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { AdminSimpleTab } from '../admin/AdminSimpleTab';
import type { Chofer, FichadasEmpresa, FichadasLegajo } from '../../types';

// Muchos choferes reales nunca tuvieron una ficha en Personal -- solo
// existían en esta colección (usada por Planilla Choferes/Vale de Caja),
// sin pasar nunca por el flujo de RRHH. El backfill por nombre (migración
// 1789550000) solo pudo vincular a los que YA tenían una ficha coincidente
// en fichadas_legajos -- el resto queda "Sin legajo vinculado" y, hasta
// ahora, no tenía forma de arreglarlo sin ir a Personal a crear la ficha a
// mano y volver acá a vincularla. Esta pantalla ahora deja crear esa
// ficha directo, en el mismo lugar.
function VincularLegajoForm({ chofer, empresas, onVinculado }: { chofer: Chofer; empresas: FichadasEmpresa[]; onVinculado: () => void }) {
  const toast = useToast();
  const [nroLegajo, setNroLegajo] = useState('');
  const [fechaAlta, setFechaAlta] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function crearYVincular() {
    if (!nroLegajo.trim()) { toast('Completá el N° de Legajo.', 'warn'); return; }
    setGuardando(true);
    try {
      // El chofer no ficha con reloj -- nro_tarjeta es obligatorio en la
      // base (lo usa el motor de Fichadas para matchear marcas) pero no
      // tiene sentido real acá, así que se completa con el mismo N° de
      // Legajo (lo que sí importa para RRHH) en vez de pedirlo aparte.
      const nuevoLegajo = await pb.collection('fichadas_legajos').create<FichadasLegajo>({
        nro_legajo: nroLegajo.trim(), nro_tarjeta: nroLegajo.trim(), nombre: chofer.nombre.toUpperCase(), estado: true, fecha_alta: fechaAlta || null, empresa: empresaId || null,
      });
      await pb.collection('choferes').update(chofer.id, { legajo: nuevoLegajo.id });
      toast('Legajo creado y vinculado.', 'ok');
      onVinculado();
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ minWidth: 160, fontWeight: 600, fontSize: 13 }}>{chofer.nombre}</div>
      <div className="field"><label>N° de Legajo</label><input value={nroLegajo} onChange={(e) => setNroLegajo(e.target.value)} style={{ width: 110 }} /></div>
      <div className="field"><label>Fecha de alta</label><input type="date" value={fechaAlta} onChange={(e) => setFechaAlta(e.target.value)} /></div>
      <div className="field">
        <label>Área</label>
        <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
          <option value="">Sin área</option>
          {empresas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </div>
      <button className="small" disabled={guardando} onClick={crearYVincular}>{guardando ? 'Creando…' : 'Crear legajo y vincular'}</button>
    </div>
  );
}

export function ChoferesTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [modoLegajo, setModoLegajo] = useState<'existente' | 'nuevo'>('existente');
  const [legajoCreando, setLegajoCreando] = useState('');
  const [nroLegajoNuevo, setNroLegajoNuevo] = useState('');
  const [fechaAltaNuevo, setFechaAltaNuevo] = useState('');
  const [empresaNuevo, setEmpresaNuevo] = useState('');
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [empresas, setEmpresas] = useState<FichadasEmpresa[]>([]);

  useEffect(() => {
    Promise.all([
      pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre' }),
      pb.collection('choferes').getFullList<Chofer>(),
      pb.collection('fichadas_empresas').getFullList<FichadasEmpresa>({ sort: 'nombre' }),
    ]).then(([l, c, e]) => { setLegajos(l); setChoferes(c); setEmpresas(e); })
      .catch((e) => toast('No se pudieron cargar los legajos: ' + (e instanceof Error ? e.message : ''), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const legajoPorId = new Map(legajos.map((l) => [l.id, l]));
  const legajosOcupados = new Set(choferes.map((c) => c.legajo).filter(Boolean));
  const legajosLibres = legajos.filter((l) => !legajosOcupados.has(l.id) && l.estado);
  const choferesSinLegajo = choferes.filter((c) => !c.legajo);

  async function create() {
    if (!nombre.trim()) { toast('Falta el nombre.', 'warn'); return; }
    try {
      let legajoId = legajoCreando;
      if (modoLegajo === 'nuevo') {
        if (!nroLegajoNuevo.trim()) { toast('Completá el N° de Legajo nuevo.', 'warn'); return; }
        // El chofer no ficha con reloj -- nro_tarjeta es obligatorio en la
        // base pero no tiene sentido real acá, se completa con el mismo
        // N° de Legajo en vez de pedirlo aparte (ver VincularLegajoForm).
        const nuevoLegajo = await pb.collection('fichadas_legajos').create<FichadasLegajo>({
          nro_legajo: nroLegajoNuevo.trim(), nro_tarjeta: nroLegajoNuevo.trim(), nombre: nombre.trim().toUpperCase(), estado: true, fecha_alta: fechaAltaNuevo || null, empresa: empresaNuevo || null,
        });
        legajoId = nuevoLegajo.id;
      }
      if (!legajoId) { toast('Elegí un legajo de Personal o creá uno nuevo.', 'warn'); return; }
      await pb.collection('choferes').create({ nombre: nombre.trim(), localidad: localidad.trim(), activo: true, legajo: legajoId });
      setNombre(''); setLocalidad(''); setLegajoCreando(''); setNroLegajoNuevo(''); setFechaAltaNuevo(''); setEmpresaNuevo('');
      onChanged();
      toast('Chofer agregado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <>
      {choferesSinLegajo.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 13 }}>Choferes sin legajo vinculado ({choferesSinLegajo.length})</h3>
          <div className="hint">Nunca tuvieron una ficha en Personal — creásela acá para que aparezcan en Personal → Empleados y puedan tener alta/baja.</div>
          {choferesSinLegajo.map((c) => <VincularLegajoForm key={c.id} chofer={c} empresas={empresas} onVinculado={onChanged} />)}
        </div>
      )}

      <AdminSimpleTab<Chofer>
        title="Choferes"
        collection="choferes"
        activoReadOnly
        columns={[
          { field: 'nombre', label: 'Nombre' },
          { field: 'localidad', label: 'Localidad' },
          {
            field: 'legajo', label: 'Legajo', type: 'select',
            options: legajos.map((l) => ({ value: l.id, label: l.nombre + (l.nro_legajo ? ' (' + l.nro_legajo + ')' : '') })),
            render: (v) => { const l = legajoPorId.get(String(v || '')); return l ? l.nombre : '⚠ Sin legajo vinculado'; },
          },
        ]}
        searchFields={['nombre', 'localidad']}
        version={version}
        onChanged={onChanged}
        form={
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1 }}><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
            <div className="field"><label>Localidad</label><input value={localidad} onChange={(e) => setLocalidad(e.target.value)} /></div>
            <div className="field">
              <label>Legajo (Personal)</label>
              <div className="row" style={{ gap: 4 }}>
                <button type="button" className={modoLegajo === 'existente' ? 'small' : 'small secondary'} onClick={() => setModoLegajo('existente')}>Elegir existente</button>
                <button type="button" className={modoLegajo === 'nuevo' ? 'small' : 'small secondary'} onClick={() => setModoLegajo('nuevo')}>Crear nuevo</button>
              </div>
            </div>
            {modoLegajo === 'existente' ? (
              <div className="field" style={{ flex: 1 }}>
                <label>&nbsp;</label>
                <select value={legajoCreando} onChange={(e) => setLegajoCreando(e.target.value)}>
                  <option value="">Elegir…</option>
                  {legajosLibres.map((l) => <option key={l.id} value={l.id}>{l.nombre}{l.nro_legajo ? ' (' + l.nro_legajo + ')' : ''}</option>)}
                </select>
              </div>
            ) : (
              <>
                <div className="field"><label>N° de Legajo</label><input value={nroLegajoNuevo} onChange={(e) => setNroLegajoNuevo(e.target.value)} style={{ width: 110 }} /></div>
                <div className="field"><label>Fecha de alta</label><input type="date" value={fechaAltaNuevo} onChange={(e) => setFechaAltaNuevo(e.target.value)} /></div>
                <div className="field">
                  <label>Área</label>
                  <select value={empresaNuevo} onChange={(e) => setEmpresaNuevo(e.target.value)}>
                    <option value="">Sin área</option>
                    {empresas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
              </>
            )}
            <button onClick={create}>+ Agregar</button>
          </div>
        }
      />
    </>
  );
}
