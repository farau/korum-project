import React from 'react';
import TickerClient from './TickerClient';
import { getDebates } from '../../lib/debates';

export default function TickerServer() {
  const debates = getDebates();
  return <TickerClient debates={debates} />;
}
