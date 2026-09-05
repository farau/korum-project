import React from 'react';
import { getDebates } from '../../lib/debates';

export default function TopVsServer() {
  const debates = getDebates();
  const top = [...debates].sort((a,b) => (b.volume24h) - (a.volume24h)).slice(0,10);

  return (
    <aside className="topvs">
      <h3>Top VS</h3>
      <div id="topVsRows">
        {top.map((d,i) => (
          <div className={`topvs-row ${i<3? 'top3' : ''}`} key={d.id}>
            <span className="topvs-rank">{String(i+1).padStart(2,'0')}</span>
            <span className="topvs-name">{d.sideA} vs {d.sideB}</span>
            <span className="topvs-cap">${Intl.NumberFormat('en-US').format(d.volume24h * 2.4)}</span>
            <span className="topvs-traders">{d.participantCount.toLocaleString('en-US')}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
