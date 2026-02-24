import './style.css';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const overlay = document.querySelector('#overlay');
const pauseOverlay = document.querySelector('#pause-overlay');
const resultOverlay = document.querySelector('#result-overlay');
const resultTitle = document.querySelector('#result-title');
const resultBody = document.querySelector('#result-body');
const startButton = document.querySelector('#start-btn');
const demoButton = document.querySelector('#demo-btn');
const roundLabel = document.querySelector('#round-label');
const scoreLabel = document.querySelector('#score-label');
const speedLabel = document.querySelector('#speed-label');
const phaseLabel = document.querySelector('#phase-label');

const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed')) || 20260224;
const autoStart = params.get('autostart') === '1';
const scriptedDemo = params.get('scripted_demo') === '1';

const padColors = [
  { base: '#ff595e', glow: '#ff8a8d' },
  { base: '#ffca3a', glow: '#ffe07a' },
  { base: '#8ac926', glow: '#b5e56a' },
  { base: '#1982c4', glow: '#53b4f0' }
];

const padLabels = ['1', '2', '3', '4'];
const padKeys = ['1', '2', '3', '4'];
const padFrequencies = [329.63, 392.0, 523.25, 659.25];

const state = {
  mode: 'intro',
  round: 1,
  score: 0,
  best: 0,
  sequence: [],
  inputIndex: 0,
  litPad: null,
  showIndex: 0,
  showPhase: 'lit',
  showTimer: 0,
  inputFlash: 0,
  paused: false,
  modeBeforePause: null,
  lastMistake: null,
  soundEnabled: false,
  seed: seedParam,
  demo: scriptedDemo,
  demoTimer: 0,
  lastTick: performance.now()
};

let rngSeed = seedParam;
const rng = () => {
  rngSeed = (rngSeed * 1664525 + 1013904223) % 4294967296;
  return rngSeed / 4294967296;
};

const pads = createPads();
let audioContext = null;

function createPads() {
  const size = Math.min(canvas.width, canvas.height);
  const center = { x: size / 2, y: size / 2 };
  const radius = size * 0.3;
  const padRadius = size * 0.18;
  const angles = [-90, 0, 90, 180].map((deg) => (deg * Math.PI) / 180);
  return angles.map((angle) => ({
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
    r: padRadius
  }));
}

function ensureAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return false;
  if (!audioContext) audioContext = new AudioCtx();
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  state.soundEnabled = true;
  return true;
}

function playTone(frequency, durationMs = 120, gainValue = 0.06, startOffset = 0) {
  if (!audioContext) return;
  const now = audioContext.currentTime + startOffset;
  const duration = durationMs / 1000;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playPadTone(index, isPlayerInput = false) {
  const base = padFrequencies[index] || 440;
  playTone(base, isPlayerInput ? 130 : 95, isPlayerInput ? 0.08 : 0.05);
}

function playRoundClearCue() {
  playTone(523.25, 120, 0.05, 0);
  playTone(659.25, 120, 0.05, 0.09);
  playTone(783.99, 160, 0.05, 0.18);
}

function playFailCue() {
  playTone(220, 180, 0.06, 0);
  playTone(185, 220, 0.06, 0.16);
}

function setMode(mode) {
  state.mode = mode;
  pauseOverlay.classList.toggle('overlay--hidden', mode !== 'paused');
  resultOverlay.classList.toggle('overlay--hidden', mode !== 'fail');
}

function resetGame() {
  state.round = 1;
  state.score = 0;
  state.sequence = [nextPad()];
  state.inputIndex = 0;
  state.showIndex = 0;
  state.showPhase = 'lit';
  state.showTimer = 0;
  state.litPad = null;
  state.inputFlash = 0;
  state.paused = false;
  state.modeBeforePause = null;
  state.lastMistake = null;
  rngSeed = state.seed;
  setMode('showing');
  overlay.classList.add('overlay--hidden');
  resultTitle.textContent = 'Missed!';
  resultBody.textContent = 'Press R to try again.';
  playTone(440, 90, 0.04);
}

function nextPad() {
  return Math.floor(rng() * pads.length);
}

function currentTempo() {
  const roundBoost = Math.max(0, state.round - 1);
  return Math.min(2.4, 1 + roundBoost * 0.08);
}

function showDurations() {
  const tempo = currentTempo();
  const baseShow = 600 / tempo;
  const baseGap = 260 / tempo;
  return {
    showMs: Math.max(240, baseShow),
    gapMs: Math.max(120, baseGap)
  };
}

function startShowing() {
  state.showIndex = 0;
  state.showPhase = 'lit';
  state.showTimer = 0;
  state.litPad = state.sequence[0];
  playPadTone(state.litPad, false);
  setMode('showing');
}

function startInput() {
  state.inputIndex = 0;
  state.litPad = null;
  setMode('input');
}

function handleInput(index) {
  if (state.mode !== 'input' || state.paused) return;
  const expected = state.sequence[state.inputIndex];
  playPadTone(index, true);
  state.litPad = index;
  state.inputFlash = 180;
  if (index === expected) {
    state.inputIndex += 1;
    if (state.inputIndex >= state.sequence.length) {
      const tempo = currentTempo();
      state.score += Math.round(100 * tempo + state.round * 10);
      state.best = Math.max(state.best, state.score);
      state.round += 1;
      state.sequence.push(nextPad());
      playRoundClearCue();
      startShowing();
    }
  } else {
    state.lastMistake = { expected, received: index };
    resultTitle.textContent = 'Missed!';
    resultBody.textContent = `Expected pad ${padLabels[expected]}, but got ${padLabels[index]}. Score ${state.score}. Press R to try again.`;
    playFailCue();
    setMode('fail');
  }
}

function update(dt) {
  if (state.paused) return;

  if (state.inputFlash > 0) {
    state.inputFlash = Math.max(0, state.inputFlash - dt * 1000);
    if (state.inputFlash === 0) state.litPad = null;
  }

  if (state.mode === 'showing') {
    const { showMs, gapMs } = showDurations();
    state.showTimer += dt * 1000;
    if (state.showPhase === 'lit' && state.showTimer >= showMs) {
      state.showPhase = 'gap';
      state.showTimer = 0;
      state.litPad = null;
    } else if (state.showPhase === 'gap' && state.showTimer >= gapMs) {
      state.showPhase = 'lit';
      state.showTimer = 0;
      state.showIndex += 1;
      if (state.showIndex >= state.sequence.length) {
        startInput();
      } else {
        state.litPad = state.sequence[state.showIndex];
        playPadTone(state.litPad, false);
      }
    }
  }

  if (state.demo && state.mode === 'input') {
    state.demoTimer += dt * 1000;
    if (state.demoTimer >= 280) {
      state.demoTimer = 0;
      const expected = state.sequence[state.inputIndex];
      handleInput(expected);
    }
  } else {
    state.demoTimer = 0;
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1b1a16';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = '#2f2a22';
  ctx.beginPath();
  ctx.arc(0, 0, canvas.width * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  pads.forEach((pad, index) => {
    const isLit = state.litPad === index;
    const color = isLit ? padColors[index].glow : padColors[index].base;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pad.x, pad.y, pad.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#1b1a16';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.fillStyle = '#1b1a16';
    ctx.font = '600 32px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(padLabels[index], pad.x, pad.y);
  });

  ctx.fillStyle = '#fdf9ea';
  ctx.font = '600 18px Rubik, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Best ${state.best}`, canvas.width / 2, canvas.height * 0.86);
  const phaseMessage =
    state.mode === 'showing'
      ? 'Phase: Watch the sequence'
      : state.mode === 'input'
        ? 'Phase: Repeat the sequence'
        : state.mode === 'paused'
          ? 'Phase: Paused'
          : state.mode === 'fail'
            ? 'Phase: Round ended'
            : 'Phase: Ready';
  ctx.fillText(phaseMessage, canvas.width / 2, canvas.height * 0.92);

  roundLabel.textContent = `Round ${state.round}`;
  scoreLabel.textContent = `Score ${state.score}`;
  speedLabel.textContent = `Tempo ${currentTempo().toFixed(2)}x`;
  phaseLabel.textContent =
    state.mode === 'showing'
      ? 'Phase Watch'
      : state.mode === 'input'
        ? 'Phase Input'
        : state.mode === 'paused'
          ? 'Phase Pause'
          : state.mode === 'fail'
            ? 'Phase Fail'
            : 'Phase Intro';
}

function loop(timestamp) {
  const dt = Math.min(0.05, (timestamp - state.lastTick) / 1000);
  state.lastTick = timestamp;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function startGame(demo = false) {
  state.demo = demo;
  ensureAudioContext();
  resetGame();
}

startButton.addEventListener('click', () => startGame(false));
demoButton.addEventListener('click', () => startGame(true));

canvas.addEventListener('click', (event) => {
  ensureAudioContext();
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  const index = pads.findIndex((pad) => Math.hypot(pad.x - x, pad.y - y) <= pad.r);
  if (index >= 0) handleInput(index);
});

window.addEventListener('keydown', (event) => {
  ensureAudioContext();
  if (event.key === 'p' || event.key === 'P') {
    if (state.paused) {
      state.paused = false;
      setMode(state.modeBeforePause || 'input');
      state.modeBeforePause = null;
      playTone(660, 90, 0.05);
    } else {
      state.paused = true;
      state.modeBeforePause = state.mode;
      setMode('paused');
      playTone(330, 120, 0.05);
    }
    return;
  }
  if (event.key === 'r' || event.key === 'R') {
    playTone(494, 100, 0.05);
    resetGame();
    return;
  }
  if (event.key === 'Enter' && state.mode === 'intro') {
    startGame(false);
    return;
  }
  const keyIndex = padKeys.indexOf(event.key);
  if (keyIndex >= 0) {
    handleInput(keyIndex);
  }
});

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) {
    update(1 / 60);
  }
  state.lastTick = performance.now();
  render();
};

window.render_game_to_text = () => {
  const payload = {
    mode: state.mode,
    round: state.round,
    score: state.score,
    best: state.best,
    sequence: state.sequence.slice(),
    inputIndex: state.inputIndex,
    litPad: state.litPad,
    tempo: Number(currentTempo().toFixed(2)),
    seed: state.seed,
    paused: state.paused,
    demo: state.demo,
    soundEnabled: state.soundEnabled,
    lastMistake: state.lastMistake,
    coordinateSystem: {
      origin: 'top-left',
      x: 'right',
      y: 'down',
      units: 'pixels'
    },
    pads: pads.map((pad, index) => ({
      id: index,
      x: Math.round(pad.x),
      y: Math.round(pad.y),
      r: Math.round(pad.r)
    }))
  };
  return JSON.stringify(payload);
};

if (autoStart) {
  startGame(scriptedDemo);
}

requestAnimationFrame(loop);
