import type { Metadata, Viewport } from 'next';
import { PwaRegister } from '@/components/PwaRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'Simulart Tracks — by Arigatoo Club',
  description:
    'Simulart Tracks: A browser Formula racing game by Arigatoo Club featuring full grid AI, telemetry, custom liveries, and authentic circuits.',
  keywords: ['Simulart Tracks', 'Arigatoo Club', 'F1', 'Racing Game', 'Three.js', 'Next.js', 'React Three Fiber', 'PWA'],
  authors: [{ name: 'Arigatoo Club' }],
  applicationName: 'Simulart Tracks',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Simulart Tracks',
  },
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@600;700;800;900&family=Chakra+Petch:wght@500;700&family=JetBrains+Mono:wght@700;800&display=swap"
          rel="stylesheet"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
