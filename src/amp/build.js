import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  BADGE, BODY, BODY_BASE, FACE_FRONT_Z, FACEPLATE, FLOOR_Y, GRILLE, JACK, JEWEL_X, JEWEL_Y, KNOB_X, KNOB_Y, POWER,
} from './layout.js';
import { arc, roundedRectSweep } from './sweep.js';
import {
  backPanelTexture, badgeMaps, faceplateMaps, glowTexture, grilleAlpha, grilleShade, haloTexture, knurlNormal,
  leatherNormal, radialFalloff, spunRoughness,
} from './textures.js';

const shape = (w, h, r) => {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
};

const lathe = (pts, segments = 48) => {
  const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), segments);
  g.rotateX(Math.PI / 2);
  return g;
};

export function createMaterials({ tier }) {
  const leather = leatherNormal(tier === 'high' ? 1024 : 512);
  return {
    tolex: new THREE.MeshPhysicalMaterial({
      color: '#13261c', roughness: 0.68, sheen: 0.35, sheenColor: new THREE.Color('#36573f'), sheenRoughness: 0.55,
      specularIntensity: 0.12, normalMap: leather, normalScale: new THREE.Vector2(0.3, 0.3),
    }),
    leather: new THREE.MeshPhysicalMaterial({
      color: '#3a2418', roughness: 0.52, sheen: 0.4, sheenColor: new THREE.Color('#8a6a4f'), sheenRoughness: 0.45,
      normalMap: leather, normalScale: new THREE.Vector2(0.22, 0.22), clearcoat: 0.12, clearcoatRoughness: 0.5,
      specularIntensity: 0.5, vertexColors: true,
    }),
    thread: new THREE.MeshStandardMaterial({ color: '#c9b48a', roughness: 0.62 }),
    cream: new THREE.MeshPhysicalMaterial({ color: '#d8ccaf', roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35 }),
    urea: new THREE.MeshPhysicalMaterial({ color: '#e8dfc6', roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.12 }),
    brass: new THREE.MeshStandardMaterial({ color: '#d2b070', metalness: 1, roughness: 0.24 }),
    nickel: new THREE.MeshStandardMaterial({ color: '#d9d7d0', metalness: 1, roughness: 0.22 }),
    black: new THREE.MeshStandardMaterial({ color: '#050606', roughness: 0.92 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#0d0d0d', roughness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a2219', roughness: 0.6 }),
  };
}

export function buildBody(mat) {
  const profile = [
    [0.8, 9.4], [0.8, 11.6], [0.8, 12.15],
    ...arc(1.15, 12.15, 0.35, 180, 90, 5).slice(1),
    ...arc(1.15, 11.45, 1.05, 90, 0, 9).slice(1),
    [2.2, 4], [2.2, -4],
    ...arc(1.15, -11.45, 1.05, 0, -90, 9),
    [0.8, -12.5], [0.8, -12.0],
  ];
  const g = roundedRectSweep({ ...BODY_BASE, profile, cornerSegments: 14, uvScale: 1 / 12 });
  const body = new THREE.Mesh(g, mat.tolex);
  body.castShadow = true;
  body.receiveShadow = true;
  return body;
}

export function buildPiping(mat) {
  const profile = arc(0.84, 12.36, 0.22, 360, 0, 14);
  const g = roundedRectSweep({ ...BODY_BASE, profile, cornerSegments: 14, uvScale: 0.5 });
  const m = new THREE.Mesh(g, mat.cream);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function buildInterior(mat) {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(59, 9.8, 1), mat.black);
  box.position.set(0, 7.3, 11.6);
  const baffle = new THREE.Mesh(new THREE.PlaneGeometry(59.4, 16), mat.black);
  baffle.position.set(0, -4.4, 9.8);
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(59.6, 24.4),
    new THREE.MeshStandardMaterial({ map: backPanelTexture(), roughness: 0.85 }),
  );
  back.rotation.y = Math.PI;
  back.position.z = -12.05;
  group.add(box, baffle, back);
  return group;
}

export function buildFaceplate(knobNames) {
  const maps = faceplateMaps(knobNames);
  const g = new THREE.ExtrudeGeometry(shape(FACEPLATE.w, FACEPLATE.h, FACEPLATE.r), {
    depth: FACEPLATE.depth, bevelEnabled: true, bevelThickness: FACEPLATE.bevel, bevelSize: FACEPLATE.bevel,
    bevelSegments: 1, curveSegments: 6,
  });
  const wood = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', map: maps.map, roughness: 1, roughnessMap: maps.roughnessMap, normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(0.5, 0.5), clearcoat: 0.35, clearcoatRoughness: 0.35,
  });
  const endGrain = new THREE.MeshPhysicalMaterial({
    color: '#4a2a15', roughness: 0.66, clearcoat: 0.2, clearcoatRoughness: 0.45,
  });
  const plate = new THREE.Mesh(g, [wood, endGrain]);
  plate.position.set(FACEPLATE.x, FACEPLATE.y, FACEPLATE.z);
  plate.castShadow = plate.receiveShadow = true;
  const mesh = new THREE.Group();
  mesh.add(plate, buildPrint(maps.print));
  return { mesh, maps };
}

function buildPrint(print) {
  const z = FACE_FRONT_Z + 0.004;
  const pos = [], uv = [], index = [];
  for (const t of print.tiles) {
    const [px, py, pw, ph] = t.px.map((v) => v / print.size);
    const x0 = t.x - t.w / 2, x1 = t.x + t.w / 2, y0 = t.y - t.h / 2, y1 = t.y + t.h / 2;
    const b = pos.length / 3;
    pos.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
    uv.push(px, 1 - py - ph, px + pw, 1 - py - ph, px + pw, 1 - py, px, 1 - py);
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  const mesh = new THREE.Mesh(
    g,
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff', map: print.map, alphaMap: print.alphaMap, transparent: true, depthWrite: false,
      roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35, polygonOffset: true, polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

export function buildGrille({ alphaToCoverage }) {
  const alpha = grilleAlpha();
  const grille = new THREE.Mesh(
    new THREE.PlaneGeometry(GRILLE.w, GRILLE.h),
    new THREE.MeshStandardMaterial({
      color: '#2e2318', map: grilleShade(), metalness: 0.55, roughness: 0.52, alphaMap: alpha, alphaTest: 0.5,
      side: THREE.DoubleSide, alphaToCoverage,
    }),
  );
  grille.position.set(GRILLE.x, GRILLE.y, GRILLE.z);
  grille.receiveShadow = true;

  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, color: 0x000000,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(GRILLE.w, GRILLE.h), glowMat);
  glow.position.set(GRILLE.x, GRILLE.y, 10.5);
  return { grille, glow, glowMat, holes: alpha.userData.holes };
}

export function buildKnobs(mat) {
  const body = lathe([
    [1.7, 0], [1.8, 0.06], [1.8, 0.44], [1.775, 0.54], [1.7, 0.6], [1.53, 0.6], [1.5, 0.64], [1.47, 2.12],
    [1.44, 2.23], [1.36, 2.3], [1.18, 2.3],
  ]);
  const capSide = lathe([[1.2, 2.26], [1.2, 2.52], [1.185, 2.595], [1.13, 2.64], [1.04, 2.65]], 96);
  const capTop = new THREE.CircleGeometry(1.045, 64);
  capTop.translate(0, 0, 2.65);
  const pointer = new THREE.BoxGeometry(0.13, 0.84, 0.03);
  pointer.translate(0, 0.56, 2.666);
  const notch = new THREE.BoxGeometry(0.11, 0.3, 0.05);
  notch.translate(0, 1.66, 0.6);

  const knurl = knurlNormal();
  const capSideMat = mat.brass.clone();
  capSideMat.normalMap = knurl;
  capSideMat.roughness = 0.26;
  const capTopMat = mat.brass.clone();
  capTopMat.roughnessMap = spunRoughness();
  capTopMat.roughness = 1;

  const parts = [
    new THREE.InstancedMesh(body, mat.urea, 6),
    new THREE.InstancedMesh(capSide, capSideMat, 6),
    new THREE.InstancedMesh(capTop, capTopMat, 6),
    new THREE.InstancedMesh(pointer, mat.cream, 6),
    new THREE.InstancedMesh(notch, mat.dark, 6),
  ];
  const white = new THREE.Color(1, 1, 1);
  for (const p of parts) {
    p.castShadow = true;
    p.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 6; i++) p.setColorAt(i, white);
  }
  parts[0].receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const z = new THREE.Vector3(0, 0, 1);
  function setAngles(angles) {
    for (let i = 0; i < 6; i++) {
      pos.set(KNOB_X[i], KNOB_Y, FACE_FRONT_Z - 0.01);
      q.setFromAxisAngle(z, angles[i]);
      m.compose(pos, q, one);
      for (const p of parts) p.setMatrixAt(i, m);
    }
    for (const p of parts) p.instanceMatrix.needsUpdate = true;
  }
  function setCapGlow(values) {
    const c = new THREE.Color();
    for (let i = 0; i < 6; i++) {
      c.setScalar(values[i]);
      parts[1].setColorAt(i, c);
      parts[2].setColorAt(i, c);
    }
    parts[1].instanceColor.needsUpdate = parts[2].instanceColor.needsUpdate = true;
  }
  const group = new THREE.Group();
  group.add(...parts);
  return { group, setAngles, setCapGlow };
}

export function buildHalo() {
  const mat = new THREE.MeshBasicMaterial({
    map: haloTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    color: '#e8cc93',
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 7.0), mat);
  mesh.position.set(KNOB_X[0], KNOB_Y, FACE_FRONT_Z + 0.02);
  mesh.visible = false;
  return { mesh, mat };
}

export function buildMarkers() {
  const g = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  g.rotateX(Math.PI / 2);
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 24);
  mesh.count = 0;
  mesh.setColorAt(0, new THREE.Color());
  return mesh;
}

export function buildJewels(mat) {
  const xs = [...JEWEL_X, POWER.x];
  const ys = [JEWEL_Y, JEWEL_Y, JEWEL_Y, POWER.pilotY];
  const sizes = [0.45, 0.45, 0.45, 0.35];
  const dome = new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.46);
  dome.rotateX(Math.PI / 2);
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.42, clearcoat: 1,
    clearcoatRoughness: 0.03, ior: 1.5, specularIntensity: 1, flatShading: true, depthWrite: false,
  });
  const core = new THREE.SphereGeometry(1, 20, 10);
  const bezel = new THREE.TorusGeometry(1, 0.17, 10, 40);
  const domes = new THREE.InstancedMesh(dome, glass, 4);
  const cores = new THREE.InstancedMesh(core, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 4);
  const bezels = new THREE.InstancedMesh(bezel, mat.brass, 4);
  bezels.castShadow = true;
  const m = new THREE.Matrix4();
  for (let i = 0; i < 4; i++) {
    const s = sizes[i];
    m.makeScale(s, s, s * 0.9).setPosition(xs[i], ys[i], FACE_FRONT_Z + 0.02);
    domes.setMatrixAt(i, m);
    m.makeScale(s * 0.62, s * 0.62, s * 0.4).setPosition(xs[i], ys[i], FACE_FRONT_Z + 0.02);
    cores.setMatrixAt(i, m);
    m.makeScale(s * 1.12, s * 1.12, s * 0.9).setPosition(xs[i], ys[i], FACE_FRONT_Z + 0.08);
    bezels.setMatrixAt(i, m);
    domes.setColorAt(i, new THREE.Color(1, 1, 1));
    cores.setColorAt(i, new THREE.Color(0, 0, 0));
  }
  const group = new THREE.Group();
  group.add(cores, domes, bezels);
  return { group, domes, cores };
}

export function buildJack(mat) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    lathe([[0.33, 0], [0.33, 0.3], [0.38, 0.4], [0.6, 0.42], [0.7, 0.34], [0.7, 0]], 40),
    mat.brass,
  );
  ring.castShadow = true;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.33, 32), new THREE.MeshBasicMaterial({ color: '#000000' }));
  hole.position.z = 0.05;
  group.add(ring, hole);
  group.position.set(JACK.x, JACK.y, FACE_FRONT_Z - 0.01);
  return group;
}

export function buildPower(mat) {
  const group = new THREE.Group();
  const washer = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.08, 32).rotateX(Math.PI / 2), mat.brass);
  washer.position.z = 0.04;
  const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.36, 6).rotateX(Math.PI / 2), mat.brass);
  nut.position.z = 0.26;
  nut.rotation.z = Math.PI / 6;
  const pivot = new THREE.Group();
  pivot.position.z = 0.42;
  const bat = new THREE.Mesh(
    lathe([[0.19, 0], [0.16, 0.3], [0.11, 1.12], [0.16, 1.2], [0.2, 1.3], [0.18, 1.4], [0.09, 1.46], [0.001, 1.47]], 24),
    mat.brass,
  );
  pivot.add(bat);
  for (const m of [washer, nut, bat]) m.castShadow = true;
  group.add(washer, nut, pivot);
  group.position.set(POWER.x, POWER.y, FACE_FRONT_Z - 0.01);
  const setUp = (t) => {
    pivot.rotation.x = -(t * 2 - 1) * 0.5;
  };
  setUp(0);
  return { group, setUp };
}

export function buildBadge(name) {
  const maps = badgeMaps(name);
  const g = new THREE.ExtrudeGeometry(shape(BADGE.w, BADGE.h, 0.35), {
    depth: 0.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 6,
  });
  const mesh = new THREE.Mesh(
    g,
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff', map: maps.map, metalness: 1, roughness: 1, roughnessMap: maps.roughnessMap,
      normalMap: maps.normalMap, normalScale: new THREE.Vector2(0.6, 0.6),
    }),
  );
  mesh.position.set(BADGE.x, BADGE.y, BADGE.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, maps };
}

const STRAP = { width: 3.0, thick: 0.8, folded: 1.35, edge: 0.2, stitchIn: 0.3, pitch: 0.45, uvPerCm: 1 / 3.2 };
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function strapThickness(u, L) {
  const e = Math.max(1 - THREE.MathUtils.smoothstep(u, 1.45, 2.0), 1 - THREE.MathUtils.smoothstep(L - u, 1.45, 2.0));
  return STRAP.thick + (STRAP.folded - STRAP.thick) * e;
}

function strapSection(h) {
  const A = STRAP.width / 2, R = STRAP.edge, s = A - STRAP.stitchIn, q = A - R;
  const flat = [q, s + 0.07, s, s - 0.07, 0.7, 0, -0.7, -s + 0.07, -s, -s - 0.07, -q];
  const shade = (a) => (Math.abs(Math.abs(a) - s) < 1e-6 ? 0.68 : 1);
  const arc = (ca, cb, from) => [1, 2, 3].map((k) => {
    const t = ((from + 22.5 * k) * Math.PI) / 180;
    return [ca + R * Math.cos(t), cb + R * Math.sin(t), Math.cos(t), Math.sin(t), 0.72];
  });
  return [
    ...flat.map((a) => [a, h, 0, 1, shade(a)]),
    ...arc(-q, h - R, 90),
    [-A, h - R, -1, 0, 0.66], [-A, -h + R, -1, 0, 0.66],
    ...arc(-q, -h + R, 180),
    ...flat.slice().reverse().map((a) => [a, -h, 0, -1, shade(a)]),
    ...arc(q, -h + R, 270),
    [A, -h + R, 1, 0, 0.66], [A, h - R, 1, 0, 0.66],
    ...arc(q, h - R, 0),
    [q, h, 0, 1, 1],
  ];
}

function strapGeometry(curve, segments = 140) {
  const L = curve.getLength();
  const pos = [], nor = [], col = [], uv = [], index = [];
  const C = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3();
  let row = 0;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, C);
    curve.getTangentAt(t, T);
    N.set(-T.y, T.x, 0);
    const sec = strapSection(strapThickness(t * L, L) / 2);
    row = sec.length;
    let v = 0;
    sec.forEach(([a, b, na, nb, shade], j) => {
      if (j) v += Math.hypot(a - sec[j - 1][0], b - sec[j - 1][1]);
      pos.push(C.x + b * N.x, C.y + b * N.y, C.z + a);
      nor.push(nb * N.x, nb * N.y, na);
      col.push(shade, shade, shade);
      uv.push(t * L * STRAP.uvPerCm, v * STRAP.uvPerCm);
    });
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < row - 1; j++) {
      const a = i * row + j, b = a + row;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

function buildStitches(curve, material, minY) {
  const L = curve.getLength();
  const slant = 0.36;
  const C = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Zn = new THREE.Vector3(), P = new THREE.Vector3();
  const m = new THREE.Matrix4(), scale = new THREE.Matrix4().makeScale(0.17, 0.042, 0.032);
  const mats = [];
  for (let u = STRAP.pitch / 2; u < L; u += STRAP.pitch) {
    curve.getPointAt(u / L, C);
    if (C.y < minY) continue;
    curve.getTangentAt(u / L, T);
    N.set(-T.y, T.x, 0);
    const h = strapThickness(u, L) / 2;
    for (const face of [1, -1]) {
      for (const side of [1, -1]) {
        Zn.copy(N).multiplyScalar(face);
        X.copy(T).multiplyScalar(Math.cos(slant)).addScaledVector(Z_AXIS, Math.sin(slant));
        Y.crossVectors(Zn, X);
        P.copy(C).addScaledVector(N, face * (h + 0.004)).addScaledVector(Z_AXIS, side * (STRAP.width / 2 - STRAP.stitchIn));
        m.makeBasis(X, Y, Zn).setPosition(P).multiply(scale);
        mats.push(m.clone());
      }
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 4), material, mats.length);
  mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
  mesh.receiveShadow = true;
  return mesh;
}

export function buildHandle(mat) {
  const group = new THREE.Group();
  const top = BODY.h / 2;
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(-13.6, top + 0.55, 0),
    new THREE.Vector3(-12.2, top + 6.4, 0),
    new THREE.Vector3(12.2, top + 6.4, 0),
    new THREE.Vector3(13.6, top + 0.55, 0),
  );
  const strap = new THREE.Mesh(strapGeometry(curve), mat.leather);
  strap.castShadow = strap.receiveShadow = true;
  const stitches = buildStitches(curve, mat.thread, top + 1.32);
  const capGeo = new RoundedBoxGeometry(2.2, 1.2, 3.4, 3, 0.35);
  const capMat = mat.brass.clone();
  capMat.roughness = 0.36;
  const caps = new THREE.InstancedMesh(capGeo, capMat, 2);
  const screwGeo = new THREE.SphereGeometry(0.24, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  const screws = new THREE.InstancedMesh(screwGeo, mat.nickel, 4);
  const m = new THREE.Matrix4(), flip = new THREE.Matrix4().makeRotationY(Math.PI);
  [-1, 1].forEach((side, i) => {
    m.makeTranslation(side * 13.2, top + 0.6, 0);
    caps.setMatrixAt(i, m);
    [1, -1].forEach((dir, j) => {
      m.makeTranslation(side * 13.2, top + 0.62, dir * 1.69);
      if (dir < 0) m.multiply(flip);
      screws.setMatrixAt(i * 2 + j, m);
    });
  });
  caps.castShadow = caps.receiveShadow = true;
  group.add(strap, stitches, caps, screws);
  return group;
}

export function buildFeet(mat) {
  const feet = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.5, 1.35, 1.2, 28), mat.rubber, 4);
  const m = new THREE.Matrix4();
  let i = 0;
  for (const x of [-26.5, 26.5]) for (const z of [-9, 9]) feet.setMatrixAt(i++, m.makeTranslation(x, -BODY.h / 2 - 0.6, z));
  return feet;
}

export function buildFloor() {
  const g = new THREE.CircleGeometry(170, 64);
  g.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({
      color: '#0f1412', roughness: 0.9, metalness: 0, alphaMap: radialFalloff(), transparent: true, depthWrite: false,
    }),
  );
  floor.position.y = FLOOR_Y;
  floor.renderOrder = -2;
  return floor;
}
