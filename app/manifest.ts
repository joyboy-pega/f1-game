import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Open Race — by Arigatoo Club',
    short_name: 'Open Race',
    description: 'Open Race: Browser Formula Racing & SAE Pegasus #53 Simulation',
    start_url: '/',
    id: '/',
    scope: '/',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone', 'window-controls-overlay'],
    orientation: 'any',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    categories: ['games', 'sports', 'entertainment'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
    screenshots: [
      {
        src: '/svg/buddh_circuit_clean.svg',
        sizes: '1280x720',
        type: 'image/svg+xml',
        form_factor: 'wide',
        label: 'Buddh International Circuit Track Map',
      },
    ],
  };
}
