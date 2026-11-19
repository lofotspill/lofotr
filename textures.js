// Prosedyrale teksturer (tegnet på canvas), så spillet ikke trenger bildefiler.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

let R = mulberry32(4242);
const cache = {};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return '#' + c.getHexString();
}
function toTex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
function speckle(g, w, h, n, a) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = R() < 0.5 ? `rgba(0,0,0,${a * R()})` : `rgba(255,255,255,${a * R()})`;
    g.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2);
  }
}

// Liggende kledning (overlappende bord). Tile = 2 m.
export function clapboard(hex) {
  const key = 'cl' + hex;
  if (cache[key]) return cache[key];
  const S = 512, bh = 32;
  const c = canvas(S, S), b = canvas(S, S);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += bh) {
    g.fillStyle = shade(hex, 0.93 + R() * 0.14); g.fillRect(0, y, S, bh);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = `rgba(0,0,0,${0.02 + R() * 0.05})`;
      g.fillRect(R() * S, y + 3 + R() * (bh - 8), 40 + R() * 200, 1);
    }
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y, S, 2);
    g.fillStyle = 'rgba(0,0,0,0.34)'; g.fillRect(0, y + bh - 4, S, 4);
    gb.fillStyle = '#a4a4a4'; gb.fillRect(0, y, S, bh - 6);
    gb.fillStyle = '#2a2a2a'; gb.fillRect(0, y + bh - 5, S, 5);
  }
  speckle(g, S, S, 900, 0.05);
  const out = { map: toTex(c), bump: toTex(b, { srgb: false }) };
  return (cache[key] = out);
}

// Stående bord med lekter (låve). Tile = 2 m.
export function vertBoards(hex) {
  const key = 'vb' + hex;
  if (cache[key]) return cache[key];
  const S = 512, bw = 42;
  const c = canvas(S, S), b = canvas(S, S);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#909090'; gb.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += bw) {
    g.fillStyle = shade(hex, 0.92 + R() * 0.16); g.fillRect(x, 0, bw, S);
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(0,0,0,${0.02 + R() * 0.05})`;
      g.fillRect(x + 4 + R() * (bw - 8), R() * S, 1, 60 + R() * 220);
    }
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x, 0, 3, S);
    gb.fillStyle = '#2c2c2c'; gb.fillRect(x, 0, 3, S);
    // lekt over fugen
    g.fillStyle = shade(hex, 1.08); g.fillRect(x - 5, 0, 10, S);
    gb.fillStyle = '#b4b4b4'; gb.fillRect(x - 5, 0, 10, S);
  }
  speckle(g, S, S, 900, 0.06);
  return (cache[key] = { map: toTex(c), bump: toTex(b, { srgb: false }) });
}

// Takstein / skifer. Tile = 2 m.
export function roofTiles(hex) {
  const key = 'rt' + hex;
  if (cache[key]) return cache[key];
  const S = 512, rh = 40, tw = 64;
  const c = canvas(S, S), b = canvas(S, S);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, S, S);
  for (let y = 0, row = 0; y < S; y += rh, row++) {
    for (let x = -(row % 2) * (tw / 2); x < S; x += tw) {
      g.fillStyle = shade(hex, 0.88 + R() * 0.22); g.fillRect(x, y, tw - 2, rh - 1);
      g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(x, y + rh - 5, tw - 2, 5);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + tw - 4, y, 2, rh);
      gb.fillStyle = '#9a9a9a'; gb.fillRect(x, y, tw - 2, rh - 6);
      gb.fillStyle = '#222'; gb.fillRect(x, y + rh - 6, tw - 2, 6);
    }
  }
  speckle(g, S, S, 1500, 0.07);
  return (cache[key] = { map: toTex(c), bump: toTex(b, { srgb: false }) });
}

// Bølgeblikk. Tile = 2 m.
export function corrugated(hex) {
  const key = 'co' + hex;
  if (cache[key]) return cache[key];
  const S = 512, w = 32;
  const c = canvas(S, S), b = canvas(S, S);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  for (let x = 0; x < S; x += w) {
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, shade(hex, 1.15)); gr.addColorStop(0.5, shade(hex, 0.82)); gr.addColorStop(1, shade(hex, 1.15));
    g.fillStyle = gr; g.fillRect(x, 0, w, S);
    const gg = gb.createLinearGradient(x, 0, x + w, 0);
    gg.addColorStop(0, '#d0d0d0'); gg.addColorStop(0.5, '#303030'); gg.addColorStop(1, '#d0d0d0');
    gb.fillStyle = gg; gb.fillRect(x, 0, w, S);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(110,60,30,${0.04 + R() * 0.08})`;
    g.fillRect(R() * S, R() * S, 3 + R() * 8, 30 + R() * 140);
  }
  speckle(g, S, S, 800, 0.06);
  return (cache[key] = { map: toTex(c), bump: toTex(b, { srgb: false }) });
}

// Kaidekke / planker som går langs x. Tile = 2 m.
export function planks(hex = '#7b6a55') {
  const key = 'pl' + hex;
  if (cache[key]) return cache[key];
  const S = 512, ph = 46;
  const c = canvas(S, S), b = canvas(S, S);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += ph) {
    g.fillStyle = shade(hex, 0.8 + R() * 0.38); g.fillRect(0, y, S, ph - 3);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + R() * 0.06})`;
      g.fillRect(R() * S, y + 2 + R() * (ph - 8), 30 + R() * 200, 1);
    }
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(0, y + ph - 3, S, 3);
    const jx = R() * S; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(jx, y, 2, ph - 3);
    gb.fillStyle = '#a0a0a0'; gb.fillRect(0, y, S, ph - 3);
    gb.fillStyle = '#111'; gb.fillRect(0, y + ph - 3, S, 3);
  }
  speckle(g, S, S, 1200, 0.07);
  return (cache[key] = { map: toTex(c), bump: toTex(b, { srgb: false }) });
}

// Værbitt tre (hjell, gjerder, tønner). Tile = 1 m.
export function weathered(hex = '#8b8070') {
  const key = 'we' + hex;
  if (cache[key]) return cache[key];
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = hex; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = R() < 0.5 ? `rgba(0,0,0,${0.04 + R() * 0.1})` : `rgba(255,255,255,${0.03 + R() * 0.07})`;
    g.fillRect(R() * S, R() * S, 1 + R() * 2, 20 + R() * 120);
  }
  return (cache[key] = { map: toTex(c) });
}

// Jevn detaljtekstur for bakke (lys, multipliseres med vertex-farger). Tile = 6 m.
export function groundDetail() {
  if (cache.gd) return cache.gd;
  const S = 256;
  const c = canvas(S, S), b = canvas(S, S);
  const g = c.getContext('2d'), gb = b.getContext('2d');
  g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, S, S);
  gb.fillStyle = '#808080'; gb.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = R() * S, y = R() * S, r = 0.8 + R() * 5;
    const dark = R() < 0.55;
    const col = dark ? `rgba(40,40,30,${0.05 + R() * 0.12})` : `rgba(255,255,240,${0.05 + R() * 0.1})`;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.fillStyle = col; g.beginPath(); g.arc(x + ox, y + oy, r, 0, 6.3); g.fill();
      gb.fillStyle = dark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';
      gb.beginPath(); gb.arc(x + ox, y + oy, r, 0, 6.3); gb.fill();
    }
  }
  return (cache.gd = { map: toTex(c), bump: toTex(b, { srgb: false }) });
}

// Grastuft med alfa.
export function grassTuft() {
  if (cache.gt) return cache.gt;
  const S = 128;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const cols = ['#5d6f30', '#7d8c43', '#93a052', '#6a7a38', '#a2a862'];
  for (let i = 0; i < 34; i++) {
    const x0 = S / 2 + (R() - 0.5) * 36, lean = (R() - 0.5) * 70, hgt = 50 + R() * 70;
    g.strokeStyle = cols[(R() * cols.length) | 0];
    g.lineWidth = 2 + R() * 2.5;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, S);
    g.quadraticCurveTo(x0 + lean * 0.3, S - hgt * 0.6, x0 + lean, S - hgt);
    g.stroke();
  }
  const t = toTex(c, { repeat: false });
  return (cache.gt = t);
}

// Skiltflater med tekst
export function sign(lines, { w = 512, h = 128, bg = '#f2f0e8', fg = '#1d2f6b', border = null, align = 'center' } = {}) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (border) { g.strokeStyle = border; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12); }
  g.textAlign = align; g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((ln, i) => {
    const size = ln.size || Math.min(h / (n + 0.4), 64);
    g.fillStyle = ln.color || fg;
    g.font = `${ln.style || 'bold'} ${size}px ${ln.font || 'Georgia, "Times New Roman", serif'}`;
    const x = align === 'center' ? w / 2 : align === 'left' ? 24 : w - 24;
    g.fillText(ln.text, x, (h / (n + 1)) * (i + 1), w - 24);
  });
  const t = toTex(c, { repeat: false });
  return t;
}

// Tønne-tre (stav og bånd)
export function barrel() {
  if (cache.ba) return cache.ba;
  const c = canvas(256, 256), g = c.getContext('2d');
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = shade('#8a6a45', 0.85 + R() * 0.3); g.fillRect(x, 0, 16, 256);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, 0, 1.5, 256);
  }
  for (const y of [28, 70, 186, 228]) { g.fillStyle = '#2f2a26'; g.fillRect(0, y, 256, 9); }
  return (cache.ba = toTex(c));
}

// Kasse med lister
export function crate() {
  if (cache.cr) return cache.cr;
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#a58a5f'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 51) {
    g.fillStyle = shade('#a58a5f', 0.85 + R() * 0.3); g.fillRect(0, y + 2, 256, 47);
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(R() * 256, y + 4 + R() * 40, 60, 1); }
  }
  g.fillStyle = '#6b5638';
  g.fillRect(0, 0, 18, 256); g.fillRect(238, 0, 18, 256);
  return (cache.cr = toTex(c));
}
