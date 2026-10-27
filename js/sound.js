// Tiny synthesized UI sounds. No audio files. Off by default; the context is
// only created after the visitor switches sound on (a user gesture).

export function createSound() {
  let enabled = false;
  let ctx = null;

  function ensureContext() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq, to = freq, dur = 0.05, type = 'square', gain = 0.03 }) {
    const c = ensureContext();
    if (!c) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const sounds = {
    click: () => tone({ freq: 900, to: 600, dur: 0.03, gain: 0.025 }),
    open: () => tone({ freq: 520, to: 980, dur: 0.09, gain: 0.025 }),
    close: () => tone({ freq: 980, to: 420, dur: 0.08, gain: 0.025 }),
    lamp: () => tone({ freq: 180, to: 120, dur: 0.04, type: 'triangle', gain: 0.08 }),
    confirm: () => tone({ freq: 660, dur: 0.06, gain: 0.02 }),
  };

  const api = {
    get enabled() {
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      if (enabled) {
        ensureContext();
        sounds.confirm();
      }
      return enabled;
    },
    play(name) {
      if (enabled && sounds[name]) sounds[name]();
    },
  };
  return api;
}
