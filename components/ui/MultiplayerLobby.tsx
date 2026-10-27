'use client';

import React, { useState, useEffect } from 'react';
import { multiplayerRoom as room } from '@/lib/game/multiplayer/room';
import type { PlayerInfo, RoomSettings } from '@/lib/game/multiplayer/protocol';
import { trackCatalog } from '@/lib/game/track';
import { WEATHER_LABEL } from './format';
import type { WeatherType } from '@/lib/game/constants';

interface MultiplayerLobbyProps {
  onStartRace: (settings: RoomSettings, players: PlayerInfo[], isHost: boolean) => void;
  onBack: () => void;
}

export function MultiplayerLobby({ onStartRace, onBack }: MultiplayerLobbyProps) {
  const [roomCode, setRoomCode] = useState(room.roomId);
  const [joinCode, setJoinCode] = useState('');
  const [inLobby, setInLobby] = useState(room.state !== 'idle');
  const [isHost, setIsHost] = useState(room.role === 'host');
  const [players, setPlayers] = useState<PlayerInfo[]>(room.players);
  const [settings, setSettings] = useState<RoomSettings>(room.settings);
  const [isReady, setIsReady] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = room.subscribe({
      onStateChange: (state) => {
        if (state === 'countdown' || state === 'racing') {
          onStartRace(room.settings, room.players, room.role === 'host');
        }
      },
      onPlayersChange: (newPlayers) => setPlayers(newPlayers),
      onSettingsChange: (newSettings) => setSettings(newSettings),
    });
    return () => {
      unsub();
      if (room.state === 'idle' || room.state === 'lobby') {
        room.close();
      }
    };
  }, [onStartRace]);

  const handleCreate = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomCode(code);
    setIsHost(true);
    room.createRoom(code, {
      driverName: 'You (Host)',
      driverCode: 'YOU',
      team: 'Scuderia',
    });
    setInLobby(true);
    setIsReady(true);
  };

  const handleJoin = () => {
    if (!joinCode.trim()) return;
    const code = joinCode.trim().toUpperCase();
    setRoomCode(code);
    setIsHost(false);
    room.joinRoom(code, {
      driverName: 'Challenger',
      driverCode: 'CHL',
      team: 'Papaya',
    });
    setInLobby(true);
  };

  const handleToggleReady = () => {
    const next = !isReady;
    setIsReady(next);
    room.setReady(next);
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStart = () => {
    if (isHost) {
      room.startCountdown();
    }
  };

  return (
    <div className="fixed inset-0 bg-[var(--ink)]/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div
        className="w-full max-w-2xl bg-[var(--panel)] border border-white/10 p-6 flex flex-col gap-6 text-white shadow-2xl"
        style={{
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)',
        }}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <span className="text-[10px] tracking-widest text-[var(--lime)] font-mono uppercase">
              WebRTC P2P Multiplayer
            </span>
            <h2 className="text-3xl font-black tracking-tight" style={{ fontFamily: 'var(--font-anton)' }}>
              RACE LOBBY
            </h2>
          </div>
          <button
            onClick={onBack}
            className="text-xs font-mono uppercase px-3 py-1.5 border border-white/20 hover:border-white/40 transition-colors"
          >
            ← Exit
          </button>
        </div>

        {!inLobby ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            {/* Create Room Box */}
            <div className="flex flex-col gap-3 p-5 bg-white/5 border border-white/10">
              <h3 className="text-lg font-bold">Host a Race</h3>
              <p className="text-xs text-white/60 leading-relaxed">
                Run an authoritative 120 Hz deterministic race room. Invite up to 19 racers or fill with AI.
              </p>
              <button
                onClick={handleCreate}
                className="mt-auto py-2.5 px-4 bg-[var(--lime)] text-black font-bold uppercase tracking-wider text-xs hover:brightness-110 transition-all"
              >
                Create Room
              </button>
            </div>

            {/* Join Room Box */}
            <div className="flex flex-col gap-3 p-5 bg-white/5 border border-white/10">
              <h3 className="text-lg font-bold">Join Room</h3>
              <p className="text-xs text-white/60 leading-relaxed">
                Enter a 6-character room code to join an active P2P lobby.
              </p>
              <div className="flex gap-2 mt-auto">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="CODE"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="flex-1 bg-black/50 border border-white/20 px-3 py-2 font-mono uppercase tracking-widest text-sm focus:outline-none focus:border-[var(--lime)]"
                />
                <button
                  onClick={handleJoin}
                  className="py-2.5 px-5 bg-white/10 text-white font-bold uppercase tracking-wider text-xs hover:bg-white/20 transition-all"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Room Code Header */}
            <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-white/60">ROOM CODE:</span>
                <span className="text-xl font-mono font-bold tracking-widest text-[var(--lime)]">{roomCode}</span>
              </div>
              <button
                onClick={handleCopyCode}
                className="text-xs font-mono px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/20 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
            </div>

            {/* Room Settings (Host editable) */}
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-white/60">CIRCUIT</label>
                <select
                  disabled={!isHost}
                  value={settings.trackId}
                  onChange={(e) => room.updateSettings({ trackId: e.target.value })}
                  className="bg-black/40 border border-white/15 px-2.5 py-1.5 text-xs focus:outline-none font-mono"
                >
                  {trackCatalog().map((t) => (
                    <option key={t.id} value={t.id} className="bg-neutral-900">
                      {t.name} ({t.country})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-white/60">WEATHER</label>
                <select
                  disabled={!isHost}
                  value={settings.weather}
                  onChange={(e) => room.updateSettings({ weather: e.target.value as WeatherType })}
                  className="bg-black/40 border border-white/15 px-2.5 py-1.5 text-xs focus:outline-none font-mono"
                >
                  {(['sunny', 'cloudy', 'rain', 'snow', 'dynamic'] as WeatherType[]).map((w) => (
                    <option key={w} value={w} className="bg-neutral-900">
                      {WEATHER_LABEL[w]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-white/60">DISTANCE</label>
                <select
                  disabled={!isHost}
                  value={settings.totalLaps}
                  onChange={(e) => room.updateSettings({ totalLaps: Number(e.target.value) })}
                  className="bg-black/40 border border-white/15 px-2.5 py-1.5 text-xs focus:outline-none font-mono"
                >
                  {[3, 5, 10, 20].map((l) => (
                    <option key={l} value={l} className="bg-neutral-900">
                      {l} LAPS
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Players List */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-mono text-white/60 tracking-wider">
                GRID ENTRANTS ({players.length}/20)
              </span>
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {players.map((p, idx) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2.5 bg-black/40 border border-white/10 text-xs font-mono"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-white/40">P{idx + 1}</span>
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: p.livery.body, border: `2px solid ${p.livery.accent}` }}
                      />
                      <span className="font-bold">{p.driverName}</span>
                      <span className="text-white/50 text-[10px]">[{p.driverCode}]</span>
                      {p.isHost && (
                        <span className="px-1.5 py-0.5 text-[9px] bg-[var(--orange)] text-black font-bold uppercase rounded">
                          HOST
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      {p.latencyMs > 0 && <span className="text-white/40 text-[10px]">{p.latencyMs}ms</span>}
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 border ${
                          p.ready
                            ? 'border-[var(--lime)] text-[var(--lime)] bg-[var(--lime)]/10'
                            : 'border-white/20 text-white/40'
                        }`}
                      >
                        {p.ready ? 'READY' : 'WAITING'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <button
                onClick={handleToggleReady}
                className={`py-2 px-5 text-xs font-mono uppercase font-bold border transition-colors ${
                  isReady
                    ? 'border-[var(--lime)] bg-[var(--lime)]/20 text-[var(--lime)]'
                    : 'border-white/30 text-white hover:border-white/60'
                }`}
              >
                {isReady ? 'READY ✓' : 'READY UP'}
              </button>

              {isHost ? (
                <button
                  onClick={handleStart}
                  className="py-2.5 px-6 bg-[var(--lime)] text-black font-bold uppercase tracking-wider text-xs hover:brightness-110 transition-all shadow-lg"
                >
                  START RACE
                </button>
              ) : (
                <span className="text-xs font-mono text-white/50 italic">Waiting for host to start race…</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
