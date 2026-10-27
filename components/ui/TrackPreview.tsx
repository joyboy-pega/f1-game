'use client';

import React, { useEffect, useState } from 'react';
import { ensureTrack, trackCatalog, trackOutline, type Outline } from '@/lib/game/track';

const W = 220;
const H = 140;

/** Minimap outline of a circuit, generated at runtime from its centreline (loads the track module on demand). */
export function TrackPreview({ trackId, className }: { trackId: string; className?: string }) {
  const [outline, setOutline] = useState<Outline | null>(null);
  const name = trackCatalog().find((t) => t.id === trackId)?.name ?? trackId;

  useEffect(() => {
    let live = true;
    setOutline(null);
    ensureTrack(trackId)
      .then((rt) => {
        if (live) setOutline(trackOutline(rt, W, H, 10));
      })
      .catch((err) => {
        if (live) console.warn(`Failed to generate track outline for ${trackId}`, err);
      });
    return () => {
      live = false;
    };
  }, [trackId]);

  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${name} layout`} preserveAspectRatio="xMidYMid meet">
      {outline && (
        <>
          <path d={outline.d} fill="none" stroke="#dfe7ee" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={outline.start.x} cy={outline.start.y} r={6} fill="#c8ff2e" />
        </>
      )}
    </svg>
  );
}
