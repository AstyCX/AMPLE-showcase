import * as THREE from 'three';
import { SPRIG } from './layout.js';
import { createLeafGeometry } from './leaf.js';
import { leafVeins } from './textures.js';

const LEAVES = 8;
const BRASS = new THREE.Color('#c9a76a');
const MID = new THREE.Color('#b9a66e');
const VERDIGRIS = new THREE.Color('#7fae8e');
const OMEGA = 13;

export function cardToLeafU(card, stats) {
  return Array.from({ length: LEAVES }, (_, i) => {
    const sd = stats?.std?.[i] || 1;
    const z = (card[i] - (stats?.mean?.[i] ?? 0)) / sd;
    return Number.isFinite(z) ? Math.tanh(z / 1.5) : 0;
  });
}

function tint(u, out) {
  return u < 0 ? out.copy(MID).lerp(BRASS, -u) : out.copy(MID).lerp(VERDIGRIS, u);
}

export function createSprig({ envIntensity = 1 } = {}) {
  const group = new THREE.Group();
  const [x0, y0, z0] = SPRIG.from;
  const [x3, y3] = SPRIG.to;
  const a0 = (28 * Math.PI) / 180, a1 = (52 * Math.PI) / 180;
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(x0, y0, z0),
    new THREE.Vector3(x0 + 3.8 * Math.cos(a0), y0 + 3.8 * Math.sin(a0), z0 + 0.05),
    new THREE.Vector3(x3 - 3.4 * Math.cos(a1), y3 - 3.4 * Math.sin(a1), z0 + 0.12),
    new THREE.Vector3(x3, y3, z0 + 0.05),
  );

  const stemGeo = new THREE.TubeGeometry(curve, 64, 0.12, 10, false);
  const p = stemGeo.attributes.position;
  const rings = 65, radial = 11;
  for (let i = 0; i < rings; i++) {
    const c = curve.getPointAt(i / 64);
    const taper = 1 - 0.5 * (i / 64);
    for (let j = 0; j < radial; j++) {
      const k = i * radial + j;
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * taper, c.y + (p.getY(k) - c.y) * taper, c.z + (p.getZ(k) - c.z) * taper);
    }
  }
  const brass = new THREE.MeshStandardMaterial({ color: '#cfae72', metalness: 1, roughness: 0.3, envMapIntensity: envIntensity });
  const stem = new THREE.Mesh(stemGeo, brass);
  stem.castShadow = true;
  group.add(stem);

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), brass);
  tip.position.copy(curve.getPointAt(1));
  group.add(tip);

  const leafMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: leafVeins(),
    metalness: 1,
    roughness: 0.28,
    side: THREE.DoubleSide,
    transparent: true,
    envMapIntensity: envIntensity,
  });
  const leaves = new THREE.InstancedMesh(createLeafGeometry(), leafMat, LEAVES);
  leaves.castShadow = true;
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(leaves);

  const ts = Array.from({ length: LEAVES }, (_, i) => 0.12 + (i * 0.84) / (LEAVES - 1));
  const base = ts.map((t) => ({ p: curve.getPointAt(t), tan: curve.getTangentAt(t) }));
  const state = ts.map(() => ({ u: 0, v: 0, target: 0 }));
  const presence = { value: 1, from: 1, to: 1, t: 1 };
  let dirty = true;

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const s = new THREE.Vector3(), pos = new THREE.Vector3(), color = new THREE.Color();
  const zAxis = new THREE.Vector3(0, 0, 1), xAxis = new THREE.Vector3(1, 0, 0);

  function write() {
    const pr = presence.value;
    const ease = pr * pr * (3 - 2 * pr);
    for (let i = 0; i < LEAVES; i++) {
      const { p: bp, tan } = base[i];
      const side = i % 2 === 0 ? 1 : -1;
      const u = state[i].u;
      const len = 2.3 * (1 + 0.38 * u) * (i === LEAVES - 1 ? 0.8 : 1);
      const ang = Math.atan2(tan.y, tan.x) + side * ((42 + 18 * u) * Math.PI) / 180;
      q.setFromAxisAngle(zAxis, ang);
      q2.setFromAxisAngle(xAxis, side * 0.32);
      q.multiply(q2);
      q2.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.12);
      q.multiply(q2);
      pos.set(bp.x, bp.y - 1.2 * (1 - ease), bp.z + 0.02);
      const k = Math.max(1e-4, ease);
      s.set(len * k, len * k, len * k);
      m.compose(pos, q, s);
      leaves.setMatrixAt(i, m);
      leaves.setColorAt(i, tint(u, color));
    }
    leafMat.opacity = Math.min(1, ease * 1.15);
    leafMat.depthWrite = ease > 0.98;
    leaves.visible = ease > 0.002;
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  }

  function setCard(u, animate) {
    if (u) u.forEach((v, i) => (state[i].target = v));
    const to = u ? 1 : 0;
    if (!animate) {
      state.forEach((st) => ((st.u = st.target), (st.v = 0)));
      presence.value = presence.to = to;
      presence.t = 1;
    } else if (to !== presence.to) {
      presence.from = presence.value;
      presence.to = to;
      presence.t = 0;
      if (to === 1 && presence.value < 0.01) state.forEach((st) => ((st.u = st.target), (st.v = 0)));
    }
    dirty = true;
  }

  function update(dt) {
    let moving = false;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (const st of state) {
      for (let k = 0; k < steps; k++) {
        const a = OMEGA * OMEGA * (st.target - st.u) - 2 * OMEGA * st.v;
        st.v += a * h;
        st.u += st.v * h;
      }
      if (Math.abs(st.target - st.u) > 1e-4 || Math.abs(st.v) > 1e-3) moving = true;
      else (st.u = st.target), (st.v = 0);
    }
    if (presence.t < 1) {
      presence.t = Math.min(1, presence.t + dt / 0.5);
      presence.value = presence.from + (presence.to - presence.from) * presence.t;
      moving = true;
    }
    if (moving || dirty) write();
    const was = dirty;
    dirty = false;
    return moving || was;
  }

  write();
  return { group, setCard, update };
}
