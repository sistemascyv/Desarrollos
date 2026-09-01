import { useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { AdminSimpleTab } from './AdminSimpleTab';
import type { Vehiculo } from '../../types';

export function VehiculosTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const toast = useToast();
  const [codigo, setCodigo] = useState('');
  const [marca, setMarca] = useState('');

  async function create() {
    if (!codigo.trim()) { toast('Falta el código.', 'warn'); return; }
    try {
      await pb.collection('vehiculos').create({ codigo: codigo.trim(), marca_modelo: marca.trim(), activo: true });
      setCodigo('');
      setMarca('');
      onChanged();
      toast('Vehículo agregado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <AdminSimpleTab<Vehiculo>
      title="Vehículos / Tractores"
      collection="vehiculos"
      columns={[{ field: 'codigo', label: 'Código' }, { field: 'marca_modelo', label: 'Marca / modelo' }]}
      searchFields={['codigo', 'marca_modelo']}
      version={version}
      onChanged={onChanged}
      form={
        <div className="row">
          <div className="field"><label>Código (patente/tractor)</label><input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="T130" /></div>
          <div className="field" style={{ flex: 1 }}><label>Marca / modelo</label><input value={marca} onChange={(e) => setMarca(e.target.value)} /></div>
          <button onClick={create}>+ Agregar</button>
        </div>
      }
    />
  );
}
