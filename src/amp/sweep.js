import * as THREE from 'three';

function stations(halfW, halfH, cornerSegments) {
  const out = [{ cx: 0, cy: -halfH, nx: 0, ny: -1 }];
  const corners = [
    [halfW, -halfH, -90],
    [halfW, halfH, 0],
    [-halfW, halfH, 90],
    [-halfW, -halfH, 180],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= cornerSegments; k++) {
      const a = ((a0 + (90 * k) / cornerSegments) * Math.PI) / 180;
      out.push({ cx, cy, nx: Math.cos(a), ny: Math.sin(a) });
    }
  }
  out.push({ cx: 0, cy: -halfH, nx: 0, ny: -1 });
  return out;
}

export function roundedRectSweep({ halfW, halfH, profile, cornerSegments = 12, uvScale = 0.1 }) {
  const st = stations(halfW, halfH, cornerSegments);
  const dRef = Math.max(...profile.map((p) => p[0]));
  const pathLen = [0];
  for (let i = 1; i < st.length; i++) {
    const a = st[i - 1], b = st[i];
    pathLen.push(pathLen[i - 1] + Math.hypot(b.cx + dRef * b.nx - a.cx - dRef * a.nx, b.cy + dRef * b.ny - a.cy - dRef * a.ny));
  }
  const profLen = [0];
  for (let j = 1; j < profile.length; j++) {
    profLen.push(profLen[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
  }
  const pNormals = profile.map((_, j) => {
    const a = profile[Math.max(0, j - 1)];
    const b = profile[Math.min(profile.length - 1, j + 1)];
    const td = b[0] - a[0], tz = b[1] - a[1];
    const l = Math.hypot(td, tz) || 1;
    return [-tz / l, td / l];
  });

  const pos = [], nor = [], uv = [], index = [];
  for (let i = 0; i < st.length; i++) {
    const s = st[i];
    for (let j = 0; j < profile.length; j++) {
      const [d, z] = profile[j];
      const [nd, nz] = pNormals[j];
      pos.push(s.cx + d * s.nx, s.cy + d * s.ny, z);
      nor.push(s.nx * nd, s.ny * nd, nz);
      uv.push(pathLen[i] * uvScale, profLen[j] * uvScale);
    }
  }
  const row = profile.length;
  for (let i = 0; i < st.length - 1; i++) {
    for (let j = 0; j < row - 1; j++) {
      const a = i * row + j, b = (i + 1) * row + j, c = b + 1, d = a + 1;
      index.push(a, d, b, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

export function arc(cd, cz, r, a0, a1, n) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
    out.push([cd + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return out;
}
