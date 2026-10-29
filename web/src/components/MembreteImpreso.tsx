// Precarga el logo del membrete apenas carga este módulo: window.print() /
// toPng() pueden disparar antes de que el navegador termine de pedir una
// imagen recién referenciada -- el primer impreso/descarga de la sesión
// podía salir sin logo. Corre una sola vez por sesión (módulo compartido),
// sin importar cuántas páginas importen este componente.
new Image().src = '/vale-logo.jpg';

export function MembreteImpreso() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img src="/vale-logo.jpg" alt="" style={{ height: 120 }} />
      <div>
        <div style={{ fontSize: 10, color: '#333' }}>SAN LORENZO 31<br />2400 SAN FRANCISCO (Cba.)</div>
      </div>
    </div>
  );
}
