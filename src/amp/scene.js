import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  buildBadge, buildBody, buildFaceplate, buildFeet, buildFloor, buildGrille, buildHalo, buildHandle, buildInterior,
  buildJack, buildJewels, buildKnobs, buildMarkers, buildPiping, buildPower, createMaterials,
} from './build.js';
import { createContactShadow } from './contactShadow.js';
import { waitForFonts } from './fonts.js';
import { attachInteraction } from './interaction.js';
import { FACE_FRONT_Z, FLOOR_Y, JEWEL_IDS, KNOB_X, KNOB_Y, SCALE, knobAngle, scalePoint } from './layout.js';
import { cardToLeafU, createSprig } from './sprig.js';

const DEG = Math.PI / 180;
const TARGET = new THREE.Vector3(0, 0.5, 0);
const START = { azimuth: -16, elevation: 9 };
const TIERS = ['low', 'medium', 'high'];
const TIER = {
  high: { dpr: 2, bloom: 1, samples: 4, shadow: 2048 },
  medium: { dpr: 1.5, bloom: 0.5, samples: 2, shadow: 1024 },
  low: { dpr: 1, bloom: 0, samples: 0, shadow: 0 },
};
const LIT_MAX = 2.4;
const BLOOM_THRESHOLD = 2.5;
if (!THREE.ShaderChunk.opaque_fragment.includes('LIT_MAX')) {
  THREE.ShaderChunk.opaque_fragment =
    `#ifdef STANDARD\n\toutgoingLight *= min( 1.0, ${LIT_MAX.toFixed(2)} / max( luminance( outgoingLight ), 1e-4 ) ); // LIT_MAX\n#endif\n` +
    THREE.ShaderChunk.opaque_fragment;
}
const GLOW_GAIN = 5;
const PILOT_COLOR = new THREE.Color('#ff5a1f');
const WHITE = new THREE.Color(1, 1, 1);
const MARKER_ACTIVE_LUM = 3.4;
const JEWEL_CORE_LUM = 5.5;
const luminance = (c) => Math.max(0.05, 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
const STILL_MS = 2000;
const DRIFT = { amplitude: 3 * DEG, period: 14, pauseMs: 10000, rampMs: 2500 };
const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const approach = (v, target, dt, tauUp, tauDown = tauUp) =>
  v + (target - v) * (1 - Math.exp(-dt / (target > v ? tauUp : tauDown)));

function initialTier() {
  const cores = navigator.hardwareConcurrency || 4;
  const small = Math.min(screen.width, screen.height) < 700 || matchMedia('(pointer: coarse)').matches;
  if (cores <= 2) return 'low';
  if (small || cores <= 4) return 'medium';
  return 'high';
}

const FRAME_POINTS = (() => {
  const pts = [];
  for (const x of [-31, 31]) for (const y of [-13.5, 13.5]) for (const z of [-12.5, 12.5]) pts.push(new THREE.Vector3(x, y, z));
  for (const x of [-20, 14]) pts.push(new THREE.Vector3(x, 7.2, FACE_FRONT_Z + 2.7));
  const tall = [new THREE.Vector3(0, 19.8, 0), new THREE.Vector3(-13, 15, 1.7), new THREE.Vector3(13, 15, -1.7)];
  for (const x of [-28, 28]) for (const z of [-10.5, 10.5]) tall.push(new THREE.Vector3(x, FLOOR_Y, z));
  return { wide: pts, tall: pts.concat(tall) };
})();

export async function createAmpScene({ container, knobNames, name, positionColors, reducedMotion = false, quality = 'auto' }) {
  const fonts = await waitForFonts(1500);
  let tier = TIER[quality] ? quality : initialTier();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;
  const canvas = renderer.domElement;
  Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', outline: 'none' });
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const key = new THREE.DirectionalLight('#fff0da', 2.4);
  key.position.set(-60, 90, 110);
  Object.assign(key.shadow.camera, { left: -34.5, right: 35, bottom: -29, top: 32, near: 116, far: 188 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  const rim = new THREE.DirectionalLight('#cfe2ff', 1.2);
  rim.position.set(80, 50, -90);
  const fill = new THREE.HemisphereLight('#d9e4dc', '#0c100e', 0.35);
  scene.add(key, rim, fill);

  const mat = createMaterials({ tier });
  const amp = new THREE.Group();
  const faceplate = buildFaceplate(knobNames);
  const grille = buildGrille({ alphaToCoverage: tier !== 'low' });
  const knobs = buildKnobs(mat);
  const halo = buildHalo();
  const markers = buildMarkers();
  const jewels = buildJewels(mat);
  const power = buildPower(mat);
  const badge = buildBadge(name);
  const sprig = createSprig();
  amp.add(
    buildBody(mat), buildPiping(mat), buildInterior(mat), faceplate.mesh, grille.grille, grille.glow, knobs.group,
    halo.mesh, markers, jewels.group, buildJack(mat), power.group, badge.mesh, sprig.group, buildHandle(mat),
    buildFeet(mat),
  );
  scene.add(amp, buildFloor());

  const contacts = [
    createContactShadow(renderer, amp, {
      width: 84, depth: 48, y: FLOOR_Y, height: 7, opacity: 0.9, blur: [2.0, 1.4, 0.8, 0.4], falloff: 1.0,
    }),
    createContactShadow(renderer, amp, {
      width: 66, depth: 30, y: FLOOR_Y + 0.01, height: 1.15, opacity: 0.9, blur: [0.55, 0.3], falloff: 1, size: 1024,
    }),
  ];
  for (const c of contacts) {
    scene.add(c.mesh);
    c.bake();
  }

  if (!fonts.ready) {
    fonts.late.then((ok) => {
      if (!ok || disposed) return;
      faceplate.maps.redraw(knobNames);
      badge.maps.redraw(name);
      wake(true);
    });
  }

  const camera = new THREE.PerspectiveCamera(28, 1, 2, 1500);
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  let size = { w: 1, h: 1 };
  let fitDistance = 200;
  setSpherical(START.azimuth, START.elevation, fitDistance);

  function setSpherical(azDeg, elDeg, d, target = TARGET) {
    const az = azDeg * DEG, el = elDeg * DEG;
    camera.position.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(d).add(target);
    camera.lookAt(target);
  }

  const events = new Map();
  const fired = new Set();
  const emit = (type, detail) => {
    fired.add(type);
    for (const cb of events.get(type) ?? []) cb(detail);
  };

  const knobState = Array.from({ length: 6 }, () => ({ value: 0.5, from: 0.5, to: 0.5, t0: 0, dur: 0 }));
  let dragIndex = -1;
  let hoverIndex = -1;
  let focusIndex = -1;
  let lastInteraction = -Infinity;

  const input = attachInteraction({
    canvas,
    camera,
    getKnobs: () => knobState.map((k) => k.value),
    onDragStart(index) {
      dragIndex = index;
      controls.enabled = false;
      wake();
    },
    onKnobInput(index, value) {
      dragIndex = index;
      const k = knobState[index];
      k.value = k.from = k.to = value;
      k.dur = 0;
      emit('knobinput', { index, value });
      wake();
    },
    onKnobRelease(index, value) {
      dragIndex = -1;
      controls.enabled = true;
      emit('knobrelease', { index, value });
      wake();
    },
    onChannel: (id) => emit('channel', { id }),
    onPower: () => emit('power', {}),
    onHover(hit) {
      const i = hit?.type === 'knob' ? hit.index : -1;
      if (i !== hoverIndex) {
        hoverIndex = i;
        wake();
      }
    },
    onInteract() {
      lastInteraction = performance.now();
    },
  });

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.55;
  controls.minAzimuthAngle = -55 * DEG;
  controls.maxAzimuthAngle = 55 * DEG;
  controls.minPolarAngle = 62 * DEG;
  controls.maxPolarAngle = 98 * DEG;
  canvas.style.touchAction = 'pan-y';
  controls.addEventListener('start', () => (lastInteraction = performance.now()));
  controls.addEventListener('change', () => wake());

  let composer = null;
  let bloom = null;

  function configureTier() {
    const t = TIER[tier];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, t.dpr));
    const shadows = t.shadow > 0;
    if (renderer.shadowMap.enabled !== shadows) {
      renderer.shadowMap.enabled = shadows;
      scene.traverse((o) => [].concat(o.material ?? []).forEach((m) => (m.needsUpdate = true)));
    }
    if (shadows) {
      key.castShadow = true;
      key.shadow.mapSize.set(t.shadow, t.shadow);
      key.shadow.map?.dispose();
      key.shadow.map = null;
      renderer.shadowMap.needsUpdate = true;
    } else key.castShadow = false;
    grille.grille.material.alphaToCoverage = true;
    grille.grille.material.needsUpdate = true;

    composer?.dispose();
    bloom?.dispose();
    composer = bloom = null;
    if (t.bloom > 0) {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: t.samples });
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, BLOOM_THRESHOLD);
      bloom.blendMaterial.blending = THREE.CustomBlending;
      bloom.blendMaterial.blendSrc = THREE.OneFactor;
      bloom.blendMaterial.blendDst = THREE.OneFactor;
      bloom.blendMaterial.blendSrcAlpha = THREE.ZeroFactor;
      bloom.blendMaterial.blendDstAlpha = THREE.OneFactor;
      if (t.bloom < 1) {
        const setSize = bloom.setSize.bind(bloom);
        bloom.setSize = (w, h) => setSize(Math.max(2, Math.round(w * t.bloom)), Math.max(2, Math.round(h * t.bloom)));
      }
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    }
    resize(true);
  }

  const proj = new THREE.Vector3();
  function extentPx(points) {
    camera.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) {
      proj.copy(p).project(camera);
      const x = ((proj.x + 1) / 2) * size.w, y = ((1 - proj.y) / 2) * size.h;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { w: x1 - x0, h: y1 - y0 };
  }

  function computeFit() {
    const freeW = Math.max(1, size.w - insets.left - insets.right);
    const freeH = Math.max(1, size.h - insets.top - insets.bottom);
    const frac = freeW / freeH < 1 ? 0.92 : freeW / freeH < 1.35 ? 0.86 : 0.78;
    const saved = camera.position.clone();
    let d = 200;
    for (let k = 0; k < 6; k++) {
      setSpherical(START.azimuth, START.elevation, d);
      const wide = extentPx(FRAME_POINTS.wide);
      const tall = extentPx(FRAME_POINTS.tall);
      const ratio = Math.max(wide.w / (frac * freeW), tall.h / (0.84 * freeH));
      d *= ratio;
    }
    camera.position.copy(saved);
    camera.lookAt(controls.target);
    return d;
  }

  function applyViewOffset() {
    const sx = (insets.left - insets.right) / 2;
    const sy = (insets.top - insets.bottom) / 2;
    if (!sx && !sy) camera.clearViewOffset();
    else {
      const fw = size.w + 2 * Math.abs(sx), fh = size.h + 2 * Math.abs(sy);
      camera.setViewOffset(fw, fh, Math.abs(sx) - sx, Math.abs(sy) - sy, size.w, size.h);
    }
  }

  function resize(force = false) {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    if (!force && w === size.w && h === size.h) return;
    const ratio = camera.position.distanceTo(controls.target) / fitDistance;
    size = { w, h };
    renderer.setSize(w, h, false);
    composer?.setPixelRatio(renderer.getPixelRatio());
    composer?.setSize(w, h);
    camera.aspect = w / h;
    applyViewOffset();
    camera.updateProjectionMatrix();
    fitDistance = computeFit();
    controls.minDistance = fitDistance * 0.75;
    controls.maxDistance = fitDistance * 1.25;
    const offset = camera.position.clone().sub(controls.target).setLength(fitDistance * (Number.isFinite(ratio) ? ratio : 1));
    camera.position.copy(controls.target).add(offset);
    if (inspect) applyInspect();
    controls.update();
    wake(true);
  }

  let inspect = null;
  function applyInspect() {
    const { azimuth, elevation, distanceFactor, target } = inspect;
    controls.minDistance = 0;
    controls.maxDistance = Infinity;
    controls.target.copy(target);
    setSpherical(azimuth, elevation, fitDistance * distanceFactor, target);
    controls.update();
    wake(true);
  }

  const posColor = (id) => new THREE.Color().setStyle(positionColors?.[id] || '#c9a76a');
  const jewelColors = [...JEWEL_IDS.map(posColor), PILOT_COLOR];
  const jewelState = jewelColors.map(() => ({ value: 0, target: 0 }));
  const coreGain = jewelColors.map((c) => JEWEL_CORE_LUM / luminance(c));
  const powerState = { bat: 0, pilot: 0, on: false };
  const glow = { value: 0.06, level: 0 };
  const caps = Array.from({ length: 6 }, () => 1);
  const haloState = { value: 0, index: -1 };
  let levelSource = null;
  let markerData = [];
  let dirtyKnobs = true;
  let shadowDirty = true;

  function layoutMarkers() {
    const m = new THREE.Matrix4();
    let n = 0;
    markerData.forEach((list, k) => {
      const placed = [];
      for (const mk of list ?? []) {
        if (n >= 24 || !Number.isFinite(mk?.value)) continue;
        const close = placed.filter((v) => Math.abs(v - mk.value) < 0.035).length;
        placed.push(mk.value);
        const r = SCALE.markerR + [0, SCALE.markerSpread, -SCALE.markerSpread, 2 * SCALE.markerSpread][Math.min(close, 3)];
        const [x, y] = scalePoint(k, Math.min(1, Math.max(0, mk.value)), r);
        const s = mk.active ? 0.2 : 0.15;
        m.makeScale(s, s, s * 0.8).setPosition(x, y, FACE_FRONT_Z);
        markers.setMatrixAt(n, m);
        const color = posColor(mk.id);
        markers.setColorAt(n, color.multiplyScalar(mk.active ? MARKER_ACTIVE_LUM / luminance(color) : 0.5));
        n++;
      }
    });
    markers.count = n;
    markers.instanceMatrix.needsUpdate = true;
    if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
  }

  let raf = 0;
  let running = false;
  let lastFrame = 0;
  let lastActive = 0;
  let forceFrames = 0;
  let visible = true;
  let disposed = false;
  let driftPrev = 0;
  let driftFrom = performance.now();
  let frameMs = 0;
  const probe = { until: 0, samples: [] };

  function wake(render = false) {
    if (disposed) return;
    lastActive = performance.now();
    if (render) forceFrames = Math.max(forceFrames, 1);
    if (!running && visible && !document.hidden) {
      running = true;
      lastFrame = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function stepKnobs(now) {
    let moving = false;
    for (let i = 0; i < 6; i++) {
      const k = knobState[i];
      if (k.dur > 0) {
        const t = Math.min(1, (now - k.t0) / k.dur);
        k.value = k.from + (k.to - k.from) * easeOutCubic(t);
        if (t >= 1) k.dur = 0;
        moving = true;
      }
    }
    if (moving || dirtyKnobs) {
      knobs.setAngles(knobState.map((k) => knobAngle(k.value)));
      dirtyKnobs = false;
      return true;
    }
    return false;
  }

  function stepLights(dt) {
    let changed = false;
    const level = levelSource && powerState.on ? Math.min(1, Math.max(0, Number(levelSource()) || 0)) : 0;
    const target = powerState.on ? (reducedMotion ? 0.6 : 0.25 + 0.75 * level) : 0.06;
    const next = approach(glow.value, target, dt, 0.04, 0.25);
    if (Math.abs(next - glow.value) > 1e-4 || powerState.on) changed = true;
    glow.value = next;
    grille.glowMat.color.setScalar(glow.value * GLOW_GAIN);

    const batT = powerState.on ? 1 : 0;
    if (powerState.bat !== batT) {
      powerState.bat = reducedMotion ? batT : Math.max(0, Math.min(1, powerState.bat + (batT ? dt : -dt) / 0.15));
      power.setUp(easeOutCubic(powerState.bat));
      shadowDirty = changed = true;
    }
    const pilotT = powerState.on ? 1 : 0;
    if (Math.abs(powerState.pilot - pilotT) > 1e-3) {
      powerState.pilot = reducedMotion ? pilotT : Math.max(0, Math.min(1, powerState.pilot + (pilotT ? dt : -dt) / 0.3));
      changed = true;
    }
    jewelState[3].target = powerState.pilot;

    const c = new THREE.Color();
    let jewelChanged = false;
    jewelState.forEach((j, i) => {
      const v = reducedMotion ? j.target : approach(j.value, j.target, dt, 0.06);
      if (Math.abs(v - j.value) > 1e-4 || !j.init) {
        j.value = Math.abs(v - j.target) < 1e-3 ? j.target : v;
        j.init = true;
        jewels.cores.setColorAt(i, c.copy(jewelColors[i]).multiplyScalar(0.02 + j.value * coreGain[i]));
        jewels.domes.setColorAt(i, c.copy(jewelColors[i]).multiplyScalar(0.22 + 0.7 * j.value).lerp(WHITE, 0.08));
        jewelChanged = true;
      }
    });
    if (jewelChanged) {
      jewels.cores.instanceColor.needsUpdate = jewels.domes.instanceColor.needsUpdate = true;
      changed = true;
    }

    let capChanged = false;
    for (let i = 0; i < 6; i++) {
      const t = i === dragIndex || i === hoverIndex ? 1.22 : 1;
      const v = approach(caps[i], t, dt, 0.06);
      if (Math.abs(v - caps[i]) > 1e-3) capChanged = true;
      caps[i] = Math.abs(v - t) < 1e-3 ? t : v;
    }
    if (capChanged) knobs.setCapGlow(caps);

    const hi = dragIndex >= 0 ? dragIndex : focusIndex;
    const hTarget = dragIndex >= 0 ? 0.6 : focusIndex >= 0 ? 0.32 : 0;
    if (hi >= 0 && hi !== haloState.index && haloState.value < 0.02) haloState.index = hi;
    const hv = approach(haloState.value, hi === haloState.index ? hTarget : 0, dt, 0.08, 0.15);
    if (Math.abs(hv - haloState.value) > 1e-3) {
      haloState.value = hv;
      halo.mat.opacity = hv;
      halo.mesh.visible = hv > 0.01;
      if (haloState.index >= 0) halo.mesh.position.set(KNOB_X[haloState.index], KNOB_Y, FACE_FRONT_Z + 0.02);
      changed = true;
    }
    return changed || capChanged;
  }

  function stepDrift(now) {
    if (reducedMotion || dragIndex >= 0 || !powerState.on) return false;
    if (now - lastInteraction < DRIFT.pauseMs) {
      driftPrev = 0;
      driftFrom = now;
      return false;
    }
    const ramp = Math.min(1, (now - driftFrom) / DRIFT.rampMs);
    const off = ramp * DRIFT.amplitude * Math.sin(((now - driftFrom) / 1000) * ((2 * Math.PI) / DRIFT.period));
    const d = off - driftPrev;
    driftPrev = off;
    if (Math.abs(d) < 1e-7) return true;
    camera.position.sub(controls.target).applyAxisAngle(THREE.Object3D.DEFAULT_UP, d).add(controls.target);
    return true;
  }

  function render() {
    renderer.info.reset();
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  function frame(now) {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    if (lastFrame && now > lastFrame) frameMs = frameMs ? frameMs * 0.9 + (now - lastFrame) * 0.1 : now - lastFrame;
    lastFrame = now;
    let active = false;
    const knobsMoved = stepKnobs(now);
    const sprigMoved = sprig.update(dt);
    active = knobsMoved || sprigMoved;
    if (stepLights(dt)) active = true;
    if (stepDrift(now)) active = true;
    if (controls.update()) active = true;
    if (dragIndex >= 0 || powerState.on) active = true;
    if (knobsMoved || sprigMoved || shadowDirty) renderer.shadowMap.needsUpdate = true;
    shadowDirty = false;
    if (probe.until && now < probe.until) {
      probe.samples.push(dt * 1000);
      active = true;
    } else if (probe.until) finishProbe();

    if (active || forceFrames > 0) {
      render();
      forceFrames = Math.max(0, forceFrames - 1);
      lastActive = now;
    }
    if (now - lastActive > STILL_MS || !visible || document.hidden) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function finishProbe() {
    const s = probe.samples.slice(5).sort((a, b) => a - b);
    probe.until = 0;
    probe.samples = [];
    if (quality !== 'auto' || s.length < 10) return;
    const median = s[Math.floor(s.length / 2)];
    const i = TIERS.indexOf(tier);
    if (median > 26 && i > 0) {
      tier = TIERS[i - 1];
      configureTier();
    }
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) wake(true);
  });
  io.observe(canvas);
  const onVisibility = () => !document.hidden && wake(true);
  document.addEventListener('visibilitychange', onVisibility);

  configureTier();
  knobs.setAngles(knobState.map((k) => knobAngle(k.value)));
  stepLights(1);
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera).catch(() => {});
  render();
  probe.until = performance.now() + 1100;
  wake(true);
  setTimeout(() => emit('ready', {}), 0);

  const api = {
    setKnobs(values, { animate = true, duration = 650, except = -1 } = {}) {
      const now = performance.now();
      values.slice(0, 6).forEach((v, i) => {
        if (i === except || i === dragIndex || !Number.isFinite(v)) return;
        const k = knobState[i];
        const to = Math.min(1, Math.max(0, v));
        if (!animate || reducedMotion || duration <= 0) {
          k.value = k.from = k.to = to;
          k.dur = 0;
        } else if (Math.abs(to - k.value) > 1e-5) {
          k.from = k.value;
          k.to = to;
          k.t0 = now;
          k.dur = duration;
        }
      });
      dirtyKnobs = true;
      wake(true);
    },
    getKnobs: () => knobState.map((k) => k.value),
    setMarkers(list) {
      markerData = Array.isArray(list) ? list : [];
      layoutMarkers();
      wake(true);
    },
    setChannel(positionId) {
      JEWEL_IDS.forEach((id, i) => (jewelState[i].target = id === positionId ? 1 : 0));
      wake(true);
    },
    setCard(card, stats, { animate = true } = {}) {
      sprig.setCard(Array.isArray(card) ? cardToLeafU(card, stats) : null, animate && !reducedMotion);
      wake(true);
    },
    setPowered(on) {
      powerState.on = Boolean(on);
      wake(true);
    },
    setLevelSource(fn) {
      levelSource = typeof fn === 'function' ? fn : null;
    },
    focusKnob(index) {
      focusIndex = Number.isInteger(index) && index >= 0 && index < 6 ? index : -1;
      wake(true);
    },
    setViewInsets(v = {}) {
      Object.assign(insets, { top: 0, right: 0, bottom: 0, left: 0 }, v);
      resize(true);
    },
    on(type, cb) {
      if (!events.has(type)) events.set(type, new Set());
      events.get(type).add(cb);
      if (type === 'ready' && fired.has('ready')) setTimeout(() => cb({}), 0);
      return () => events.get(type)?.delete(cb);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      input.dispose();
      controls.dispose();
      for (const c of contacts) c.dispose();
      composer?.dispose();
      bloom?.dispose();
      envRT.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material ?? [])) {
          for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
      canvas.remove();
      events.clear();
    },
    debug: {
      renderer, scene, camera, controls,
      tier: () => tier,
      info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, tier, frameMs, holes: grille.holes }),
      setTier(t) {
        if (TIER[t]) {
          tier = t;
          configureTier();
        }
      },
      setView(azimuth, elevation, distanceFactor = 1, target = TARGET) {
        inspect = { azimuth, elevation, distanceFactor, target: target.clone() };
        lastInteraction = performance.now() + 1e9;
        applyInspect();
      },
      renderNow: render,
      knobScreen(i) {
        const p = new THREE.Vector3(KNOB_X[i], KNOB_Y, FACE_FRONT_Z + 2.65).project(camera);
        const r = canvas.getBoundingClientRect();
        return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
      },
      textures: () => ({
        faceplate: faceplate.maps.map.image,
        faceplateNormal: faceplate.maps.normalMap.image,
        faceplateRoughness: faceplate.maps.roughnessMap.image,
        print: faceplate.maps.print.map.image,
        printAlpha: faceplate.maps.print.alphaMap.image,
        grille: grille.grille.material.alphaMap.image,
        grilleShade: grille.grille.material.map.image,
        badge: badge.maps.map.image,
        leather: mat.tolex.normalMap.image,
      }),
    },
  };
  return api;
}
