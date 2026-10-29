// Entry point. Decides between the 3D room and the StudioOS-only fallback,
// runs the boot screen with real loading steps, and wires the HUD.
import { createSound } from './sound.js';
import { createOS } from './os.js';

const $ = (selector) => document.querySelector(selector);
const body = document.body;
const sound = createSound();
const os = createOS({ sound });
let room = null;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const phoneLike = window.matchMedia('(max-width: 767px), (pointer: coarse) and (max-width: 1024px)');

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

// ---- sound toggle (off by default) ----------------------------------------
const soundButton = $('#sound-toggle');
function paintSound() {
  soundButton.setAttribute('aria-pressed', String(sound.enabled));
  soundButton.textContent = sound.enabled ? 'Sound: on' : 'Sound: off';
}
soundButton.addEventListener('click', () => {
  sound.toggle();
  paintSound();
});
paintSound();

// ---- Escape: close the top window, else leave the zoomed monitor ----------
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (os.closeTopWindow()) return;
  room?.zoomOut();
});

// ---- fallback: StudioOS full screen, no 3D --------------------------------
async function startFallback() {
  body.dataset.mode = 'os';
  $('#boot').hidden = true;
  os.mount($('#fallback-host'), { fullscreen: true });
  try {
    await os.load();
  } catch (err) {
    console.error(err);
    $('#fallback-host').insertAdjacentHTML(
      'beforeend',
      '<p class="fallback-error">Some content could not be loaded. Reload the page to try again.</p>'
    );
  }
}

// ---- boot screen ----------------------------------------------------------
const boot = {
  root: $('#boot'),
  log: $('#boot-log'),
  status: $('#boot-status'),
  bar: $('#boot-bar'),
  meter: document.querySelector('.boot-progress'),
  skip: $('#boot-skip'),
};
let skipped = false;
const bootStarted = performance.now();

boot.skip.addEventListener('click', () => {
  skipped = true;
  boot.skip.disabled = true;
});

function setProgress(percent) {
  boot.bar.style.transform = `scaleX(${percent / 100})`;
  boot.meter.setAttribute('aria-valuenow', String(Math.round(percent)));
}

function logLine(text, ok = true) {
  const li = document.createElement('li');
  li.textContent = `${ok ? '[ OK ]' : '[FAIL]'} ${text}`;
  boot.log.append(li);
}

// Each step is a real asynchronous task. The bar moves by its weight when
// the step finishes, so it never runs ahead of the actual loading.
async function runBoot() {
  let done = 0;
  const step = async (label, weight, task) => {
    boot.status.textContent = `${label}…`;
    const result = await task();
    done += weight;
    setProgress(done);
    logLine(label);
    return result;
  };

  await step('Typefaces', 10, () =>
    Promise.all([
      document.fonts.load('400 16px "IBM Plex Mono"'),
      document.fonts.load('400 16px Silkscreen'),
    ])
  );
  const roomModule = await step('Three.js engine', 35, () => import('./room.js'));
  await step('StudioOS files', 15, () => os.load());
  room = await step('Studio desk', 15, () =>
    roomModule.createRoom({
      canvasHost: $('#room-stage'),
      cssHost: $('#css-stage'),
      screenEl: os.root,
      onZoomChange: handleZoomChange,
      onLampChange: handleLampChange,
      onDimmerChange: handleDimmerChange,
    })
  );
  room.setDimmer(Number(dimmer.value) / 100);
  handleZoomChange('wide');
  await step('Renderer', 25, () => room.compile());
  setProgress(100);
  boot.status.textContent = 'Ready';
  return room;
}

async function revealRoom() {
  const minimum = 900;
  const elapsed = performance.now() - bootStarted;
  if (!skipped && elapsed < minimum) {
    await new Promise((resolve) => setTimeout(resolve, minimum - elapsed));
  }
  body.dataset.mode = 'room';
  boot.root.classList.add('is-done');
  setTimeout(() => {
    boot.root.hidden = true;
  }, 700);
  $('#btn-lamp').focus({ preventScroll: true });
}

// ---- HUD wiring -----------------------------------------------------------
const btnLamp = $('#btn-lamp');
const btnMonitor = $('#btn-monitor');
const btnBack = $('#btn-back');
const hint = $('#hint');

function handleZoomChange(mode) {
  body.dataset.zoom = mode;
  os.root.inert = mode !== 'zoomed';
  btnMonitor.disabled = mode !== 'wide';
  btnBack.hidden = mode !== 'zoomed';
  hint.textContent =
    mode === 'zoomed'
      ? 'Press Escape or use the button to return to the room.'
      : 'Click the monitor to step in. Click a lamp to switch it. Dim The Refusal with the slider.';
  if (mode === 'zoomed') {
    os.root.querySelector('.os-icon')?.focus({ preventScroll: true });
  }
}

function handleLampChange(on) {
  btnLamp.setAttribute('aria-pressed', String(on));
  btnLamp.textContent = on ? 'Switch lamp off' : 'Switch lamp on';
  sound.play('lamp');
}

// The Refusal's dimmer. The slider drives the room; clicking the lamp in 3D
// switches it off or back on, and the slider follows.
const dimmer = $('#dimmer');
const dimmerValue = $('#dimmer-value');
function handleDimmerChange(level) {
  const percent = Math.round(level * 100);
  dimmer.value = String(percent);
  dimmer.setAttribute('aria-valuetext', `${percent} percent`);
  dimmerValue.textContent = `${percent}%`;
}
dimmer.addEventListener('input', () => room?.setDimmer(Number(dimmer.value) / 100));

btnLamp.addEventListener('click', () => room?.toggleLamp());
btnMonitor.addEventListener('click', () => room?.zoomIn());
btnBack.addEventListener('click', () => {
  room?.zoomOut();
  btnMonitor.focus({ preventScroll: true });
});

// ---- start ----------------------------------------------------------------
async function start() {
  const wantsRoom = !reduceMotion.matches && !phoneLike.matches && supportsWebGL();
  if (!wantsRoom) {
    await startFallback();
    return;
  }
  try {
    await runBoot();
    await revealRoom();
  } catch (err) {
    console.error(err);
    logLine('Studio desk', false);
    boot.status.textContent = 'The 3D room could not start. Showing StudioOS instead.';
    await new Promise((resolve) => setTimeout(resolve, 1500));
    room?.dispose?.();
    room = null;
    await startFallback();
  }
}

start();
