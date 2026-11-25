import { useState } from 'react';
import { VehiculosTab } from './VehiculosTab';

export function VehiculosPage() {
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((n) => n + 1);

  return (
    <main>
      <VehiculosTab version={version} onChanged={bump} />
    </main>
  );
}
