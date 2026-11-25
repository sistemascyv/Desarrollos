import { useState } from 'react';
import { RutasTab } from './RutasTab';

export function RutasFrecuentesPage() {
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((n) => n + 1);

  return (
    <main>
      <RutasTab version={version} onChanged={bump} />
    </main>
  );
}
