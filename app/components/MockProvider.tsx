"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';

type MockContextValue = {
  mockEnabled: boolean;
  setMockEnabled: (v: boolean) => void;
  hydrated: boolean;
};

const MockContext = createContext<MockContextValue | null>(null);

export function MockProvider({ children }: { children: React.ReactNode }) {
  const [mockEnabled, setMockEnabled] = useState<boolean>(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const v = localStorage.getItem('korum-mock');
        setMockEnabled(v === null ? true : v === '1' || v === 'true');
      } catch {
        setMockEnabled(true);
      }
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem('korum-mock', mockEnabled ? '1' : '0');
    } catch {
      // localStorage can be unavailable in private or restricted contexts.
    }
  }, [hydrated, mockEnabled]);

  return (
    <MockContext.Provider value={{ mockEnabled, setMockEnabled, hydrated }}>
      {children}
    </MockContext.Provider>
  );
}

export function useMock() {
  const ctx = useContext(MockContext);
  if (!ctx) throw new Error('useMock must be used within MockProvider');
  return ctx;
}
