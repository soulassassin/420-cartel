import type { Metadata, Viewport } from 'next';

import { CartelCommandNav } from '@/components/layout/CartelCommandNav';
import { JsonLd } from '@/components/seo/JsonLd';
import './globals.css';

/**
 * 420 CARTEL :: root layout
 *
 * The three font families back the Tailwind `--font-display` / `--font-sans` /
 * `--font-mono` custom properties declared in tailwind.config.ts. Monospace is
 * loaded with tabular figures because every gram, millilitre and THC percentage
 * in the product surfaces renders in it.
 */

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: '420 Cartel — Private Cannabis Social Lounge & Botanical Collective',
    template: '%s · 420 Cartel',
  },
  description:
    'Premier private cannabis collective and social lounge network in South Africa and Johannesburg. Small-batch indoor craft flower, solventless live rosin, and precision sublingual elixirs allocated strictly to verified 18+ members.',
  applicationName: '420 Cartel',
  keywords: [
    '420 Cartel',
    'cannabis social lounge South Africa',
    'private cannabis collective Johannesburg',
    'solventless live rosin SA',
    'strictly 18+ cannabis collective',
    'craft cannabis flower',
    'Norwood 420 lounge',
    'Rivonia Sandton vault',
    'Kibler Park bud bar',
  ],
  icons: {
    icon: '/fourtwentycartel_logo.jpg',
    apple: '/fourtwentycartel_logo.jpg',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    siteName: '420 Cartel',
    title: '420 Cartel — Private Cannabis Social Lounge & Botanical Collective',
    description:
      'Small-batch craft flower, solventless extracts and precision elixirs. Verified 18+ private membership social lounge across South Africa.',
    url: siteUrl,
    locale: 'en_ZA',
    images: [
      {
        url: '/fourtwentycartel_logo.jpg',
        width: 1080,
        height: 1080,
        alt: '420 Cartel',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '420 Cartel — Private Cannabis Social Lounge & Botanical Collective',
    description:
      'Small-batch craft flower, solventless extracts and precision elixirs. Verified 18+ members only in South Africa.',
    images: ['/fourtwentycartel_logo.jpg'],
  },
  other: {
    rating: 'adult',
    'geo.region': 'ZA-GT',
    'geo.placename': 'Johannesburg',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
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
    <html lang="en-ZA" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          Archivo is requested as a VARIABLE font across both its axes.

          The previous request (`Archivo:wght@700;800;900`) pulled three fixed
          instances at normal width, which have no `wdth` axis at all — so the
          condensed display setting the type system is built on silently did
          nothing. Axes must be listed alphabetically, hence `wdth,wght`.
        */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anton&family=Montserrat:wght@400;500;600;700;800;900&family=Inter:wght@400;500&display=swap"
        />
      </head>
      <body className="min-h-screen bg-void font-sans text-foreground antialiased overflow-x-hidden">
        <JsonLd />
        <CartelCommandNav />
        {children}
      </body>
    </html>
  );
}
