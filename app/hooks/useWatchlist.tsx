"use client";
import { useEffect, useState } from 'react';

export function useWatchlist() {
  const [ids, setIds] = useState<number[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem('korum-watchlist');
        setIds(raw ? JSON.parse(raw) : []);
      } catch {
        setIds([]);
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem('korum-watchlist', JSON.stringify(ids)); } catch {}
  }, [ids, ready]);

  function add(id: number) {
    setIds(prev => prev.includes(id) ? prev : [...prev, id]);
  }
  function remove(id: number) {
    setIds(prev => prev.filter(x => x !== id));
  }
  function toggle(id: number) {
    setIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function has(id: number) { return ids.includes(id); }

  return { ids, add, remove, toggle, has };
}
