"use client";
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let now: number | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach(notify => notify());
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { clearInterval(timer); timer = undefined; now = null; }
  };
}
export function useMinuteClock() {
  return useSyncExternalStore(subscribe, () => now, () => null);
}
