import type { Metadata, Viewport } from 'next';
import { Archivo, Inter, JetBrains_Mono } from 'next/font/google';

import { CartelCommandNav } from '@/components/layout/CartelCommandNav';
import './globals.css';

/**
 * 420 CARTEL :: root layout
 *
 * The three font families back the Tailwind `--font-display` / `--font-sans` /
 * `--font-mono` custom properties declared in tailwind.config.ts. Monospace is
 * loaded with tabular figures because every gram, millilitre and THC percentage
 * in the product surfaces renders in it.
 */

const display = Archivo({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: '420 Cartel — Private Botanical Collective',
    template: '%s · 420 Cartel',
  },
  description:
    "South Africa's premier private cannabis collective. Small-batch indoor flower, " +
    'solventless extracts and precision sublingual elixirs, allocated to verified 18+ members.',
  applicationName: '420 Cartel',
  keywords: [
    'private cannabis collective',
    'South Africa grow club',
    '18+ members only',
    'craft flower',
    'solventless extract',
  ],
  robots: {
    // A private members' club: let the brand page be found, keep the
    // member, POS and admin surfaces out of every index.
    index: true,
    follow: true,
    nocache: true,
  },
  openGraph: {
    type: 'website',
    siteName: '420 Cartel',
    title: '420 Cartel — Private Botanical Collective',
    description:
      'Obsidian craft. Pure gold. Verified 18+ private membership, Johannesburg, ZA.',
    url: siteUrl,
    locale: 'en_ZA',
  },
  other: {
    rating: 'adult',
  },
};

export const viewport: Viewport = {
  themeColor: '#050505',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // The 3D vault relies on pinch-free vertical scroll on tablets at the POS.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-ZA"
      className={`${display.variable} ${sans.variable} ${mono.variable} dark`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-void font-sans text-foreground antialiased">
        {children}
        {/* Mounted on every route so any surface is one tap from any other. */}
        <CartelCommandNav />
        {/* Film grain sits above everything but the print layer. */}
        <div className="grain-overlay" aria-hidden="true" />
      </body>
    </html>
  );
}
