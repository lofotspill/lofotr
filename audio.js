// Lyd: vind, bølgjer, måsar og skritt. Alt laga med WebAudio, utan lydfiler.
export function createAudio() {
  let ctx = null, master, windG, waveG, muted = false;
  function noiseBuf(sec = 4) {
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
    let l = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = (l + 0.04 * w) / 1.04; d[i] = l * 3.2 + w * 0.15; }
    return b;
  }
  function loop(freq, q, type = 'bandpass') {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    return { g, f };
  }
  function start() {
    if (ctx) { ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    const wind = loop(420, 0.5), wave = loop(260, 0.7, 'lowpass');
    windG = wind; waveG = wave;
    let t = 0;
    setInterval(() => {
      t += 0.1;
      const now = ctx.currentTime;
      windG.g.gain.setTargetAtTime(0.10 + 0.07 * Math.sin(t * 0.37) + 0.04 * Math.sin(t * 1.3), now, 0.4);
      windG.f.frequency.setTargetAtTime(380 + 160 * Math.sin(t * 0.21), now, 0.4);
      waveG.g.gain.setTargetAtTime(0.13 + 0.10 * Math.max(0, Math.sin(t * 0.55)), now, 0.5);
    }, 100);
    (function gull() { setTimeout(() => { cry(); gull(); }, 6000 + Math.random() * 14000); })();
  }
  function cry() {
    if (!ctx || muted) return;
    const now = ctx.currentTime, n = 2 + Math.floor(Math.random() * 3);
    const base = 1250 + Math.random() * 500;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t0 = now + i * 0.22;
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.25, t0);
      o.frequency.exponentialRampToValueAtTime(base * 0.8, t0 + 0.2);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = base * 1.3; f.Q.value = 2;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.045, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.24);
      o.connect(f); f.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.26);
    }
  }
  function step(surface = 'grus') {
    if (!ctx || muted) return;
    const len = 0.09, b = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = surface === 'planke' ? 500 : 1800; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = surface === 'planke' ? 0.28 : 0.16;
    s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  return {
    start, step, cry,
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; return muted; },
    get muted() { return muted; },
  };
}
