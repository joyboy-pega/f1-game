'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export function MainMenu() {
  // Currencies state
  const [cash, setCash] = useState(18190);
  const [coins, setCoins] = useState(5);
  const [parts, setParts] = useState(803);
  const [rep, setRep] = useState(35);
  const [energy, setEnergy] = useState(3);

  // Claim status
  const [crateClaimed, setCrateClaimed] = useState(false);
  const [repCollected, setRepCollected] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);

  // Active modal state
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Showroom car selection
  const [currentCar, setCurrentCar] = useState<'street' | 'f1'>('street');
  const [autoSpin, setAutoSpin] = useState(true);

  // Showroom 3D canvas ref
  const showroomCanvasRef = useRef<HTMLCanvasElement>(null);
  const yawRef = useRef(0.65);
  const pitchRef = useRef(0.32);
  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);

  // Track animation refs
  const trackPathRef = useRef<SVGPathElement>(null);
  const carBeaconRef = useRef<SVGGElement>(null);
  const [hudSpeed, setHudSpeed] = useState(210);
  const [hudGear, setHudGear] = useState<number | string>(5);
  const [hudDrs, setHudDrs] = useState('DRS OFF');

  // Load saved state from localStorage
  useEffect(() => {
    try {
      const savedCash = localStorage.getItem('formula_v_cash');
      const savedCoins = localStorage.getItem('formula_v_coins');
      const savedParts = localStorage.getItem('formula_v_parts');
      const savedRep = localStorage.getItem('formula_v_rep');
      const savedCar = localStorage.getItem('formula_v_car') as 'street' | 'f1' | null;

      if (savedCash) setCash(parseInt(savedCash, 10));
      if (savedCoins) setCoins(parseInt(savedCoins, 10));
      if (savedParts) setParts(parseInt(savedParts, 10));
      if (savedRep) setRep(parseInt(savedRep, 10));
      if (savedCar) setCurrentCar(savedCar);
    } catch {}
  }, []);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2400);
  };

  const handleClaimCrate = () => {
    if (crateClaimed) return;
    setCrateClaimed(true);
    const newCash = cash + 500;
    setCash(newCash);
    localStorage.setItem('formula_v_cash', newCash.toString());
    triggerToast('CLAIMED +500 CASH FROM PIT SPONSOR!');
  };

  const handleCollectRep = () => {
    if (repCollected) return;
    setRepCollected(true);
    const newRep = rep + 10;
    setRep(newRep);
    localStorage.setItem('formula_v_rep', newRep.toString());
    triggerToast('COLLECTED +10 SUPER LICENSE PTS!');
  };

  // 1. Live Track Telemetry Animation on SVG
  useEffect(() => {
    const pathEl = trackPathRef.current;
    const carEl = carBeaconRef.current;
    if (!pathEl || !carEl) return;

    let animId: number;
    let trackProgress = 0.0;
    let totalLen = 0;

    try {
      totalLen = pathEl.getTotalLength();
    } catch {
      return;
    }

    const animate = () => {
      trackProgress = (trackProgress + 0.0018) % 1.0;
      const currentLen = trackProgress * totalLen;
      const pt = pathEl.getPointAtLength(currentLen);
      const nextLen = (currentLen + 3) % totalLen;
      const nextPt = pathEl.getPointAtLength(nextLen);
      const angleDeg = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x) * (180 / Math.PI);

      carEl.setAttribute('transform', `translate(${pt.x}, ${pt.y}) rotate(${angleDeg})`);

      let speed = 210;
      let gear = 5;
      let drs = 'DRS OFF';

      if (trackProgress > 0.22 && trackProgress < 0.45) {
        const straightPct = (trackProgress - 0.22) / 0.23;
        speed = Math.floor(240 + straightPct * 98);
        gear = speed > 300 ? 8 : 7;
        drs = 'DRS ACTIVE';
      } else if (trackProgress >= 0.45 && trackProgress < 0.5) {
        speed = Math.floor(338 - ((trackProgress - 0.45) / 0.05) * 248);
        gear = 2;
        drs = 'BRAKE 100%';
      } else if (trackProgress >= 0.68 && trackProgress < 0.78) {
        speed = 195;
        gear = 4;
        drs = 'HIGH DOWNFORCE';
      } else if (trackProgress > 0.92 || trackProgress < 0.12) {
        speed = 285;
        gear = 7;
        drs = 'DRS ACTIVE';
      } else {
        speed = Math.floor(140 + Math.sin(trackProgress * 30) * 45);
        gear = speed > 180 ? 4 : 3;
        drs = 'DRS OFF';
      }

      setHudSpeed(speed);
      setHudGear(gear);
      setHudDrs(drs);

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  // 2. 3D Showroom Turntable Canvas Animation
  useEffect(() => {
    const cv = showroomCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      if (autoSpin) {
        yawRef.current += 0.012;
      }

      const W = cv.width;
      const H = cv.height;
      ctx.clearRect(0, 0, W, H);

      // Floor Grid
      const cx = W / 2;
      const cy = H / 2 + 30;
      ctx.save();
      ctx.translate(cx, cy);

      const cosY = Math.cos(yawRef.current);
      const sinY = Math.sin(yawRef.current);
      const cosP = Math.cos(pitchRef.current);
      const sinP = Math.sin(pitchRef.current);

      // Radial Ground Disc
      ctx.beginPath();
      ctx.ellipse(0, 50, 110, 45, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10, 14, 20, 0.75)';
      ctx.fill();
      ctx.strokeStyle = '#C8FF2E';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Simple wireframe vehicle representation on turntable
      const carCol = currentCar === 'f1' ? '#C8FF2E' : '#FF6B1A';
      ctx.fillStyle = carCol;
      ctx.strokeStyle = '#0A0A0A';
      ctx.lineWidth = 2;

      // Projected box body
      const len = 90;
      const wid = 36;
      const hgt = 22;

      const pts = [
        [-len / 2, -wid / 2, 0],
        [len / 2, -wid / 2, 0],
        [len / 2, wid / 2, 0],
        [-len / 2, wid / 2, 0],
        [-len / 2, -wid / 2, hgt],
        [len / 2, -wid / 2, hgt],
        [len / 2, wid / 2, hgt],
        [-len / 2, wid / 2, hgt],
      ].map(([x, y, z]) => {
        // Yaw
        const x1 = x * cosY - y * sinY;
        const y1 = x * sinY + y * cosY;
        // Pitch
        const y2 = y1 * cosP - z * sinP;
        const z2 = y1 * sinP + z * cosP;
        return [x1, y2 - 20];
      });

      // Draw bottom face
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.lineTo(pts[2][0], pts[2][1]);
      ctx.lineTo(pts[3][0], pts[3][1]);
      ctx.closePath();
      ctx.fillStyle = 'rgba(20, 25, 35, 0.9)';
      ctx.fill();
      ctx.stroke();

      // Top face
      ctx.beginPath();
      ctx.moveTo(pts[4][0], pts[4][1]);
      ctx.lineTo(pts[5][0], pts[5][1]);
      ctx.lineTo(pts[6][0], pts[6][1]);
      ctx.lineTo(pts[7][0], pts[7][1]);
      ctx.closePath();
      ctx.fillStyle = carCol;
      ctx.fill();
      ctx.stroke();

      // Side pillars
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[i + 4][0], pts[i + 4][1]);
        ctx.stroke();
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [autoSpin, currentCar]);

  // Pointer drag for 3D showroom turntable
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastXRef.current = e.clientX;
    lastYRef.current = e.clientY;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastXRef.current;
    const dy = e.clientY - lastYRef.current;
    lastXRef.current = e.clientX;
    lastYRef.current = e.clientY;
    yawRef.current += dx * 0.015;
    pitchRef.current = Math.max(0.1, Math.min(0.8, pitchRef.current + dy * 0.01));
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  const TRACK_D =
    'M263.373,432.217l-96.534-264.13c0,0-3.417-11.104,5.765-14.521s21.996-0.428,35.662-8.969 c13.669-8.542,22.763-17.174,31.185-41.849c6.197-18.151,7.266-35.234,7.479-39.718s1.281-19.646,1.281-19.646 s0.004-7.479,7.906-8.76c7.9-1.281,9.182,6.406,10.463,11.531s55.951,203.083,63.426,230.63 c7.473,27.546,77.729,271.621,77.729,271.621s3.623,9.178-5.98,14.521c-7.971,4.436-14.312-0.218-19.432-2.989 c-9.154-4.957-178.966-99.081-178.966-99.081s-14.521-8.756-25.838,1.922s-22.635,21.566-22.635,21.566s-2.78,3.84-2.989,6.192 c-0.286,3.216-0.641,5.766,0.213,8.328s3.416,5.765,4.911,6.833s3.844,3.204,3.844,6.834s-5.417,67.702-5.417,67.702 s0,3.56-3.559,7.38c-3.055,3.279-5.209,4.254-7.466,5.556c-2.068,1.192-9.029,4.428-9.029,4.428s-8.855,3.3-9.336,10.597 c-0.425,6.448-4.483,110.826-4.483,110.826s-0.681,7.065-7.625,14.013c-5.027,5.029-11.199,9.723-20.99,10.758 c-8.561,0.905-17.246-1.054-26.906-7.046c-10.187-6.318-16.329-16.171-20.173-23.858s-6.859-15.976-7.587-24.401 c-0.538-6.229,1.943-11.977,4.698-15.161c1.986-2.296,17.976-15.13,22.421-19.219c4.431-4.075,10.586-9.706,15.457-16.143 c2.431-3.212,6.164-9.896,6.164-9.896l31.976-57.24c0,0,3.012-7.437,1.536-15.25c-1.604-8.487-7.207-13.804-7.207-13.804 l-17.191-19.531c0,0-3.299-3.473-2.764-8.857c0.677-6.813,8.969-100.577,8.969-100.577s0.735-10.732,10.725-17.229 c10.679-6.945,19.598-1.348,19.598-1.348l120.239,67.691c0,0,6.834,3.201,12.812-2.776c4.863-4.862,3.846-10.251,1.283-17.298 C264.812,435.81,263.373,432.217,263.373,432.217z';

  return (
    <main className="app-lobby-container" id="canvas-lobby" role="main" aria-label="Buddh Formula V Racing Game Lobby">
      {/* Ambient Glowing Backdrop */}
      <div className="ambient-glow" />

      {/* BACKGROUND GRAPHIC LAYERS */}
      <div className="bg-layer-diagonal" />
      <div className="bg-layer-checker" />
      <div className="bg-layer-ghost-text" id="ghost-title">BUDDH GP</div>
      <div className="bg-layer-radial" />

      {/* Ink Brush Stroke SVG */}
      <svg className="bg-layer-brush" aria-hidden="true" viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path d="M-20 40 C180 18 360 52 600 32 C840 18 1020 44 1220 26 L1220 64 C1020 80 840 58 600 72 C360 90 180 62 -20 80 Z" fill="#0A0A0A" opacity="0.94" />
      </svg>

      {/* ═══════════ TOP BAR ═══════════ */}
      <div className="top-bar-outer">
        <header className="top-bar">
          {/* Driver Profile */}
          <div className="profile-chip" id="btn-profile" title="Driver Profile · Arigatoo Club">
            <div className="profile-avatar">
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 14a8 8 0 0 1 16 0v4H4z" />
                <path d="M4 14h16" />
                <path d="M12 6v8" />
              </svg>
            </div>
            <div className="profile-text">
              <div className="profile-name" id="display-player-name">FORMULA V RACER</div>
              <div className="profile-sub" id="display-player-sub">ARIGATOO CLUB · FOR FUN</div>
            </div>
          </div>

          {/* Currencies */}
          <section className="currency-row" aria-label="Player Currencies">
            <div className="curr-pill cash" id="btn-curr-cash" title="Formula V Credits" onClick={() => setActiveModal('shop')}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="#C8FF2E">
                <rect x="3" y="6" width="18" height="12" rx="1" />
                <circle cx="12" cy="12" r="3" fill="#0A0A0A" />
              </svg>
              <div className="curr-val" id="val-cash">{cash.toLocaleString()}</div>
            </div>

            <div className="curr-pill coins" id="btn-curr-coins" title="Pit Tokens">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF6B1A" strokeWidth="3">
                <circle cx="9" cy="12" r="6" />
                <circle cx="15" cy="12" r="6" />
              </svg>
              <div className="curr-val" id="val-coins">{coins}</div>
            </div>

            <div className="curr-pill parts" id="btn-curr-parts" title="Formula V Aero Parts">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round">
                <circle cx="12" cy="3.5" r="3.5" />
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
              </svg>
              <div className="curr-val" id="val-parts">{parts}</div>
            </div>
          </section>

          {/* Right: Fuel & Settings */}
          <div className="top-bar-right">
            <div className="energy-chip" id="btn-energy" title="Push Laps / ERS: 3/7">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8h10v12H6z" />
                <path d="M16 11l3-2v6" />
                <path d="M8 8V5h5" />
              </svg>
              <div className="energy-val" id="display-energy">{energy}<span className="energy-sub">/7</span></div>
            </div>

            <button
              type="button"
              className="menu-btn"
              id="btn-open-menu"
              aria-label="Open Settings Menu"
              onClick={() => setActiveModal('menu')}
            >
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="3.2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </header>
      </div>

      {/* ═══════════ MAIN RESPONSIVE STAGE ═══════════ */}
      <div className="main-stage-wrap">
        <div className="responsive-main-grid">

          {/* ─── LEFT COLUMN: BUDDH CIRCUIT TRACK & LIVE TELEMETRY ─── */}
          <div className="desktop-left-hero">
            <section className="hero-area" aria-label="Buddh International Circuit Track">
              {/* Offer Stickers */}
              <div className="offer-sticker" id="sticker-offer">
                <div className="offer-sticker-sub">338 KM/H</div>
                <div className="offer-tag">1.06KM DRS</div>
              </div>

              <div className="starburst-badge" id="sticker-boost">
                <svg aria-hidden="true" width="72" height="72" viewBox="0 0 66 66">
                  <path d="M33 2l8 12 14-4-4 14 12 9-12 8 3 14-14-3-7 12-7-12-14 3 3-14L2 33l12-9-4-14 14 4z" fill="#C8FF2E" stroke="#0A0A0A" strokeWidth="3" strokeLinejoin="round" />
                </svg>
                <div className="starburst-text">POLE<br />1:27.2</div>
              </div>

              <div className="arigatoo-sticker" id="sticker-arigatoo" title="Made by Arigatoo Club for fun">
                ARIGATOO CLUB
              </div>

              {/* Dual Viewports Splitter */}
              <div className="hero-split-container">
                {/* 1. Track Stage */}
                <div className="track-hero-stage">
                  <svg id="hero-circuit-svg" className="track-svg-canvas" viewBox="0 0 760 440" preserveAspectRatio="xMidYMid meet">
                    <defs>
                      <filter id="track-lime-glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#C8FF2E" floodOpacity="0.85" />
                      </filter>
                      <pattern id="track-sf-checkers" width="8" height="8" patternUnits="userSpaceOnUse">
                        <rect width="4" height="4" fill="#FFFFFF" />
                        <rect x="4" y="4" width="4" height="4" fill="#FFFFFF" />
                        <rect x="4" width="4" height="4" fill="#0A0A0A" />
                        <rect y="4" width="4" height="4" fill="#0A0A0A" />
                      </pattern>
                    </defs>

                    <g transform="translate(190, -10) scale(0.68)">
                      <path d={TRACK_D} fill="none" stroke="rgba(200,255,46,0.25)" strokeWidth="36" filter="url(#track-lime-glow)" />
                      <path d={TRACK_D} fill="none" stroke="#0A0A0A" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
                      <path d={TRACK_D} fill="none" stroke="#1E1E1E" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
                      <path ref={trackPathRef} d={TRACK_D} fill="none" stroke="#C8FF2E" strokeWidth="2.5" strokeDasharray="10 8" />

                      {/* Turn Apex Markers */}
                      <g className="track-apex-tags" fontFamily="'Anton', sans-serif" fontSize="11" textAnchor="middle">
                        <g transform="translate(144.5, 143.9)"><circle r="8" fill="#0A0A0A" stroke="#C8FF2E" strokeWidth="2" /><text y="4" fill="#C8FF2E">1</text></g>
                        <g transform="translate(278.3, 14.7)"><circle r="8" fill="#FF6B1A" stroke="#0A0A0A" strokeWidth="2" /><text y="4" fill="#0A0A0A">3</text></g>
                        <g transform="translate(417.7, 582.3)"><circle r="8" fill="#0A0A0A" stroke="#FF6B1A" strokeWidth="2" /><text y="4" fill="#FF6B1A">4</text></g>
                        <g transform="translate(130.7, 751.5)"><circle r="8" fill="#C8FF2E" stroke="#0A0A0A" strokeWidth="2" /><text y="4" fill="#0A0A0A">10</text></g>
                        <g transform="translate(284.7, 473.3)"><circle r="8" fill="#0A0A0A" stroke="#FFFFFF" strokeWidth="2" /><text y="4" fill="#FFFFFF">16</text></g>
                      </g>

                      {/* Animated Car Beacon */}
                      <g ref={carBeaconRef} id="animated-car-beacon" transform="translate(263, 432)">
                        <circle r="14" fill="none" stroke="#C8FF2E" strokeWidth="1.5" opacity="0.6" />
                        <ellipse cx="0" cy="0" rx="13" ry="6" fill="rgba(0,0,0,0.7)" />
                        <path d="M-9,-3.5 L-2,-5 L4,-2.5 L11,0 L4,2.5 L-2,5 L-9,3.5 Z" fill="#C8FF2E" stroke="#0A0A0A" strokeWidth="0.8" />
                      </g>
                    </g>
                  </svg>

                  {/* Live Telemetry Floating Chip */}
                  <div className="track-live-hud" id="track-live-hud">
                    <span className="hud-speed-chip" id="hud-live-speed">{hudSpeed} KM/H</span>
                    <span>GEAR <b id="hud-live-gear" style={{ color: 'var(--neon-lime)' }}>{hudGear}</b></span>
                    <span className="hud-drs-chip" id="hud-live-drs" style={{
                      background: hudDrs.includes('ACTIVE') ? 'var(--neon-lime)' : hudDrs.includes('BRAKE') ? 'var(--hot-orange)' : '#444',
                      color: hudDrs.includes('ACTIVE') || hudDrs.includes('BRAKE') ? '#0A0A0A' : '#FFF'
                    }}>
                      {hudDrs}
                    </span>
                    <span style={{ opacity: 0.6 }}>| T4 APEX</span>
                  </div>
                </div>

                {/* 2. Showroom Turntable Stage */}
                <div className="cardboard-car-stage" id="cardboard-showroom">
                  <div className="cardboard-header">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div className="cardboard-badge-pill">SPECIAL DIY BUILD</div>
                      <button
                        type="button"
                        onClick={() => setActiveModal('garage')}
                        className="cardboard-scale-tag"
                        style={{ background: 'var(--neon-lime)', color: 'var(--ink-black)', fontWeight: 800, border: '1px solid #000', cursor: 'pointer' }}
                      >
                        🎨 SETUP &amp; GARAGE ⛶
                      </button>
                    </div>
                    <div className="cardboard-title-row">
                      <span className="cardboard-title" id="showroom-car-title">
                        {currentCar === 'f1' ? 'DIY FORMULA 1 (#7)' : 'DIY STREET RACER'}
                      </span>
                      <span className="cardboard-scale-tag">3D TURNTABLE</span>
                    </div>
                  </div>

                  <div
                    className="cardboard-canvas-wrap"
                    id="cardboard-canvas-wrap"
                    title="Drag to rotate 3D Cardboard Car"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                  >
                    <canvas ref={showroomCanvasRef} id="cardboard-canvas" width={480} height={340} />
                    <div className="cardboard-rotate-overlay-hint">
                      <span>DRAG TO ROTATE 360°</span>
                    </div>
                  </div>

                  <div className="cardboard-specs-strip" id="showroom-specs-strip">
                    <span>KRAFT CHASSIS</span>
                    <span>•</span>
                    <span>DUCT TAPE AERO</span>
                    <span>•</span>
                    <span>10-POLY WHEELS</span>
                  </div>

                  {/* Vehicle Selector Pills */}
                  <div style={{ display: 'flex', gap: '8px', padding: '6px 12px', background: 'rgba(10,14,20,0.6)', borderTop: '1px solid rgba(255,255,255,0.06)', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className={`btn-cardboard-ctrl ${currentCar === 'street' ? 'active' : ''}`}
                      id="btn-show-street"
                      style={{ flex: 1, cursor: 'pointer', fontSize: '11px' }}
                      onClick={() => {
                        setCurrentCar('street');
                        localStorage.setItem('formula_v_car', 'street');
                      }}
                    >
                      🏎️ STREET RACER
                    </button>
                    <button
                      type="button"
                      className={`btn-cardboard-ctrl ${currentCar === 'f1' ? 'active' : ''}`}
                      id="btn-show-f1"
                      style={{ flex: 1, cursor: 'pointer', fontSize: '11px' }}
                      onClick={() => {
                        setCurrentCar('f1');
                        localStorage.setItem('formula_v_car', 'f1');
                      }}
                    >
                      🏁 FORMULA 1 (#7)
                    </button>
                  </div>

                  <div className="cardboard-actions-row">
                    <button
                      type="button"
                      className={`btn-cardboard-ctrl ${autoSpin ? 'active' : ''}`}
                      id="btn-toggle-cardboard-spin"
                      onClick={() => setAutoSpin(!autoSpin)}
                    >
                      SPIN: {autoSpin ? 'ON' : 'OFF'}
                    </button>
                    <Link
                      href={`/game?car=${currentCar}&cam=chase`}
                      className="btn-cardboard-ctrl active"
                      id="btn-drive-cardboard"
                      style={{ textDecoration: 'none', background: 'var(--neon-lime)', color: 'var(--ink-black)', fontWeight: 800 }}
                    >
                      🏎️ RACE NOW ➔
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ─── RIGHT COLUMN: ACTIONS, CHALLENGES & GRAND PRIX LAUNCH ─── */}
          <div className="desktop-right-actions">
            {/* Row A: Pit Sponsor & License Points */}
            <section className="row-a">
              <div className="daily-crate-card" id="card-daily-crate">
                <div className="daily-crate-title">PIT SPONSOR</div>
                <button
                  type="button"
                  className="btn-claim"
                  id="btn-claim-crate"
                  disabled={crateClaimed}
                  onClick={handleClaimCrate}
                  style={crateClaimed ? { background: '#888' } : {}}
                >
                  {crateClaimed ? 'CLAIMED' : 'CLAIM'}
                </button>
              </div>

              <div className="reputation-card" id="card-reputation">
                <div className="rep-content">
                  <div className="rep-label">SUPER LICENSE PTS</div>
                  <div className="rep-score-row">
                    <div className="rep-number" id="display-rep">{rep}<small>PTS</small></div>
                    <button
                      type="button"
                      className="rep-collect-btn"
                      id="btn-collect-rep"
                      disabled={repCollected}
                      onClick={handleCollectRep}
                      style={repCollected ? { background: '#888' } : {}}
                    >
                      <div className="collect-title">{repCollected ? 'COLLECTED' : 'COLLECT'}</div>
                    </button>
                  </div>
                </div>
                {!repCollected && <div className="alert-dot" id="dot-rep">!</div>}
              </div>
            </section>

            {/* Event Banner */}
            <section className="event-banner" id="banner-event" title="Event Progress">
              <div className="event-info">
                <div className="event-title">INDIAN GRAND PRIX 2024</div>
                <div className="event-track">
                  <div className="event-fill" id="event-progress-bar" style={{ width: '22%' }} />
                </div>
              </div>
              <div className="event-count">2<small>/9 LAPS</small></div>
              <div className="alert-dot">!</div>
            </section>

            {/* PRIMARY RACE CTA BUTTONS */}
            <section className="action-buttons-wrap">
              <Link
                href={`/game?car=${currentCar}&cam=chase`}
                className="btn-race-primary"
                id="btn-race-main"
                title="Launch Formula V Grand Prix"
                style={{ textDecoration: 'none' }}
              >
                <div className="race-text">RACE</div>
                <div className="race-subtag">BUDDH GP · 3D COCKPIT SIMULATOR</div>
              </Link>

              <div className="secondary-buttons-row">
                <button
                  type="button"
                  className="btn-challenges"
                  id="btn-challenges"
                  onClick={() => setActiveModal('challenges')}
                >
                  <div className="ch-text">CHALLENGES</div>
                </button>
                <button
                  type="button"
                  className="btn-turbo-cup"
                  id="btn-turbo-cup"
                  onClick={() => setActiveModal('race-modes')}
                >
                  <div className="cup-text">GRAND PRIX MODES</div>
                </button>
              </div>

              <div className="timer-pill">QUALIFYING STARTS IN 19H 46M</div>
            </section>
          </div>
        </div>
      </div>

      {/* ═══════════ TICKER STRIP ═══════════ */}
      <div className="ticker-strip">
        <div className="ticker-content">
          FORMULA V BUDDH GRAND PRIX IS LIVE · 1.06KM BACK STRAIGHT INTO TURN 4 · SEBASTIAN VETTEL 1:27.249 LAP RECORD · ENJOY THE RACE!
        </div>
      </div>

      {/* ═══════════ BOTTOM NAVIGATION BAR ═══════════ */}
      <div className="bottom-nav-outer">
        <nav className="bottom-nav" aria-label="Main Navigation">
          <button type="button" className="nav-tab" id="nav-btn-shop" onClick={() => setActiveModal('shop')}>
            <div className="nav-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <div className="nav-label">STORE</div>
          </button>

          <button type="button" className="nav-tab" id="nav-btn-garage" onClick={() => setActiveModal('garage')}>
            <div className="nav-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M7 17l5-5 5 5" />
              </svg>
            </div>
            <div className="nav-label">GARAGE</div>
          </button>

          <Link href={`/game?car=${currentCar}&cam=chase`} className="nav-race-center" id="nav-btn-race" title="Race Now" style={{ textDecoration: 'none' }}>
            <div className="nav-race-circle">
              <span className="nav-race-label">RACE</span>
            </div>
          </Link>

          <button type="button" className="nav-tab" id="nav-btn-gear" onClick={() => setActiveModal('menu')}>
            <div className="nav-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div className="nav-label">SETUP</div>
          </button>

          <button type="button" className="nav-tab" id="nav-btn-crew" onClick={() => setActiveModal('race-modes')}>
            <div className="nav-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="nav-label">MODES</div>
          </button>
        </nav>
      </div>

      {/* ═══════════ TOAST NOTIFICATION ═══════════ */}
      <div className={`retro-toast ${showToast ? 'active' : ''}`} id="toast">
        {toastMsg}
      </div>

      {/* ═══════════ MODAL OVERLAYS ═══════════ */}
      {/* 1. RACE MODES MODAL */}
      <div className={`modal-overlay ${activeModal === 'race-modes' ? 'active' : ''}`} id="modal-race-modes">
        <div className="modal-card">
          <div className="modal-card-inner">
            <div className="modal-header">
              <div className="modal-title">SELECT FORMULA V RACE MODE</div>
              <button type="button" className="modal-close-btn" onClick={() => setActiveModal(null)}>X</button>
            </div>
            <div className="modal-body">
              <Link href={`/game?car=${currentCar}&cam=chase`} className="mode-option-btn" style={{ textDecoration: 'none' }}>
                <div className="mode-opt-header">
                  <span className="mode-opt-name">🏎️ 3D COCKPIT GRAND PRIX</span>
                  <span className="mode-opt-tag">HOT</span>
                </div>
                <div className="mode-opt-desc">Full 3D cockpit simulation at Buddh International Circuit. Real DRS, ERS boost &amp; tire thermal model.</div>
              </Link>

              <Link href={`/game?car=street&cam=hood`} className="mode-option-btn" style={{ textDecoration: 'none' }}>
                <div className="mode-opt-header">
                  <span className="mode-opt-name">🏁 NOSE CAM TIME TRIAL</span>
                  <span className="mode-opt-tag">APEX</span>
                </div>
                <div className="mode-opt-desc">Low apex ground camera view. Hit all 16 turns at maximum velocity.</div>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CHALLENGES MODAL */}
      <div className={`modal-overlay ${activeModal === 'challenges' ? 'active' : ''}`} id="modal-challenges">
        <div className="modal-card">
          <div className="modal-card-inner">
            <div className="modal-header">
              <div className="modal-title">CIRCUIT CHALLENGES</div>
              <button type="button" className="modal-close-btn" onClick={() => setActiveModal(null)}>X</button>
            </div>
            <div className="modal-body">
              <div className="mode-option-btn">
                <div className="mode-opt-header">
                  <span className="mode-opt-name">🎯 APEX HUNTER</span>
                  <span className="mode-opt-tag">500 PTS</span>
                </div>
                <div className="mode-opt-desc">Hit all 16 apexes at Buddh Circuit with zero track limits warnings.</div>
              </div>

              <div className="mode-option-btn">
                <div className="mode-opt-header">
                  <span className="mode-opt-name">⚡ 1.06KM SPEED TRAP</span>
                  <span className="mode-opt-tag">1000 PTS</span>
                </div>
                <div className="mode-opt-desc">Reach 320+ km/h on the 1.06km straight into Turn 4 braking zone.</div>
              </div>

              <div className="mode-option-btn">
                <div className="mode-opt-header">
                  <span className="mode-opt-name">🏆 TILKE MASTER</span>
                  <span className="mode-opt-tag">2500 PTS</span>
                </div>
                <div className="mode-opt-desc">Lap under 1:32.000 in dry cockpit conditions. Target: 1:27.249 record.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. GARAGE & SETUP MODAL */}
      <div className={`modal-overlay ${activeModal === 'garage' ? 'active' : ''}`} id="modal-garage">
        <div className="modal-card">
          <div className="modal-card-inner">
            <div className="modal-header">
              <div className="modal-title">GARAGE &amp; TRACK SETUP</div>
              <button type="button" className="modal-close-btn" onClick={() => setActiveModal(null)}>X</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--dim)', marginBottom: '8px' }}>ACTIVE VEHICLE</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className={`btn-cardboard-ctrl ${currentCar === 'street' ? 'active' : ''}`}
                    style={{ flex: 1, padding: '10px' }}
                    onClick={() => {
                      setCurrentCar('street');
                      localStorage.setItem('formula_v_car', 'street');
                    }}
                  >
                    🏎️ STREET RACER
                  </button>
                  <button
                    type="button"
                    className={`btn-cardboard-ctrl ${currentCar === 'f1' ? 'active' : ''}`}
                    style={{ flex: 1, padding: '10px' }}
                    onClick={() => {
                      setCurrentCar('f1');
                      localStorage.setItem('formula_v_car', 'f1');
                    }}
                  >
                    🏁 FORMULA 1 (#7)
                  </button>
                </div>
              </div>

              <Link
                href={`/game?car=${currentCar}&cam=chase`}
                className="mode-option-btn"
                style={{ textAlign: 'center', background: 'var(--neon-lime)', color: 'var(--ink-black)', fontWeight: 800, textDecoration: 'none' }}
              >
                ENTER COCKPIT WITH CURRENT SETUP ➔
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 4. STORE MODAL */}
      <div className={`modal-overlay ${activeModal === 'shop' ? 'active' : ''}`} id="modal-shop">
        <div className="modal-card">
          <div className="modal-card-inner">
            <div className="modal-header">
              <div className="modal-title">FORMULA V PADDOCK STORE</div>
              <button type="button" className="modal-close-btn" onClick={() => setActiveModal(null)}>X</button>
            </div>
            <div className="modal-body">
              <div className="mode-option-btn">
                <div className="mode-opt-header">
                  <span className="mode-opt-name">🔴 SOFT COMPOUND TIRES</span>
                  <span className="mode-opt-tag">$2,500</span>
                </div>
                <div className="mode-opt-desc">Maximum dry grip compound. Optimum braking into Turn 1 and Turn 4.</div>
              </div>

              <div className="mode-option-btn">
                <div className="mode-opt-header">
                  <span className="mode-opt-name">🟡 HIGH DOWNFORCE REAR WING</span>
                  <span className="mode-opt-tag">$4,200</span>
                </div>
                <div className="mode-opt-desc">+12% cornering grip through Turn 10-11 parabolic curve.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. SETTINGS MODAL */}
      <div className={`modal-overlay ${activeModal === 'menu' ? 'active' : ''}`} id="modal-menu">
        <div className="modal-card">
          <div className="modal-card-inner">
            <div className="modal-header">
              <div className="modal-title">PADDOCK SETTINGS</div>
              <button type="button" className="modal-close-btn" onClick={() => setActiveModal(null)}>X</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px' }}>AUDIO SYNTHESIZER</div>
              <p style={{ fontSize: '11px', color: 'var(--dim)', marginBottom: '12px' }}>
                Zero-latency procedural F1 V6 turbo-hybrid engine audio, ERS whine &amp; DRS tones.
              </p>

              <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '6px' }}>CONTROLS MAPPING</div>
              <p style={{ fontSize: '11px', color: 'var(--dim)', lineHeight: 1.6, marginBottom: '16px' }}>
                ↑ W throttle · ↓ S brake · ← → A D steer<br />
                SPACE handbrake · SHIFT ERS boost · F DRS flap · P pit stop · C camera
              </p>

              <Link
                href={`/game?car=${currentCar}&cam=chase`}
                className="mode-option-btn"
                style={{ textAlign: 'center', textDecoration: 'none' }}
              >
                START 3D RACE
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
