// Nordlandsbåt (åttring/fembøring) bygd av kurver. Klinkbygd, tjærebrun, høye stavner.
import * as THREE from 'three';
import { clapboard, planks, weathered } from './textures.js';

const NT = 30, NU = 8;

function profile(t, L, B) {
  const s = t * 2 - 1, a = Math.abs(s);
  const sheer = 0.72 + 1.2 * Math.pow(a, 3.1);
  const keel = -0.52 + 0.9 * Math.pow(a, 1.7);
  const b = B * Math.pow(1 - Math.pow(a, 2.4), 0.55);
  return { sheer, keel, b };
}
function pt(t, u, L, B, side) {
  const { sheer, keel, b } = profile(t, L, B);
  const y = keel + (sheer - keel) * Math.pow(u, 1.25);
  const z = side * b * Math.pow(Math.sin(u * Math.PI / 2), 0.85);
  return [(t - 0.5) * L, y, z];
}

function shell(L, B, inner) {
  const pos = [], uv = [], idx = [];
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= NT; i++) {
      const t = i / NT;
      for (let j = 0; j <= NU; j++) {
        const u = j / NU;
        let [x, y, z] = pt(t, u, L, B, side);
        if (inner) {
          z -= side * Math.min(0.055, Math.abs(z)); y += 0.05 * (1 - u * 0.5);
        }
        pos.push(x, y, z);
        uv.push(t * L / 2, u * (inner ? 0.2 : 0.4) * (side > 0 ? 1 : 1));
      }
    }
    for (let i = 0; i < NT; i++) {
      for (let j = 0; j < NU; j++) {
        const a = base + i * (NU + 1) + j, b = a + 1, c = a + NU + 1, d = c + 1;
        const flip = (side > 0) !== inner;
        if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function gunwale(L, B) {
  const pos = [], idx = [];
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= NT; i++) {
      const t = i / NT;
      const [x, y, z] = pt(t, 1, L, B, side);
      pos.push(x, y + 0.02, z, x, y + 0.02, z - side * Math.min(0.09, Math.abs(z)));
    }
    for (let i = 0; i < NT; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// usynlig "vannmaske" som hindrer at sjøen tegnes inne i båten
function waterMask(L, B) {
  const pos = [], idx = [];
  let n = 0;
  for (let i = 0; i <= NT; i++) {
    const t = i / NT, { sheer, keel, b } = profile(t, L, B);
    if (keel >= 0 || sheer <= 0) continue;
    const u0 = Math.pow(-keel / (sheer - keel), 1 / 1.25);
    const w = Math.max(0, b * Math.pow(Math.sin(u0 * Math.PI / 2), 0.85) - 0.04);
    const x = (t - 0.5) * L;
    pos.push(x, 0.05, -w, x, 0.05, w);
    if (n > 0) { const a = (n - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    n++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = 5;
  return m;
}

export function makeBoat({ length = 9.5, beam = 1.2, sail = true, ashore = false, hull: hullCol = '#2c231e' } = {}) {
  const grp = new THREE.Group();
  const body = new THREE.Group();
  grp.add(body);
  const cl = clapboard(hullCol), pl = planks('#a58d66');
  const outer = new THREE.MeshStandardMaterial({ map: cl.map, bumpMap: cl.bump, bumpScale: 1.5, roughness: 0.85, side: THREE.DoubleSide });
  const innerMat = new THREE.MeshStandardMaterial({ map: pl.map, bumpMap: pl.bump, bumpScale: 1, roughness: 0.9, side: THREE.DoubleSide });
  const rail = new THREE.MeshStandardMaterial({ color: '#7b2f27', roughness: 0.7, side: THREE.DoubleSide });
  const wood = new THREE.MeshStandardMaterial({ color: '#b39a70', roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#4a3a2b', roughness: 0.9 });

  const hull = new THREE.Mesh(shell(length, beam, false), outer);
  const inn = new THREE.Mesh(shell(length, beam, true), innerMat);
  const gw = new THREE.Mesh(gunwale(length, beam), rail);
  [hull, inn, gw].forEach((m) => { m.castShadow = true; m.receiveShadow = true; body.add(m); });

  // tofter, bunnbord
  for (let i = 0; i < 5; i++) {
    const t = 0.2 + i * 0.15;
    const { sheer, b } = profile(t, length, beam);
    const w = b * 1.7;
    const th = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, w), wood);
    th.position.set((t - 0.5) * length, sheer - 0.42, 0); th.castShadow = true; body.add(th);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(length * 0.62, 0.04, beam * 0.9), wood);
  floor.position.set(0, -0.38, 0); body.add(floor);

  if (sail && !ashore) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 6.4, 8), dark);
    mast.position.set(-length * 0.1, 3.0, 0); mast.castShadow = true; body.add(mast);
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, length * 0.55, 6), dark);
    yard.rotation.z = Math.PI / 2; yard.position.set(-length * 0.1, 5.6, 0); body.add(yard);
    const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, length * 0.5, 10), new THREE.MeshStandardMaterial({ color: '#8d5736', roughness: 1 }));
    cloth.rotation.z = Math.PI / 2; cloth.position.set(-length * 0.1, 5.45, 0); cloth.castShadow = true; body.add(cloth);
    // årer langs tofter
    for (const s of [-1, 1]) {
      const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.2, 6), wood);
      oar.rotation.z = Math.PI / 2; oar.position.set(length * 0.12, 0.38, s * beam * 0.45); body.add(oar);
    }
  }
  if (!ashore) grp.add(waterMask(length, beam));
  grp.userData.body = body;
  grp.userData.update = (time, phase = 0) => {
    body.position.y = Math.sin(time * 0.9 + phase) * 0.035;
    body.rotation.z = Math.sin(time * 0.7 + phase * 1.7) * 0.012;
    body.rotation.x = Math.sin(time * 0.6 + phase) * 0.008;
  };
  return grp;
}
