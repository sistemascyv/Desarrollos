import { useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { AdminSimpleTab } from './AdminSimpleTab';
import type { Ruta } from '../../types';

export function RutasTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const toast = useToast();
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [cliente, setCliente] = useState('');

  async function create() {
    if (!origen.trim() || !destino.trim()) { toast('Faltan origen y/o destino.', 'warn'); return; }
    try {
      await pb.collection('rutas').create({ origen: origen.trim(), destino: destino.trim(), cliente: cliente.trim(), activo: true });
      setOrigen('');
      setDestino('');
      setCliente('');
      onChanged();
      toast('Ruta agregada.', 'ok');
    } catch (e) {
      toast('Error: ' + (e instanceof Error ? e.message : ''), 'err');
    }
  }

  return (
    <AdminSimpleTab<Ruta>
      title="Rutas frecuentes"
      collection="rutas"
      columns={[{ field: 'origen', label: 'Origen' }, { field: 'destino', label: 'Destino' }, { field: 'cliente', label: 'Cliente habitual' }]}
      searchFields={['origen', 'destino', 'cliente']}
      version={version}
      onChanged={onChanged}
      form={
        <>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>Origen</label><input value={origen} onChange={(e) => setOrigen(e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>Destino</label><input value={destino} onChange={(e) => setDestino(e.target.value)} /></div>
            <div className="field"><label>Cliente habitual (opcional)</label><input value={cliente} onChange={(e) => setCliente(e.target.value)} /></div>
            <button onClick={create}>+ Agregar</button>
          </div>
          <div className="hint">Estas rutas aparecen como acceso rápido en "Nuevo tramo" para completar origen y destino con un clic.</div>
        </>
      }
    />
  );
}
