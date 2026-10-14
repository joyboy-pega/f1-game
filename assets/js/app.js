// ==========================================================================
// BUDDH F1 RACING GAME — LOBBY ENGINE & LIVE TRACK TELEMETRY
// ==========================================================================

(function() {
  'use strict';

  // --- Track Geometry (Buddh International Circuit) ---
  const TRACK_D = "M263.373,432.217l-96.534-264.13c0,0-3.417-11.104,5.765-14.521s21.996-0.428,35.662-8.969 c13.669-8.542,22.763-17.174,31.185-41.849c6.197-18.151,7.266-35.234,7.479-39.718s1.281-19.646,1.281-19.646 s0.004-7.479,7.906-8.76c7.9-1.281,9.182,6.406,10.463,11.531s55.951,203.083,63.426,230.63 c7.473,27.546,77.729,271.621,77.729,271.621s3.623,9.178-5.98,14.521c-7.971,4.436-14.312-0.218-19.432-2.989 c-9.154-4.957-178.966-99.081-178.966-99.081s-14.521-8.756-25.838,1.922s-22.635,21.566-22.635,21.566s-2.78,3.84-2.989,6.192 c-0.286,3.216-0.641,5.766,0.213,8.328s3.416,5.765,4.911,6.833s3.844,3.204,3.844,6.834s-5.417,67.702-5.417,67.702 s0,3.56-3.559,7.38c-3.055,3.279-5.209,4.254-7.466,5.556c-2.068,1.192-9.029,4.428-9.029,4.428s-8.855,3.3-9.336,10.597 c-0.425,6.448-4.483,110.826-4.483,110.826s-0.681,7.065-7.625,14.013c-5.027,5.029-11.199,9.723-20.99,10.758 c-8.561,0.905-17.246-1.054-26.906-7.046c-10.187-6.318-16.329-16.171-20.173-23.858s-6.859-15.976-7.587-24.401 c-0.538-6.229,1.943-11.977,4.698-15.161c1.986-2.296,17.976-15.13,22.421-19.219c4.431-4.075,10.586-9.706,15.457-16.143 c2.431-3.212,6.164-9.896,6.164-9.896l31.976-57.24c0,0,3.012-7.437,1.536-15.25c-1.604-8.487-7.207-13.804-7.207-13.804 l-17.191-19.531c0,0-3.299-3.473-2.764-8.857c0.677-6.813,8.969-100.577,8.969-100.577s0.735-10.732,10.725-17.229 c10.679-6.945,19.598-1.348,19.598-1.348l120.239,67.691c0,0,6.834,3.201,12.812-2.776c4.863-4.862,3.846-10.251,1.283-17.298 C264.812,435.81,263.373,432.217,263.373,432.217z";

  // --- Web Audio SFX Synthesizer ---
  let audioCtx = null;
  let soundEnabled = true;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type, duration, gainVal = 0.1) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  function playClickSound() {
    playTone(620, 'square', 0.05, 0.07);
  }

  function playRewardSound() {
    if (!soundEnabled) return;
    playTone(523.25, 'triangle', 0.1, 0.12);
    setTimeout(() => playTone(659.25, 'triangle', 0.1, 0.12), 80);
    setTimeout(() => playTone(783.99, 'triangle', 0.15, 0.14), 160);
    setTimeout(() => playTone(1046.50, 'triangle', 0.25, 0.16), 240);
  }

  function playEngineRevSound() {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(680, audioCtx.currentTime + 0.35);
      osc.frequency.exponentialRampToValueAtTime(320, audioCtx.currentTime + 0.6);

      gain.gain.setValueAtTime(0.14, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch (e) {}
  }

  // --- Toast Manager ---
  const toastEl = document.getElementById('toast');
  let toastTimer = null;

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2200);
  }

  // --- State Variables ---
  let cash = 18190;
  let coins = 5;
  let parts = 803;
  let rep = 35;
  let crateClaimed = false;
  let repCollected = false;

  // DOM elements
  const valCash = document.getElementById('val-cash');
  const valCoins = document.getElementById('val-coins');
  const valParts = document.getElementById('val-parts');
  const displayRep = document.getElementById('display-rep');
  const dotRep = document.getElementById('dot-rep');

  const btnClaimCrate = document.getElementById('btn-claim-crate');
  const cardDailyCrate = document.getElementById('card-daily-crate');
  const btnCollectRep = document.getElementById('btn-collect-rep');
  const cardReputation = document.getElementById('card-reputation');

  const btnRaceMain = document.getElementById('btn-race-main');
  const btnChallenges = document.getElementById('btn-challenges');
  const btnTurboCup = document.getElementById('btn-turbo-cup');
  const bannerEvent = document.getElementById('banner-event');

  // Bottom Nav
  const navBtnShop = document.getElementById('nav-btn-shop');
  const navBtnGarage = document.getElementById('nav-btn-garage');
  const navBtnRace = document.getElementById('nav-btn-race');
  const navBtnGear = document.getElementById('nav-btn-gear');
  const navBtnCrew = document.getElementById('nav-btn-crew');

  // Top Bar
  const btnEnergy = document.getElementById('btn-energy');
  const btnOpenMenu = document.getElementById('btn-open-menu');
  const btnProfile = document.getElementById('btn-profile');

  // Modals
  const modalRaceModes = document.getElementById('modal-race-modes');
  const modalChallenges = document.getElementById('modal-challenges');
  const modalGarage = document.getElementById('modal-garage');
  const modalShop = document.getElementById('modal-shop');
  const modalMenu = document.getElementById('modal-menu');

  // Track & Telemetry DOM
  const trackGuardrailPath = document.getElementById('track-guardrail-path');
  const trackGuardrailSteel = document.getElementById('track-guardrail-steel');
  const trackGlowPath = document.getElementById('track-glow-path');
  const trackAsphaltPath = document.getElementById('track-asphalt-path');
  const trackCurbPath = document.getElementById('track-curb-path');
  const trackRacingLine = document.getElementById('track-racing-line');
  const animatedCarBeacon = document.getElementById('animated-car-beacon');

  const hudLiveSpeed = document.getElementById('hud-live-speed');
  const hudLiveGear = document.getElementById('hud-live-gear');
  const hudLiveDrs = document.getElementById('hud-live-drs');

  function fmt(n) {
    return n.toLocaleString();
  }

  function updateCurrencies() {
    if (valCash) valCash.textContent = fmt(cash);
    if (valCoins) valCoins.textContent = fmt(coins);
    if (valParts) valParts.textContent = fmt(parts);
    if (displayRep) displayRep.innerHTML = fmt(rep) + '<small>PTS</small>';
  }

  // --- Modal Helpers ---
  function openModal(modal) {
    if (!modal) return;
    playClickSound();
    modal.classList.add('active');
  }

  function closeModal(modal) {
    if (!modal) return;
    playClickSound();
    modal.classList.remove('active');
  }

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const modalId = btn.getAttribute('data-close');
      const modal = document.getElementById(modalId);
      closeModal(modal);
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay);
      }
    });
  });

  // --- Daily Crate Claim ---
  if (btnClaimCrate) {
    btnClaimCrate.addEventListener('click', (e) => {
      e.stopPropagation();
      if (crateClaimed) {
        showToast('PIT SPONSOR CRATE CLAIMED!');
        playClickSound();
        return;
      }
      crateClaimed = true;
      cash += 500;
      coins += 1;
      updateCurrencies();
      playRewardSound();
      showToast('PIT SPONSOR: +500 CREDITS & +1 TOKEN!');
      btnClaimCrate.textContent = 'CLAIMED';
      btnClaimCrate.style.background = '#888888';
      btnClaimCrate.style.color = '#FFFFFF';
    });
  }

  if (cardDailyCrate) {
    cardDailyCrate.addEventListener('click', () => {
      if (!crateClaimed && btnClaimCrate) {
        btnClaimCrate.click();
      }
    });
  }

  // --- Super License Reputation Collect ---
  if (btnCollectRep) {
    btnCollectRep.addEventListener('click', (e) => {
      e.stopPropagation();
      if (repCollected) {
        showToast('SUPER LICENSE UP TO DATE!');
        playClickSound();
        return;
      }
      repCollected = true;
      rep += 15;
      updateCurrencies();
      playRewardSound();
      showToast('SUPER LICENSE: +15 PTS COLLECTED!');
      if (dotRep) dotRep.style.display = 'none';
      btnCollectRep.querySelector('.collect-title').textContent = 'DONE';
    });
  }

  if (cardReputation) {
    cardReputation.addEventListener('click', () => {
      if (!repCollected && btnCollectRep) {
        btnCollectRep.click();
      }
    });
  }

  // --- Primary Action Buttons ---
  if (btnRaceMain) {
    btnRaceMain.addEventListener('click', (e) => {
      e.preventDefault();
      playEngineRevSound();
      openModal(modalRaceModes);
    });
  }

  if (btnChallenges) {
    btnChallenges.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(modalChallenges);
    });
  }

  if (btnTurboCup) {
    btnTurboCup.addEventListener('click', (e) => {
      e.preventDefault();
      playClickSound();
      window.location.href = 'duo_race.html';
    });
  }

  if (bannerEvent) {
    bannerEvent.addEventListener('click', () => {
      openModal(modalChallenges);
    });
  }

  // --- Stickers ---
  const stickerOffer = document.getElementById('sticker-offer');
  if (stickerOffer) {
    stickerOffer.addEventListener('click', () => {
      openModal(modalShop);
    });
  }

  const stickerBoost = document.getElementById('sticker-boost');
  if (stickerBoost) {
    stickerBoost.addEventListener('click', () => {
      playRewardSound();
      showToast('POLE RECORD: 1:27.249 (S. VETTEL - RED BULL RACING)');
    });
  }

  // --- Top Bar Actions ---
  if (btnEnergy) {
    btnEnergy.addEventListener('click', () => {
      playClickSound();
      showToast('PUSH LAPS: 3/7 (FULL CHARGE IN 11m 40s)');
    });
  }

  if (btnOpenMenu) {
    btnOpenMenu.addEventListener('click', () => {
      openModal(modalMenu);
    });
  }

  if (btnProfile) {
    btnProfile.addEventListener('click', () => {
      playClickSound();
      showToast('DRIVER: FORMULA V RACER · BUDDH GP SEASON 2024');
    });
  }

  // --- Bottom Navigation Actions ---
  if (navBtnShop) {
    navBtnShop.addEventListener('click', () => {
      openModal(modalShop);
    });
  }

  if (navBtnGarage) {
    navBtnGarage.addEventListener('click', () => {
      openModal(modalGarage);
    });
  }

  if (navBtnGear) {
    navBtnGear.addEventListener('click', () => {
      openModal(modalGarage);
    });
  }

  if (navBtnCrew) {
    navBtnCrew.addEventListener('click', () => {
      playClickSound();
      window.location.href = 'multiplayer_race.html';
    });
  }

  if (navBtnRace) {
    navBtnRace.addEventListener('click', (e) => {
      e.preventDefault();
      playEngineRevSound();
      openModal(modalRaceModes);
    });
  }

  // --- Weather Setup Buttons ---
  document.querySelectorAll('.weather-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      document.querySelectorAll('.weather-toggle-btn').forEach(b => {
        b.style.borderColor = '#555';
        b.style.color = '#fff';
      });
      btn.style.borderColor = 'var(--neon-lime)';
      btn.style.color = 'var(--neon-lime)';
      const w = btn.getAttribute('data-weather');
      showToast('SETUP APPLIED: ' + w.toUpperCase() + ' TRACK CONDITIONS');
    });
  });

  // --- Shop Purchases ---
  ['shop-item-1', 'shop-item-2', 'shop-item-3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => {
        playRewardSound();
        showToast('FORMULA V PART PURCHASED & EQUIPPED!');
      });
    }
  });

  // --- Sound Toggle ---
  const btnToggleSound = document.getElementById('btn-toggle-sound');
  if (btnToggleSound) {
    btnToggleSound.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      btnToggleSound.textContent = soundEnabled ? 'ON' : 'OFF';
      btnToggleSound.style.background = soundEnabled ? 'var(--neon-lime)' : '#555';
      btnToggleSound.style.color = soundEnabled ? '#000' : '#fff';
      if (soundEnabled) playClickSound();
      showToast('AUDIO EFFECTS: ' + (soundEnabled ? 'ENABLED' : 'MUTED'));
    });
  }

  // ═══════════════════════════════════════════════════════════
  // LIVE BUDDH CIRCUIT ANIMATED CAR & TELEMETRY SIMULATION
  // ═══════════════════════════════════════════════════════════
  let totalTrackLength = 0;
  let trackProgress = 0.0;

  function initHeroTrack() {
    [trackGuardrailPath, trackGuardrailSteel, trackGlowPath, trackAsphaltPath, trackCurbPath, trackRacingLine].forEach(path => {
      if (path) path.setAttribute('d', TRACK_D);
    });

    if (trackRacingLine) {
      totalTrackLength = trackRacingLine.getTotalLength();
      animateHeroTrack();
    }
  }

  function animateHeroTrack() {
    if (!totalTrackLength || !animatedCarBeacon) return;

    // Advance car progress along track
    trackProgress = (trackProgress + 0.0018) % 1.0;
    const currentLen = trackProgress * totalTrackLength;
    const pt = trackRacingLine.getPointAtLength(currentLen);
    const nextLen = (currentLen + 3) % totalTrackLength;
    const nextPt = trackRacingLine.getPointAtLength(nextLen);
    const angleDeg = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x) * (180 / Math.PI);

    // Car rides directly on top of track, rotated with circuit curvature
    animatedCarBeacon.setAttribute('transform', `translate(${pt.x}, ${pt.y}) rotate(${angleDeg})`);

    // Dynamic speed & telemetry based on sector / track position
    // Buddh Circuit 1.06km straight is roughly progress 0.25 to 0.45
    let speed = 210;
    let gear = 5;
    let drs = 'DRS OFF';

    if (trackProgress > 0.22 && trackProgress < 0.45) {
      // Back straight
      const straightPct = (trackProgress - 0.22) / 0.23;
      speed = Math.floor(240 + straightPct * 98); // reaches ~338 km/h
      gear = speed > 300 ? 8 : 7;
      drs = 'DRS ACTIVE';
    } else if (trackProgress >= 0.45 && trackProgress < 0.50) {
      // Turn 4 heavy braking zone
      speed = Math.floor(338 - ((trackProgress - 0.45) / 0.05) * 248); // drops to 90
      gear = 2;
      drs = 'BRAKE 100%';
    } else if (trackProgress >= 0.68 && trackProgress < 0.78) {
      // Parabolica Turn 10-11
      speed = 195;
      gear = 4;
      drs = 'HIGH DOWNFORCE';
    } else if (trackProgress > 0.92 || trackProgress < 0.12) {
      // Pit straight
      speed = 285;
      gear = 7;
      drs = 'DRS ACTIVE';
    } else {
      speed = Math.floor(140 + Math.sin(trackProgress * 30) * 45);
      gear = speed > 180 ? 4 : 3;
      drs = 'DRS OFF';
    }

    if (hudLiveSpeed) hudLiveSpeed.textContent = speed + ' KM/H';
    if (hudLiveGear) hudLiveGear.textContent = gear;
    if (hudLiveDrs) {
      hudLiveDrs.textContent = drs;
      hudLiveDrs.style.background = drs.includes('ACTIVE') ? 'var(--neon-lime)' : (drs.includes('BRAKE') ? 'var(--hot-orange)' : '#444');
      hudLiveDrs.style.color = drs.includes('ACTIVE') || drs.includes('BRAKE') ? '#0A0A0A' : '#FFF';
    }

    requestAnimationFrame(animateHeroTrack);
  }

  // ═══════════════════════════════════════════════════════════
  // 3D CARDBOARD RACER SHOWROOM ENGINE (HOMESCREEN TURNTABLE)
  // ═══════════════════════════════════════════════════════════
  const cbCanvas = document.getElementById('cardboard-canvas');
  const cbWrap = document.getElementById('cardboard-canvas-wrap');
  const btnCbSpin = document.getElementById('btn-toggle-cardboard-spin');
  const btnCbReset = document.getElementById('btn-reset-cardboard-view');
  const btnDriveCb = document.getElementById('btn-drive-cardboard');

  let cbCtx = cbCanvas ? cbCanvas.getContext('2d') : null;
  let cbYaw = 0.65;
  let cbPitch = 0.32;
  let cbAutoSpin = true;
  let cbDragging = false;
  let cbLastX = 0;
  let cbLastY = 0;

  function shadeHex(hex, factor) {
    if (hex.startsWith('rgba')) return hex;
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, Math.max(0, Math.round(r * factor)));
    g = Math.min(255, Math.max(0, Math.round(g * factor)));
    b = Math.min(255, Math.max(0, Math.round(b * factor)));
    return '#' + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
  }

  function create3DBox(loc, scale, rotX, color, isTrans) {
    const sx = scale[0] / 2, sy = scale[1] / 2, sz = scale[2] / 2;
    const raw = [
      [-sx, -sy, -sz], [sx, -sy, -sz], [sx, sy, -sz], [-sx, sy, -sz],
      [-sx, -sy, sz],  [sx, -sy, sz],  [sx, sy, sz],  [-sx, sy, sz]
    ];
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
    const verts = raw.map(v => {
      const y = v[1] * cosX - v[2] * sinX + loc[1];
      const z = v[1] * sinX + v[2] * cosX + loc[2];
      return [v[0] + loc[0], y, z];
    });
    const faces = [
      { idx: [0, 3, 2, 1], col: color, isTrans },
      { idx: [4, 5, 6, 7], col: color, isTrans },
      { idx: [0, 1, 5, 4], col: color, isTrans },
      { idx: [2, 3, 7, 6], col: color, isTrans },
      { idx: [0, 4, 7, 3], col: color, isTrans },
      { idx: [1, 2, 6, 5], col: color, isTrans }
    ];
    return { verts, faces };
  }

  function create3DCylinder(segs, radius, depth, loc, alongX, color, isGlow) {
    const halfD = depth / 2;
    const verts = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const rCos = radius * Math.cos(a), rSin = radius * Math.sin(a);
      if (alongX) {
        verts.push([-halfD + loc[0], rCos + loc[1], rSin + loc[2]]);
        verts.push([halfD + loc[0], rCos + loc[1], rSin + loc[2]]);
      } else {
        verts.push([rCos + loc[0], -halfD + loc[1], rSin + loc[2]]);
        verts.push([rCos + loc[0], halfD + loc[1], rSin + loc[2]]);
      }
    }
    const faces = [];
    for (let i = 0; i < segs; i++) {
      const next = (i + 1) % segs;
      faces.push({
        idx: [i * 2, i * 2 + 1, next * 2 + 1, next * 2],
        col: color,
        isGlow
      });
    }
    const cap1 = [], cap2 = [];
    for (let i = 0; i < segs; i++) {
      cap1.push(i * 2);
      cap2.unshift(i * 2 + 1);
    }
    faces.push({ idx: cap1, col: color, isGlow });
    faces.push({ idx: cap2, col: color, isGlow });
    return { verts, faces };
  }

  const cbCarModel = [];

  function buildCardboardCar() {
    cbCarModel.length = 0;
    const MAT_CB = '#a66735';
    const MAT_DARK_CB = '#5e381b';
    const MAT_TIRE = '#1a1816';
    const MAT_TAPE = '#7b838f';
    const MAT_RED = '#bf2626';
    const MAT_LIGHT = '#ffd159';
    const MAT_GLASS = 'rgba(165, 205, 235, 0.45)';

    // Chassis & Cabin
    cbCarModel.push(create3DBox([0, -0.75, 0.45], [1.4, 1.1, 0.5], 0, MAT_CB));
    cbCarModel.push(create3DBox([0, 0.2, 0.25], [1.4, 0.9, 0.1], 0, MAT_DARK_CB));
    cbCarModel.push(create3DBox([-0.65, 0.2, 0.45], [0.1, 0.9, 0.5], 0, MAT_CB));
    cbCarModel.push(create3DBox([0.65, 0.2, 0.45], [0.1, 0.9, 0.5], 0, MAT_CB));
    cbCarModel.push(create3DBox([0, 0.9, 0.5], [1.4, 0.6, 0.6], 0, MAT_CB));

    // Racing Stripe on Hood
    cbCarModel.push(create3DBox([-0.25, -0.75, 0.705], [0.22, 1.08, 0.02], 0, MAT_RED));

    // Cardboard Bucket Seat
    cbCarModel.push(create3DBox([0, 0.35, 0.35], [0.85, 0.5, 0.2], 0, MAT_DARK_CB));
    cbCarModel.push(create3DBox([0, 0.55, 0.65], [0.85, 0.15, 0.65], -10 * Math.PI / 180, MAT_CB));

    // Windshield & Frame
    cbCarModel.push(create3DBox([0, -0.22, 0.88], [1.28, 0.03, 0.45], -25 * Math.PI / 180, MAT_GLASS, true));
    cbCarModel.push(create3DBox([-0.65, -0.22, 0.88], [0.1, 0.12, 0.48], -25 * Math.PI / 180, MAT_CB));
    cbCarModel.push(create3DBox([0.65, -0.22, 0.88], [0.1, 0.12, 0.48], -25 * Math.PI / 180, MAT_CB));

    // Steering Column & Wheel
    cbCarModel.push(create3DBox([0, -0.15, 0.62], [0.08, 0.08, 0.4], -35 * Math.PI / 180, MAT_DARK_CB));
    cbCarModel.push(create3DCylinder(10, 0.18, 0.06, [0, -0.05, 0.78], false, MAT_TIRE));

    // Rear Spoiler
    cbCarModel.push(create3DBox([-0.45, 1.0, 0.92], [0.08, 0.12, 0.4], 15 * Math.PI / 180, MAT_DARK_CB));
    cbCarModel.push(create3DBox([0.45, 1.0, 0.92], [0.08, 0.12, 0.4], 15 * Math.PI / 180, MAT_DARK_CB));
    cbCarModel.push(create3DBox([0, 1.05, 1.12], [1.5, 0.4, 0.06], 10 * Math.PI / 180, MAT_CB));

    // Headlights & Accents
    [-0.45, 0.45].forEach(x => {
      cbCarModel.push(create3DCylinder(10, 0.15, 0.10, [x, -1.3, 0.42], false, MAT_CB));
      cbCarModel.push(create3DCylinder(10, 0.11, 0.12, [x, -1.31, 0.42], false, MAT_LIGHT, true));
      cbCarModel.push(create3DBox([x * 1.45, -0.8, 0.55], [0.25, 0.45, 0.05], 0, MAT_CB));
      cbCarModel.push(create3DBox([x * 1.48, -1.28, 0.68], [0.16, 0.16, 0.08], 0, MAT_TAPE));
    });

    // 4 Low-Poly Wheels (FL, FR, RL, RR)
    const wheelCoords = [
      [-0.82, -0.8, 0.32],
      [ 0.82, -0.8, 0.32],
      [-0.82,  0.8, 0.32],
      [ 0.82,  0.8, 0.32]
    ];
    wheelCoords.forEach(([wx, wy, wz]) => {
      cbCarModel.push(create3DCylinder(10, 0.32, 0.26, [wx, wy, wz], true, MAT_TIRE));
      const hOff = wx < 0 ? -0.02 : 0.02;
      cbCarModel.push(create3DCylinder(10, 0.18, 0.28, [wx + hOff, wy, wz], true, MAT_CB));
      const nOff = wx < 0 ? -0.05 : 0.05;
      cbCarModel.push(create3DCylinder(6, 0.06, 0.32, [wx + nOff, wy, wz], true, MAT_TAPE));
    });
  }

  function computeCbCameraView(eye, target, up) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;

    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    let xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;

    let yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;

    return {
      project(px, py, pz) {
        const dx = px - eye[0], dy = py - eye[1], dz = pz - eye[2];
        const cx = dx * xx + dy * xy + dz * xz;
        const cy = dx * yx + dy * yy + dz * yz;
        const cz = -(dx * zx + dy * zy + dz * zz);
        return { cx, cy, cz };
      }
    };
  }

  function renderCardboardShowroom() {
    if (!cbCanvas || !cbCtx) return;
    const w = cbCanvas.width, h = cbCanvas.height;
    cbCtx.clearRect(0, 0, w, h);

    if (cbAutoSpin && !cbDragging) {
      cbYaw += 0.010;
    }

    const target = [0, 0, 0.45];
    const curPitch = Math.max(-0.2, Math.min(1.4, cbPitch));
    const camDist = 3.9;
    const eye = [
      camDist * Math.cos(curPitch) * Math.sin(cbYaw),
      -camDist * Math.cos(curPitch) * Math.cos(cbYaw),
      target[2] + camDist * Math.sin(curPitch)
    ];
    const view = computeCbCameraView(eye, target, [0, 0, 1]);
    const focal = Math.min(w, h) * 1.65;
    const lightDir = [0.45, -0.65, 0.85];
    const lightLen = Math.hypot(...lightDir);
    const lx = lightDir[0] / lightLen, ly = lightDir[1] / lightLen, lz = lightDir[2] / lightLen;

    function projectPoint(vx, vy, vz) {
      const p = view.project(vx, vy, vz);
      const cz = Math.max(0.1, p.cz);
      const sx = w / 2 + (p.cx / cz) * focal;
      const sy = h / 2 - (p.cy / cz) * focal;
      return { cx: p.cx, cy: p.cy, cz, sx, sy };
    }

    // Turntable Podium Base
    const pedR = 2.05;
    cbCtx.save();
    cbCtx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.2) {
      const px = pedR * Math.cos(a), py = pedR * Math.sin(a), pz = 0;
      const pt = projectPoint(px, py, pz);
      if (a === 0) cbCtx.moveTo(pt.sx, pt.sy); else cbCtx.lineTo(pt.sx, pt.sy);
    }
    cbCtx.closePath();
    cbCtx.fillStyle = 'rgba(22, 28, 38, 0.75)';
    cbCtx.fill();
    cbCtx.strokeStyle = 'rgba(200, 255, 46, 0.4)';
    cbCtx.lineWidth = 1.8;
    cbCtx.stroke();

    // Ground Contact Shadow
    const groundCenter = projectPoint(0, 0, 0.02);
    cbCtx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    cbCtx.beginPath();
    cbCtx.ellipse(groundCenter.sx, groundCenter.sy, 85, 28, 0, 0, Math.PI * 2);
    cbCtx.fill();
    cbCtx.restore();

    // Transform and collect faces
    const renderFaces = [];

    cbCarModel.forEach(mesh => {
      const camVerts = mesh.verts.map(([x, y, z]) => {
        const pt = projectPoint(x, y, z);
        return { x: pt.sx, y: pt.sy, cz: pt.cz, wx: x, wy: y, wz: z };
      });

      mesh.faces.forEach(face => {
        const poly = face.idx.map(i => camVerts[i]);
        if (poly.length < 3) return;

        const v0 = mesh.verts[face.idx[0]];
        const v1 = mesh.verts[face.idx[1]];
        const v2 = mesh.verts[face.idx[2]];
        const e1x = v1[0] - v0[0], e1y = v1[1] - v0[1], e1z = v1[2] - v0[2];
        const e2x = v2[0] - v0[0], e2y = v2[1] - v0[1], e2z = v2[2] - v0[2];
        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        const nlen = Math.hypot(nx, ny, nz) || 1;
        nx /= nlen; ny /= nlen; nz /= nlen;

        // Backface culling: vector from eye to face in world space
        const dx = v0[0] - eye[0], dy = v0[1] - eye[1], dz = v0[2] - eye[2];
        const dotView = nx * dx + ny * dy + nz * dz;
        if (dotView >= 0 && !face.isTrans) return;

        let avgZ = 0;
        poly.forEach(p => avgZ += p.cz);
        avgZ /= poly.length;

        const dotLight = Math.max(0, nx * lx + ny * ly + nz * lz);
        const lightFactor = face.isGlow ? 1.4 : (0.42 + 0.58 * dotLight);
        const finalColor = face.isGlow ? face.col : (face.isTrans ? face.col : shadeHex(face.col, lightFactor));

        renderFaces.push({
          poly,
          col: finalColor,
          z: avgZ,
          isGlow: face.isGlow,
          isTrans: face.isTrans
        });
      });
    });

    renderFaces.sort((a, b) => b.z - a.z);

    renderFaces.forEach(f => {
      cbCtx.fillStyle = f.col;
      cbCtx.beginPath();
      cbCtx.moveTo(f.poly[0].x, f.poly[0].y);
      for (let i = 1; i < f.poly.length; i++) {
        cbCtx.lineTo(f.poly[i].x, f.poly[i].y);
      }
      cbCtx.closePath();
      cbCtx.fill();

      if (!f.isTrans) {
        cbCtx.strokeStyle = 'rgba(20, 14, 10, 0.35)';
        cbCtx.lineWidth = 1;
        cbCtx.stroke();
      }

      if (f.isGlow && f.poly[0].cz < camDist + 0.2) {
        const cx = (f.poly[0].x + f.poly[2].x) / 2;
        const cy = (f.poly[0].y + f.poly[2].y) / 2;
        const flare = cbCtx.createRadialGradient(cx, cy, 1, cx, cy, 18);
        flare.addColorStop(0, 'rgba(255, 230, 120, 0.85)');
        flare.addColorStop(0.5, 'rgba(255, 190, 40, 0.35)');
        flare.addColorStop(1, 'rgba(255, 160, 0, 0)');
        cbCtx.fillStyle = flare;
        cbCtx.beginPath();
        cbCtx.arc(cx, cy, 18, 0, Math.PI * 2);
        cbCtx.fill();
      }
    });

    requestAnimationFrame(renderCardboardShowroom);
  }

  // Interactive Drag & Touch Orbit Controls
  if (cbWrap) {
    const onStart = (x, y) => {
      cbDragging = true;
      cbLastX = x;
      cbLastY = y;
    };
    const onMove = (x, y) => {
      if (!cbDragging) return;
      const dx = x - cbLastX;
      const dy = y - cbLastY;
      cbYaw += dx * 0.012;
      cbPitch = Math.max(-0.15, Math.min(0.85, cbPitch + dy * 0.008));
      cbLastX = x;
      cbLastY = y;
    };
    const onEnd = () => { cbDragging = false; };

    cbWrap.addEventListener('mousedown', e => onStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);

    cbWrap.addEventListener('touchstart', e => {
      if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchmove', e => {
      if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchend', onEnd);
  }

  if (btnCbSpin) {
    btnCbSpin.addEventListener('click', () => {
      cbAutoSpin = !cbAutoSpin;
      btnCbSpin.textContent = cbAutoSpin ? 'SPIN: ON' : 'SPIN: OFF';
      btnCbSpin.classList.toggle('active', cbAutoSpin);
    });
  }

  if (btnCbReset) {
    btnCbReset.addEventListener('click', () => {
      cbYaw = 0.65;
      cbPitch = 0.32;
      cbAutoSpin = true;
      if (btnCbSpin) {
        btnCbSpin.textContent = 'SPIN: ON';
        btnCbSpin.classList.add('active');
      }
    });
  }

  if (btnDriveCb) {
    btnDriveCb.addEventListener('click', () => {
      localStorage.setItem('formula_v_car', 'cardboard');
    });
  }

  // --- Initialize ---
  updateCurrencies();
  initHeroTrack();
  buildCardboardCar();
  renderCardboardShowroom();

  window.addEventListener('click', () => {
    initAudio();
  }, { once: true });

})();
