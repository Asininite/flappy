/*
  Flappy Clone - No external assets, Canvas + Web Audio
  Copyright: This is an original implementation.
  Mechanics are inspired by the classic game but art/sounds are original.
*/
(() => {
  'use strict';

  // ----- Config -----
  const LOGICAL_WIDTH = 288; // classic base width
  const LOGICAL_HEIGHT = 512; // classic base height
  const GROUND_HEIGHT = 112; // ground bar height
  const SKY_COLOR = '#4ec0ca';
  const PIPE_COLOR = '#2bb24a';
  const PIPE_DARK = '#1e7d33';
  const GROUND_COLOR = '#ded895';
  const GROUND_DARK = '#c6be7f';
  const BIRD_COLOR = '#ffe066';
  const BIRD_OUTLINE = '#b8860b';
  const ASSET_DIR = 'assets/';
  const BIRD_DRAW_W = 34; // used when drawing custom bird.png
  const BIRD_DRAW_H = 24;
  let RENDER_SCALE = 1; // internal render scale for high-res drawing (keeps gameplay size the same)

  // Physics tuned to feel close to the original
  const GRAVITY = 0.25; // px/frame^2 @60fps
  const FLAP_VELOCITY = -4.3; // px/frame impulse
  const MAX_DROP_SPEED = 10; // terminal velocity
  const SCROLL_SPEED = 1.8; // world scroll speed px/frame

  const PIPE_GAP_MIN = 86;
  const PIPE_GAP_MAX = 110;
  const PIPE_SPAWN_INTERVAL = 90; // frames between pipes ~1.5s
  const PIPE_WIDTH = 52;
  const PIPE_CAP = 20; // small lip at pipe top/bottom for style

  const STATES = { READY: 'ready', PLAYING: 'playing', GAMEOVER: 'gameover', PAUSED: 'paused' };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');

  function setHudVisible(visible) {
    if (!hud) return;
    hud.style.display = visible ? '' : 'none';
  }

  // DPR-aware offscreen canvas for crisp scaling
  const backCanvas = document.createElement('canvas');
  backCanvas.width = LOGICAL_WIDTH * RENDER_SCALE;
  backCanvas.height = LOGICAL_HEIGHT * RENDER_SCALE;
  const g = backCanvas.getContext('2d');

  // Audio (synthesized by default; can use user audio if present)
  const audio = new (window.AudioContext || window.webkitAudioContext || function(){return {resume:async()=>{}, createOscillator:()=>({}), destination:null}})();
  let muted = false;

  // Optional user-provided assets
  const images = { bird: null, tower: null };
  const sounds = { flap: null, score: null, hit: null };
  function tryLoadImage(fileName, key) {
    try {
      const img = new Image();
      img.onload = () => { images[key] = img; };
      img.onerror = () => {};
      img.src = ASSET_DIR + fileName;
    } catch {}
  }
  function tryLoadAudio(fileName, key) {
    try {
      const el = new Audio();
      el.preload = 'auto';
      el.src = ASSET_DIR + fileName;
      // assign immediately; play() will no-op/fail gracefully if missing
      sounds[key] = el;
    } catch {}
  }

  const storage = {
    get(key, def) { try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch { return def; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
  };

  let state = STATES.READY;
  let frame = 0;
  let score = 0;
  let best = storage.get('fb_highscore', 0);

  const input = { flap: false, justFlapped: false };

  const bird = {
    x: 64,
    y: LOGICAL_HEIGHT/2,
    vy: 0,
    rot: 0,
    radius: 10,
  };

  /** Array of pipes: { x, gapY, gapH } */
  const pipes = [];
  let groundOffset = 0;

  // ----- Helpers -----
  const rand = (a, b) => Math.random() * (b - a) + a;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function synth(freq = 440, type = 'sine', dur = 0.08, gain = 0.12) {
    if (!audio || muted || !audio.createOscillator) return;
    const t0 = audio.currentTime;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function playSound(name, volume=1) {
    if (muted) return false;
    const base = sounds[name];
    if (base && base.src) {
      try {
        const inst = base.cloneNode(true);
        inst.volume = volume;
        inst.play().catch(() => {});
        return true;
      } catch {}
    }
    return false;
  }
  const sfx = {
    flap: () => { if (!playSound('flap', 0.9)) { synth(700, 'square', 0.06, 0.07); synth(1000, 'square', 0.05, 0.03); } },
    score: () => { if (!playSound('score', 0.9)) { synth(1000, 'triangle', 0.06, 0.11); synth(1500, 'triangle', 0.06, 0.08); } },
    hit: () => { if (!playSound('hit', 0.9)) { synth(120, 'sawtooth', 0.15, 0.2); } },
    swoosh: () => { synth(600, 'sine', 0.1, 0.05); },
  };

  function resetGame() {
    state = STATES.READY;
    frame = 0;
    score = 0;
    pipes.length = 0;
    bird.x = 64;
    bird.y = LOGICAL_HEIGHT/2;
    bird.vy = 0;
    bird.rot = 0;
    groundOffset = 0;
    setHudVisible(true); // show controls only on splash (READY)
  }

  function spawnPipe() {
    const gapH = rand(PIPE_GAP_MIN, PIPE_GAP_MAX);
    const margin = 28;
    const minY = margin;
    const maxY = LOGICAL_HEIGHT - GROUND_HEIGHT - margin - gapH;
    const gapY = rand(minY, maxY);
    pipes.push({ x: LOGICAL_WIDTH + 10, gapY, gapH, scored: false });
  }

  function update() {
    if (state === STATES.PAUSED) return;

    frame++;

    // Input: flap on press
    if (input.flap) {
      input.flap = false;
      input.justFlapped = true;
      if (state === STATES.READY) {
        state = STATES.PLAYING;
        setHudVisible(false); // hide controls when gameplay starts
        sfx.swoosh();
      }
      if (state === STATES.PLAYING) {
        bird.vy = FLAP_VELOCITY;
        sfx.flap();
      } else if (state === STATES.GAMEOVER) {
        resetGame();
      }
    } else {
      input.justFlapped = false;
    }

    if (state === STATES.PLAYING) {
      // Bird physics
      bird.vy = clamp(bird.vy + GRAVITY, -999, MAX_DROP_SPEED);
      bird.y += bird.vy;
      bird.rot = clamp((bird.vy / MAX_DROP_SPEED) * 1.2, -0.6, 1.2);

      // Ceiling clamp
      if (bird.y - bird.radius < 0) {
        bird.y = bird.radius;
        if (bird.vy < 0) bird.vy = 0;
      }

      // Ground collision
      const groundY = LOGICAL_HEIGHT - GROUND_HEIGHT;
      if (bird.y + bird.radius >= groundY) {
        bird.y = groundY - bird.radius;
        state = STATES.GAMEOVER;
        best = Math.max(best, score); storage.set('fb_highscore', best);
        sfx.hit();
        setHudVisible(false); // keep controls hidden outside splash
      }

      // Pipes
      if (frame % PIPE_SPAWN_INTERVAL === 0) spawnPipe();
      for (let i = pipes.length - 1; i >= 0; i--) {
        const p = pipes[i];
        p.x -= SCROLL_SPEED;
        if (!p.scored && p.x + PIPE_WIDTH < bird.x) { p.scored = true; score++; sfx.score(); }
        if (p.x < -PIPE_WIDTH - 10) pipes.splice(i, 1);
      }

      // Ground scroll
      groundOffset = (groundOffset + SCROLL_SPEED) % 24;

      // Collision with pipes (AABB vs circle)
      for (const p of pipes) {
        const topRect = { x: p.x, y: 0, w: PIPE_WIDTH, h: p.gapY };
        const botRect = { x: p.x, y: p.gapY + p.gapH, w: PIPE_WIDTH, h: LOGICAL_HEIGHT - GROUND_HEIGHT - (p.gapY + p.gapH) };
        if (circleIntersectsRect(bird.x, bird.y, bird.radius, topRect) || circleIntersectsRect(bird.x, bird.y, bird.radius, botRect)) {
          state = STATES.GAMEOVER;
          best = Math.max(best, score); storage.set('fb_highscore', best);
          sfx.hit();
          setHudVisible(false);
          break;
        }
      }
    }
  }

  function circleIntersectsRect(cx, cy, r, rect) {
    const nearestX = clamp(cx, rect.x, rect.x + rect.w);
    const nearestY = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return (dx*dx + dy*dy) <= r*r;
  }

  // ----- Render -----
  function draw() {
    const w = backCanvas.width, h = backCanvas.height;

    // Sky background
    gradientSky(g, w, h);

    // Background clouds (simple parallax)
    drawClouds(g, frame * 0.25);

  // Pipes
  for (const p of pipes) drawPipe(g, p.x, p.gapY, p.gapH);

    // Ground
    drawGround(g, groundOffset);

  // Bird
  drawBird(g, bird.x, bird.y, bird.rot);

    // UI overlays
    drawScore(g);
    if (state === STATES.READY) drawReady(g);
    if (state === STATES.GAMEOVER) drawGameOver(g);
    if (state === STATES.PAUSED) drawPaused(g);

    // Blit to screen canvas with CSS scaling preserved
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(backCanvas, 0, 0, canvas.width, canvas.height);
  }

  function gradientSky(g, w, h) {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#6bd2e4');
    grd.addColorStop(1, '#b6ecff');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }

  function drawClouds(g, t) {
    g.save();
    g.globalAlpha = 0.5;
    g.fillStyle = 'white';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 90 - (t % 300)) % (LOGICAL_WIDTH + 120)) - 60;
      const y = 30 + ((i * 23) % 50);
      drawCloud(g, x, y);
    }
    g.restore();
  }
  function drawCloud(g, x, y) {
    g.beginPath();
    g.arc(x, y, 14, 0, Math.PI * 2);
    g.arc(x + 16, y + 2, 18, 0, Math.PI * 2);
    g.arc(x + 34, y + 0, 12, 0, Math.PI * 2);
    g.fill();
  }

  function drawPipe(g, x, gapY, gapH) {
    const botY = gapY + gapH + PIPE_CAP;
    if (images.tower) {
      const img = images.tower;
      // Top segment (stretch vertically)
      const topH = Math.max(0, gapY - PIPE_CAP);
      if (topH > 0) {
        g.drawImage(img, 0, 0, img.naturalWidth || img.width, img.naturalHeight || img.height, x, 0, PIPE_WIDTH, topH);
      }
      // Bottom segment
      const bottomH = Math.max(0, (LOGICAL_HEIGHT - GROUND_HEIGHT) - botY);
      if (bottomH > 0) {
        g.drawImage(img, 0, 0, img.naturalWidth || img.width, img.naturalHeight || img.height, x, botY, PIPE_WIDTH, bottomH);
      }
    } else {
      // Vector fallback
      g.fillStyle = PIPE_COLOR;
      g.fillRect(x, 0, PIPE_WIDTH, gapY - PIPE_CAP);
      // lip
      g.fillStyle = PIPE_DARK;
      g.fillRect(x - 2, gapY - PIPE_CAP, PIPE_WIDTH + 4, PIPE_CAP);

      // Bottom pipe
      g.fillStyle = PIPE_COLOR;
      g.fillRect(x, botY, PIPE_WIDTH, (LOGICAL_HEIGHT - GROUND_HEIGHT) - botY);
      // lip
      g.fillStyle = PIPE_DARK;
      g.fillRect(x - 2, gapY + gapH, PIPE_WIDTH + 4, PIPE_CAP);

      // Shading stripes
      g.fillStyle = 'rgba(255,255,255,0.15)';
      for (let i = 4; i < PIPE_WIDTH; i += 12) g.fillRect(x + i, 0, 3, gapY - PIPE_CAP);
      for (let i = 4; i < PIPE_WIDTH; i += 12) g.fillRect(x + i, botY, 3, (LOGICAL_HEIGHT - GROUND_HEIGHT) - botY);
    }
  }

  function drawGround(g, offset) {
    const y = LOGICAL_HEIGHT - GROUND_HEIGHT;
    g.fillStyle = GROUND_COLOR;
    g.fillRect(0, y, LOGICAL_WIDTH, GROUND_HEIGHT);
    g.fillStyle = GROUND_DARK;
    for (let i = -24; i < LOGICAL_WIDTH + 24; i += 24) {
      const x = (i - (offset % 24));
      g.fillRect(x, y + 40, 24, 8);
      g.fillRect(x + 12, y + 60, 24, 8);
      g.fillRect(x - 6, y + 80, 24, 8);
    }
  }

  function drawBird(g, x, y, rot) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    if (images.bird) {
      const img = images.bird;
      const w = BIRD_DRAW_W, h = BIRD_DRAW_H;
      g.drawImage(img, -w/2, -h/2, w, h);
    } else {
      // vector fallback
      g.fillStyle = BIRD_COLOR;
      g.strokeStyle = BIRD_OUTLINE;
      g.lineWidth = 2;
      roundedRect(g, -12, -9, 24, 18, 8);
      g.fill(); g.stroke();
      // wing
      g.fillStyle = '#ffd24d';
      roundedRect(g, -10, -3, 12, 6, 3); g.fill(); g.stroke();
      // eye
      g.fillStyle = 'white'; g.beginPath(); g.arc(4, -4, 3.5, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = 'black'; g.beginPath(); g.arc(5, -4, 1.5, 0, Math.PI * 2); g.fill();
      // beak
      g.fillStyle = '#ff9f1a';
      g.beginPath(); g.moveTo(12, 0); g.lineTo(20, 3); g.lineTo(12, 6); g.closePath(); g.fill(); g.stroke();
    }
    g.restore();
  }

  function roundedRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r);
    g.quadraticCurveTo(x, y, x + r, y);
  }

  function drawScore(g) {
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'top';
    // shadow
    g.font = 'bold 24px system-ui, sans-serif';
    const sx = LOGICAL_WIDTH / 2, sy = 12;
    drawOutlinedText(g, `${score}`, sx, sy, 'white');
    g.restore();
  }

  function drawReady(g) {
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 24px system-ui, sans-serif';
    drawOutlinedText(g, 'Thayoli Kili', LOGICAL_WIDTH/2, 140, 'white');
    g.font = 'bold 16px system-ui, sans-serif';
    drawOutlinedText(g, 'Tap that Thayoli', LOGICAL_WIDTH/2, 172, 'white');
    drawOutlinedText(g, 'Best Streak: ' + best, LOGICAL_WIDTH/2, 196, 'white');
    g.restore();
  }

  function drawGameOver(g) {
    g.save();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 26px system-ui, sans-serif';
    drawOutlinedText(g, 'Thayoli Over', LOGICAL_WIDTH/2, 150, 'white');
    g.font = 'bold 16px system-ui, sans-serif';
    drawOutlinedText(g, `Score: ${score}`, LOGICAL_WIDTH/2, 184, 'white');
    drawOutlinedText(g, `Best: ${best}`, LOGICAL_WIDTH/2, 206, 'white');
    drawOutlinedText(g, 'Press R to restart', LOGICAL_WIDTH/2, 232, 'white');
    g.restore();
  }

  function drawPaused(g) {
    g.save();
    g.globalAlpha = 0.6;
    g.fillStyle = 'black';
    g.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    g.globalAlpha = 1;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 24px system-ui, sans-serif';
    drawOutlinedText(g, 'Paused', LOGICAL_WIDTH/2, LOGICAL_HEIGHT/2, 'white');
    g.restore();
  }

  function drawOutlinedText(g, text, x, y, color) {
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillText(text, x+1, y+1);
    g.fillStyle = color; g.fillText(text, x, y);
  }

  // ----- Input -----
  function handlePointer() {
    if (state === STATES.PAUSED) return; // ignore while paused
    input.flap = true;
  }
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); handlePointer(); });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'arrowup' || k === 'w') { e.preventDefault(); handlePointer(); }
    else if (k === 'p') { togglePause(); }
    else if (k === 'm') { toggleMute(); }
    else if (k === 'r') { if (state === STATES.GAMEOVER) resetGame(); }
  });

  function togglePause() {
    if (state === STATES.PAUSED) state = prevState || STATES.READY; else { prevState = state; state = STATES.PAUSED; }
  }
  let prevState = STATES.READY;

  function toggleMute() {
    muted = !muted; storage.set('fb_muted', muted); if (audio && audio.resume) audio.resume();
  }
  muted = storage.get('fb_muted', false);

  // ----- Resize handling: scale canvas drawing buffer to device DPR -----
  function resize() {
    // Keep logical size in back buffer; scale front buffer to device CSS size
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    // Front buffer (what the user sees)
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor((rect.height || rect.width * (LOGICAL_HEIGHT/LOGICAL_WIDTH)) * dpr);
    ctx.imageSmoothingEnabled = false; // keep crisp upscaling look (change to true if you want smoother)

    // Back buffer: render at higher resolution to preserve sprite detail while keeping logical sizes
    RENDER_SCALE = Math.min(3, dpr); // cap to 3x for performance; adjust if needed
    backCanvas.width = Math.floor(LOGICAL_WIDTH * RENDER_SCALE);
    backCanvas.height = Math.floor(LOGICAL_HEIGHT * RENDER_SCALE);
    g.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    g.imageSmoothingEnabled = true; // smooth downscaling of high-res images into logical space
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  // ----- Main loop (fixed timestep) -----
  let last = performance.now();
  let acc = 0;
  const DT = 1000/60;
  function loop(now) {
    // Clamp large gaps (e.g., after tab is hidden) to avoid fast-forwarding
    let elapsed = now - last; last = now;
    const MAX_ELAPSED = 120; // ms max to accumulate per frame (~7 frames)
    acc += Math.min(elapsed, MAX_ELAPSED);

    const MAX_FRAME_STEPS = 5; // also cap per-frame updates to guard spikes
    let steps = 0;
    while (acc >= DT && steps < MAX_FRAME_STEPS) { update(); acc -= DT; steps++; }
    draw();
    requestAnimationFrame(loop);
  }

  // Prevent time accumulator from exploding when tab/window visibility changes
  function resetTiming() {
    last = performance.now();
    acc = 0;
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resetTiming(); });
  window.addEventListener('focus', resetTiming);
  window.addEventListener('blur', resetTiming);

  // Boot
  resetGame();
  // Load optional user assets (non-blocking)
  tryLoadImage('bird.png', 'bird');
  tryLoadImage('tower.png', 'tower');
  tryLoadAudio('flap.ogg', 'flap');
  tryLoadAudio('hit.ogg', 'hit');
  tryLoadAudio('score.ogg', 'score');
  resize();
  requestAnimationFrame(loop);
})();
