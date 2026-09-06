import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

import Script from 'next/script';
import AppKitProvider from "./components/AppKitProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Korum - Launch 2 tokens. One debate. Two sides.",
  description: "Korum brings online debates to token markets. Pick your side and trade the debate.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Minimal deterministic head to avoid server/client mismatches. Do not inject the
  // original korum.html head here — it caused hydration issues and nested <script>.
  const themeInitScript = `try{const t=localStorage.getItem('korum-theme'); if(t) document.documentElement.setAttribute('data-theme', t);}catch(e){};`;
  const requestHeaders = await headers();
  const cookieHeader = requestHeaders.get("cookie");

  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark light" />
        <link rel="icon" href="/favicon.ico" />
        {/* Run a minimal theme init before React hydrates to avoid hydration mismatch */}
        <Script id="korum-theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
      </head>

      <body className="min-h-full flex flex-col">
        <AppKitProvider cookies={cookieHeader}>{children}</AppKitProvider>
      </body>
    </html>
  );
}
