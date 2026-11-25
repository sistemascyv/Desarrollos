import { useState } from 'react';
import { ClientesTab } from './ClientesTab';

export function ClientesPage() {
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((n) => n + 1);

  return (
    <main>
      <ClientesTab version={version} onChanged={bump} />
    </main>
  );
}
