"use client";
import React from 'react';
import Header from './Header';
import Footer from './Footer';
import { MockProvider } from './MockProvider';

export default function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <MockProvider>
      <div className="korum-app-root">
        <Header />
        <main>{children}</main>
        <Footer />
      </div>
    </MockProvider>
  );
}
