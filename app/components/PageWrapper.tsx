"use client";
import React from 'react';
import Header from './Header';
import Footer from './Footer';

export default function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="korum-app-root">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
