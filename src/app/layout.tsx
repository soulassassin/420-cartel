import type { Metadata, Viewport } from 'next';
import { Anton, Inter } from 'next/font/google';

import { CartelCommandNav } from '@/components/layout/CartelCommandNav';
import { JsonLd } from '@/components/seo/JsonLd';
import './globals.css';

/**
 * 420 CARTEL :: root layout
 *
 * Anton (display) and Inter (everything else) are loaded through next/font and
 * exposed as CSS variables that globals.css maps onto --font-display / --font-sans.
 */

/*
 * Self-hosted by next/font: the files ship with the build and are preloaded,
 * so there is no render-blocking stylesheet request to Google and no layout
 * shift when the faces swap in. Only the two families the design uses.
 */
const anton = Anton({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-anton' });
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

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
    icon: { url: '/icon-96.png', type: 'image/png', sizes: '96x96' },
    apple: { url: '/apple-icon-180.png', sizes: '180x180' },
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
    <html lang="en-ZA" className={`dark ${anton.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-void font-sans text-foreground antialiased overflow-x-hidden">
        <JsonLd />
        <CartelCommandNav />
        {children}
      </body>
    </html>
  );
}
