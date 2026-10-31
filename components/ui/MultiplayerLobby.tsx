'use client';

import React, { useState, useEffect } from 'react';
import { multiplayerRoom as room } from '@/lib/game/multiplayer/room';
import type { PlayerInfo, RoomSettings } from '@/lib/game/multiplayer/protocol';
import { trackCatalog } from '@/lib/game/track';
import { WEATHER_LABEL } from './format';
import type { Livery, TimeOfDay, VehicleModelType, WeatherType } from '@/lib/game/constants';

interface MultiplayerLobbyProps {
  onStartRace: (settings: RoomSettings, players: PlayerInfo[], isHost: boolean) => void;
  onBack: () => void;
}

interface TeamPreset {
  name: string;
  body: string;
  accent: string;
  rim: string;
  number: number;
}

const TEAM_PRESETS: TeamPreset[] = [
  { name: 'Titan Corsa', body: '#DC0000', accent: '#FFFFFF', rim: '#DC0000', number: 16 },
  { name: 'Nova Racing', body: '#00D2BE', accent: '#111111', rim: '#00D2BE', number: 44 },
  { name: 'Velocity GP', body: '#FF8700', accent: '#0072BB', rim: '#1E1E1E', number: 4 },
  { name: 'Apex Dynamics', body: '#1E41B0', accent: '#FFD700', rim: '#C0C0C0', number: 1 },
  { name: 'Phantom F1', body: '#006F62', accent: '#CEDC00', rim: '#1E1E1E', number: 14 },
  { name: 'Pegasus', body: '#F8FAFC', accent: '#DC2626', rim: '#9A6B26', number: 53 },
  { name: 'Zenith Corse', body: '#6B21A8', accent: '#F59E0B', rim: '#F59E0B', number: 10 },
  { name: 'Solaris', body: '#FACC15', accent: '#111827', rim: '#111827', number: 5 },
];

const CAR_MODELS: { id: VehicleModelType; label: string; badge: string }[] = [
  { id: 'f1', label: 'Formula 1', badge: 'OPEN-WHEEL' },
  { id: 'roadster', label: 'Roadster', badge: 'GT AERO' },
  { id: 'pegasus', label: 'Pegasus #53', badge: 'PROTOTYPE' },
];

const TIME_OPTIONS: { id: TimeOfDay; label: string }[] = [
  { id: 'day', label: '☀️ Day (Clear Sun)' },
  { id: 'sunset', label: '🌅 Sunset (Golden Hour)' },
  { id: 'night', label: '🌙 Night (Floodlights)' },
];

const getPresetLivery = (teamName: string, defaultNum = 1): Livery => {
  const p = TEAM_PRESETS.find((t) => t.name === teamName) || TEAM_PRESETS[0];
  return { body: p.body, accent: p.accent, rim: p.rim, number: p.number || defaultNum };
};

export function MultiplayerLobby({ onStartRace, onBack }: MultiplayerLobbyProps) {
  const [roomCode, setRoomCode] = useState(room.roomId);
  const [joinCode, setJoinCode] = useState('');
  const [inLobby, setInLobby] = useState(room.state !== 'idle');
  const [isHost, setIsHost] = useState(room.role === 'host');
  const [players, setPlayers] = useState<PlayerInfo[]>(room.players);
  const [settings, setSettings] = useState<RoomSettings>(room.settings);
  const [isReady, setIsReady] = useState(false);
  const [copied, setCopied] = useState(false);

  // Local racer customization
  const myPlayer = players.find((p) => p.id === room.localPeerId) || players[0];
  const [selectedCar, setSelectedCar] = useState<VehicleModelType>(myPlayer?.carModel ?? 'f1');
  const [selectedTeam, setSelectedTeam] = useState<string>(myPlayer?.team ?? 'Titan Corsa');
  const [driverName, setDriverName] = useState<string>(myPlayer?.driverName ?? (isHost ? 'Host Driver' : 'Challenger'));
  const [driverCode, setDriverCode] = useState<string>(myPlayer?.driverCode ?? (isHost ? 'HST' : 'CHL'));

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
      driverName: driverName || 'Host Driver',
      driverCode: driverCode || 'HST',
      team: selectedTeam,
      carModel: selectedCar,
      livery: getPresetLivery(selectedTeam, 1),
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
      driverName: driverName || 'Challenger',
      driverCode: driverCode || 'CHL',
      team: selectedTeam,
      carModel: selectedCar,
      livery: getPresetLivery(selectedTeam, 2),
    });
    setInLobby(true);
    setIsReady(true);
  };

  const handleCarModelChange = (model: VehicleModelType) => {
    setSelectedCar(model);
    room.updatePlayer({ carModel: model });
  };

  const handleTeamChange = (preset: TeamPreset) => {
    setSelectedTeam(preset.name);
    room.updatePlayer({
      team: preset.name,
      livery: {
        body: preset.body,
        accent: preset.accent,
        rim: preset.rim,
        number: myPlayer?.livery?.number ?? (isHost ? 1 : 2),
      },
    });
  };

  const handleDriverNameChange = (name: string) => {
    setDriverName(name);
    const code = (name.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()) || (isHost ? 'HST' : 'CHL');
    setDriverCode(code);
    room.updatePlayer({ driverName: name, driverCode: code });
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
    if (isHost && players.length >= 2) {
      room.startCountdown();
    }
  };

  const canStart = isHost && players.length >= 2;

  return (
    <div className="fixed inset-0 bg-[var(--ink)]/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div
        className="w-full max-w-3xl bg-[var(--panel)] border border-white/10 p-6 flex flex-col gap-5 text-white shadow-2xl my-auto"
        style={{
          clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <span className="text-[10px] tracking-widest text-[var(--lime)] font-mono uppercase font-bold">
              Multiplayer P2P Room · Minimum 2 Racers
            </span>
            <h2 className="text-3xl font-black tracking-tight" style={{ fontFamily: 'var(--font-anton)' }}>
              RACE LOBBY
            </h2>
          </div>
          <button
            onClick={onBack}
            className="text-xs font-mono uppercase px-3 py-1.5 border border-white/20 hover:border-white/40 transition-colors cursor-pointer"
          >
            ← Exit
          </button>
        </div>

        {!inLobby ? (
          <div className="flex flex-col gap-6 py-2">
            {/* Quick Profile Setup */}
            <div className="p-4 bg-white/5 border border-white/10 flex flex-col gap-3">
              <span className="text-xs font-mono text-[var(--lime)] uppercase tracking-wider font-bold">
                Driver Credentials
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-white/60">DRIVER NAME</label>
                  <input
                    type="text"
                    maxLength={16}
                    value={driverName}
                    onChange={(e) => handleDriverNameChange(e.target.value)}
                    placeholder="Your Name"
                    className="bg-black/50 border border-white/20 px-3 py-1.5 font-mono text-sm focus:outline-none focus:border-[var(--lime)]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-white/60">3-LETTER CODE</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={driverCode}
                    onChange={(e) => setDriverCode(e.target.value.toUpperCase())}
                    className="bg-black/50 border border-white/20 px-3 py-1.5 font-mono uppercase text-sm tracking-widest focus:outline-none focus:border-[var(--lime)]"
                  />
                </div>
              </div>
            </div>

            {/* Host or Join */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-3 p-5 bg-white/5 border border-white/10">
                <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-anton)' }}>
                  HOST A RACE (ROOM OWNER)
                </h3>
                <p className="text-xs text-white/60 leading-relaxed">
                  Open a room, pick the circuit & theme, and wait for at least 1 other player to join before launching.
                </p>
                <button
                  onClick={handleCreate}
                  className="mt-auto py-2.5 px-4 bg-[var(--lime)] text-black font-bold uppercase tracking-wider text-xs hover:brightness-110 transition-all cursor-pointer"
                >
                  Create Room as Host
                </button>
              </div>

              <div className="flex flex-col gap-3 p-5 bg-white/5 border border-white/10">
                <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-anton)' }}>
                  JOIN A RACE (RACER)
                </h3>
                <p className="text-xs text-white/60 leading-relaxed">
                  Enter the 6-character room code from the host to enter the grid and pick your car.
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
                    className="py-2.5 px-5 bg-white/15 text-white font-bold uppercase tracking-wider text-xs hover:bg-white/25 transition-all cursor-pointer"
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Room Code & Status Header */}
            <div className="flex flex-wrap items-center justify-between p-3.5 bg-white/5 border border-white/10 gap-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-white/60">ROOM CODE:</span>
                <span className="text-2xl font-mono font-bold tracking-widest text-[var(--lime)]">{roomCode}</span>
                <span className="text-xs font-mono px-2 py-0.5 bg-white/10 text-white/80 rounded">
                  {players.length} / 20 Players
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-[10px] font-mono px-2 py-1 font-bold uppercase ${
                    players.length >= 2 ? 'bg-[var(--lime)]/20 text-[var(--lime)] border border-[var(--lime)]' : 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                  }`}
                >
                  {players.length >= 2 ? '✓ Ready (2+ Players)' : '⏳ Need 2 Players Min'}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="text-xs font-mono px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/20 transition-colors cursor-pointer"
                >
                  {copied ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
            </div>

            {/* Room Theme & Circuit Settings (Host Editable, synced live to joined racers) */}
            <div className="p-4 bg-white/5 border border-white/10 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[var(--lime)] uppercase tracking-wider font-bold">
                  Track & Theme {isHost ? '(Host Configurable)' : '(Host Decided)'}
                </span>
                {!isHost && <span className="text-[10px] font-mono text-white/40 italic">Synced from host</span>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-white/60">CIRCUIT</label>
                  <select
                    disabled={!isHost}
                    value={settings.trackId}
                    onChange={(e) => room.updateSettings({ trackId: e.target.value })}
                    className="bg-black/60 border border-white/15 px-2.5 py-1.5 text-xs focus:outline-none font-mono disabled:opacity-75"
                  >
                    {trackCatalog().map((t) => (
                      <option key={t.id} value={t.id} className="bg-neutral-900">
                        {t.name} ({t.country})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-white/60">WEATHER THEME</label>
                  <select
                    disabled={!isHost}
                    value={settings.weather}
                    onChange={(e) => room.updateSettings({ weather: e.target.value as WeatherType })}
                    className="bg-black/60 border border-white/15 px-2.5 py-1.5 text-xs focus:outline-none font-mono disabled:opacity-75"
                  >
                    {(['sunny', 'cloudy', 'rain', 'snow', 'dynamic'] as WeatherType[]).map((w) => (
                      <option key={w} value={w} className="bg-neutral-900">
                        {WEATHER_LABEL[w]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-white/60">TIME OF DAY</label>
                  <select
                    disabled={!isHost}
                    value={settings.timeOfDay ?? 'day'}
                    onChange={(e) => room.updateSettings({ timeOfDay: e.target.value as TimeOfDay })}
                    className="bg-black/60 border border-white/15 px-2.5 py-1.5 text-xs focus:outline-none font-mono disabled:opacity-75"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t.id} value={t.id} className="bg-neutral-900">
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-white/60">RACE DISTANCE</label>
                  <select
                    disabled={!isHost}
                    value={settings.totalLaps}
                    onChange={(e) => room.updateSettings({ totalLaps: Number(e.target.value) })}
                    className="bg-black/60 border border-white/15 px-2.5 py-1.5 text-xs focus:outline-none font-mono disabled:opacity-75"
                  >
                    {[3, 5, 10, 20].map((l) => (
                      <option key={l} value={l} className="bg-neutral-900">
                        {l} LAPS
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Choose Your Car & Team (Every joined racer can choose their car & team) */}
            <div className="p-4 bg-white/5 border border-white/10 flex flex-col gap-3">
              <span className="text-xs font-mono text-[var(--lime)] uppercase tracking-wider font-bold">
                Choose Your Car & Team
              </span>

              {/* Car Model Selector */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono text-white/60">CAR MODEL</span>
                <div className="grid grid-cols-3 gap-2">
                  {CAR_MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleCarModelChange(m.id)}
                      className={`p-2 border text-left flex flex-col transition-all cursor-pointer ${
                        selectedCar === m.id
                          ? 'border-[var(--lime)] bg-[var(--lime)]/15 text-white'
                          : 'border-white/15 bg-black/40 text-white/70 hover:border-white/35'
                      }`}
                    >
                      <span className="text-xs font-bold font-mono">{m.label}</span>
                      <span className="text-[9px] font-mono text-white/50">{m.badge}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Team & Livery Presets */}
              <div className="flex flex-col gap-1.5 pt-1">
                <span className="text-[10px] font-mono text-white/60">TEAM LIVERY PRESET</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {TEAM_PRESETS.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => handleTeamChange(t)}
                      className={`p-2 border flex items-center gap-2 transition-all text-left cursor-pointer ${
                        selectedTeam === t.name
                          ? 'border-[var(--lime)] bg-[var(--lime)]/15 text-white font-bold'
                          : 'border-white/15 bg-black/40 text-white/70 hover:border-white/35'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: t.body, border: `2px solid ${t.accent}` }}
                      />
                      <span className="text-[11px] font-mono truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Grid Entrants List */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-white/60 tracking-wider">
                  GRID ENTRANTS ({players.length}/20)
                </span>
                <span className="text-[10px] font-mono text-white/40">
                  {players.length < 2 ? '⚠️ Need 2 players minimum to race' : '✓ Ready to start'}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                {players.map((p, idx) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2.5 bg-black/50 border border-white/10 text-xs font-mono"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-white/40">P{idx + 1}</span>
                      <span
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ backgroundColor: p.livery.body, border: `2px solid ${p.livery.accent}` }}
                      />
                      <span className="font-bold">{p.driverName}</span>
                      <span className="text-white/50 text-[10px]">[{p.driverCode}]</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-white/10 text-white/70 uppercase">
                        {p.carModel.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-white/50 hidden sm:inline">{p.team}</span>
                      {p.isHost && (
                        <span className="px-1.5 py-0.5 text-[9px] bg-[var(--orange)] text-black font-bold uppercase rounded">
                          HOST
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
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
            <div className="flex items-center justify-between pt-3 border-t border-white/10 gap-3">
              <button
                onClick={handleToggleReady}
                className={`py-2 px-5 text-xs font-mono uppercase font-bold border transition-colors cursor-pointer ${
                  isReady
                    ? 'border-[var(--lime)] bg-[var(--lime)]/20 text-[var(--lime)]'
                    : 'border-white/30 text-white hover:border-white/60'
                }`}
              >
                {isReady ? 'READY ✓' : 'READY UP'}
              </button>

              {isHost ? (
                canStart ? (
                  <button
                    onClick={handleStart}
                    className="py-2.5 px-6 bg-[var(--lime)] text-black font-bold uppercase tracking-wider text-xs hover:brightness-110 transition-all shadow-lg active:scale-95 cursor-pointer"
                  >
                    START RACE ({players.length} RACERS) →
                  </button>
                ) : (
                  <div className="flex flex-col items-end gap-0.5">
                    <button
                      disabled
                      className="py-2.5 px-6 bg-white/10 text-white/40 font-bold uppercase tracking-wider text-xs border border-white/10 cursor-not-allowed"
                    >
                      WAITING FOR OPPONENT (MIN 2 PLAYERS)
                    </button>
                    <span className="text-[10px] font-mono text-amber-400">
                      Share room code {roomCode} to connect a 2nd player
                    </span>
                  </div>
                )
              ) : (
                <div className="flex items-center gap-2 text-xs font-mono text-white/60 italic">
                  <span className="w-2 h-2 rounded-full bg-[var(--lime)] animate-ping" />
                  Waiting for host to start race…
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
