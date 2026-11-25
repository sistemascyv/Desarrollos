import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { AdminSimpleTab } from './AdminSimpleTab';
import type { Chofer, FichadasLegajo } from '../../types';

export function ChoferesTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [legajoCreando, setLegajoCreando] = useState('');
  const [legajos, setLegajos] = useState<FichadasLegajo[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);

  useEffect(() => {
    Promise.all([
      pb.collection('fichadas_legajos').getFullList<FichadasLegajo>({ sort: 'nombre' }),
      pb.collection('choferes').getFullList<Chofer>(),
    ]).then(([l, c]) => { setLegajos(l); setChoferes(c); })
      .catch((e) => toast('No se pudieron cargar los legajos: ' + (e instanceof Error ? e.message : ''), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const legajoPorId = new Map(legajos.map((l) => [l.id, l]));
  const legajosOcupados = new Set(choferes.map((c) => c.legajo).filter(Boolean));
  const legajosLibres = legajos.filter((l) => !legajosOcupados.has(l.id) && l.estado);

  async function create() {
    if (!nombre.trim()) { toast('Falta el nombre.', 'warn'); return; }
    if (!legajoCreando) { toast('Elegí un legajo de Personal para vincular (si no existe todavía, creálo primero en Personal → Empleados).', 'warn'); return; }
    try {
      await pb.collection('choferes').create({ nombre: nombre.trim(), localidad: localidad.trim(), activo: true, legajo: legajoCreando });
      setNombre('');
      setLocalidad('');
      setLegajoCreando('');
      onChanged();
      toast('Chofer agregado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
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
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div className="field"><label>Localidad</label><input value={localidad} onChange={(e) => setLocalidad(e.target.value)} /></div>
          <div className="field" style={{ flex: 1 }}>
            <label>Legajo (Personal)</label>
            <select value={legajoCreando} onChange={(e) => setLegajoCreando(e.target.value)}>
              <option value="">Elegir…</option>
              {legajosLibres.map((l) => <option key={l.id} value={l.id}>{l.nombre}{l.nro_legajo ? ' (' + l.nro_legajo + ')' : ''}</option>)}
            </select>
          </div>
          <button onClick={create}>+ Agregar</button>
        </div>
      }
    />
  );
}
