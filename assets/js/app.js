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
    [trackGlowPath, trackAsphaltPath, trackCurbPath, trackRacingLine].forEach(path => {
      if (path) path.setAttribute('d', TRACK_D);
    });

    if (trackRacingLine) {
      totalTrackLength = trackRacingLine.getTotalLength();
      animateHeroTrack();
    }
  }

  function animateHeroTrack() {
    if (!totalTrackLength || !animatedCarBeacon) return;

    // Advance car progress
    trackProgress = (trackProgress + 0.0018) % 1.0;
    const pt = trackRacingLine.getPointAtLength(trackProgress * totalTrackLength);

    animatedCarBeacon.setAttribute('transform', `translate(${pt.x}, ${pt.y})`);

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

  // --- Initialize ---
  updateCurrencies();
  initHeroTrack();

  window.addEventListener('click', () => {
    initAudio();
  }, { once: true });

})();
