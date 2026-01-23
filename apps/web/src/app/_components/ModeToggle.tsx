'use client';

import { useAdvancedMode } from './useAdvancedMode';

type ModeToggleProps = {
  label?: string;
};

export function ModeToggle(props: ModeToggleProps) {
  const { advanced, setAdvanced } = useAdvancedMode();
  const label = props.label ?? 'Modo avançado';

  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#B9C3D6' }}>
      <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
      <span style={{ fontWeight: 700 }}>{label}</span>
    </label>
  );
}
