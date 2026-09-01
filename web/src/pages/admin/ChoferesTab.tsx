import { useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { AdminSimpleTab } from './AdminSimpleTab';
import type { Chofer } from '../../types';

export function ChoferesTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [localidad, setLocalidad] = useState('');

  async function create() {
    if (!nombre.trim()) { toast('Falta el nombre.', 'warn'); return; }
    try {
      await pb.collection('choferes').create({ nombre: nombre.trim(), localidad: localidad.trim(), activo: true });
      setNombre('');
      setLocalidad('');
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
      columns={[{ field: 'nombre', label: 'Nombre' }, { field: 'localidad', label: 'Localidad' }]}
      searchFields={['nombre', 'localidad']}
      version={version}
      onChanged={onChanged}
      form={
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label>Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div className="field"><label>Localidad</label><input value={localidad} onChange={(e) => setLocalidad(e.target.value)} /></div>
          <button onClick={create}>+ Agregar</button>
        </div>
      }
    />
  );
}
