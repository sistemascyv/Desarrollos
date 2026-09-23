import { useEffect, useState } from 'react';
import { pb } from '../../lib/pb';
import { useToast } from '../../lib/ToastContext';
import { isoDate } from '../../lib/format';
import type { Chofer, ValeCaja } from '../../types';

export function ValeCajaPage() {
  const toast = useToast();

  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [choferId, setChoferId] = useState('');
  const [fecha, setFecha] = useState(() => isoDate(new Date()));
  const [importe, setImporte] = useState('');
  const [moneda, setMoneda] = useState<'ARS' | 'BRL'>('ARS');
  const [observacion1, setObservacion1] = useState('');
  const [observacion2, setObservacion2] = useState('');
  const [nombreFirma, setNombreFirma] = useState('');
  const [nombreFirmaTocado, setNombreFirmaTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ultimoCreado, setUltimoCreado] = useState<ValeCaja | null>(null);

  useEffect(() => {
    pb.collection('choferes').getFullList<Chofer>({ filter: 'activo=true', sort: 'nombre' })
      .then(setChoferes)
      .catch((e) => toast('No se pudieron cargar los choferes: ' + (e instanceof Error ? e.message : ''), 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegirChofer(id: string) {
    setChoferId(id);
    if (!nombreFirmaTocado) {
      const c = choferes.find((x) => x.id === id);
      if (c) setNombreFirma(c.nombre);
    }
  }

  function limpiar() {
    setChoferId('');
    setFecha(isoDate(new Date()));
    setImporte('');
    setMoneda('ARS');
    setObservacion1('');
    setObservacion2('');
    setNombreFirma('');
    setNombreFirmaTocado(false);
    setUltimoCreado(null);
  }

  async function guardar() {
    const valor = Number(importe.replace(',', '.'));
    if (!choferId) { toast('Elegí un chofer.', 'warn'); return; }
    if (!fecha) { toast('Elegí una fecha.', 'warn'); return; }
    if (!valor || valor <= 0) { toast('El importe tiene que ser mayor a cero.', 'warn'); return; }
    if (!nombreFirma.trim()) { toast('Falta el nombre de quien firma.', 'warn'); return; }

    setGuardando(true);
    try {
      const creado = await pb.collection('vales_caja').create<ValeCaja>({
        fecha, chofer: choferId, importe: valor, moneda,
        observacion1: observacion1.trim() || undefined,
        observacion2: observacion2.trim() || undefined,
        nombre_firma: nombreFirma.trim(),
      });
      setUltimoCreado(creado);
      toast(`Vale de Caja N° ${creado.numero} guardado.`, 'ok');
    } catch (e) {
      toast('No se pudo guardar el vale: ' + (e instanceof Error ? e.message : ''), 'err');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main>
      <div className="card">
        <h2 style={{ margin: 0 }}>Vale de Caja</h2>
        <div className="hint">Pago en efectivo a un chofer. Recibí de Carossio Vairolatti y Cía SRL.</div>

        <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
          <div className="field">
            <label>Chofer</label>
            <select value={choferId} onChange={(e) => elegirChofer(e.target.value)} disabled={!!ultimoCreado}>
              <option value="">Elegir...</option>
              {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!!ultimoCreado} />
          </div>
          <div className="field">
            <label>Importe</label>
            <input inputMode="decimal" placeholder="ej: 50000" value={importe} onChange={(e) => setImporte(e.target.value)} disabled={!!ultimoCreado} style={{ width: 120 }} />
          </div>
          <div className="field">
            <label>Moneda</label>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as 'ARS' | 'BRL')} disabled={!!ultimoCreado}>
              <option value="ARS">Pesos Argentinos</option>
              <option value="BRL">Reales</option>
            </select>
          </div>
        </div>

        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label>Observación 1</label>
            <input value={observacion1} onChange={(e) => setObservacion1(e.target.value)} disabled={!!ultimoCreado} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label>Observación 2</label>
            <input value={observacion2} onChange={(e) => setObservacion2(e.target.value)} disabled={!!ultimoCreado} />
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div className="field" style={{ flex: 1, minWidth: 260 }}>
            <label>Nombre y Firma</label>
            <input
              value={nombreFirma}
              onChange={(e) => { setNombreFirma(e.target.value); setNombreFirmaTocado(true); }}
              disabled={!!ultimoCreado}
            />
          </div>
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          {!ultimoCreado ? (
            <button onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          ) : (
            <>
              <span className="hint">Vale N° {ultimoCreado.numero} guardado.</span>
              <button onClick={limpiar} className="secondary">Cargar otro</button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
