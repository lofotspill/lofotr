// Felles oppsett: grenser, stier og kai. Endre her for å flytte på ting i bygda.
import { shoreX } from './world.js';

export const BOUNDS = { minX: -54, maxX: 52, minZ: -54, maxZ: 60 };
export const QUAY_Y = 1.55;
export const SPAWN = { x: -20, z: 34, yaw: 0.66 }; // yaw: 0 = nord (-z), økende mot øst. Ser mot bygda.

// stier (grus). Hver sti er en liste punkter.
export const PATHS = [
  [[-22, 36], [-12, 26], [-4, 16], [1, 7], [12, 6], [36, 6]],
  [[1, 7], [-2, -2], [-3, -9]],
  [[1, 7], [-12, 7], [-22, 7]],
  [[1, 7], [8, -4], [14, -12], [26, -13], [34, -13]],
  [[-22, 7], [-30, -4], [-34, -20], [-38, -32]],
  [[-12, 26], [-20, 44], [-30, 56]],
  [[-3, -9], [-3, -26], [-3, -44], [-2, -52]],
  [[-22, 7], [-40, 3], [-52, 2]],
  [[36, 6], [36, 20], [36, 48]],
];

export function pathDist(x, z) {
  let best = 1e9;
  for (const p of PATHS) {
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      const abx = bx - ax, abz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz)));
      const dx = x - (ax + abx * t), dz = z - (az + abz * t);
      const d = Math.hypot(dx, dz);
      if (d < best) best = d;
    }
  }
  return best;
}

// Kaidekket: liste med rektangler {cx, cz, hx, hz}
export function quayRects() {
  const out = [];
  for (let z = -36; z < 54; z += 4) {
    const zc = z + 2, sx = shoreX(zc);
    const x0 = sx - 3, x1 = sx + 4;
    out.push({ cx: (x0 + x1) / 2, cz: zc, hx: (x1 - x0) / 2, hz: 2 });
  }
  const sp = shoreX(6);
  out.push({ cx: sp + 12.5, cz: 6, hx: 10, hz: 2 });
  return out;
}

export function onQuay(x, z, rects) {
  for (const r of rects) {
    if (Math.abs(x - r.cx) <= r.hx + 0.02 && Math.abs(z - r.cz) <= r.hz + 0.02) return true;
  }
  return false;
}
