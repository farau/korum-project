import React from 'react';
import StatsClient from './StatsClient';
import { getDebates } from '../../lib/debates';

export default function StatsServer() {
  const debates = getDebates();
  return <StatsClient debates={debates} />;
}
