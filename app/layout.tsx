import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Buddh GP — F1 Racing at Buddh International Circuit',
  description:
    'A browser Formula 1 racing game at Buddh International Circuit: full grid, DRS and ERS, tyre strategy, pit stops, weather and a live 3D garage.',
  keywords: ['F1', 'Buddh International Circuit', 'Racing Game', 'Three.js', 'Next.js', 'React Three Fiber'],
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
          href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@600;700;800;900&family=JetBrains+Mono:wght@700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
