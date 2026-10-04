// tree.js — «Древо Любарского», живой образец (#73, этап 2; ATLAS_TREE_SPEC.md). three.js 0.160 (модули).
// Данные: ./tree/data/ — tree.json, leaves.bin, search_words.json + search.bin (tests/_eval73/tree_export73.py).
// Высота = время (форма 1, выбор автора 02.10). Виды «Дерево», «Метла», «Цилиндр» с перетеканием. Листья: издали —
// свечение, вблизи — чёткие кружки с каёмкой (с глубиной); выбор листа — по пикселям экрана, «прицел».
// Выделение тем/созвездий (панель «Ветви», правая кнопка, 1–9); яркость диапазона дат (линейка, ▶); окраски.
// Поиск (по ключевым словам фрагментов — замена настоящего поиска на этапе образца): светлячки, гистограмма на
// линейке, лиана сюжета (главный ролик каждого квартала/месяца), «▶ сюжет» — облёт по узлам.
// Ролик: его листья светятся, кольцо разговора на высоте даты (дуги — темы по ходу речи), огонёк «сейчас» с нитью
// к листу, дорожка ±1/5/15 со стрелками, плеер YouTube (секунда — сообщениями плеера), ←/→ ±15 с, Shift+←/→.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DATA = './tree/data/';
const $ = (id) => document.getElementById(id);
const S = {
  view: 'tree', morphTo: null, dimOthers: 0.07,
  selG: new Set(), selC: new Set(), hidG: new Set(), hidC: new Set(),
  range: null, playing: false, search: null, tour: null, video: null, hover: null,
};

const [meta, buf] = await Promise.all([
  fetch(DATA + 'tree.json').then((r) => r.json()),
  fetch(DATA + 'leaves.bin').then((r) => r.arrayBuffer()),
]);
const col = (name) => {
  const ix = meta.index[name];
  const T = { int16: Int16Array, uint8: Uint8Array, uint16: Uint16Array }[ix.type];
  return new T(buf, ix.off, ix.n);
};
const N = meta.n, NG = meta.galaxies.length, NC = meta.constellations.length;
const viewPos = {
  tree: Float32Array.from(col('pos_tree'), (v) => v * meta.scale),
  bush: Float32Array.from(col('pos_bush'), (v) => v * meta.scale),
  cyl: Float32Array.from(col('pos_cyl'), (v) => v * meta.scale),
};
const VIEWS = ['tree', 'bush', 'cyl'];
const gal = col('gal'), con = col('con'), chan = col('chan'), day = col('day'), vid = col('vid'), sec = col('sec');
const cno = col('cno');                         // номер фрагмента в ролике: chunk_id = «<ролик>_<номер, 4 цифры>»
const SITE = 'https://momendex.quest';          // «Поиск» и «Вселенная» Любарского
const chunkId = (i) => `${meta.videos[vid[i]].v}_${String(cno[i]).padStart(4, '0')}`;
let idMap = null;
function leafOfChunk(id) {                      // номер фрагмента → лист (указатель строится при первом обращении)
  if (!idMap) { idMap = new Map(); for (let i = 0; i < N; i++) idMap.set(chunkId(i), i); }
  return idMap.get(id);
}
const dayMax = day.reduce((a, b) => Math.max(a, b), 0);
const gcol = meta.galaxies.map((g) => new THREE.Color(g.color[0] / 255, g.color[1] / 255, g.color[2] / 255));
const videoLeaves = Array.from({ length: meta.videos.length }, () => []);   // ролик → его листья по порядку речи
for (let i = 0; i < N; i++) videoLeaves[vid[i]].push(i);
for (const L of videoLeaves) L.sort((a, b) => sec[a] - sec[b]);
$('sub').textContent = `${N.toLocaleString('ru')} фрагментов · ${meta.videos.length.toLocaleString('ru')} роликов · `
  + `высота — время (${fmtDate(meta.first_date)} — ${fmtDate(meta.last_date)})`;
$('load').remove();

function fmtDate(d) { d = +d; return `${String(d % 100).padStart(2, '0')}.${String(Math.floor(d / 100) % 100).padStart(2, '0')}.${Math.floor(d / 10000)}`; }
function dayToDate(k) {
  const t = new Date((meta.d0 + k) * 86400000);
  return `${String(t.getUTCDate()).padStart(2, '0')}.${String(t.getUTCMonth() + 1).padStart(2, '0')}.${t.getUTCFullYear()}`;
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const curPos = () => viewPos[S.view];
const leafVec = (i, P = curPos()) => new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);

// ---------------------------------------------------------------- сцена
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
$('scene').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1222);
scene.fog = new THREE.Fog(0x0b1222, 8, 18);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.01, 100);
const HOME = { pos: new THREE.Vector3(0.4, 1.7, 5.6), target: new THREE.Vector3(0, 1.35, 0) };
camera.position.copy(HOME.pos);
const _ax = new THREE.Vector3();
renderer.domElement.addEventListener('wheel', (e) => {     // ближе 0,45 — точка обзора уходит вперёд: крону можно пролететь насквозь
  if (e.shiftKey || e.ctrlKey) {                 // Shift — сдвиг картинки по вертикали, Ctrl — по горизонтали (без масштаба)
    e.preventDefault(); e.stopImmediatePropagation();
    const raw = (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 33 : 1);
    const d = Math.sign(raw) * Math.min(3, Math.abs(raw) / 100) * 0.05 * camera.position.distanceTo(controls.target);
    _ax.setFromMatrixColumn(camera.matrixWorld, e.shiftKey ? 1 : 0).multiplyScalar(e.shiftKey ? -d : d);
    camera.position.add(_ax); controls.target.add(_ax);
    return;
  }
  if (e.deltaY >= 0) return;
  const d = camera.position.distanceTo(controls.target);
  if (d > 0.45) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const dir = controls.target.clone().sub(camera.position).normalize().multiplyScalar(0.05 * Math.min(3, Math.abs(e.deltaY) / 100));
  camera.position.add(dir); controls.target.add(dir);
}, { passive: false });
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.3;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.62;
controls.screenSpacePanning = true;
controls.zoomSpeed = 1.2;
scene.add(new THREE.HemisphereLight(0x8090c0, 0x201820, 1.1));
const sun = new THREE.DirectionalLight(0xfff0dd, 1.2);
sun.position.set(-3, 5, 4);
scene.add(sun);
{
  const n = 1400, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 25 + Math.random() * 25, a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.5;
    p[i * 3] = r * Math.cos(e) * Math.cos(a); p[i * 3 + 1] = r * Math.sin(e) - 2; p[i * 3 + 2] = r * Math.cos(e) * Math.sin(a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb0e0, size: 0.06, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.6 })));
  const gg = new THREE.CircleGeometry(2.2, 64);
  gg.rotateX(-Math.PI / 2);
  scene.add(new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: 0x15121c, roughness: 1 })));
}
const projPx = () => innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));   // пикселей на единицу на расстоянии 1

// ---------------------------------------------------------------- листья: издали свечение, вблизи — чёткие кружки
const leafGeo = new THREE.BufferGeometry();
leafGeo.setAttribute('position', new THREE.BufferAttribute(viewPos.tree.slice(), 3));
leafGeo.setAttribute('aTo', new THREE.BufferAttribute(viewPos.tree.slice(), 3));
leafGeo.setAttribute('aGal', new THREE.BufferAttribute(Float32Array.from(gal), 1));
leafGeo.setAttribute('aCon', new THREE.BufferAttribute(Float32Array.from(con), 1));
leafGeo.setAttribute('aDay', new THREE.BufferAttribute(Float32Array.from(day), 1));
leafGeo.setAttribute('aChan', new THREE.BufferAttribute(Float32Array.from(chan), 1));
leafGeo.setAttribute('aVid', new THREE.BufferAttribute(Float32Array.from(vid), 1));
leafGeo.setAttribute('aHit', new THREE.BufferAttribute(new Float32Array(N), 1));
const conTex = new THREE.DataTexture(new Float32Array(NC * 4).fill(1), NC, 1, THREE.RGBAFormat, THREE.FloatType);
conTex.needsUpdate = true;
const U = {
  uMorph: { value: 0 }, uTime: { value: 0 }, uWind: { value: 1 }, uPix: { value: renderer.getPixelRatio() },
  uProj: { value: projPx() }, uLeaf: { value: 0.006 }, uNear: { value: 1.25 }, uMode: { value: 0 },
  uGalColors: { value: gcol }, uGalW: { value: new Array(NG).fill(1) }, uConTex: { value: conTex }, uNC: { value: NC },
  uRange: { value: new THREE.Vector2(0, dayMax) }, uRangeOn: { value: 0 }, uDayMax: { value: dayMax },
  uChan0: { value: new THREE.Color(232 / 255, 168 / 255, 80 / 255) }, uChan1: { value: new THREE.Color(90 / 255, 180 / 255, 230 / 255) },
  uFlat: { value: 0 }, uBright: { value: 1 }, uPass: { value: 0 }, uVid: { value: -1 }, uVidOn: { value: 0 }, uVidDim: { value: 0 }, uSearchOn: { value: 0 },
  uSizeK: { value: 1 }, uFireK: { value: 1 }, uFogA: { value: 8 }, uFogB: { value: 18 },
};
const leafVS = `
  attribute vec3 aTo; attribute float aGal, aCon, aDay, aChan, aVid, aHit;
  uniform float uMorph, uTime, uWind, uPix, uProj, uLeaf, uNear, uMode, uNC, uRangeOn, uDayMax, uFlat, uVid, uVidOn, uVidDim, uSearchOn, uSizeK, uFogA, uFogB;
  uniform vec3 uGalColors[${NG}]; uniform float uGalW[${NG}]; uniform sampler2D uConTex; uniform vec2 uRange;
  uniform vec3 uChan0, uChan1;
  varying vec3 vCol; varying float vA; varying float vNear; varying float vSel; varying float vFog;
  void main() {
    vec3 p = mix(position, aTo, uMorph);
    float dist0 = -(modelViewMatrix * vec4(p, 1.0)).z;
    float near = 1.0 - smoothstep(uNear * 0.55, uNear, dist0);
    float amp = uWind * 0.007 * smoothstep(0.7, 2.6, p.y) * (1.0 - 0.9 * near);
    p.x += amp * sin(uTime * 1.3 + p.y * 3.1 + aCon * 0.37);
    p.z += amp * cos(uTime * 1.1 + p.y * 2.7 + aCon * 0.21);
    if (uFlat > 0.5) p.y = 0.004;
    int gi = int(aGal + 0.5);
    float w = 1.0;
    for (int i = 0; i < ${NG}; i++) { if (i == gi) { w = uGalW[i]; vCol = uGalColors[i]; } }
    w *= texture2D(uConTex, vec2((aCon + 0.5) / uNC, 0.5)).r;
    float inR = step(uRange.x, aDay) * step(aDay, uRange.y);
    w *= mix(1.0, mix(0.1, 1.0, inR), uRangeOn);
    w *= mix(1.0, mix(0.12, 1.0, aHit), uSearchOn * (1.0 - uVidDim));   // в ролике — все его фрагменты, не только находки
    float isV = 1.0 - step(0.5, abs(aVid - uVid));
    w *= mix(1.0, mix(0.05, 1.0, isV), uVidOn);
    w = mix(w, 1.0, isV * uVidDim);                // в ролике его листья — всегда полностью (выбор, окно, поиск не гасят)
    vSel = isV * uVidOn;
    if (uMode > 0.5 && uMode < 1.5) {
      float a = aDay / uDayMax;
      vCol = mix(vec3(0.85, 0.42, 0.16), vec3(0.95, 0.80, 0.30), smoothstep(0.0, 0.55, a));
      vCol = mix(vCol, vec3(0.45, 0.95, 0.45), smoothstep(0.55, 1.0, a));
    } else if (uMode > 1.5) {
      vCol = aChan < 0.5 ? uChan0 : uChan1;
    }
    vCol = mix(vCol, vec3(1.0), vSel * 0.35);
    vA = w; vNear = max(near, vSel * uVidDim) * (1.0 - uFlat);   // листья ролика — чёткими кружками и издали
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float vv = vSel * uVidDim;                         // ролик: его листья крупнее (не меньше 6 пикселей)
    float px = uLeaf * uProj / max(0.04, -mv.z) * (1.0 + 0.7 * vSel + 0.6 * vv);
    gl_PointSize = clamp(px, 2.0 + 4.0 * vv, 15.0 + 6.0 * vv) * uSizeK * uPix * (0.6 + 0.4 * min(w, 1.0));
    vFog = smoothstep(uFogA, uFogB, -mv.z);
    vA *= 1.0 - vFog;
  }`;
const leafFS = `
  uniform float uBright, uPass; varying vec3 vCol; varying float vA; varying float vNear; varying float vSel; varying float vFog;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    if (uPass < 0.5) {                                   // свечение (издали), гаснет вблизи
      float a = smoothstep(0.5, 0.0, r) * vA * (1.0 - vNear);
      if (a < 0.003) discard;
      gl_FragColor = vec4(vCol * a * 0.22 * uBright, 1.0);
    } else {                                             // чёткий кружок с тёмной каёмкой (вблизи)
      if (vNear < 0.05 || vA < 0.3 || vFog > 0.97) discard;
      float ring = smoothstep(0.34, 0.47, r);
      vec3 c = mix(vCol * (0.75 + 0.25 * vNear) * clamp(uBright, 0.45, 1.5), vec3(0.03, 0.05, 0.09), ring * 0.9);
      gl_FragColor = vec4(mix(c, vec3(0.043, 0.071, 0.133), vFog), 1.0);
    }
  }`;
const glowMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: leafVS, fragmentShader: leafFS,
  blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
const discU = { ...U, uPass: { value: 1 } };
const discMat = new THREE.ShaderMaterial({ uniforms: discU, vertexShader: leafVS, fragmentShader: leafFS,
  depthWrite: true, depthTest: true, transparent: false });
const leaves = new THREE.Points(leafGeo, glowMat);
const leafDiscs = new THREE.Points(leafGeo, discMat);
leaves.frustumCulled = leafDiscs.frustumCulled = false;
leafDiscs.renderOrder = -1;
scene.add(leafDiscs, leaves);
const shadowMat = new THREE.ShaderMaterial({ uniforms: { ...U, uFlat: { value: 1 }, uBright: { value: 0.18 } },
  vertexShader: leafVS, fragmentShader: leafFS, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
const shadow = new THREE.Points(leafGeo, shadowMat);
shadow.frustumCulled = false;
scene.add(shadow);

// ---------------------------------------------------------------- ветви (объёмные трубки), три вида
function tube(flat, radii, seg = 7) {
  const n = radii.length, pts = [];
  for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]));
  const pos = [], nor = [], idx = [];
  let prevN = null;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const T = new THREE.Vector3().subVectors(b, a).normalize();
    let Nn = prevN ? prevN.clone().sub(T.clone().multiplyScalar(prevN.dot(T))) : new THREE.Vector3(1, 0, 0).cross(T);
    if (Nn.lengthSq() < 1e-8) Nn = new THREE.Vector3(0, 0, 1).cross(T);
    Nn.normalize();
    prevN = Nn;
    const B = new THREE.Vector3().crossVectors(T, Nn);
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const dir = new THREE.Vector3().addScaledVector(Nn, c).addScaledVector(B, s);
      pos.push(pts[i].x + dir.x * radii[i], pts[i].y + dir.y * radii[i], pts[i].z + dir.z * radii[i]);
      nor.push(dir.x, dir.y, dir.z);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
const BARK = new THREE.Color(0x3a2f48);
// заметность ветвей (поправка автора 03.10): «Дерево»/«Куст» — темы и ветки толще (×R) и ярче (доля цвета K, свечение E);
// «Цилиндр» — столбы тем тоньше (Rmin…Rmax) и ярче
const WOOD = { gR: 1.7, cR: 2.0, gK: 0.55, cK: 0.6, gE: 0.18, cE: 0.15, cylGK: 0.8, cylGE: 0.2, cylGRmin: 0.0012, cylGRmax: 0.038 };
function barkMat(c, k, em = 0.05) {
  const m = new THREE.MeshStandardMaterial({ color: BARK.clone().lerp(c, k), roughness: 0.85, metalness: 0, transparent: true, opacity: 1 });
  m.emissive = c.clone().multiplyScalar(em);
  m.userData.em = em;                            // свечение «в покое» (подсветка при наведении возвращается к нему)
  return m;
}
// «Цилиндр»: столбы тем и созвездий — толщина по числу фрагментов в каждом месяце (скользящее среднее за 3 месяца)
function pillar(b, life, rMin, rMax, lifeMax) {
  const x = b.p[0], z = b.p[2], mh = meta.month_h, n = life.length, p = [], r = [];
  let first = life.findIndex((v) => v > 0), last = n - 1 - [...life].reverse().findIndex((v) => v > 0);
  if (first < 0) return null;
  for (let m = first; m <= last; m++) {
    const v = ((life[m - 1] || 0) + 2 * life[m] + (life[m + 1] || 0)) / 4;
    p.push(x, ((mh[m] + mh[m + 1]) / 2) * meta.H, z);
    r.push(rMin + (rMax - rMin) * Math.pow(v / lifeMax, 0.7));
  }
  if (p.length < 6) { p.push(x, p[1] + 0.01, z); r.push(r[0]); }
  return { p, r };
}
const lifeMaxG = Math.max(...meta.life_g.flat()), lifeMaxC = Math.max(...meta.life_c.flat());
const woodRoot = new THREE.Group();             // все ветви — одним узлом (кнопка «ветви»)
scene.add(woodRoot);
S.woodK = 1;
const views = {};
for (const vname of VIEWS) {
  const sk = meta.skeleton[vname], grp = new THREE.Group(), V = { group: grp, g: [], c: [], fade: vname === 'tree' ? 1 : 0 };
  const cyl = vname === 'cyl';
  if (sk.trunk) grp.add(new THREE.Mesh(tube(sk.trunk.p, sk.trunk.r, 12), barkMat(new THREE.Color(0x5a4a6a), 0.3)));
  sk.g.forEach((b, i) => {
    const bb = b && cyl ? pillar(b, meta.life_g[i], WOOD.cylGRmin, WOOD.cylGRmax, lifeMaxG) : b;
    if (!bb) { V.g.push(null); return; }
    const m = new THREE.Mesh(tube(bb.p, cyl ? bb.r : bb.r.map((r) => r * WOOD.gR), 9),
      cyl ? barkMat(gcol[i], WOOD.cylGK, WOOD.cylGE) : barkMat(gcol[i], WOOD.gK, WOOD.gE));
    m.userData = { level: 'g', i };
    grp.add(m); V.g.push(m);
  });
  sk.c.forEach((b, i) => {
    const bb = b && cyl ? pillar(b, meta.life_c[i], 0.0006, 0.024, lifeMaxC) : b;
    if (!bb) { V.c.push(null); return; }
    const m = new THREE.Mesh(tube(bb.p, cyl ? bb.r : bb.r.map((r) => r * WOOD.cR), 6),
      cyl ? barkMat(gcol[meta.constellations[i].g], 0.55) : barkMat(gcol[meta.constellations[i].g], WOOD.cK, WOOD.cE));
    m.userData = { level: 'c', i };
    grp.add(m); V.c.push(m);
  });
  const lp = [];
  (sk.k || []).forEach((b) => {
    if (!b) return;
    for (let j = 0; j < b.r.length - 1; j++) lp.push(b.p[j * 3], b.p[j * 3 + 1], b.p[j * 3 + 2], b.p[j * 3 + 3], b.p[j * 3 + 4], b.p[j * 3 + 5]);
  });
  if (lp.length) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const tw = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3a3050, transparent: true, opacity: 0.55 }));
    tw.userData.selOp = 0.55;
    grp.add(tw);
  }
  if (vname !== 'cyl') {
    [[-1, 0], [1, 1]].forEach(([side, ci]) => {
      const p = [], r = [];
      for (let j = 0; j <= 10; j++) { const u = j / 10; p.push(side * (0.02 + u * 0.55), -0.004 - u * u * 0.05, (ci ? 0.08 : -0.06) * u); r.push(0.03 * (1 - u) + 0.002); }
      grp.add(new THREE.Mesh(tube(p, r, 8), barkMat(ci ? U.uChan1.value : U.uChan0.value, 0.35)));
    });
  }
  grp.visible = vname === 'tree';
  woodRoot.add(grp);
  views[vname] = V;
}
function fadeGroup(V) { const k = S.video ? 0.12 : 1; V.group.traverse((o) => { if (o.material) o.material.opacity = (o.userData.selOp ?? 1) * V.fade * S.woodK * k; }); }

// годы и подписи тем
const yearLabels = [];
for (const y of meta.years) {
  const h = y.h * meta.H, pts = [];
  for (let j = 0; j <= 96; j++) { const a = (j / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 1.55, h, Math.sin(a) * 1.55)); }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8f9bc0, transparent: true, opacity: 0.14 })));
  const el = document.createElement('div');
  el.className = 'yr'; el.textContent = y.y;
  document.body.appendChild(el);
  yearLabels.push({ el, p: new THREE.Vector3(-1.58, h, 0) });
}
function labelAnchor(P, i) {
  let x = 0, y = 0, z = 0, n = 0;
  for (let k = 0; k < N; k += 7) if (gal[k] === i) { x += P[k * 3]; y += P[k * 3 + 1]; z += P[k * 3 + 2]; n++; }
  const r = Math.hypot(x, z) || 1;
  return new THREE.Vector3((x / r) * 1.22, y / Math.max(1, n) + 0.12, (z / r) * 1.22);
}
const themeLabels = meta.galaxies.map((g, i) => {
  const el = document.createElement('div');
  el.className = 'lab'; el.textContent = g.name; el.style.color = `rgb(${g.color.join(',')})`;
  document.body.appendChild(el);
  const a = {};
  for (const v of VIEWS) a[v] = labelAnchor(viewPos[v], i);
  return { el, i, a, p: new THREE.Vector3() };
});
const cylAt = meta.galaxies.map((g, i) => {      // ролик: подписи тем — в его плоскости, у столбов своих тем («Цилиндр»)
  const b = meta.skeleton.cyl.g[i];
  if (b) return new THREE.Vector2(b.p[0], b.p[2]);
  let x = 0, z = 0, n = 0;
  for (let k = 0; k < N; k += 7) if (gal[k] === i) { x += viewPos.cyl[k * 3]; z += viewPos.cyl[k * 3 + 2]; n++; }
  return new THREE.Vector2(x / Math.max(1, n), z / Math.max(1, n));
});

// ---------------------------------------------------------------- выделение
function weights() {
  const anyG = S.selG.size > 0, anyC = S.selC.size > 0, dim = S.dimOthers;
  const gw = meta.galaxies.map((_, i) => {
    if (S.hidG.has(i)) return 0;
    if (anyC) return [...S.selC].some((c) => meta.constellations[c].g === i) ? 1 : dim;
    return !anyG || S.selG.has(i) ? 1 : dim;
  });
  const cw = meta.constellations.map((c, i) => (S.hidC.has(i) ? 0 : anyC ? (S.selC.has(i) ? 1 : dim) : 1));
  return { gw, cw };
}
function applySel() {
  const { gw, cw } = weights();
  U.uGalW.value = gw;
  const t = conTex.image.data;
  for (let i = 0; i < NC; i++) { const g = meta.constellations[i].g; t[i * 4] = gw[g] > 0 ? Math.min(1, cw[i] / gw[g]) : 0; }
  conTex.needsUpdate = true;
  for (const V of Object.values(views)) {
    V.g.forEach((m, i) => { if (m) { m.userData.selOp = Math.max(0.04, gw[i]); m.visible = gw[i] > 0; } });
    V.c.forEach((m, i) => {
      if (!m) return;
      const g = meta.constellations[i].g, w = gw[g] * Math.min(1, cw[i] / Math.max(gw[g], 1e-6));
      m.userData.selOp = Math.max(0.04, w); m.visible = w > 0;
    });
    fadeGroup(V);
  }
  themeLabels.forEach((L) => { L.el.style.opacity = S.video ? 0.62 : gw[L.i] >= 1 ? 1 : 0.25; });
  updateConLabels();
  renderList();
  if (S.search) { styleVine(); searchStatus(); }
  if (typeof drawRuler === 'function' && rc) drawRuler();
}
function selectG(i, add) { S.selC.clear(); if (!add) S.selG.clear(); if (S.selG.has(i) && add) S.selG.delete(i); else S.selG.add(i); applySel(); showRow(); }
function selectC(i, add) {
  S.selG.clear(); if (!add) S.selC.clear(); if (S.selC.has(i) && add) S.selC.delete(i); else S.selC.add(i);
  expanded.add(meta.constellations[i].g);        // панель: раскрыть тему выбранного созвездия
  applySel(); showRow();
}
function showRow() { const r = document.querySelector('#list .row.sel'); if (r) r.scrollIntoView({ block: 'nearest' }); }
function showAll() { S.selG.clear(); S.selC.clear(); S.hidG.clear(); S.hidC.clear(); applySel(); }

// ---------------------------------------------------------------- панель «Ветви»
function spark(cv, life, color) {
  const w = cv.width = 184, h = cv.height = 40, c = cv.getContext('2d'), m = life.reduce((a, b) => Math.max(a, b), 1);
  c.clearRect(0, 0, w, h);
  c.fillStyle = color;
  const n = life.length;
  for (let k = 0; k < n; k++) { const v = life[k] / m; c.fillRect((k / n) * w, h - v * h, w / n + 0.5, v * h); }
}
const expanded = new Set();
function renderList() {
  const q = $('find').value.trim().toLowerCase(), list = $('list');
  list.innerHTML = '';
  const order = meta.galaxies.map((g, i) => i).sort((a, b) => meta.galaxies[b].size - meta.galaxies[a].size);
  for (const i of order) {
    const g = meta.galaxies[i];
    const cons = meta.constellations.map((c, k) => k).filter((k) => meta.constellations[k].g === i)
      .sort((a, b) => meta.constellations[b].size - meta.constellations[a].size);
    const match = (s) => !q || s.toLowerCase().includes(q);
    const consShown = cons.filter((k) => match(meta.constellations[k].name));
    if (q && !match(g.name) && !consShown.length) continue;
    const open = expanded.has(i) || (q && consShown.length);
    list.appendChild(row('g', i, g.name, `rgb(${g.color.join(',')})`, meta.life_g[i], g.size, open));
    if (open) for (const k of (q && !match(g.name) ? consShown : cons)) {
      list.appendChild(row('c', k, meta.constellations[k].name, `rgb(${g.color.join(',')})`, meta.life_c[k], meta.constellations[k].size));
    }
  }
}
function row(level, i, name, color, life, size, open) {
  const el = document.createElement('div');
  const sel = level === 'g' ? S.selG.has(i) : S.selC.has(i), hid = level === 'g' ? S.hidG.has(i) : S.hidC.has(i);
  el.className = `row ${level}` + (sel ? ' sel' : '') + (hid ? ' off' : '');
  el.title = `${name} — ${size.toLocaleString('ru')} фрагментов; щелчок — выделить, Ctrl+щелчок — добавить, ◉ — скрыть`;
  el.innerHTML = `<span class="tw">${level === 'g' ? (open ? '▾' : '▸') : ''}</span><span class="dot" style="background:${color}"></span>`
    + `<span class="nm"></span><canvas></canvas><span class="eye">${hid ? '○' : '◉'}</span>`;
  el.querySelector('.nm').textContent = name;
  spark(el.querySelector('canvas'), life, color);
  el.querySelector('.tw').onclick = (e) => { e.stopPropagation(); if (level === 'g') { expanded.has(i) ? expanded.delete(i) : expanded.add(i); renderList(); } };
  el.querySelector('.eye').onclick = (e) => { e.stopPropagation(); const H = level === 'g' ? S.hidG : S.hidC; H.has(i) ? H.delete(i) : H.add(i); applySel(); };
  el.onclick = (e) => { (level === 'g' ? selectG : selectC)(i, e.ctrlKey || e.metaKey); flyToNode(level, i); };
  el.onmouseenter = () => hoverNode(level, i, true);
  el.onmouseleave = () => hoverNode(level, i, false);
  return el;
}
function hoverNode(level, i, on) {
  for (const V of Object.values(views)) {
    const m = (level === 'g' ? V.g : V.c)[i];
    if (m) m.material.emissive.copy(gcol[level === 'g' ? i : meta.constellations[i].g]).multiplyScalar(on ? 0.6 : (m.material.userData.em ?? 0.05));
  }
}
$('find').oninput = renderList;
$('all').onclick = showAll;
$('hideOthers').onclick = () => { S.dimOthers = S.dimOthers > 0 ? 0 : 0.07; $('hideOthers').textContent = S.dimOthers > 0 ? 'приглушать' : 'скрывать'; applySel(); };
$('pmin').onclick = () => $('panel').classList.toggle('min');

// ---------------------------------------------------------------- линейка времени
const rc = $('rc');
const months = meta.month_h.length - 1;
const monthTotals = new Array(months).fill(0);
meta.life_g.forEach((life) => life.forEach((v, k) => { monthTotals[k] += v; }));
const PAD = 14;
const hToY = (h) => rc.clientHeight - PAD - h * (rc.clientHeight - 2 * PAD);
const yToH = (y) => Math.min(1, Math.max(0, (rc.clientHeight - PAD - y) / (rc.clientHeight - 2 * PAD)));
const monthOfDay = (k) => { const t = new Date((meta.d0 + k) * 86400000); return (t.getUTCFullYear() - 2022) * 12 + t.getUTCMonth(); };
function dayOfH(h) {
  const mh = meta.month_h;
  let k = 0;
  while (k < mh.length - 2 && mh[k + 1] < h) k++;
  const f = (h - mh[k]) / Math.max(1e-6, mh[k + 1] - mh[k]);
  const d0 = Date.UTC(2022, k, 1) / 86400000 - meta.d0, d1 = Date.UTC(2022, k + 1, 1) / 86400000 - meta.d0;
  return Math.max(0, Math.min(dayMax, d0 + f * (d1 - d0)));
}
function hOfDate(d) {                            // дата ГГГГММДД → высота (доля), по месяцам линейки
  d = +d;
  const y = Math.floor(d / 10000), mo = Math.floor(d / 100) % 100, dd = d % 100, mh = meta.month_h;
  const k = Math.max(0, Math.min(months - 1, (y - 2022) * 12 + mo - 1)), dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return mh[k] + ((dd - 1) / dim) * (mh[k + 1] - mh[k]);
}
function drawRuler() {
  rc.width = rc.clientWidth * devicePixelRatio; rc.height = rc.clientHeight * devicePixelRatio;
  const c = rc.getContext('2d');
  c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  const W = rc.clientWidth, mx = monthTotals.reduce((a, b) => Math.max(a, b), 1);
  c.clearRect(0, 0, W, rc.clientHeight);
  const sel = selLife(), hm = S.search ? searchByMonth() : null;
  const smx = sel ? Math.max(1, ...sel.total) : 1, hmx = hm ? Math.max(1, ...hm) : 1;
  for (let k = 0; k < months; k++) {
    const y0 = hToY(meta.month_h[k]), y1 = hToY(meta.month_h[k + 1]), hh = Math.max(1, y0 - y1 - 0.5);
    c.fillStyle = hm || sel ? 'rgba(143,155,192,.18)' : 'rgba(143,155,192,.45)';
    c.fillRect(40, y1, (monthTotals[k] / mx) * (W - 46), hh);
    if (sel && !hm) {                           // частота выбранных тем/созвездий — стопкой, их цветами
      let x = 40;
      for (const it of sel.items) { const w = (it.life[k] / smx) * (W - 46); if (w > 0) { c.fillStyle = it.color; c.fillRect(x, y1, w, hh); x += w; } }
    }
    if (hm && hm[k]) { c.fillStyle = 'rgba(255,214,106,.9)'; c.fillRect(40, y1, (hm[k] / hmx) * (W - 46), hh); }
  }
  if (sel || hm) {
    c.font = '10px Arial'; c.fillStyle = hm ? '#ffd76a' : '#dbe3ff'; c.textAlign = 'right';
    c.fillText(hm ? (sel ? 'находки в выборе' : 'находки') : 'выбор', W - 4, 10);
  }
  c.font = '11px Arial'; c.fillStyle = '#8f9bc0'; c.textAlign = 'left';
  for (const y of meta.years) { const Y = hToY(y.h); c.fillRect(30, Y, 8, 1); c.fillText(y.y, 2, Y + 4); }
  if (S.range) {
    const ya = hToY(S.range[1]), yb = hToY(S.range[0]);
    c.fillStyle = 'rgba(242,193,78,.18)'; c.fillRect(30, ya, W - 30, yb - ya);
    c.fillStyle = '#f2c14e'; c.fillRect(30, ya - 1.5, W - 30, 3); c.fillRect(30, yb - 1.5, W - 30, 3);
    c.fillText(dayToDate(Math.round(dayOfH(S.range[1]))), 34, ya - 5);
    c.fillText(dayToDate(Math.round(dayOfH(S.range[0]))), 34, yb + 13);
  }
  if (S.answers) {                               // ответы поиска — голубые метки с местом в выдаче
    c.font = 'bold 9px Arial'; c.textAlign = 'right'; c.fillStyle = '#8fd8ff';
    for (const it of S.answers.items) { const Y = hToY(hOfDate(meta.videos[vid[it.i]].d)); c.fillRect(W - 14, Y - 1, 12, 2); c.fillText(it.rank, W - 16, Y + 3); }
  }
  if (S.video) {                                 // дата ролика — белая черта с меткой
    const d = meta.videos[S.video.v].d, Y = hToY(hOfDate(d));
    c.fillStyle = '#ffffff'; c.fillRect(30, Y - 1, W - 30, 2);
    c.beginPath(); c.moveTo(22, Y - 5); c.lineTo(30, Y); c.lineTo(22, Y + 5); c.fill();
    c.font = 'bold 10px Arial'; c.textAlign = 'right'; c.fillText(fmtDate(d), W - 3, Y < 16 ? Y + 12 : Y - 4);
  }
}
function selLife() {                           // выбранные темы/созвездия: кривые жизни по месяцам
  const items = [];
  if (S.selC.size) for (const k of S.selC) items.push({ life: meta.life_c[k], color: `rgb(${meta.galaxies[meta.constellations[k].g].color.join(',')})` });
  else if (S.selG.size) for (const g of S.selG) items.push({ life: meta.life_g[g], color: `rgb(${meta.galaxies[g].color.join(',')})` });
  if (!items.length) return null;
  const total = new Array(months).fill(0);
  for (const it of items) for (let k = 0; k < months; k++) total[k] += it.life[k] || 0;
  return { items, total };
}
function searchByMonth() {                     // находки поиска по месяцам — с учётом выбора тем/созвездий (без окна)
  const s = S.search, key = [...S.selG, '|', ...S.selC, '|', ...S.hidG, '|', ...S.hidC].join(',');
  if (s.bmKey === key) return s.bmSel;
  const W = weights(), out = new Array(months).fill(0);
  for (const i of s.hits) {
    if (W.gw[gal[i]] * Math.min(1, W.cw[con[i]] / Math.max(W.gw[gal[i]], 1e-6)) < 0.5) continue;
    out[Math.max(0, Math.min(months - 1, monthOfDay(day[i])))]++;
  }
  s.bmKey = key; s.bmSel = out;
  return out;
}
function setRange(r) {
  S.range = r;
  if (r) { U.uRange.value.set(dayOfH(r[0]), dayOfH(r[1])); U.uRangeOn.value = 1; } else U.uRangeOn.value = 0;
  $('rreset').style.display = r ? 'block' : 'none';
  drawRuler();
  if (S.search) { styleVine(); searchStatus(); }
}
$('rreset').onclick = () => { S.playing = false; $('play').textContent = '▶ время'; setRange(null); };
{
  let drag = null;
  rc.addEventListener('pointerdown', (e) => {
    const h = yToH(e.offsetY);
    if (S.range && Math.abs(hToY(S.range[1]) - e.offsetY) < 8) drag = { kind: 'top' };
    else if (S.range && Math.abs(hToY(S.range[0]) - e.offsetY) < 8) drag = { kind: 'bot' };
    else if (S.range && h > S.range[0] && h < S.range[1]) drag = { kind: 'move', h0: h, r0: S.range.slice() };
    else { drag = { kind: 'new', h0: h }; setRange([h, h]); }
    rc.setPointerCapture(e.pointerId);
  });
  rc.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const h = yToH(e.offsetY);
    if (drag.kind === 'top') setRange([Math.min(S.range[0], h), Math.max(S.range[0], h)]);
    else if (drag.kind === 'bot') setRange([Math.min(S.range[1], h), Math.max(S.range[1], h)]);
    else if (drag.kind === 'new') setRange([Math.min(drag.h0, h), Math.max(drag.h0, h)]);
    else { const d = h - drag.h0, len = drag.r0[1] - drag.r0[0], a = Math.max(0, Math.min(1 - len, drag.r0[0] + d)); setRange([a, a + len]); }
  });
  rc.addEventListener('pointerup', () => { if (drag && drag.kind === 'new' && S.range[1] - S.range[0] < 0.004) setRange(null); drag = null; });
  rc.addEventListener('dblclick', () => setRange(null));
}
$('play').onclick = () => {
  if (S.playing) { S.playing = false; $('play').textContent = '▶ время'; return; }
  const len = S.range ? Math.max(0.03, S.range[1] - S.range[0]) : 0.06;
  setRange([0, len]);
  S.playing = true; $('play').textContent = '❚❚ стоп';
};

// ---------------------------------------------------------------- виды, окраска, кнопки
function setView(v) {
  if (S.morphTo) { S.queued = v; return; }       // во время перетекания — после него
  if (v === S.view) return;
  leafGeo.attributes.aTo.array.set(viewPos[v]);
  leafGeo.attributes.aTo.needsUpdate = true;
  S.morphTo = v; S.morphT0 = performance.now();
  views[v].group.visible = true;
  hideOverlays(true);
  [['vTree', 'tree'], ['vBush', 'bush'], ['vCyl', 'cyl']].forEach(([id, x]) => $(id).classList.toggle('on', x === v));
}
$('vTree').onclick = () => setView('tree');
$('vBush').onclick = () => setView('bush');
$('vCyl').onclick = () => setView('cyl');
[['cTheme', 0], ['cAge', 1], ['cChan', 2]].forEach(([id, m]) => {
  $(id).onclick = () => { U.uMode.value = m; ['cTheme', 'cAge', 'cChan'].forEach((x) => $(x).classList.toggle('on', x === id)); };
});
$('wind').onclick = () => { U.uWind.value = U.uWind.value ? 0 : 1; $('wind').classList.toggle('on', !!U.uWind.value); };
$('wood').onclick = () => { woodRoot.visible = !woodRoot.visible; $('wood').classList.toggle('on', woodRoot.visible); };
$('setBtn').onclick = () => { const s = $('set'); s.style.display = s.style.display === 'block' ? 'none' : 'block'; $('setBtn').classList.toggle('on', s.style.display === 'block'); };
$('setX').onclick = () => { $('set').style.display = 'none'; $('setBtn').classList.remove('on'); };
$('sVine').oninput = () => {                     // лиана: период узлов 1 / 2 / 3 / 6 / 12 мес.
  S.vineP = VINE_P[+$('sVine').value]; $('oVine').textContent = S.vineP + ' мес.';
  if (S.search) { stopTour(); computeKnots(); buildVine(); searchStatus(); }
};
[['sBright', 'oBright', (v) => { U.uBright.value = v; }],
 ['sSize', 'oSize', (v) => { U.uSizeK.value = v; }],
 ['sWood', 'oWood', (v) => { S.woodK = v; Object.values(views).forEach(fadeGroup); }],
 ['sFire', 'oFire', (v) => { U.uFireK.value = v; buildVine(); }],
 ['sShadow', 'oShadow', (v) => { shadowMat.uniforms.uBright.value = 0.18 * v; }],
 ['sFog', 'oFog', (v) => { S.fog = v; }]].forEach(([id, out, f]) => {
  $(id).oninput = () => { const v = +$(id).value; $(out).textContent = v.toFixed(v < 1 && (id === 'sWood' || id === 'sFog') ? 2 : 1); f(v); };
});
S.fog = 0.3;
$('sPersp').value = ((camera.fov - 6) / 74).toFixed(2);
$('oPersp').textContent = Math.round(camera.fov) + '°';
$('sPersp').oninput = () => {                    // перспектива: угол обзора 6…80°, кадр сохраняется (расстояние — обратно тангенсу)
  const fov = 6 + 74 * +$('sPersp').value;
  const k = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const off = camera.position.clone().sub(controls.target).multiplyScalar(k);
  camera.position.copy(controls.target).add(off);
  camera.fov = fov; camera.far = Math.max(100, off.length() * 4); camera.updateProjectionMatrix();
  controls.maxDistance = Math.max(14, 14 * Math.tan(THREE.MathUtils.degToRad(21)) / Math.tan(THREE.MathUtils.degToRad(fov / 2)));
  U.uProj.value = projPx();
  $('oPersp').textContent = Math.round(fov) + '°';
};
$('shadow').onclick = () => { shadow.visible = !shadow.visible; $('shadow').classList.toggle('on', shadow.visible); };
$('home').onclick = () => flyTo(HOME.pos, HOME.target);

// ---------------------------------------------------------------- камера
let fly = null;
function flyTo(pos, target, ms = 1100) { fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), s: performance.now(), ms }; }
function flyNear(p, dist) {
  const dir = camera.position.clone().sub(controls.target).normalize();
  flyTo(p.clone().add(dir.multiplyScalar(dist)), p.clone());
}
function flyToNode(level, i) {
  const sel = level === 'g' ? gal : con, P = curPos();
  let x = 0, y = 0, z = 0, n = 0;
  for (let k = 0; k < N; k += 3) if (sel[k] === i) { x += P[k * 3]; y += P[k * 3 + 1]; z += P[k * 3 + 2]; n++; }
  if (n) flyNear(new THREE.Vector3(x / n, y / n, z / n), Math.max(camera.position.distanceTo(controls.target), level === 'g' ? 4.6 : 3.4));
}

// ---------------------------------------------------------------- поиск: светлячки, лиана, «▶ сюжет»
let SW = null;
async function loadSearch() {
  if (SW) return SW;
  const [words, bin] = await Promise.all([fetch(DATA + 'search_words.json').then((r) => r.json()), fetch(DATA + 'search.bin').then((r) => r.arrayBuffer())]);
  SW = { words, offs: new Uint32Array(bin, 0, words.length + 1), post: new Uint32Array(bin, (words.length + 1) * 4) };
  return SW;
}
function prefixSet(q) {
  const { words, offs, post } = SW, set = new Uint8Array(N);
  let lo = 0, hi = words.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (words[m] < q) lo = m + 1; else hi = m; }
  for (let j = lo; j < words.length && words[j].startsWith(q); j++) for (let k = offs[j]; k < offs[j + 1]; k++) set[post[k]] = 1;
  return set;
}
const fireGeo = new THREE.BufferGeometry();
// светлячки: кружат и мерцают только при «ветре»; гаснут вне окна времени и вне выбранных тем/созвездий
const fireMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.uTime, uPix: U.uPix, uProj: U.uProj, uWind: U.uWind, uRange: U.uRange, uRangeOn: U.uRangeOn,
    uGalW: U.uGalW, uConTex: U.uConTex, uNC: U.uNC, uFireK: U.uFireK, uFogA: U.uFogA, uFogB: U.uFogB, uVidDim: U.uVidDim },
  vertexShader: `attribute float aPh, aDay, aGal, aCon; uniform float uTime, uPix, uProj, uWind, uRangeOn, uNC, uFireK, uFogA, uFogB, uVidDim;
    uniform vec2 uRange; uniform float uGalW[${NG}]; uniform sampler2D uConTex; varying float vP;
    void main() {
      vec3 p = position + uWind * 0.012 * vec3(sin(uTime * 1.7 + aPh), 0.5 * sin(uTime * 1.3 + aPh * 1.7), cos(uTime * 1.7 + aPh));
      vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
      int gi = int(aGal + 0.5); float w = 1.0;
      for (int i = 0; i < ${NG}; i++) { if (i == gi) w = uGalW[i]; }
      w *= texture2D(uConTex, vec2((aCon + 0.5) / uNC, 0.5)).r;
      float inR = step(uRange.x, aDay) * step(aDay, uRange.y);
      w *= mix(1.0, mix(0.06, 1.0, inR), uRangeOn);
      vP = w * mix(1.0, 0.65 + 0.35 * sin(uTime * 3.0 + aPh * 2.3), uWind) * (1.0 - smoothstep(uFogA, uFogB, -mv.z)) * (1.0 - 0.94 * uVidDim);
      gl_PointSize = clamp(0.016 * uProj / max(0.05, -mv.z), 4.0, 26.0) * uPix * uFireK * (0.5 + 0.5 * min(w, 1.0)); }`,
  fragmentShader: `varying float vP; void main() { if (vP < 0.02) discard; float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
      float core = smoothstep(0.22, 0.0, r), halo = smoothstep(0.5, 0.0, r) * 0.35;
      gl_FragColor = vec4(vec3(1.0, 0.86, 0.45) * (core + halo) * vP, 1.0); }`,
  blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
});
const fireflies = new THREE.Points(fireGeo, fireMat);
fireflies.frustumCulled = false;
fireflies.visible = false;
scene.add(fireflies);
const vineGroup = new THREE.Group();
scene.add(vineGroup);
function buildFireflies() {
  if (!S.search) { fireflies.visible = false; return; }
  const P = curPos(), H = S.search.hits, n = H.length, pos = new Float32Array(n * 3);
  const ph = new Float32Array(n), dd = new Float32Array(n), gg = new Float32Array(n), cc = new Float32Array(n);
  H.forEach((i, k) => {
    pos[k * 3] = P[i * 3]; pos[k * 3 + 1] = P[i * 3 + 1]; pos[k * 3 + 2] = P[i * 3 + 2];
    ph[k] = (i * 0.618) % 6.283; dd[k] = day[i]; gg[k] = gal[i]; cc[k] = con[i];
  });
  fireGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  fireGeo.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  fireGeo.setAttribute('aDay', new THREE.BufferAttribute(dd, 1));
  fireGeo.setAttribute('aGal', new THREE.BufferAttribute(gg, 1));
  fireGeo.setAttribute('aCon', new THREE.BufferAttribute(cc, 1));
  fireGeo.computeBoundingSphere();
  fireflies.visible = true;
}
function buildVine() {                          // лиана: толщина и прозрачность — по числу находок периода (плавно между узлами)
  disposeKids(vineGroup);
  if (!S.search || S.search.knots.length < 2) return;
  const k = U.uFireK.value, s = S.search, pts = s.knots.map((i) => leafVec(i)), n = pts.length;
  const wmax = Math.max(1, ...s.knotW), wk = s.knotW.map((w) => Math.sqrt(w / wmax));     // 0…1
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const tub = n * 14, rad = 6, geo = new THREE.TubeGeometry(curve, tub, 0.0055 * k, rad, false);
  const pos = geo.attributes.position, ca = new Float32Array(pos.count * 4), base = new THREE.Color(0xf2c14e);
  const c0 = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= tub; i++) {
    const u = i / tub, x = curve.getUtoTmapping(u) * (n - 1), j = Math.min(n - 2, Math.floor(x)), f = x - j;
    const w = wk[j] + (wk[j + 1] - wk[j]) * f * f * (3 - 2 * f), sc = 0.6 + 0.8 * w, al = 0.5 + 0.45 * w;
    curve.getPointAt(u, c0);
    for (let r = 0; r <= rad; r++) {
      const q = i * (rad + 1) + r;
      v.fromBufferAttribute(pos, q).sub(c0).multiplyScalar(sc).add(c0);
      pos.setXYZ(q, v.x, v.y, v.z);
      ca[q * 4] = base.r; ca[q * 4 + 1] = base.g; ca[q * 4 + 2] = base.b; ca[q * 4 + 3] = al;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(ca, 4));
  vineGroup.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false })));
  s.knots.forEach((i, j) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.015 * k * (0.75 + 0.5 * wk[j]), 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true }));
    m.position.copy(pts[j]); m.userData = { knot: j, leaf: i };
    vineGroup.add(m);
  });
  styleVine();
}
function leafOn(i, W) {                         // лист в окне времени и в выбранных темах/созвездиях (W = weights())
  const inR = !U.uRangeOn.value || (day[i] >= U.uRange.value.x && day[i] <= U.uRange.value.y);
  return inR && W.gw[gal[i]] * Math.min(1, W.cw[con[i]] / Math.max(W.gw[gal[i]], 1e-6)) >= 0.5;
}
function styleVine() {                          // узлы лианы вне окна времени / вне выбора — бледные; при ролике гаснет вся лиана
  const W = weights(), vk = S.video ? 0.12 : 1;
  for (const o of vineGroup.children) o.material.opacity = vk * (o.userData.knot === undefined ? 1 : leafOn(o.userData.leaf, W) ? 1 : 0.18);
}
function searchStatus() {
  if (!S.search) return;
  const s = S.search, filt = U.uRangeOn.value || S.selG.size || S.selC.size || S.hidG.size || S.hidC.size;
  let inWin = 0;
  const W = weights();
  if (filt) for (const i of s.hits) if (leafOn(i, W)) inWin++;
  $('sstat').innerHTML = `«${esc(s.text)}»: ${s.hits.length.toLocaleString('ru')} фрагментов в ${s.videos} роликах`
    + (filt ? ` · <b>в окне и выборе: ${inWin.toLocaleString('ru')}</b>` : '')
    + ` · лиана — ${s.knots.length} узлов (${s.period})${s.hint || ''}`
    + ` <button id="tourBtn">▶ сюжет</button>`;
  $('tourBtn').onclick = startTour;
  const a = $('stemA');
  if (a) a.onclick = () => { $('q').value = a.dataset.q; runSearch(a.dataset.q); };
}
const ENDINGS = ['иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ость', 'ости', 'ий', 'ый', 'ой', 'ая', 'яя',
  'ое', 'ее', 'ые', 'ие', 'ов', 'ев', 'ам', 'ям', 'ах', 'ях', 'ом', 'ем', 'ей', 'ую', 'юю', 'а', 'я', 'ы', 'и', 'е', 'у', 'ю', 'о', 'ь'];
function stem(w) { for (const e of ENDINGS) if (w.endsWith(e) && w.length - e.length >= 4) return w.slice(0, -e.length); return w; }
const VINE_P = [1, 2, 3, 6, 12], VINE_NAME = { 1: 'месяц', 2: '2 месяца', 3: 'квартал', 6: 'полгода', 12: 'год' };
S.vineP = 3;
function computeKnots() {                        // лиана: в каждом периоде («вид…», 1–12 мес.) — ролик с наибольшим числом
  const s = S.search, P = S.vineP, per = new Map(), aH = leafGeo.attributes.aHit.array;   // находок, его первая находка
  for (const i of s.hits) {
    const key = Math.floor(Math.max(0, monthOfDay(day[i])) / P);
    if (!per.has(key)) per.set(key, { n: 0, mv: new Map() });
    const e = per.get(key);
    e.n++; e.mv.set(vid[i], (e.mv.get(vid[i]) || 0) + 1);
  }
  s.knots = []; s.knotW = [];                    // вес узла — число находок его периода
  for (const key of [...per.keys()].sort((a, b) => a - b)) {
    const { n, mv } = per.get(key);
    let best = -1, bc = -1;
    for (const [v, c] of mv) if (c > bc || (c === bc && v < best)) { best = v; bc = c; }
    s.knots.push(videoLeaves[best].find((i) => aH[i])); s.knotW.push(n);
  }
  s.period = VINE_NAME[P];
}
async function runSearch(text) {
  const qs = text.toLowerCase().split(/[^a-zа-яё]+/).filter((w) => w.length >= 3);
  if (!qs.length) { clearSearch(); return; }
  $('sstat').textContent = 'ищу…';
  await loadSearch();
  let m = null;
  for (const q of qs) { const s = prefixSet(q); if (!m) m = s; else for (let i = 0; i < N; i++) m[i] &= s[i]; }
  const hits = [];
  for (let i = 0; i < N; i++) if (m[i]) hits.push(i);
  const aHit = leafGeo.attributes.aHit;
  aHit.array.fill(0);
  for (const i of hits) aHit.array[i] = 1;
  aHit.needsUpdate = true;
  if (!hits.length) {
    clearSearch(true);
    const st = qs.map(stem).join(' ');
    $('sstat').innerHTML = `«${esc(text)}»: ничего не найдено` + (st !== qs.join(' ')
      ? ` — попробуйте начало слова: <a id="stemA" data-q="${esc(st)}" style="color:var(--accent);cursor:pointer;text-decoration:underline">«${esc(st)}»</a>` : '');
    const a = $('stemA');
    if (a) a.onclick = () => { $('q').value = a.dataset.q; runSearch(a.dataset.q); };
    return;
  }
  const byMonth = new Array(months).fill(0), vids = new Set();
  for (const i of hits) { byMonth[Math.max(0, Math.min(months - 1, monthOfDay(day[i])))]++; vids.add(vid[i]); }
  // слово с окончанием — предложить начало слова (и сколько по нему найдётся)
  let hint = '';
  const stems = qs.map(stem);
  if (stems.join(' ') !== qs.join(' ')) {
    let ms = null;
    for (const q of stems) { const s = prefixSet(q); if (!ms) ms = s; else for (let i = 0; i < N; i++) ms[i] &= s[i]; }
    let ns = 0;
    for (let i = 0; i < N; i++) ns += ms[i];
    if (ns > hits.length) hint = ` · по началу слова <a id="stemA" data-q="${esc(stems.join(' '))}">«${esc(stems.join(' '))}»</a> — ${ns.toLocaleString('ru')}`;
  }
  S.search = { text, hits, byMonth, knots: [], knotW: [], videos: vids.size, period: '', hint };
  computeKnots();
  $('qx').style.display = 'inline-block';
  U.uSearchOn.value = 1;
  buildFireflies(); buildVine(); drawRuler();
  searchStatus();
}
function clearSearch(keepText) {
  S.search = null; stopTour();
  U.uSearchOn.value = 0; fireflies.visible = false; disposeKids(vineGroup); $('qx').style.display = 'none';
  if (!keepText) { $('sstat').textContent = ''; $('q').value = ''; }
  drawRuler();
}
$('go').onclick = () => runSearch($('q').value);
$('qx').onclick = () => clearSearch();             // крестик справа от «найти» — только при находках
const qWords = (s) => (s || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
$('q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {                       // одно слово — по ключевым словам на дереве; несколько — «ответы» поиска
    const v = $('q').value;
    if (qWords(v).length > 1) askSearch(v); else runSearch(v);
  }
  if (e.key === 'Escape') { e.preventDefault(); clearSearch(); $('q').blur(); }   // Esc в поле — сброс поиска на дереве
});
$('q').addEventListener('input', () => { if (!$('q').value && S.search) clearSearch(); });   // крестик в поле
$('find').addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('find').value = ''; renderList(); $('find').blur(); } });
// ---------------------------------------------------------------- «ответы»: 10 лучших ответов «Поиска Любарского»
// Готовый вызов поиска сайта (тот же, что у страницы поиска и у «Вселенной»); ответ → номер фрагмента → лист.
async function askSearch(text) {
  const q = (text || '').trim();
  if (!q) return;
  S.answers = null; renderAnswers();
  $('astat').style.display = 'block'; $('astat').textContent = 'спрашиваю «Поиск Любарского»…';
  let d;
  try {
    const r = await fetch(`${SITE}/v8/search?q=${encodeURIComponent(q)}&n=10&branch=lubarsky`, { cache: 'no-store' });
    if (!r.ok) throw new Error('ответ ' + r.status);
    d = await r.json();
  } catch (e) {
    $('astat').innerHTML = `«Поиск Любарского» не ответил (${esc(e.message || e)}) <button id="ansX" title="Убрать">×</button>`;
    $('ansX').onclick = () => clearAnswers();
    return;
  }
  const res = d.results || [], items = [];
  let missing = 0;
  res.forEach((x, k) => {
    const id = (x.metadata || {}).chunk_id, i = id ? leafOfChunk(id) : undefined;
    if (i === undefined) missing++; else items.push({ rank: k + 1, i, text: x.text || '' });
  });
  S.answers = { q, items, total: res.length, missing };
  renderAnswers(); drawRuler();
}
const ansEls = [];
function renderAnswers() {
  ansEls.forEach((e) => e.remove()); ansEls.length = 0;
  const A = S.answers;
  if (!A) { $('astat').style.display = 'none'; return; }
  for (const it of A.items) {
    const el = document.createElement('div'), v = meta.videos[vid[it.i]];
    el.className = 'ans'; el.textContent = it.rank;
    el.title = `${it.rank}. ${v.t || v.v} · ${fmtDate(v.d)} · ${mmss(sec[it.i])}\n${it.text.slice(0, 240)}${it.text.length > 240 ? '…' : ''}\nщелчок — смотреть`;
    el.onclick = () => openVideo(it.i);
    document.body.appendChild(el);
    ansEls.push(el); it.el = el;
  }
  $('astat').style.display = 'block';
  $('astat').innerHTML = `ответы поиска «${esc(A.q)}»: ` + (A.total ? `${A.items.length}` + (A.missing ? ` (ещё ${A.missing} — нет на «Древе»)` : '')
    + ' · номер — место в выдаче, щелчок — смотреть' : 'ничего не найдено') + ` <button id="ansX" title="Снять ответы">×</button>`;
  $('ansX').onclick = () => clearAnswers();
}
function clearAnswers() { if (!S.answers && $('astat').style.display !== 'block') return; S.answers = null; renderAnswers(); drawRuler(); }
$('ask').onclick = () => askSearch($('q').value);
function startTour() {
  if (!S.search) return;
  closeVideo();
  S.tour = { k: -1, t: 0 };
  nextKnot();
}
function nextKnot() {
  if (!S.tour) return;
  S.tour.k++;
  if (S.tour.k >= S.search.knots.length) { stopTour(); return; }
  const i = S.search.knots[S.tour.k], v = meta.videos[vid[i]];
  flyNear(leafVec(i), 0.9);
  U.uVid.value = vid[i]; U.uVidOn.value = 1;
  $('cap').innerHTML = `<span class="t-d">${S.tour.k + 1} / ${S.search.knots.length} · ${fmtDate(v.d)}</span><br>${esc(v.t || v.v)}`
    + `<br><span class="t-d">${esc(meta.galaxies[gal[i]].name)} › ${esc(meta.constellations[con[i]].name)} · двойной щелчок по узлу — смотреть</span>`;
  $('cap').style.display = 'block';
  S.tour.t = performance.now();
}
function stopTour() { if (!S.tour) return; S.tour = null; $('cap').style.display = 'none'; if (!S.video) { U.uVidOn.value = 0; U.uVid.value = -1; } }

// ---------------------------------------------------------------- ролик: кольцо разговора, «сейчас», дорожка, плеер
const vidGroup = new THREE.Group();
scene.add(vidGroup);
// дорожка ролика: «откуда» — синее и темнее (поправка автора 03.10; было светло-сиреневое), «куда» — тёплое
const PAST = new THREE.Color().setRGB(45 / 255, 95 / 255, 225 / 255, THREE.SRGBColorSpace), FUT = new THREE.Color(1, 214 / 255, 140 / 255);
const GLOW = (() => {                            // мягкий огонёк — текущий лист ролика (мигает)
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,244,214,.9)'); g.addColorStop(0.55, 'rgba(255,214,140,.35)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();
function disposeKids(g) { g.traverse((o) => { if (o !== g) { o.geometry?.dispose(); o.material?.dispose(); } }); g.clear(); }
function openVideo(leaf, t0) {                   // t0 — секунда старта (адрес «&t=»); по умолчанию — начало фрагмента
  stopTour(); unpin();
  const v = vid[leaf], list = videoLeaves[v], cur = Math.max(0, list.indexOf(leaf));
  const sameVideo = S.video && S.video.v === v;
  const st = Math.max(0, Math.floor(t0 ?? sec[leaf]));
  S.video = { v, list, cur, win: S.video ? S.video.win : 5, follow: S.video ? S.video.follow : true, t: st, seekUntil: 0 };
  U.uVid.value = v; U.uVidOn.value = 1; U.uVidDim.value = 1;
  if (S.search) styleVine();
  const meta_v = meta.videos[v];
  $('vtitle').textContent = meta_v.t || meta_v.v;
  $('vid').style.display = 'block';
  $('vtitle').title = meta_v.t || meta_v.v;
  document.body.classList.add('vidmode');        // плеер — в левом нижнем углу; нижняя панель — правее него
  if (!sameVideo) {
    $('yt').src = `https://www.youtube-nocookie.com/embed/${meta_v.v}?enablejsapi=1&autoplay=1&start=${st}&origin=${encodeURIComponent(location.origin)}`;
  } else seekTo(st);
  const toView = S.morphTo || S.view;
  if (toView !== 'cyl') { if (!S.prevView) S.prevView = toView; setView('cyl'); }   // на время ролика — «Цилиндр»
  applySel();
  buildRing();
  setCur(cur, false);
  $('ruler').style.bottom = ($('vid').offsetHeight + 10 + 42) + 'px';   // линейка — над плеером
  drawRuler();
  if (!sameVideo) {
    const y = viewPos.cyl[leaf * 3 + 1];
    flyTo(new THREE.Vector3(0.15, y + 1.7, 2.9), new THREE.Vector3(0, y, 0), 1300);
  }
}
function closeVideo() {
  if (!S.video) return;
  S.video = null; $('yt').src = 'about:blank'; $('vid').style.display = 'none';
  document.body.classList.remove('vidmode'); $('ruler').style.bottom = '';
  U.uVidOn.value = 0; U.uVid.value = -1; U.uVidDim.value = 0;
  if (S.search) styleVine();
  vidGroup.clear();
  clockLabels.forEach((e) => { e.style.display = 'none'; });
  if (S.prevView) { const pv = S.prevView; S.prevView = null; setView(pv); }      // вернуть прежний вид
  if (!S.pin) setAddr(null);                      // адресная строка — снова без листа
  applySel();
}
function smoothSeq(list) {                     // темы по ходу речи; вставки короче 3 фрагментов — в соседей
  const seq = list.map((i) => gal[i]);
  for (let j = 0; j < seq.length;) {
    let k = j;
    while (k < seq.length && seq[k] === seq[j]) k++;
    if (k - j < 3 && j > 0) for (let t = j; t < k; t++) seq[t] = seq[j - 1];
    j = k;
  }
  return seq;
}
function buildRing() {
  vidGroup.clear();
  if (!S.video) return;
  const P = curPos(), list = S.video.list;
  const ys = list.map((i) => P[i * 3 + 1]).sort((a, b) => a - b), y = ys[ys.length >> 1];
  const rr = [];
  for (let i = 0; i < N; i += 2) if (Math.abs(P[i * 3 + 1] - y) < 0.03) rr.push(Math.hypot(P[i * 3], P[i * 3 + 2]));
  rr.sort((a, b) => a - b);
  const R = 1.1 * (rr.length ? rr[Math.floor(rr.length * 0.97)] : 1), n = list.length, seq = smoothSeq(list);
  const secs = list.map((i) => sec[i]), gaps = secs.slice(1).map((s, k) => s - secs[k]).sort((a, b) => a - b);
  const T = secs[n - 1] + Math.max(20, gaps.length ? gaps[gaps.length >> 1] : 30);   // длительность (оценка)
  const a0 = -Math.PI / 2, ang = (s) => a0 + (2 * Math.PI * s) / T;                 // «12 часов» — дальняя сторона
  const pos = [], colr = [], idx = [];
  let vtx = 0;
  for (let k = 0; k < n; k++) {                 // лента: дуга фрагмента — от его секунды до следующего, цвет — тема
    const c = gcol[seq[k]], s0 = secs[k], s1 = k + 1 < n ? secs[k + 1] : T, steps = Math.max(1, Math.ceil(((s1 - s0) / T) * 120));
    for (let j = 0; j <= steps; j++) {
      const a = ang(s0 + ((s1 - s0) * j) / steps);
      for (const r of [R - 0.014, R + 0.014]) { pos.push(Math.cos(a) * r, y, Math.sin(a) * r); colr.push(c.r, c.g, c.b); }
      if (j) { const b = vtx + (j - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    vtx += (steps + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  vidGroup.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.95 })));
  const tk = [];                                 // засечки: 12 позиций; «0» — длиннее
  for (let m = 0; m < 12; m++) {
    const a = ang((T * m) / 12), r0 = R - (m ? 0.03 : 0.07), r1 = R + (m ? 0.045 : 0.11);
    tk.push(Math.cos(a) * r0, y, Math.sin(a) * r0, Math.cos(a) * r1, y, Math.sin(a) * r1);
    const el = clockLabels[m], rl = R + (m ? 0.1 : 0.17);
    el.textContent = m ? `${Math.round((T * m) / 12 / 60)}′` : '0 — начало';
    el.dataset.x = Math.cos(a) * rl; el.dataset.y = y; el.dataset.z = Math.sin(a) * rl;
    el.style.display = 'block';
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tk, 3));
  vidGroup.add(new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xdbe3ff })));
  const zero = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  zero.position.set(Math.cos(a0) * (R + 0.11), y, Math.sin(a0) * (R + 0.11));
  vidGroup.add(zero);
  const hit = new THREE.Mesh(new THREE.RingGeometry(R - 0.06, R + 0.06, 96), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false, depthWrite: false }));
  hit.rotation.x = -Math.PI / 2; hit.position.y = y; hit.userData.ring = true;
  vidGroup.add(hit);
  S.video.ring = { R, y, a0, n, T, ang, hit };
  S.video.thread = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.02, gapSize: 0.015, transparent: true, opacity: 0.8 }));
  vidGroup.add(S.video.thread);
  S.video.dot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  vidGroup.add(S.video.dot);
  S.video.pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  S.video.pulse.renderOrder = 10;
  vidGroup.add(S.video.pulse);
  S.video.path = new THREE.Group();
  vidGroup.add(S.video.path);
}
function setCur(j, seek) {
  const V = S.video;
  if (!V) return;
  V.cur = Math.max(0, Math.min(V.list.length - 1, j));
  const i = V.list[V.cur];
  if (seek) seekTo(sec[i]);
  $('vhd').innerHTML = `<span class="t-g" style="color:rgb(${meta.galaxies[gal[i]].color.join(',')})">${esc(meta.galaxies[gal[i]].name)}</span>`
    + ` › <span class="t-c">${esc(meta.constellations[con[i]].name)}</span>`;
  $('pinfo').textContent = `${V.cur + 1} / ${V.list.length} · ${mmss(sec[i])} · ${fmtDate(meta.videos[V.v].d)}`;
  setAddr(i, true);                               // адресная строка — текущий фрагмент (ссылку можно скопировать)
  if (seek) V.t = sec[i];
  disposeKids(V.path);
  const P = curPos(), lp = leafVec(i, P);
  V.leafPos = lp;
  placeDot();
  // дорожка ±win: откуда — голубое, куда — жёлтое; стрелки посредине; чем ближе к текущему фрагменту — тем толще и ярче
  const lo = Math.max(0, V.cur - V.win), hi = Math.min(V.list.length - 1, V.cur + V.win), UP = new THREE.Vector3(0, 1, 0);
  for (let k = lo; k < hi; k++) {
    const p0 = leafVec(V.list[k], P), p1 = leafVec(V.list[k + 1], P), fut = k >= V.cur;
    const d = fut ? k - V.cur : V.cur - 1 - k;                   // 0 — отрезок у текущего
    const f = 1 - (Math.min(d, V.win) / Math.max(1, V.win)) * 0.85;
    const dir = p1.clone().sub(p0), len = dir.length();
    if (len < 1e-4) continue;
    const mat = new THREE.MeshBasicMaterial({ color: fut ? FUT : PAST, transparent: true, opacity: 0.2 + 0.8 * Math.pow(f, 1.3), depthWrite: false });
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()), r = 0.0012 + 0.0048 * f;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6, 1, true), mat);
    seg.position.copy(p0).lerp(p1, 0.5); seg.quaternion.copy(q);
    V.path.add(seg);
    if (len > 0.02) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.004 + 0.008 * f, 0.014 + 0.02 * f, 8), mat);
      cone.position.copy(p0).lerp(p1, 0.55); cone.quaternion.copy(q);
      V.path.add(cone);
    }
  }
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  halo.position.copy(lp);
  V.path.add(halo);
  if (V.pulse) V.pulse.position.copy(lp);
  if (V.follow) panIfOff(lp);
}
function panIfOff(p) {
  const v = p.clone().project(camera);
  if (Math.abs(v.x) < 0.6 && Math.abs(v.y) < 0.6 && v.z < 1) return;
  const off = camera.position.clone().sub(controls.target);
  flyTo(p.clone().add(off), p.clone(), 800);
}
// плеер YouTube: секунда — сообщениями (listening → infoDelivery.currentTime)
function ytCmd(func, args = []) { $('yt').contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); }
function seekTo(t) { if (!S.video) return; S.video.t = t; S.video.seekUntil = performance.now() + 2500; ytCmd('seekTo', [t, true]); ytCmd('playVideo'); }
$('yt').addEventListener('load', () => { $('yt').contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); });
addEventListener('message', (e) => {
  if (!S.video || e.source !== $('yt').contentWindow || !/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
  let d; try { d = JSON.parse(e.data); } catch { return; }
  const t = d && d.info && typeof d.info.currentTime === 'number' ? d.info.currentTime : null;
  if (t === null) return;
  const V = S.video;
  if (performance.now() < V.seekUntil && Math.abs(t - V.t) > 3) return;      // старая секунда после ручного перехода
  V.t = t;
  let j = 0;
  while (j + 1 < V.list.length && sec[V.list[j + 1]] <= t + 0.5) j++;
  if (j !== V.cur) setCur(j, false);
});
$('vx').onclick = closeVideo;
$('pPrev').onclick = () => S.video && setCur(S.video.cur - 1, true);
$('pNext').onclick = () => S.video && setCur(S.video.cur + 1, true);
document.querySelectorAll('#vid [data-w]').forEach((b) => b.onclick = () => {
  if (!S.video) return;
  S.video.win = +b.dataset.w;
  document.querySelectorAll('#vid [data-w]').forEach((x) => x.classList.toggle('on', x === b));
  setCur(S.video.cur, false);
});
$('follow').onclick = () => { if (!S.video) return; S.video.follow = !S.video.follow; $('follow').classList.toggle('on', S.video.follow); };
function hideOverlays(hide) { fireflies.visible = !hide && !!S.search; vineGroup.visible = !hide; vidGroup.visible = !hide; }

// ---------------------------------------------------------------- наведение, щелчок, меню
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let lastMove = 0;
function pick(ev, withKnots = false) {
  mouse.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  if (withKnots && !S.video && vineGroup.children.length) {   // узлы лианы: не при ролике; при диапазоне/выборе — только включённые
    const W = weights();
    const kh = ray.intersectObjects(vineGroup.children.filter((o) => o.userData.knot !== undefined && leafOn(o.userData.leaf, W)), false)[0];
    if (kh) return { kind: 'knot', i: kh.object.userData.leaf, point: kh.object.position.clone() };
  }
  if (S.video && S.video.ring) {                 // ролик: кольцо — шкала времени
    const rh = ray.intersectObject(S.video.ring.hit, false)[0];
    if (rh) {
      const R = S.video.ring, a = Math.atan2(rh.point.z, rh.point.x);
      const s = ((((a - R.a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * R.T;
      return { kind: 'ring', s, point: rh.point.clone() };
    }
  }
  // допуск — 7 пикселей экрана на расстоянии цели; из попаданий — ближайшее к лучу (в пикселях), при равенстве — ближнее
  const dist = camera.position.distanceTo(controls.target);
  ray.params.Points.threshold = (7 / U.uProj.value) * dist;
  const { gw, cw } = weights();
  const hitsArr = ray.intersectObject(leaves, false).slice(0, 400);
  let best = null, bestScore = 1e9;
  const sOn = U.uSearchOn.value > 0.5, aHit = leafGeo.attributes.aHit.array;
  for (const h of hitsArr) {
    const i = h.index;
    if (!S.video && gw[gal[i]] * cw[con[i]] < 0.5) continue;              // в ролике его листья отвечают всегда
    if (sOn && !S.video && !aHit[i]) continue;                          // при поиске — находки; в ролике — все его фрагменты
    if (S.video && vid[i] !== S.video.v) continue;                       // при ролике — только его листья
    if (!S.video && U.uRangeOn.value && (day[i] < U.uRange.value.x || day[i] > U.uRange.value.y)) continue;   // при диапазоне — только в нём
    const px = (h.distanceToRay * U.uProj.value) / Math.max(0.05, h.distance), score = px + 0.002 * h.distance * U.uProj.value / 100;
    if (px < 9 && score < bestScore) { best = h; bestScore = score; }
  }
  const meshes = S.video || U.uRangeOn.value ? [] : [...views[S.view].g, ...views[S.view].c].filter((m) => m && m.visible);
  const mh = ray.intersectObjects(meshes, false)[0];
  if (best && (!mh || best.distance < mh.distance + 0.05)) return { kind: 'leaf', i: best.index, point: leafVec(best.index) };
  if (mh) return { kind: mh.object.userData.level, i: mh.object.userData.i, point: mh.point };
  return null;
}
function ringFrag(s) { const V = S.video; let j = 0; while (j + 1 < V.list.length && sec[V.list[j + 1]] <= s) j++; return j; }
function tipHTML(h) {
  if (h.kind === 'ring') {
    const V = S.video, j = ringFrag(h.s), i = V.list[j];
    return `<div class="t-d">${mmss(h.s)} · фрагмент ${j + 1} из ${V.list.length}</div><div class="t-g" style="color:rgb(${meta.galaxies[gal[i]].color.join(',')})">${esc(meta.galaxies[gal[i]].name)}</div>`
      + `<div class="t-c">${esc(meta.constellations[con[i]].name)}</div><div class="t-d">щелчок — перейти</div>`;
  }
  if (h.kind === 'leaf' || h.kind === 'knot') {
    const g = meta.galaxies[gal[h.i]], c = meta.constellations[con[h.i]], v = meta.videos[vid[h.i]];
    return `<div class="t-g" style="color:rgb(${g.color.join(',')})">${esc(g.name)}</div><div class="t-c">${esc(c.name)}</div>`
      + `<div>${esc(v.t || v.v)}</div><div class="t-d">${fmtDate(v.d)} · ${mmss(sec[h.i])} · канал: ${esc(meta.channels[chan[h.i]] || '')}`
      + `${h.kind === 'knot' ? ' · узел лианы' : ''} · двойной щелчок — смотреть</div>`;
  }
  if (h.kind === 'g') return `<div class="t-g">${esc(meta.galaxies[h.i].name)}</div><div class="t-d">${meta.galaxies[h.i].size.toLocaleString('ru')} фрагментов · правая кнопка — меню</div>`;
  const c = meta.constellations[h.i];
  return `<div class="t-g">${esc(meta.galaxies[c.g].name)}</div><div class="t-c">${esc(c.name)}</div><div class="t-d">${c.size.toLocaleString('ru')} фрагментов</div>`;
}
renderer.domElement.addEventListener('pointermove', (ev) => {
  const now = performance.now();
  if (now - lastMove < 60) return;
  lastMove = now;
  const h = pick(ev, true);
  S.hover = h && (h.kind === 'leaf' || h.kind === 'knot') ? h.i : h && h.kind === 'ring' ? S.video.list[ringFrag(h.s)] : null;
  $('aim').classList.toggle('rg', !!(h && h.kind === 'ring'));   // наведение на кольцо — кольцо у листа этого места
  const tip = $('tip');
  if (!h) { tip.style.display = 'none'; renderer.domElement.style.cursor = 'grab'; return; }
  tip.innerHTML = tipHTML(h);
  tip.style.display = 'block';
  const tw = tip.offsetWidth, th = tip.offsetHeight;   // подальше от курсора; у края экрана — по другую сторону
  let tx = ev.clientX + 34, ty = ev.clientY + 30;
  if (tx + tw > innerWidth - 8) tx = ev.clientX - 34 - tw;
  if (ty + th > innerHeight - 8) ty = ev.clientY - 30 - th;
  tip.style.left = Math.max(4, tx) + 'px';
  tip.style.top = Math.max(4, ty) + 'px';
  renderer.domElement.style.cursor = 'pointer';
});
renderer.domElement.addEventListener('pointerleave', () => { $('tip').style.display = 'none'; S.hover = null; $('aim').classList.remove('rg'); });
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; $('menu').style.display = 'none'; if (S.tour) stopTour(); });
renderer.domElement.addEventListener('click', (ev) => {
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 4) return;
  const h = pick(ev, true);
  if (!h) return;
  if (h.kind === 'ring') {                       // щелчок по кольцу — фрагмент в этом месте
    setCur(ringFrag(h.s), true);
    return;
  }
  if (h.kind === 'leaf' && (ev.ctrlKey || ev.metaKey)) { selectC(con[h.i], ev.shiftKey); return; }   // Ctrl — ветка листа
  if (h.kind === 'leaf' && ev.altKey) { selectG(gal[h.i], ev.shiftKey); return; }                  // Alt — тема листа
});
renderer.domElement.addEventListener('dblclick', (ev) => {   // двойной щелчок: лист / узел — ролик, ветвь — подлёт
  const h = pick(ev, true);
  if (!h || h.kind === 'ring') return;
  if (h.kind === 'leaf' || h.kind === 'knot') openVideo(h.i);
  else flyToNode(h.kind, h.i);
});
renderer.domElement.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  const h = pick(ev), menu = $('menu');
  if (!h) { menu.style.display = 'none'; return; }
  const g = h.kind === 'leaf' ? gal[h.i] : h.kind === 'g' ? h.i : meta.constellations[h.i].g;
  const c = h.kind === 'leaf' ? con[h.i] : h.kind === 'c' ? h.i : null;
  const items = [[`Только тема «${meta.galaxies[g].name}»`, () => { selectG(g, false); flyToNode('g', g); }]];
  if (c !== null) items.push([`Только ветка «${meta.constellations[c].name}»`, () => { selectC(c, false); flyToNode('c', c); }]);
  if (h.kind === 'leaf') items.push(['Смотреть этот ролик', () => openVideo(h.i)]);
  if (h.kind === 'leaf') items.push(['🌌 Звезда во Вселенной', () => window.open(`${SITE}/atlas.html#chunk=${encodeURIComponent(chunkId(h.i))}`, '_blank', 'noopener')]);
  if (h.kind === 'leaf') items.push(['🔗 Ссылка на лист', () => copyLink(h.i)]);
  items.push(['Добавить к выделенному (тема)', () => selectG(g, true)]);
  items.push(['Скрыть тему', () => { S.hidG.add(g); applySel(); }]);
  if (c !== null) items.push(['Скрыть ветку', () => { S.hidC.add(c); applySel(); }]);
  items.push(['Показать всё', showAll]);
  menu.innerHTML = '';
  for (const [t, f] of items) { const d = document.createElement('div'); d.textContent = t; d.onclick = () => { menu.style.display = 'none'; f(); }; menu.appendChild(d); }
  menu.style.left = Math.min(innerWidth - 260, ev.clientX) + 'px';
  menu.style.top = Math.min(innerHeight - 240, ev.clientY) + 'px';
  menu.style.display = 'block';
});
function showAbout(on) { $('about').style.display = on ? 'flex' : 'none'; }
// ---------------------------------------------------------------- адрес листа: tree.html#chunk=<номер фрагмента>
// Как у «Вселенной» (atlas.html#chunk=…). Параметры после #: chunk; play=1 или t=<сек> — сразу ролик; v=<ролик>&t=<сек> —
// по ролику и секунде; view=tree|bush|cyl; q=слово — поиск по дереву; ask=фраза — «ответы». ATLAS_TREE_SPEC.md §13.
let vidMap = null;
function vidOf(yt) { if (!vidMap) { vidMap = new Map(); meta.videos.forEach((x, k) => vidMap.set(x.v, k)); } return vidMap.get(yt); }
function leafNear(id) {                          // фрагмента нет на «Древе» (новее данных) — ближайший по номеру лист того же ролика
  const m = /^(.+)_(\d+)$/.exec(id || ''), v = m ? vidOf(m[1]) : undefined;
  if (v === undefined) return null;
  let best = null, bd = 1e9;
  for (const i of videoLeaves[v]) { const d = Math.abs(cno[i] - +m[2]); if (d < bd) { bd = d; best = i; } }
  return best;
}
const leafUrl = (i, play) => `${location.origin}${location.pathname}#chunk=${encodeURIComponent(chunkId(i))}${play ? '&play=1' : ''}`;
function setAddr(i, play) {                      // тихо (без перехода и без записи в историю) обновить адресную строку
  try { history.replaceState(null, '', i == null ? location.pathname + location.search : leafUrl(i, play)); } catch (e) { /* не важно */ }
}
function toast(text) { const t = $('toast'); t.textContent = text; t.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => { t.style.display = 'none'; }, 4000); }
async function copyLink(i) {
  const u = leafUrl(i, false);
  try { await navigator.clipboard.writeText(u); toast('ссылка на лист скопирована: ' + u); } catch (e) { prompt('Ссылка на лист:', u); }
}
function pinLeaf(i, note) {                      // лист по адресу: подлёт (не вплотную), мигающее кольцо, карточка
  S.pin = { i };
  const g = meta.galaxies[gal[i]], c = meta.constellations[con[i]], v = meta.videos[vid[i]];
  $('pin').innerHTML = `<span class="x" id="pinX" title="Закрыть (Esc)">×</span>`
    + `<div class="t-g" style="color:rgb(${g.color.join(',')})">${esc(g.name)}</div><div class="t-c">${esc(c.name)}</div>`
    + `<div>${esc(v.t || v.v)}</div><div class="t-d">${fmtDate(v.d)} · ${mmss(sec[i])} · ${esc(meta.channels[chan[i]] || '')}</div>`
    + (note ? `<div class="nt">${esc(note)}</div>` : '')
    + '<div class="bt"><button id="pinPlay">▶ смотреть</button><button id="pinStar" title="Этот фрагмент во «Вселенной»">🌌 звезда</button>'
    + '<button id="pinLink" title="Скопировать ссылку на этот лист">🔗 ссылка</button></div>';
  $('pinX').onclick = unpin;
  $('pinPlay').onclick = () => openVideo(i);
  $('pinStar').onclick = () => window.open(`${SITE}/atlas.html#chunk=${encodeURIComponent(chunkId(i))}`, '_blank', 'noopener');
  $('pinLink').onclick = () => copyLink(i);
  flyNear(leafVec(i, viewPos[S.morphTo || S.view]), 2.4);
  setAddr(i, false);
}
function unpin() {
  if (!S.pin) return;
  S.pin = null; $('pin').style.display = 'none'; $('pinring').style.display = 'none';
  if (!S.video) setAddr(null);
}
function goToAddress() {
  const P = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (![...P.keys()].length) return;
  showAbout(false); unpin();                      // новый адрес — прежняя отметка снимается
  const id = P.get('chunk'), yv = P.get('v'), t = P.has('t') ? +P.get('t') : null, view = P.get('view');
  const play = P.get('play') === '1' || (!!id && t !== null);
  if (view && VIEWS.includes(view) && !play) setView(view);
  if (P.get('q')) { $('q').value = P.get('q'); runSearch(P.get('q')); }
  if (P.get('ask')) { $('q').value = P.get('ask'); askSearch(P.get('ask')); }
  let i = null, note = '';
  if (id) {
    i = leafOfChunk(id) ?? null;
    if (i === null) {
      i = leafNear(id);
      note = i !== null ? 'этого фрагмента ещё нет на «Древе» (он новее) — показан соседний из того же ролика' : 'этого ролика ещё нет на «Древе»';
    }
  } else if (yv) {
    const v = vidOf(yv);
    if (v === undefined) note = 'этого ролика ещё нет на «Древе»';
    else { const Lv = videoLeaves[v]; i = Lv[0]; for (const k of Lv) if (sec[k] <= (t || 0)) i = k; }
  }
  if (i === null) { if (note) toast(note); return; }
  if (play) { openVideo(i, t !== null && t > sec[i] ? t : undefined); if (note) toast(note); return; }
  if (S.video) closeVideo();                      // адрес без ролика — ролик закрывается, лист — в прежнем виде
  pinLeaf(i, note);
}
addEventListener('hashchange', goToAddress);   // переход по новому адресу в уже открытом «Древе» — без перезагрузки
function fullReset() {                           // Esc Esc: выбор, диапазон, поиск, ролик, облёт — снять; «домой», вид «Дерево»
  unpin(); stopTour(); closeVideo(); clearSearch(); clearAnswers(); setAddr(null);
  S.playing = false; $('play').textContent = '▶ время'; setRange(null);
  S.prevView = null; showAll(); setView('tree');
  flyTo(HOME.pos, HOME.target);
}
$('about').addEventListener('pointerdown', (e) => { e.stopPropagation(); showAbout(false); });
$('help').onclick = () => showAbout(true);
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });   // кнопки не держат фокус
document.addEventListener('change', (e) => { if (e.target.type === 'range') e.target.blur(); });
addEventListener('keydown', (ev) => {
  if ($('about').style.display !== 'none') { if (ev.key === 'Escape' || ev.key === 'Enter' || ev.key === ' ') showAbout(false); return; }
  const tg = ev.target;
  if ((tg.tagName === 'INPUT' && tg.type !== 'range') || tg.tagName === 'TEXTAREA') return;   // ввод текста — не трогаем
  if (ev.key.startsWith('Arrow')) { ev.preventDefault(); if (tg !== document.body && tg.blur) tg.blur(); }   // стрелки — только дереву и ролику
  if (S.video && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
    ev.preventDefault();
    const d = ev.key === 'ArrowRight' ? 1 : -1;
    if (ev.shiftKey) setCur(S.video.cur + d, true); else seekTo(Math.max(0, S.video.t + 15 * d));
    return;
  }
  if (ev.key >= '1' && ev.key <= '9') {
    const order = meta.galaxies.map((g, i) => i).sort((a, b) => meta.galaxies[b].size - meta.galaxies[a].size);
    const g = order[+ev.key - 1];
    if (g !== undefined) { selectG(g, ev.ctrlKey); flyToNode('g', g); }
  } else if (ev.key === '0') showAll();
  else if (ev.key === 'Escape') {
    $('menu').style.display = 'none';
    const now = performance.now();
    if (now - (S.lastEsc || 0) < 700) { S.lastEsc = 0; fullReset(); return; }   // Esc Esc — полный сброс
    S.lastEsc = now;
    if (S.pin) unpin(); else if (S.tour) stopTour(); else if (S.video) closeVideo(); else if (S.search) clearSearch(); else if (S.answers) clearAnswers(); else { showAll(); setRange(null); }
  } else if (ev.key === 'h' || ev.key === 'H' || ev.key === 'р' || ev.key === 'Р') flyTo(HOME.pos, HOME.target);
  else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
    const d = (ev.key === 'ArrowUp' ? 1 : -1) * 0.08;
    camera.position.y += d; controls.target.y += d;
  }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); U.uProj.value = projPx(); drawRuler();
});

// ---------------------------------------------------------------- цикл
const clock = new THREE.Clock();
const v3 = new THREE.Vector3(), camDir = new THREE.Vector3();
function placeLabel(el, p, back) {
  v3.copy(p).project(camera);
  if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) { el.style.display = 'none'; return; }
  if (back) {
    camDir.subVectors(camera.position, controls.target).setY(0).normalize();
    const side = (p.x * camDir.x + p.z * camDir.z) / Math.max(1e-6, Math.hypot(p.x, p.z));
    el.style.filter = side < -0.2 ? 'opacity(.28)' : '';
  }
  el.style.display = 'block';
  el.style.left = ((v3.x + 1) / 2) * innerWidth + 'px';
  el.style.top = ((1 - v3.y) / 2) * innerHeight + 'px';
}
const byPriority = themeLabels.slice().sort((a, b) => meta.galaxies[b.i].size - meta.galaxies[a.i].size);
const conLabels = new Map();                       // выбранные ветки: подпись у центра их листвы
function updateConLabels() {
  for (const [c, L] of conLabels) if (!S.selC.has(c)) { L.el.remove(); conLabels.delete(c); }
  const P = viewPos[S.morphTo || S.view];
  for (const c of S.selC) {
    let L = conLabels.get(c);
    if (!L) {
      const el = document.createElement('div');
      el.className = 'lab con'; el.textContent = meta.constellations[c].name;
      el.style.color = `rgb(${meta.galaxies[meta.constellations[c].g].color.join(',')})`;
      document.body.appendChild(el);
      L = { el, p: new THREE.Vector3() }; conLabels.set(c, L);
    }
    let x = 0, y = 0, z = 0, n = 0;
    for (let k = 0; k < N; k++) if (con[k] === c) { x += P[k * 3]; y += P[k * 3 + 1]; z += P[k * 3 + 2]; n++; }
    if (n) L.p.set(x / n, y / n + 0.1, z / n);
  }
}
const clockLabels = Array.from({ length: 12 }, () => { const e = document.createElement('div'); e.className = 'yr clk'; e.style.display = 'none'; document.body.appendChild(e); return e; });
const _dot = new THREE.Vector3(), _ans = new THREE.Vector3();
function placeDot() {                            // огонёк «сейчас»: угол — по секунде плеера; нить — к текущему листу
  const V = S.video;
  if (!V || !V.ring || !V.dot) return;
  const a = V.ring.ang(Math.max(0, Math.min(V.ring.T, V.t)));
  V.dot.position.set(Math.cos(a) * V.ring.R, V.ring.y, Math.sin(a) * V.ring.R);
  if (V.leafPos) {
    V.thread.geometry.setFromPoints([V.dot.position, V.leafPos]);
    V.thread.computeLineDistances();
  }
}
function declutter() {
  const boxes = [];
  for (const L of byPriority) {
    const el = L.el;
    if (el.style.display === 'none') continue;
    const w = el.offsetWidth, h = el.offsetHeight + 2;
    let x = parseFloat(el.style.left) - w / 2, y = parseFloat(el.style.top) - h / 2, ok = false;
    for (let k = 0; k < 6 && !ok; k++) { ok = !boxes.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y); if (!ok) y += h; }
    if (!ok) { el.style.display = 'none'; continue; }
    el.style.top = (y + h / 2) + 'px';
    boxes.push({ x, y, w, h });
  }
}
function tick() { frame(); requestAnimationFrame(tick); }
function frame() {
  U.uTime.value = clock.getElapsedTime();
  {                                              // туман: границы — относительно точки обзора (ползунок «туман»)
    const d = camera.position.distanceTo(controls.target), f = S.fog;
    const A = f <= 0.001 ? 1e4 : d + (8 - 8.4 * f), B = A + (10 - 8.4 * f);
    U.uFogA.value = A; U.uFogB.value = B; scene.fog.near = A; scene.fog.far = B;
  }
  if (fly) {
    const k = Math.min(1, (performance.now() - fly.s) / fly.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e);
    if (k >= 1) fly = null;
  }
  let e = 0;
  if (S.morphTo) {
    const k = Math.min(1, (performance.now() - S.morphT0) / 1500);
    e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    U.uMorph.value = e;
    const from = views[S.view], to = views[S.morphTo];
    from.fade = 1 - e; to.fade = e;
    fadeGroup(from); fadeGroup(to);
    if (k >= 1) {                                  // перетекание закончено: место листьев — новое, наложения — заново
      leafGeo.attributes.position.array.set(viewPos[S.morphTo]);
      leafGeo.attributes.position.needsUpdate = true;
      leafGeo.computeBoundingSphere();
      U.uMorph.value = 0;
      from.group.visible = false;
      const toName = S.morphTo;
      S.view = toName; S.morphTo = null;
      applySel();
      buildFireflies(); buildVine(); updateConLabels();
      if (S.video) { buildRing(); setCur(S.video.cur, false); }
      hideOverlays(false);
      if (S.queued) { const q = S.queued; S.queued = null; setView(q); }
    }
  }
  if (S.playing && S.range) {
    const len = S.range[1] - S.range[0], a = S.range[0] + 0.0016;
    if (a + len >= 1) { setRange([1 - len, 1]); S.playing = false; $('play').textContent = '▶ время'; } else setRange([a, a + len]);
  }
  if (S.tour && performance.now() - S.tour.t > 3200) nextKnot();
  controls.update();
  for (const L of yearLabels) placeLabel(L.el, L.p);
  const from = S.view, to = S.morphTo || S.view;
  const vplane = !!(S.video && S.video.ring && !S.morphTo);   // ролик: подписи тем — неярко в его плоскости, у столбов тем
  for (const L of themeLabels) {
    L.el.classList.toggle('vbg', vplane);
    if (vplane) { L.p.set(cylAt[L.i].x, S.video.ring.y + 0.03, cylAt[L.i].y); L.el.style.filter = ''; placeLabel(L.el, L.p, false); }
    else { L.p.lerpVectors(L.a[from], L.a[to], S.morphTo ? e : 0); placeLabel(L.el, L.p, true); }
  }
  for (const L of conLabels.values()) placeLabel(L.el, L.p, false);
  if (S.answers) {
    const P0 = viewPos[S.view], P1 = viewPos[S.morphTo || S.view], k = S.morphTo ? e : 0;
    for (const it of S.answers.items) {
      if (S.video && vid[it.i] !== S.video.v) { it.el.style.display = 'none'; continue; }
      const j = it.i * 3;
      _ans.set(P0[j] + (P1[j] - P0[j]) * k, P0[j + 1] + (P1[j + 1] - P0[j + 1]) * k, P0[j + 2] + (P1[j + 2] - P0[j + 2]) * k);
      placeLabel(it.el, _ans, false);
    }
  }
  if (S.video && S.video.ring && !S.morphTo) {
    placeDot();
    if (S.video.pulse) {                         // текущий лист — мигает
      const k = 0.5 + 0.5 * Math.sin(U.uTime.value * 8);
      S.video.pulse.material.opacity = 0.15 + 0.85 * k; S.video.pulse.scale.setScalar(0.045 + 0.075 * k);
    }
    for (const el of clockLabels) if (el.style.display !== 'none') { _dot.set(+el.dataset.x, +el.dataset.y, +el.dataset.z); placeLabel(el, _dot, false); }
  } else clockLabels.forEach((el) => { if (!S.video) el.style.display = 'none'; });
  declutter();
  if (S.pin) {                                   // лист по адресу: кольцо и карточка рядом (у края — по другую сторону)
    const ring = $('pinring'), card = $('pin');
    v3.copy(leafVec(S.pin.i)).project(camera);
    if (!S.morphTo && v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05) {
      const sx = ((v3.x + 1) / 2) * innerWidth, sy = ((1 - v3.y) / 2) * innerHeight;
      ring.style.display = 'block'; ring.style.left = sx + 'px'; ring.style.top = sy + 'px';
      card.style.display = 'block';
      const w = card.offsetWidth, h = card.offsetHeight;
      let x = sx + 28, y = sy - 20;
      if (x + w > innerWidth - 8) x = sx - 28 - w;
      if (y + h > innerHeight - 8) y = innerHeight - 8 - h;
      card.style.left = Math.max(4, x) + 'px'; card.style.top = Math.max(4, y) + 'px';
    } else { ring.style.display = 'none'; card.style.display = 'none'; }
  }
  const aim = $('aim');                          // «прицел» на листе под указателем
  if (S.hover !== null && !S.morphTo) {
    v3.copy(leafVec(S.hover)).project(camera);
    aim.style.display = 'block';
    aim.style.left = ((v3.x + 1) / 2) * innerWidth + 'px';
    aim.style.top = ((1 - v3.y) / 2) * innerHeight + 'px';
  } else aim.style.display = 'none';
  renderer.render(scene, camera);
}
applySel();
drawRuler();
tick();
goToAddress();                                   // адрес листа (#chunk=…) — после загрузки данных
window.__tree = { S, U, views, meta, camera, controls, setView, selectG, selectC, setRange, frame, flyToNode, showAll,
  runSearch, clearSearch, openVideo, closeVideo, setCur, startTour, pick, videoLeaves, chunkId, leafOfChunk, askSearch, clearAnswers,
  goToAddress, pinLeaf, unpin, copyLink };
