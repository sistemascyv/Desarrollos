import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MODULES } from '../types';
import { AYUDA_MODULOS } from '../lib/ayudaContenido';

// Botón "?" flotante, siempre en la misma esquina, que muestra la ayuda
// del módulo que se está mirando en ese momento (deducido de la URL actual
// contra MODULES). Un solo lugar para mantener -- una página nueva queda
// con ayuda sola apenas se le agrega una entrada a AYUDA_MODULOS, sin tener
// que tocar cada página una por una.
function moduloActual(pathname: string): string | null {
  const limpio = pathname.replace(/^\//, '');
  if (limpio === '' || limpio === 'inicio') return 'inicio';
  if (limpio.startsWith('administracion')) return 'administracion';
  const encontrado = MODULES.find((m) => limpio === m.path || limpio.startsWith(m.path + '/'));
  return encontrado ? encontrado.id : null;
}

export function AyudaFlotante() {
  const location = useLocation();
  const [abierta, setAbierta] = useState(false);
  const id = moduloActual(location.pathname);
  const ayuda = id ? AYUDA_MODULOS[id] : undefined;
  if (!ayuda) return null;

  return (
    <>
      <button
        type="button"
        className="ayuda-flotante-boton"
        title="Ayuda de esta pantalla"
        onClick={() => setAbierta(true)}
      >
        ?
      </button>
      {abierta && (
        <div className="modal-bg" onClick={() => setAbierta(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h3>{ayuda.titulo}</h3>
            <p style={{ fontSize: 13, marginTop: 0 }}>{ayuda.resumen}</p>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Paso a paso</div>
            <ol style={{ fontSize: 13, paddingLeft: 20, margin: 0 }}>
              {ayuda.pasos.map((paso: string, i: number) => <li key={i} style={{ marginBottom: 6 }}>{paso}</li>)}
            </ol>
            {ayuda.tips && ayuda.tips.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 6px' }}>Tené en cuenta</div>
                <ul style={{ fontSize: 13, paddingLeft: 20, margin: 0 }}>
                  {ayuda.tips.map((tip: string, i: number) => <li key={i} style={{ marginBottom: 6 }}>{tip}</li>)}
                </ul>
              </>
            )}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="secondary" onClick={() => setAbierta(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
