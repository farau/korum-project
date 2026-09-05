"use client";
import React from 'react';

export default function Ticker() {
  return (
    <div className="ticker" aria-label="Recent activity">
      <div className="ticker-track" id="tickerTrack" />
    </div>
  );
}
