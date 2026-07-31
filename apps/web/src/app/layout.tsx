import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://phoenix-zero.onrender.com'),
  title: 'Phoenix ZerØ — Verifiable Execution & Media Provenance for AI Agents',
  description:
    'Sovereign execution layer for autonomous agents: pay-per-execution with a public, verifiable proof per transaction, post-quantum anchored, plus deepfake-resistant media provenance. Built for banks, exchanges, gaming and AI marketplaces.',
  applicationName: 'Phoenix ZerØ',
  authors: [{ name: 'Phoenix ZerØ', url: 'https://phoenix-zero.onrender.com' }],
  creator: 'Phoenix ZerØ',
  publisher: 'Phoenix ZerØ',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: 'Phoenix ZerØ',
    title: 'Phoenix ZerØ — Verifiable Execution & Media Provenance for AI Agents',
    description:
      'Pay-per-execution with a public, verifiable proof per transaction, post-quantum anchored, plus deepfake-resistant media provenance.',
    url: 'https://phoenix-zero.onrender.com',
    locale: 'en_US'
  },
  twitter: {
    card: 'summary',
    title: 'Phoenix ZerØ — Verifiable Execution & Media Provenance for AI Agents',
    description:
      'Pay-per-execution with a public, verifiable proof per transaction, post-quantum anchored, plus deepfake-resistant media provenance.'
  },
  alternates: {
    canonical: 'https://phoenix-zero.onrender.com'
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
