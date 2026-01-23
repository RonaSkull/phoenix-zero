'use client';

import type { ReactNode } from 'react';

import { useAdvancedMode } from './useAdvancedMode';

type AdvancedOnlyProps = {
  children: ReactNode;
};

export function AdvancedOnly(props: AdvancedOnlyProps) {
  const { advanced } = useAdvancedMode();
  if (!advanced) return null;
  return <>{props.children}</>;
}
