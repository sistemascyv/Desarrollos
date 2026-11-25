import { useState } from 'react';
import { UsuariosTab } from './UsuariosTab';

export function AdminPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const bump = () => setRefreshTick((n) => n + 1);

  return (
    <main>
      <UsuariosTab version={refreshTick} onChanged={bump} />
    </main>
  );
}
