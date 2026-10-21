import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Simulart Tracks — by Arigatoo Club',
  description:
    'Simulart Tracks: A browser Formula racing game by Arigatoo Club featuring full grid AI, telemetry, custom liveries, and authentic circuits.',
  keywords: ['Simulart Tracks', 'Arigatoo Club', 'F1', 'Racing Game', 'Three.js', 'Next.js', 'React Three Fiber'],
  authors: [{ name: 'Arigatoo Club' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
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
      </head>
      <body>{children}</body>
    </html>
  );
}
