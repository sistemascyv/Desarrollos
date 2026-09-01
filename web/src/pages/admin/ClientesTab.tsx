import { useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { AdminSimpleTab } from './AdminSimpleTab';
import type { Cliente } from '../../types';

export function ClientesTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState('');

  async function create() {
    if (!nombre.trim()) { toast('Falta el nombre.', 'warn'); return; }
    try {
      await pb.collection('clientes').create({ nombre: nombre.trim(), activo: true });
      setNombre('');
      onChanged();
      toast('Cliente agregado.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <AdminSimpleTab<Cliente>
      title="Clientes"
      collection="clientes"
      columns={[{ field: 'nombre', label: 'Nombre' }]}
      searchFields={['nombre']}
      version={version}
      onChanged={onChanged}
      form={
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label>Nombre del cliente</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <button onClick={create}>+ Agregar</button>
        </div>
      }
    />
  );
}
