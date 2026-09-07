import { useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { AdminSimpleTab } from './AdminSimpleTab';
import type { Ruta } from '../../types';

export function RutasTab({ version, onChanged }: { version: number; onChanged: () => void }) {
  const toast = useToast();
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [kmReales, setKmReales] = useState('');
  const [kmConvenio, setKmConvenio] = useState('');

  async function create() {
    if (!origen.trim() || !destino.trim()) { toast('Faltan origen y/o destino.', 'warn'); return; }
    try {
      await pb.collection('rutas').create({
        origen: origen.trim(),
        destino: destino.trim(),
        km_reales: kmReales.trim() === '' ? null : Number(kmReales),
        km_convenio: kmConvenio.trim() === '' ? null : Number(kmConvenio),
        activo: true,
      });
      setOrigen('');
      setDestino('');
      setKmReales('');
      setKmConvenio('');
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
      columns={[
        { field: 'origen', label: 'Origen' },
        { field: 'destino', label: 'Destino' },
        { field: 'km_reales', label: 'Km reales', type: 'number' },
        { field: 'km_convenio', label: 'Km convenio', type: 'number' },
      ]}
      searchFields={['origen', 'destino']}
      version={version}
      onChanged={onChanged}
      form={
        <>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>Origen</label><input value={origen} onChange={(e) => setOrigen(e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>Destino</label><input value={destino} onChange={(e) => setDestino(e.target.value)} /></div>
            <div className="field"><label>Km reales</label><input type="number" value={kmReales} onChange={(e) => setKmReales(e.target.value)} /></div>
            <div className="field"><label>Km convenio</label><input type="number" value={kmConvenio} onChange={(e) => setKmConvenio(e.target.value)} /></div>
            <button onClick={create}>+ Agregar</button>
          </div>
          <div className="hint">Estas rutas aparecen como acceso rápido en "Nuevo tramo" para completar origen y destino con un clic.</div>
        </>
      }
    />
  );
}
