// Liten, deterministisk støy-modul (gradient-støy), uten eksterne bibliotek.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createNoise(seed = 1) {
  const rnd = mulberry32(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const GX = [1, -1, 1, -1, 1, -1, 0, 0];
  const GY = [1, 1, -1, -1, 0, 0, 1, -1];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const gr = (h, x, y) => GX[h & 7] * x + GY[h & 7] * y;

  function noise2(x, y) {
    const xf = Math.floor(x), yf = Math.floor(y);
    const X = xf & 255, Y = yf & 255;
    x -= xf; y -= yf;
    const u = fade(x), v = fade(y);
    const a = p[X] + Y, b = p[X + 1] + Y;
    return lerp(
      lerp(gr(p[a], x, y), gr(p[b], x - 1, y), u),
      lerp(gr(p[a + 1], x, y - 1), gr(p[b + 1], x - 1, y - 1), u),
      v
    ) * 1.4;
  }
  function fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
    let s = 0, a = 1, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += noise2(x * f, y * f) * a; n += a; a *= gain; f *= lac;
    }
    return s / n;
  }
  return { noise2, fbm, rnd };
}
