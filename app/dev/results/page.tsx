'use client';

import React from 'react';
import { GameOver } from '@/components/ui/GameOver';
import { DRIVER_ROSTER } from '@/lib/game/constants';
import type { RaceResults } from '@/lib/game/gameState';

const rows = [...DRIVER_ROSTER.slice(0, 9)].map((d, i) => ({
  position: i + 1,
  carId: i,
  code: d.code,
  name: d.name,
  team: d.team,
  color: d.livery.body,
  isPlayer: false,
  totalTime: 330 + i * 1.4,
  gapText: i === 0 ? '5:30.412' : `+${(i * 1.4 + 0.3).toFixed(3)}`,
  bestLap: 65.1 + i * 0.35,
  laps: 5,
  pitStops: i % 4 === 0 ? 1 : 0,
  penaltySec: i === 5 ? 5 : 0,
}));
rows.splice(2, 0, { position: 3, carId: 99, code: 'YOU', name: 'You', team: 'Player', color: '#e10600', isPlayer: true, totalTime: 332.1, gapText: '+2.204', bestLap: 65.42, laps: 5, pitStops: 0, penaltySec: 0 });
rows.forEach((r, i) => (r.position = i + 1));

const mock: RaceResults = {
  mode: 'race',
  classification: rows,
  playerPosition: 3,
  playerLapTimes: [68.9, 66.1, 65.4, 66.0, 65.8],
  fastestLap: { carId: 0, code: rows[0].code, time: 65.1 },
  topSpeed: 318,
  overtakes: 6,
  drsUses: 9,
  ersUses: 14,
  totalTime: 332.1,
};

export default function Page() {
  return <GameOver results={mock} onRestart={() => {}} onExitToMenu={() => {}} />;
}
