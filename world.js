// Terreng-funksjon og felles verdensmål. Koordinater: x = øst (mot havet), z = sør, y = opp. Havnivå = 0.
import { createNoise } from './noise.js';

const N1 = createNoise(11), N2 = createNoise(23), N3 = createNoise(37);
export const SEA = 0;
export const PLAT = 1.6;
export const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function shoreX(z) {
  return 38 + 5 * Math.sin(z * 0.06 + 0.5) + 3 * Math.sin(z * 0.17 + 1.3) + 2 * N1.noise2(z * 0.03, 5.5);
}

// holmer og skjær: [x, z, sigmaX, sigmaZ, høyde]
const BLOBS = [
  [96, 130, 20, 26, 34],
  [124, -72, 16, 12, 26],
  [78, -150, 30, 20, 30],
  [150, 40, 12, 10, 24],
];

export function heightAt(x, z) {
  const sx = shoreX(z), d = sx - x;
  let h;
  if (d >= 0) {
    const flat = (1 - sstep(48, 80, Math.abs(x + 5))) * (1 - sstep(60, 95, Math.abs(z - 2)));
    let land = PLAT
      + Math.max(0, -x - 35) * 0.025 * (1 - flat)
      + N1.fbm(x * 0.02, z * 0.02, 3) * 1.4 * (1 - flat)
      + N2.fbm(x * 0.09, z * 0.09, 3) * 0.3 * (1 - flat * 0.85)
      + N2.noise2(x * 0.05, z * 0.05) * 0.22 * flat;
    // naturlige skrenter rundt bygda
    const ex = -56 - 6 * N2.noise2(z * 0.05, 1.1);
    const nz = -58 - 5 * N2.noise2(x * 0.05, 3.3);
    const szz = 62 + 5 * N2.noise2(x * 0.05, 7.7);
    land += (sstep(ex, ex - 18, x) + sstep(nz, nz - 18, z) + sstep(szz, szz + 18, z)) * 22 * sstep(2, 14, d);
    // fjell lenger unna
    const e = Math.max(0, Math.hypot((x + 10) * 0.9, (z - 2) * 1.1) - 95);
    const ridge = Math.pow(1 - Math.abs(N3.fbm(x * 0.004 + 9, z * 0.004, 4)), 2);
    land += (Math.pow(e, 1.22) * 0.15 * (0.6 + 0.8 * ridge) + N1.fbm(x * 0.012, z * 0.012, 4) * e * 0.1) * sstep(0, 120, d);
    const bank = sstep(0, 7, d);
    const rough = N1.fbm(x * 0.3, z * 0.3, 3) * 0.45 * (1 - bank) * Math.min(1, d / 1.5);
    h = 0.25 + (land - 0.25) * bank + rough;
  } else {
    h = 0.25 - 0.25 * sstep(0, 3, -d) - sstep(0, 45, -d) * (18 + N1.fbm(x * 0.01, z * 0.01, 3) * 5);
  }
  for (const b of BLOBS) {
    const dx = (x - b[0]) / b[2], dz = (z - b[1]) / b[3];
    const q = dx * dx + dz * dz;
    if (q < 12) h += b[4] * Math.exp(-q) * (1 + N1.noise2(x * 0.15, z * 0.15) * 0.12);
  }
  // fjellveggen i det fjerne (på andre sida av havet)
  const wall = sstep(2800, 3800, x) * (1 - sstep(5200, 6400, x));
  if (wall > 0) h += wall * (250 + 600 * Math.pow(1 - Math.abs(N3.fbm(z * 0.0015, x * 0.0004, 4)), 2));
  return h;
}

export { N1, N2, N3 };
