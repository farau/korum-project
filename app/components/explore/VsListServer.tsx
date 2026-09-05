import React from 'react';
import VsListClient from './VsListClient';
import { getDebates } from '../../lib/debates';

export default async function VsListServer() {
  const debates = getDebates();
  return <VsListClient debates={debates} />;
}
