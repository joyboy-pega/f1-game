'use client';

import dynamic from 'next/dynamic';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

const RacingGame = dynamic(
  () => import('@/components/game/RacingGame').then((mod) => mod.RacingGame),
  {
    ssr: false,
    loading: () => <LoadingScreen />,
  }
);

export default function GamePage() {
  return (
    <main className="w-screen h-screen overflow-hidden bg-slate-950">
      <RacingGame />
    </main>
  );
}
