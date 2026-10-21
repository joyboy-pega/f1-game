'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { ToastMessage } from '@/lib/game/gameState';
import { useGameStore } from '@/lib/game/store';

const EXIT_MS = 260;
const MAX_VISIBLE = 2;

interface Shown extends ToastMessage {
  leaving: boolean;
}

/** Broadcast-style banners: slide in from above, at most two on screen, slide out when the store drops them. */
export function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  const [shown, setShown] = useState<Shown[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const live = new Set(toasts.map((t) => t.id));
    setShown((prev) => {
      const next: Shown[] = [];
      const known = new Set<string>();
      for (const p of prev) {
        known.add(p.id);
        const stillLive = live.has(p.id);
        const fresh = toasts.find((t) => t.id === p.id);
        next.push(stillLive && fresh ? { ...fresh, leaving: false } : { ...p, leaving: true });
      }
      for (const t of toasts) if (!known.has(t.id)) next.push({ ...t, leaving: false });
      return next;
    });
  }, [toasts]);

  // Remove banners after their exit animation.
  useEffect(() => {
    for (const s of shown) {
      if (s.leaving && !timers.current.has(s.id)) {
        const id = window.setTimeout(() => {
          timers.current.delete(s.id);
          setShown((prev) => prev.filter((p) => p.id !== s.id || !p.leaving));
        }, EXIT_MS);
        timers.current.set(s.id, id);
      } else if (!s.leaving && timers.current.has(s.id)) {
        window.clearTimeout(timers.current.get(s.id));
        timers.current.delete(s.id);
      }
    }
  }, [shown]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);

  const active = shown.filter((s) => !s.leaving).slice(-MAX_VISIBLE);
  const leaving = shown.filter((s) => s.leaving);
  const visible = [...leaving, ...active].slice(-(MAX_VISIBLE + 1));

  return (
    <div className="h-toasts" role="status" aria-live="polite">
      {visible.map((t) => (
        <div key={t.id} className={`h-toast ${t.type}${t.leaving ? ' out' : ''}`}>
          <span className="h-toast-bar" />
          <div className="h-toast-body">
            <div className="h-toast-title">{t.title}</div>
            {t.subtitle && <div className="h-toast-sub">{t.subtitle}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
