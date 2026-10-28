import * as THREE from 'three';
import { COPY } from '../../copy.js';
import { BADGE, FACEPLATE, GRILLE, JACK, JEWEL_LABELS, JEWEL_X, JEWEL_Y, KNOB_X, KNOB_Y, POWER, SCALE, scalePoint } from './layout.js';
import { leafPath } from './leaf.js';
import {
  blurField, canvasTexture, canvasToField, fbm, makeCanvas, normalCanvas, rng, smoothstep, spacedText, valueNoise,
} from './canvas.js';

export const FONTS = { serif: "'Source Code Pro', ui-monospace, monospace", sans: "'Source Code Pro', ui-monospace, monospace" };

export function leatherNormal(size = 1024) {
  const grid = 48;
  const r = rng(7);
  const pts = new Float32Array(grid * grid * 2);
  for (let i = 0; i < grid * grid; i++) {
    pts[i * 2] = r();
    pts[i * 2 + 1] = r();
  }
  const f = new Float32Array(size * size);
  const cell = size / grid;
  for (let y = 0; y < size; y++) {
    const gy = Math.floor(y / cell);
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / cell);
      let f1 = 1e9, f2 = 1e9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = gx + ox, cy = gy + oy;
          const k = (((cy + grid) % grid) * grid + ((cx + grid) % grid)) * 2;
          const px = (cx + pts[k]) * cell, py = (cy + pts[k + 1]) * cell;
          const d = (px - x) * (px - x) + (py - y) * (py - y);
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
      }
      const edge = (Math.sqrt(f2) - Math.sqrt(f1)) / cell;
      const dome = 1 - Math.min(1, Math.sqrt(f1) / cell) * 0.35;
      f[y * size + x] = smoothstep(0, 0.45, edge) * dome + (r() - 0.5) * 0.05;
    }
  }
  blurField(f, size, size, 1, 2, true);
  const t = canvasTexture(normalCanvas(f, size, size, size / 260, true), { repeat: true });
  return t;
}

export function knurlNormal() {
  const w = 1024, h = 8;
  const f = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    const p = ((x / w) * 120) % 1;
    const v = 1 - Math.abs(p - 0.5) * 2;
    for (let y = 0; y < h; y++) f[y * w + x] = Math.min(1, v * 1.4);
  }
  const t = canvasTexture(normalCanvas(f, w, h, 3.2, true), { repeat: true });
  return t;
}

export function spunRoughness() {
  const s = 256;
  const c = makeCanvas(s, s);
  const ctx = c.getContext('2d');
  const r = rng(11);
  ctx.fillStyle = 'rgb(84,84,84)';
  ctx.fillRect(0, 0, s, s);
  for (let k = 2; k < s / 2; k += 1) {
    const v = 74 + r() * 30;
    ctx.strokeStyle = `rgb(${v},${v},${v})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, k, 0, Math.PI * 2);
    ctx.stroke();
  }
  return canvasTexture(c);
}

const FP_W = 2048;
const FP_H = 304;
const fpX = (x) => ((x - (FACEPLATE.x - FACEPLATE.w / 2)) / FACEPLATE.w) * FP_W;
const fpY = (y) => ((FACEPLATE.y + FACEPLATE.h / 2 - y) / FACEPLATE.h) * FP_H;
const FP_PX = FP_W / FACEPLATE.w;

const PRINT = {
  ivory: '#f3ead2',
  shadow: '#1d1007',
  nameY: 11.0,
  nameCap: 0.48,
  numeralCap: 0.34,
  smallCap: 0.3,
  tinyCap: 0.2,
  tracking: 0.14,
  small: [
    ...JEWEL_LABELS.map((t, i) => ({ text: t, x: JEWEL_X[i], y: 5.72 })),
    { text: COPY.amp.input, x: JACK.x, y: 8.8 },
    { text: COPY.amp.power, x: POWER.x, y: 4.5 },
    { text: COPY.amp.on, x: POWER.x - 1.22, y: POWER.y + 0.8, tiny: true },
    { text: COPY.amp.off, x: POWER.x - 1.22, y: POWER.y - 0.8, tiny: true },
  ],
};

function keepOut() {
  const z = [];
  KNOB_X.forEach((x, i) => {
    z.push({ x, y: KNOB_Y, r: 2.2 });
    for (let k = 0; k <= 10; k++) {
      const [px, py] = scalePoint(i, k / 10, SCALE.tickR);
      z.push({ x: px, y: py, r: 0.45 });
    }
    for (const v of [0, 0.5, 1]) {
      const [px, py] = scalePoint(i, v, SCALE.numeralR);
      z.push({ x: px, y: py, r: 0.62 });
    }
    z.push({ rect: [x - 2.5, PRINT.nameY - 0.5, x + 2.5, PRINT.nameY + 0.5] });
  });
  JEWEL_X.forEach((x) => z.push({ x, y: JEWEL_Y, r: 1.0 }));
  for (const s of PRINT.small) {
    const hw = s.tiny ? 0.5 : 1.05, hh = s.tiny ? 0.25 : 0.38;
    z.push({ rect: [s.x - hw, s.y - hh, s.x + hw, s.y + hh] });
  }
  z.push({ x: JACK.x, y: JACK.y, r: 1.2 });
  z.push({ x: POWER.x, y: POWER.y, r: 1.35 }, { x: POWER.x, y: POWER.pilotY, r: 0.9 });
  return z;
}

function blocked(zones, x, y, margin = 0.08) {
  const inset = 0.5;
  if (x < -FACEPLATE.w / 2 + inset || x > FACEPLATE.w / 2 - inset) return true;
  if (y < FACEPLATE.y - FACEPLATE.h / 2 + inset || y > FACEPLATE.y + FACEPLATE.h / 2 - inset) return true;
  for (const z of zones) {
    if (z.rect) {
      if (x > z.rect[0] - margin && x < z.rect[2] + margin && y > z.rect[1] - margin && y < z.rect[3] + margin) return true;
    } else if (Math.hypot(x - z.x, y - z.y) < z.r + margin) return true;
  }
  return false;
}

function drawFrond(ctx, zones, o) {
  const ds = 0.03;
  let x = o.x, y = o.y, h = (o.heading * Math.PI) / 180;
  const path = [[x, y, h]];
  for (let s = 0; s < o.length; s += ds) {
    const f = s / o.length;
    h += (o.bend + o.curl * f ** 4) * ds;
    x += Math.cos(h) * ds;
    y += Math.sin(h) * ds;
    if (blocked(zones, x, y, 0.02)) break;
    path.push([x, y, h]);
  }
  ctx.beginPath();
  path.forEach(([px, py], i) => (i ? ctx.lineTo(fpX(px), fpY(py)) : ctx.moveTo(fpX(px), fpY(py))));
  ctx.stroke();

  const n = path.length;
  let side = o.firstSide ?? 1;
  for (let k = Math.floor(n * 0.04); k < n * 0.86; k += Math.max(2, Math.round((o.spacing * (1 - 0.45 * (k / n))) / ds))) {
    const [px, py, ph] = path[k];
    const f = k / n;
    const env = (1 - f) ** 0.75 * Math.min(1, 0.45 + f / 0.18);
    const ang = ph + side * ((o.angle - 22 * f) * Math.PI) / 180;
    for (const scale of [1, 0.72, 0.5, 0.34]) {
      const len = o.pinna * env * scale;
      if (len < 0.14) break;
      const tipX = px + Math.cos(ang) * len, tipY = py + Math.sin(ang) * len;
      const midX = px + Math.cos(ang) * len * 0.55, midY = py + Math.sin(ang) * len * 0.55;
      const nx = -Math.sin(ang) * len * 0.2, ny = Math.cos(ang) * len * 0.2;
      if ([[tipX, tipY], [midX + nx, midY + ny], [midX - nx, midY - ny]].some(([qx, qy]) => blocked(zones, qx, qy))) continue;
      ctx.beginPath();
      leafPath(ctx, fpX(px), fpY(py), len * FP_PX, -ang);
      ctx.stroke();
      if (len > 0.42) {
        ctx.beginPath();
        ctx.moveTo(fpX(px), fpY(py));
        ctx.lineTo(fpX(px + Math.cos(ang) * len * 0.8), fpY(py + Math.sin(ang) * len * 0.8));
        ctx.stroke();
      }
      break;
    }
    side = -side;
  }
}

const FRONDS = [
  { x: -28.6, y: 4.0, heading: 84, length: 8.2, bend: -0.02, curl: -3.0, pinna: 0.75, spacing: 0.36, angle: 58 },
  { x: -28.3, y: 3.95, heading: 24, length: 5.6, bend: 0.05, curl: 4.2, pinna: 0.8, spacing: 0.34, angle: 58, firstSide: -1 },
  { x: 28.6, y: 11.1, heading: 182, length: 9.2, bend: 0.03, curl: 3.4, pinna: 1.0, spacing: 0.4, angle: 60 },
];

function fernBurn() {
  const c = makeCanvas(FP_W, FP_H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, FP_W, FP_H);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.2;
  const zones = keepOut();
  for (const fr of FRONDS) drawFrond(ctx, zones, fr);
  if (globalThis.__fernDebug) {
    ctx.lineWidth = 1;
    for (const z of zones) {
      ctx.beginPath();
      if (z.rect) ctx.rect(fpX(z.rect[0]), fpY(z.rect[3]), (z.rect[2] - z.rect[0]) * FP_PX, (z.rect[3] - z.rect[1]) * FP_PX);
      else ctx.arc(fpX(z.x), fpY(z.y), z.r * FP_PX, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const core = canvasToField(c);
  const halo = blurField(Float32Array.from(core), FP_W, FP_H, 2, 2);
  for (let i = 0; i < core.length; i++) core[i] = Math.min(1, 0.75 * core[i] + 0.8 * halo[i]);
  return core;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearHex = (hex) => [1, 3, 5].map((k) => toLinear(parseInt(hex.slice(k, k + 2), 16) / 255));
const SRGB8 = (() => {
  const lut = new Uint8ClampedArray(4096);
  for (let i = 0; i < 4096; i++) {
    const c = i / 4095;
    lut[i] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
  }
  return lut;
})();
const toSrgb8 = (v) => SRGB8[Math.max(0, Math.min(4095, Math.round(v * 4095)))];

function rgbaCanvas(data, w, h) {
  const c = makeCanvas(w, h);
  c.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0);
  return c;
}

function grayCanvas(f, w, h) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < f.length; i++) {
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = f[i] * 255;
    d[i * 4 + 3] = 255;
  }
  return rgbaCanvas(d, w, h);
}

const WOOD = {
  base: linearHex('#7b4f2e'),
  dark: linearHex('#4a2c18'),
  light: linearHex('#9a6a41'),
  burn: linearHex('#2a160b'),
  linesPerCm: 3.4,
};

function plateOcclusion(X, Y) {
  let ao = 1;
  const ring = (cx, cy, r0, r1, depth) => {
    const dx = X - cx, dy = Y - cy;
    if (Math.abs(dx) > r1 || Math.abs(dy) > r1) return;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < r1) ao *= 1 - depth * (1 - smoothstep(r0, r1, d));
  };
  for (const kx of KNOB_X) ring(kx, KNOB_Y, 1.78, 2.7, 0.6);
  for (const jx of JEWEL_X) ring(jx, JEWEL_Y, 0.5, 1.0, 0.5);
  ring(JACK.x, JACK.y, 0.7, 1.2, 0.5);
  ring(POWER.x, POWER.y, 0.72, 1.25, 0.5);
  ring(POWER.x, POWER.pilotY, 0.4, 0.8, 0.45);
  const top = FACEPLATE.y + FACEPLATE.h / 2 - Y;
  const bottom = Y - (FACEPLATE.y - FACEPLATE.h / 2);
  const side = FACEPLATE.w / 2 - Math.abs(X - FACEPLATE.x);
  ao *= 1 - 0.5 * (1 - smoothstep(0, 0.6, top));
  ao *= 1 - 0.38 * (1 - smoothstep(0, 0.45, side));
  ao *= 1 - 0.25 * (1 - smoothstep(0, 0.3, bottom));
  return ao;
}

function woodFields(burn) {
  const W = FP_W, H = FP_H, N = W * H;
  const nWarp = valueNoise(31), nWarp2 = valueNoise(32), nTone = valueNoise(33), nStreak = valueNoise(34);
  const nLine = valueNoise(35), nFibre = valueNoise(36), nPhase = valueNoise(37);
  const S = 4, GW = Math.ceil(W / S) + 1, GH = Math.ceil(H / S) + 1;
  const warp = new Float32Array(GW * GH), phase = new Float32Array(GW * GH);
  const tone = new Float32Array(GW * GH), streak = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const X = (gx * S) / FP_PX, Y = (gy * S) / FP_PX, i = gy * GW + gx;
      warp[i] = 0.8 * fbm(nWarp, X * 0.035, Y * 0.12, 3) + 0.07 * fbm(nWarp2, X * 0.22 + 5.1, Y * 1.4 + 2.3, 2);
      phase[i] = 2.2 * fbm(nPhase, X * 0.02 + 9.2, Y * 0.35, 3);
      tone[i] = fbm(nTone, X * 0.05 + 1.7, Y * 0.3, 3);
      streak[i] = fbm(nStreak, X * 0.03 + 4.4, (Y + warp[i]) * 1.4, 3);
    }
  }
  const at = (f, x, y) => {
    const gx = x / S, gy = y / S, ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, i = iy * GW + ix;
    return (f[i] * (1 - fx) + f[i + 1] * fx) * (1 - fy) + (f[i + GW] * (1 - fx) + f[i + GW + 1] * fx) * fy;
  };

  const late = new Float32Array(N), fine = new Float32Array(N), early = new Float32Array(N);
  const fibre = new Float32Array(N), light = new Float32Array(N), drift = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, X = x / FP_PX, Y = y / FP_PX;
      const yy = Y + at(warp, x, y), ph = at(phase, x, y);
      const r = yy * WOOD.linesPerCm + ph;
      const line = Math.floor(r), p = r - line;
      const strength = 0.2 + 0.8 * smoothstep(-0.4, 0.6, nLine(line * 1.93 + 0.5, X * 0.08));
      late[i] = smoothstep(0.5, 0.82, p) * (1 - smoothstep(0.86, 0.99, p)) * strength;
      fine[i] = Math.max(0, Math.sin((yy * 9.7 + 0.4 * ph) * 2 * Math.PI)) ** 6;
      early[i] = 1 - smoothstep(0.2, 0.45, p);
      fibre[i] = nFibre(X * 0.9, yy * 24);
      light[i] = smoothstep(0.0, 0.55, at(streak, x, y));
      drift[i] = at(tone, x, y);
    }
  }

  const pore = new Float32Array(N);
  const rand = rng(41);
  for (let k = 0, n = Math.round(N / 30); k < n; k++) {
    const x0 = (rand() * W) | 0, y = (rand() * H) | 0, i0 = y * W + x0;
    if (rand() > 0.1 + 0.9 * early[i0]) continue;
    const len = 2 + ((rand() * 3) | 0), depth = 0.3 + 0.45 * rand();
    for (let t = 0; t < len && x0 + t < W; t++) {
      const v = depth * (0.55 + 0.45 * Math.sin(((t + 0.5) / len) * Math.PI));
      if (v > pore[i0 + t]) pore[i0 + t] = v;
    }
  }

  const albedo = new Uint8ClampedArray(N * 4), rough = new Float32Array(N), height = new Float32Array(N);
  const [br, bg, bb] = WOOD.base, [dr, dg, db] = WOOD.dark, [lr, lg, lb] = WOOD.light, [ur, ug, ub] = WOOD.burn;
  for (let y = 0; y < H; y++) {
    const wy = FACEPLATE.y + FACEPLATE.h / 2 - (y + 0.5) / FP_PX;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const wx = FACEPLATE.x - FACEPLATE.w / 2 + (x + 0.5) / FP_PX;
      const st = light[i] * 0.55, lt = late[i] * 0.72 + fine[i] * 0.14, b = burn[i], pr = pore[i], tn = drift[i];
      let r = br + (lr - br) * st, g = bg + (lg - bg) * st, bl = bb + (lb - bb) * st;
      r += (dr - r) * lt;
      g += (dg - g) * lt;
      bl += (db - bl) * lt;
      const v = (1 + 0.12 * tn) * (1 + 0.06 * fibre[i]) * (1 - 0.45 * pr);
      r *= v * (1 + 0.04 * tn);
      g *= v;
      bl *= v * (1 - 0.06 * tn);
      const bk = 0.42 * b;
      const ao = plateOcclusion(wx, wy);
      albedo[i * 4] = toSrgb8((r + (ur - r) * bk) * ao);
      albedo[i * 4 + 1] = toSrgb8((g + (ug - g) * bk) * ao);
      albedo[i * 4 + 2] = toSrgb8((bl + (ub - bl) * bk) * ao);
      albedo[i * 4 + 3] = 255;
      rough[i] = Math.min(1, 0.52 + 0.06 * late[i] + 0.12 * pr - 0.05 * light[i] + 0.12 * b);
      height[i] = 0.5 - 0.05 * late[i] - 0.1 * pr + 0.02 * fibre[i] - 0.22 * b;
    }
  }
  return { albedo, rough, height };
}

export function faceplateMaps(knobNames) {
  const { albedo, rough, height } = woodFields(fernBurn());
  const map = canvasTexture(rgbaCanvas(albedo, FP_W, FP_H), { color: true, anisotropy: 16 });
  const roughnessMap = canvasTexture(grayCanvas(rough, FP_W, FP_H), { anisotropy: 16 });
  const normalMap = canvasTexture(normalCanvas(height, FP_W, FP_H, 2.2), { anisotropy: 16 });
  for (const t of [map, roughnessMap, normalMap]) {
    t.repeat.set(1 / FACEPLATE.w, 1 / FACEPLATE.h);
    t.offset.set(0.5, 0.5);
  }
  const print = printMaps(knobNames);
  return { map, roughnessMap, normalMap, print, redraw: print.redraw };
}

const PRINT_SIZE = 1024;
const PRINT_PPC = 100;
const CAP_EM = 0.66;
const UNDER = { dx: 2.5, dy: 3.5, blur: 3.5, alpha: 0.5 };

function printTiles() {
  const tiles = KNOB_X.map((x) => ({ kind: 'scale', x, y: KNOB_Y, w: 6.6, h: 6.6, px: [0, 0, 660, 660] }));
  KNOB_X.forEach((x, i) => {
    const px = [(i % 2) * 512 + 6, 676 + Math.floor(i / 2) * 114, 500, 100];
    tiles.push({ kind: 'name', index: i, x, y: PRINT.nameY, w: 5.0, h: 1.0, px });
  });
  PRINT.small.forEach((s, k) => {
    tiles.push({ kind: 'small', text: s.text, tiny: s.tiny, x: s.x, y: s.y, w: 2.2, h: 0.7, px: [690, 10 + k * 84, 220, 70] });
  });
  return tiles;
}

function capText(ctx, text, cx, cy, capPx, weight, trackEm, maxW = Infinity) {
  const chars = [...text];
  let size = capPx / CAP_EM;
  const width = (s) => {
    ctx.font = `${weight} ${s}px ${FONTS.sans}`;
    return chars.reduce((a, ch) => a + ctx.measureText(ch).width, 0) + trackEm * s * (chars.length - 1);
  };
  while (width(size) > maxW && size > 8) size *= 0.96;
  let x = cx - width(size) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const ch of chars) {
    ctx.fillText(ch, x, cy + (size * CAP_EM) / 2);
    x += ctx.measureText(ch).width + trackEm * size;
  }
}

function paintPrint(ctx, tiles, knobNames) {
  const P = PRINT_PPC;
  const ring = (v, r) => {
    const [x, y] = scalePoint(0, v, r);
    return [330 + (x - KNOB_X[0]) * P, 330 - (y - KNOB_Y) * P];
  };
  ctx.lineCap = 'butt';
  for (let k = 0; k <= 10; k++) {
    const major = k % 5 === 0;
    const [x0, y0] = ring(k / 10, SCALE.tickR - (major ? 0.27 : 0.17));
    const [x1, y1] = ring(k / 10, SCALE.tickR + 0.1);
    ctx.lineWidth = (major ? 0.075 : 0.05) * P;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  for (const [v, t] of [[0, '0'], [0.5, '5'], [1, '10']]) {
    const [x, y] = ring(v, SCALE.numeralR + (v === 0.5 ? 0.04 : 0.1));
    capText(ctx, t, x, y, PRINT.numeralCap * P, 600, 0.02);
  }
  for (const t of tiles) {
    const [px, py, pw, ph] = t.px;
    if (t.kind === 'name') {
      const name = String(knobNames[t.index] ?? '').toUpperCase();
      capText(ctx, name, px + pw / 2, py + ph / 2, PRINT.nameCap * P, 700, PRINT.tracking, pw - 24);
    } else if (t.kind === 'small') {
      const cap = (t.tiny ? PRINT.tinyCap : PRINT.smallCap) * P;
      capText(ctx, String(t.text).toUpperCase(), px + pw / 2, py + ph / 2, cap, 700, PRINT.tracking, pw - 20);
    }
  }
}

export function printMaps(knobNames) {
  const tiles = printTiles();
  const color = makeCanvas(PRINT_SIZE, PRINT_SIZE);
  const cover = makeCanvas(PRINT_SIZE, PRINT_SIZE);
  const map = canvasTexture(color, { color: true, anisotropy: 16 });
  const alphaMap = canvasTexture(cover, { anisotropy: 16 });
  const OFF = 4 * PRINT_SIZE;
  const shadowOnly = (ctx, shade, blur, times, names) => {
    ctx.save();
    ctx.translate(-OFF, 0);
    ctx.shadowColor = shade;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = OFF + UNDER.dx;
    ctx.shadowOffsetY = UNDER.dy;
    ctx.fillStyle = ctx.strokeStyle = '#000';
    for (let k = 0; k < times; k++) paintPrint(ctx, tiles, names);
    ctx.restore();
  };
  const redraw = (names) => {
    let ctx = color.getContext('2d');
    ctx.fillStyle = PRINT.ivory;
    ctx.fillRect(0, 0, PRINT_SIZE, PRINT_SIZE);
    shadowOnly(ctx, PRINT.shadow, UNDER.blur * 1.6, 3, names);
    ctx.fillStyle = ctx.strokeStyle = PRINT.ivory;
    paintPrint(ctx, tiles, names);
    ctx = cover.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, PRINT_SIZE, PRINT_SIZE);
    shadowOnly(ctx, `rgba(255,255,255,${UNDER.alpha})`, UNDER.blur, 1, names);
    ctx.fillStyle = ctx.strokeStyle = '#fff';
    paintPrint(ctx, tiles, names);
    map.needsUpdate = alphaMap.needsUpdate = true;
  };
  redraw(knobNames);
  return { map, alphaMap, tiles, size: PRINT_SIZE, redraw };
}

export function grilleAlpha() {
  const W = 2048, H = 512;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  const px = W / GRILLE.w;
  const gx = (x) => (x + GRILLE.w / 2) * px;
  const gy = (y) => (GRILLE.h / 2 - (y - GRILLE.y)) * (H / GRILLE.h);
  const center = { x: 4.5, y: GRILLE.y - 1.2 };
  const spacing = 0.43;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const rMax = Math.hypot(GRILLE.w / 2 + Math.abs(center.x), GRILLE.h / 2 + 1.5);
  const badge = { x0: BADGE.x - BADGE.w / 2 - 0.5, x1: BADGE.x + BADGE.w / 2 + 0.5, y0: BADGE.y - BADGE.h / 2 - 0.5, y1: BADGE.y + BADGE.h / 2 + 0.5 };
  let count = 0;
  for (let k = 1; ; k++) {
    const r = spacing * Math.sqrt(k);
    if (r > rMax) break;
    const th = k * golden;
    const x = center.x + r * Math.cos(th);
    const y = center.y + r * Math.sin(th);
    const edge = Math.min(x + GRILLE.w / 2, GRILLE.w / 2 - x, y - (GRILLE.y - GRILLE.h / 2), GRILLE.y + GRILLE.h / 2 - y);
    if (edge < 0.45) continue;
    const bdx = Math.max(badge.x0 - x, 0, x - badge.x1);
    const bdy = Math.max(badge.y0 - y, 0, y - badge.y1);
    const fade = smoothstep(0.45, 1.6, edge) * smoothstep(0.0, 1.3, Math.hypot(bdx, bdy));
    const grow = 0.75 + 0.25 * Math.min(1, r / 16);
    const len = (0.3 + 0.22 * (0.5 + 0.5 * Math.sin(k * 0.37))) * grow * fade;
    if (len < 0.1) continue;
    const flow = th + Math.PI / 2 + 0.55 * Math.sin(0.19 * x + 0.8) + 0.45 * Math.cos(0.31 * y - 0.07 * x);
    ctx.beginPath();
    leafPath(ctx, gx(x - (Math.cos(flow) * len) / 2), gy(y - (Math.sin(flow) * len) / 2), len * px, -flow);
    ctx.fill();
    count++;
  }
  const t = canvasTexture(c);
  t.userData.holes = count;
  return t;
}

export function grilleShade() {
  const W = 1024, H = 256, px = W / GRILLE.w, py = H / GRILLE.h;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const Y = GRILLE.y + GRILLE.h / 2 - (y + 0.5) / py;
    const top = GRILLE.y + GRILLE.h / 2 - Y, bottom = Y - (GRILLE.y - GRILLE.h / 2);
    const by = Math.max(BADGE.y - BADGE.h / 2 - Y, 0, Y - BADGE.y - BADGE.h / 2);
    for (let x = 0; x < W; x++) {
      const X = GRILLE.x - GRILLE.w / 2 + (x + 0.5) / px;
      const side = GRILLE.w / 2 - Math.abs(X - GRILLE.x);
      const bx = Math.max(BADGE.x - BADGE.w / 2 - X, 0, X - BADGE.x - BADGE.w / 2);
      let ao = 1 - 0.62 * (1 - smoothstep(0, 1.1, top));
      ao *= 1 - 0.45 * (1 - smoothstep(0, 0.8, Math.min(bottom, side)));
      ao *= 1 - 0.45 * (1 - smoothstep(0, 0.7, Math.sqrt(bx * bx + by * by)));
      const v = toSrgb8(ao), i = (y * W + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return canvasTexture(rgbaCanvas(data, W, H), { color: true });
}

export function glowTexture() {
  const W = 512, H = 128;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const haze = ctx.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, W * 0.55);
  haze.addColorStop(0, 'rgba(150,58,14,0.55)');
  haze.addColorStop(1, 'rgba(40,10,2,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, W, H);
  for (const x of [-14, 0, 14]) {
    const cx = ((x + GRILLE.w / 2) / GRILLE.w) * W;
    const cy = H * 0.42;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 1.25);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 62);
    g.addColorStop(0, 'rgba(255,214,150,1)');
    g.addColorStop(0.18, 'rgba(255,150,60,0.9)');
    g.addColorStop(0.5, 'rgba(200,80,20,0.45)');
    g.addColorStop(1, 'rgba(90,24,4,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-70, -70, 140, 140);
    ctx.restore();
  }
  return canvasTexture(c, { color: true });
}

export function leafVeins() {
  const W = 256, H = 96;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#8c8070';
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W * 0.96, H / 2);
  ctx.stroke();
  ctx.strokeStyle = '#b4aa98';
  ctx.lineWidth = 1.6;
  for (let i = 1; i < 7; i++) {
    const x = (i / 7.4) * W;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x, H / 2);
      ctx.quadraticCurveTo(x + 18, H / 2 + s * 16, x + 34, H / 2 + s * 34);
      ctx.stroke();
    }
  }
  return canvasTexture(c, { color: true });
}

export function radialFalloff(size = 256, inner = 0.15) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * inner * 0.5, size / 2, size / 2, size / 2);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.45, '#888');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(c);
}

export function haloTexture() {
  const s = 256;
  const c = makeCanvas(s, s);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.72, 'rgba(255,255,255,0)');
  g.addColorStop(0.84, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return canvasTexture(c, { color: true });
}

export function backPanelTexture() {
  const W = 512, H = 210;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#16191a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#030303';
  for (let i = 0; i < 5; i++) {
    roundRect(ctx, 70 + i * 78, 60, 46, 90, 10);
    ctx.fill();
  }
  return canvasTexture(c, { color: true });
}

export function badgeMaps(name) {
  const W = 1040, H = 256;
  const ppc = W / BADGE.w;
  const map = canvasTexture(makeCanvas(W, H), { color: true });
  const roughnessMap = canvasTexture(makeCanvas(W, H));
  const normalMap = canvasTexture(makeCanvas(W, H));
  const draw = (text) => {
    const hc = makeCanvas(W, H);
    const ctx = hc.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = ctx.fillStyle = '#fff';
    ctx.lineWidth = 0.13 * ppc;
    roundRect(ctx, 0.24 * ppc, 0.24 * ppc, W - 0.48 * ppc, H - 0.48 * ppc, 0.28 * ppc);
    ctx.stroke();
    const label = String(text || '').toUpperCase();
    let size = 1.75 * ppc;
    ctx.font = `600 ${size}px ${FONTS.serif}`;
    const width = (s) => {
      ctx.font = `600 ${s}px ${FONTS.serif}`;
      return [...label].reduce((a, ch) => a + ctx.measureText(ch).width, 0) + 0.18 * s * (label.length - 1);
    };
    while (width(size) > 9.6 * ppc && size > 20) size *= 0.96;
    ctx.font = `600 ${size}px ${FONTS.serif}`;
    spacedText(ctx, label, W / 2, H / 2 + size * 0.04, 0.18 * size);

    const f = canvasToField(hc);
    const raised = Float32Array.from(f);
    blurField(f, W, H, 3, 2);
    const r = rng(23);
    const stip = new Float32Array(W * H);
    for (let i = 0; i < stip.length; i++) stip[i] = r();
    blurField(stip, W, H, 1, 1);
    for (let i = 0; i < f.length; i++) f[i] = f[i] * 0.9 + (stip[i] - 0.5) * 0.06 * (1 - raised[i]);
    normalMap.image.getContext('2d').drawImage(normalCanvas(f, W, H, 4.5), 0, 0);

    const ci = map.image.getContext('2d');
    const ri = roughnessMap.image.getContext('2d');
    const cd = ci.createImageData(W, H);
    const rd = ri.createImageData(W, H);
    for (let i = 0; i < f.length; i++) {
      const h = Math.min(1, Math.max(0, raised[i] * 0.85 + f[i] * 0.15));
      const s = (stip[i] - 0.5) * 18 * (1 - h);
      cd.data[i * 4] = 92 + (228 - 92) * h + s;
      cd.data[i * 4 + 1] = 70 + (196 - 70) * h + s;
      cd.data[i * 4 + 2] = 38 + (132 - 38) * h + s * 0.6;
      cd.data[i * 4 + 3] = 255;
      const rough = 150 - 84 * h + s * 1.5;
      rd.data[i * 4] = rd.data[i * 4 + 1] = rd.data[i * 4 + 2] = rough;
      rd.data[i * 4 + 3] = 255;
    }
    ci.putImageData(cd, 0, 0);
    ri.putImageData(rd, 0, 0);
    for (const t of [map, roughnessMap, normalMap]) t.needsUpdate = true;
  };
  draw(name);
  for (const t of [map, roughnessMap, normalMap]) {
    t.repeat.set(1 / BADGE.w, 1 / BADGE.h);
    t.offset.set(0.5, 0.5);
  }
  return { map, roughnessMap, normalMap, redraw: draw };
}
