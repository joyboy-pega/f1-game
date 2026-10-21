'use client';

import dynamic from 'next/dynamic';

const Showroom = dynamic(() => import('./Showroom'), { ssr: false });

/**
 * Dev-only car showroom: /dev/car
 * Query: ?cam=front|rear|side|top|iso|close  &focus=<car index>  &spin=1 (turntable)  &anim=1 (drs/brake demo)
 */
export default function CarShowroomPage() {
  return (
    <main style={{ width: '100vw', height: '100vh', background: '#0b0d12' }}>
      <Showroom />
    </main>
  );
}
