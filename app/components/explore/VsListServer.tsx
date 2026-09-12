import React from 'react';
import VsListClient from './VsListClient';
import type { Debate } from '../../lib/debates';

type VsListServerProps = {
  mockDebates: Debate[];
  indexedDebates: Debate[];
  indexedReadFailed: boolean;
};

export default function VsListServer(props: VsListServerProps) {
  return <VsListClient {...props} />;
}
