import { UsuariosTab } from './UsuariosTab';
import { useState } from 'react';

export function AdminPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const bump = () => setRefreshTick((n) => n + 1);

  return (
    <main>
      <UsuariosTab version={refreshTick} onChanged={bump} />
    </main>
  );
}
