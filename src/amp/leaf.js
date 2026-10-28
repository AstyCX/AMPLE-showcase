import * as THREE from 'three';

const TOP = [[0, 0], [0.25, 0.26], [0.7, 0.24], [1, 0]];
const BOTTOM = [[1, 0], [0.7, -0.2], [0.25, -0.24], [0, 0]];

export function leafPath(ctx, x, y, length, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const p = ([u, v]) => [x + length * (u * c - v * s), y + length * (u * s + v * c)];
  ctx.moveTo(...p(TOP[0]));
  ctx.bezierCurveTo(...p(TOP[1]), ...p(TOP[2]), ...p(TOP[3]));
  ctx.bezierCurveTo(...p(BOTTOM[1]), ...p(BOTTOM[2]), ...p(BOTTOM[3]));
  ctx.closePath();
}

function bezier(pts, t) {
  const m = 1 - t;
  const a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
  return [
    a * pts[0][0] + b * pts[1][0] + c * pts[2][0] + d * pts[3][0],
    a * pts[0][1] + b * pts[1][1] + c * pts[2][1] + d * pts[3][1],
  ];
}

function edgeSampler(pts) {
  const samples = [];
  for (let i = 0; i <= 64; i++) samples.push(bezier(pts, i / 64));
  samples.sort((p, q) => p[0] - q[0]);
  return (x) => {
    for (let i = 1; i < samples.length; i++) {
      const [x0, y0] = samples[i - 1];
      const [x1, y1] = samples[i];
      if (x <= x1) return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
    return 0;
  };
}

export function createLeafGeometry({ along = 18, across = 6 } = {}) {
  const top = edgeSampler(TOP);
  const bottom = edgeSampler(BOTTOM);
  const pos = [];
  const uv = [];
  const index = [];
  for (let i = 0; i <= along; i++) {
    const x = i / along;
    const yt = top(x);
    const yb = bottom(x);
    for (let j = 0; j <= across; j++) {
      const v = j / across;
      const y = yb + (yt - yb) * v;
      const w = (v - 0.5) * 2;
      const z = 0.08 * Math.sin(Math.PI * x) + 0.05 * w * w + 0.06 * x * x;
      pos.push(x, y, z);
      uv.push(x, v);
    }
  }
  const row = across + 1;
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < across; j++) {
      const a = i * row + j, b = a + row, c = b + 1, d = a + 1;
      index.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
