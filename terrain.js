// Terreng-mesher (tre detaljnivå), fargelegging og sjø.
import * as THREE from 'three';
import { heightAt, shoreX, sstep, N1, N2, N3 } from './world.js';
import { pathDist } from './layout.js';
import { groundDetail } from './textures.js';

const C = (h) => new THREE.Color(h);
const cGrassA = C('#68793a'), cGrassB = C('#8a9849'), cDry = C('#a3a05f'), cMoss = C('#53683a');
const cRock = C('#9a9b93'), cRockD = C('#74766f'), cLichen = C('#8f9b7c');
const cGravel = C('#968c77'), cShingle = C('#77736a'), cSea = C('#2d4846');

function colorAt(x, z, y, slope, out) {
  const n = N2.fbm(x * 0.05, z * 0.05, 3), n2 = N1.fbm(x * 0.4, z * 0.4, 2), n3 = N3.fbm(x * 0.012, z * 0.012, 3);
  out.copy(cGrassA).lerp(cGrassB, sstep(-0.2, 0.4, n))
    .lerp(cDry, sstep(0.15, 0.6, n3) * 0.6)
    .lerp(cMoss, sstep(-0.1, -0.5, n3) * 0.5);
  const rock = Math.min(1, sstep(0.3, 0.62, slope + n2 * 0.1) + sstep(50, 260, y) * 0.55);
  out.lerp(n2 > 0.08 ? cRock : cRockD, rock * (0.75 + Math.abs(n2) * 0.5));
  out.lerp(cLichen, rock * sstep(0.2, 0.5, n) * 0.3);
  const d = shoreX(z) - x;
  if (d > 0 && d < 10) out.lerp(n2 > 0 ? cShingle : cRock, (1 - sstep(1, 10, d)) * 0.85);
  // hjell-berget (steinete grunn)
  const dh = Math.hypot(x + 39, z + 33);
  if (dh < 17) out.lerp(n2 > -0.05 ? cRock : cDry, (1 - sstep(6, 17, dh)) * 0.6);
  if (y < 0.12) out.lerp(cSea, sstep(0.12, -1.6, y));
  const pd = pathDist(x, z);
  if (pd < 2.8 && y > 0.3) out.lerp(cGravel, (1 - sstep(1.0, 2.8, pd)) * 0.9);
}

function buildMesh(size, segs, tileMeters, lowerBy = 0, innerHalf = 0, centerX = 0, centerZ = 0) {
  const g = new THREE.PlaneGeometry(size, size, segs, segs);
  g.rotateX(-Math.PI / 2);
  g.translate(centerX, 0, centerZ);
  const p = g.attributes.position, n = p.count, W = segs + 1;
  const H = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), z = p.getZ(i);
    let y = heightAt(x, z);
    if (innerHalf) y -= lowerBy * (1 - sstep(innerHalf * 0.82, innerHalf, Math.max(Math.abs(x - centerX), Math.abs(z - centerZ))));
    H[i] = y;
    p.setY(i, y);
  }
  const cs = size / segs, col = new Float32Array(n * 3), tmp = new THREE.Color();
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const il = Math.max(0, i - 1), ir = Math.min(segs, i + 1), jl = Math.max(0, j - 1), jr = Math.min(segs, j + 1);
      const dx = (H[j * W + ir] - H[j * W + il]) / ((ir - il) * cs);
      const dz = (H[jr * W + i] - H[jl * W + i]) / ((jr - jl) * cs);
      colorAt(p.getX(k), p.getZ(k), H[k], Math.hypot(dx, dz), tmp);
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const d = groundDetail();
  const map = d.map.clone(), bump = d.bump.clone();
  map.repeat.set(size / tileMeters, size / tileMeters); bump.repeat.copy(map.repeat);
  map.needsUpdate = bump.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map, bumpMap: bump, bumpScale: 2.2, roughness: 0.97, metalness: 0 });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildTerrain(scene) {
  const near = buildMesh(360, 240, 5);
  const mid = buildMesh(3600, 360, 40, 1.6, 180);
  const far = buildMesh(15000, 300, 400, 6, 1800);
  far.material.bumpScale = 0; mid.material.bumpScale = 0.3;
  far.material.map = null; far.material.bumpMap = null; far.material.needsUpdate = true;
  scene.add(far, mid, near);
  return { near, mid, far };
}

// ---------------- Sjø ----------------
const WATER_VERT = /* glsl */`
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const WATER_FRAG = /* glsl */`
uniform float uTime, uFogDensity, uTexSize;
uniform vec3 uSunDir, uSunColor, uHorizon, uZenith, uFogColor, uDeep, uShallow;
uniform vec2 uTexCenter;
uniform sampler2D uDepthTex;
varying vec3 vW;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
vec2 wg(vec2 p, vec2 d, float k, float w, float a, float t){ return normalize(d)*k*a*cos(dot(normalize(d),p)*k + t*w); }
void main(){
  vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 V = toCam / dist;
  vec2 p = vW.xz; float t = uTime;
  vec2 g = wg(p,vec2(1.,.35),.21,1.05,.55,t) + wg(p,vec2(-.4,1.),.37,1.5,.3,t) + wg(p,vec2(.7,-.8),.71,2.1,.16,t) + wg(p,vec2(-1.,-.2),1.3,2.9,.08,t);
  g += (vec2(vnoise(p*.9+t*.15), vnoise(p*.9+31.7-t*.12)) - .5) * .42;
  g *= mix(1., .12, smoothstep(60., 1400., dist));
  vec3 n = normalize(vec3(-g.x, 1., -g.y));
  float ndv = max(dot(n,V), 0.);
  float F = .02 + .98 * pow(1. - ndv, 5.);
  vec3 R = reflect(-V, n); R.y = abs(R.y);
  float hh = clamp(R.y, 0., 1.);
  vec3 sky = mix(uHorizon, uZenith, pow(hh, .45));
  float sd = max(dot(R, uSunDir), 0.);
  sky += uSunColor * (pow(sd, 380.) * 5. + pow(sd, 18.) * .30);
  float depth = 25.;
  vec2 tuv = (p - uTexCenter) / uTexSize + .5;
  if (tuv.x > 0. && tuv.x < 1. && tuv.y > 0. && tuv.y < 1.) { depth = -(texture2D(uDepthTex, tuv).r * 60. - 30.); }
  depth = max(depth, 0.);
  vec3 body = mix(uDeep, uShallow, exp(-depth * .28));
  vec3 col = mix(body, sky, F);
  float edge = smoothstep(1.6, 0., depth);
  float lines = smoothstep(.5, 1., sin(depth * 7. - t * 1.1 + vnoise(p * .6) * 5.) * .5 + .5);
  float foam = edge * (.18 + .55 * lines * (1. - depth / 1.6)) + smoothstep(.4, 0., depth) * .5;
  foam *= .6 + .4 * vnoise(p * 1.7 + t * .2);
  col = mix(col, vec3(.86,.9,.92), clamp(foam, 0., .8));
  float alpha = clamp(depth * 1.2 + .1, 0., 1.);
  float f = 1. - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function buildWater(scene) {
  // dybdetekstur (8 bit): høyde -30..+30 m
  const RES = 384, SIZE = 380;
  const data = new Uint8Array(RES * RES);
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const x = (i / (RES - 1) - 0.5) * SIZE, z = (j / (RES - 1) - 0.5) * SIZE;
      data[j * RES + i] = Math.max(0, Math.min(255, Math.round(((heightAt(x, z) + 30) / 60) * 255)));
    }
  }
  const tex = new THREE.DataTexture(data, RES, RES, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const uniforms = {
    uTime: { value: 0 }, uFogDensity: { value: 0.0005 }, uTexSize: { value: SIZE },
    uTexCenter: { value: new THREE.Vector2(0, 0) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color('#fff') },
    uHorizon: { value: new THREE.Color('#b9c4c9') }, uZenith: { value: new THREE.Color('#7e93a6') },
    uFogColor: { value: new THREE.Color('#b9c4c9') },
    uDeep: { value: new THREE.Color('#0d3947') }, uShallow: { value: new THREE.Color('#3a8c8a') },
    uDepthTex: { value: tex },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 10;
  scene.add(mesh);
  return { mesh, uniforms };
}
