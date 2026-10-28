import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function valueNoise(seed) {
  const hash = (ix, iy) => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 2147483647.5 - 1;
  };
  return (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

export function fbm(noise, x, y, octaves = 4) {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x, y);
    norm += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 5.3;
    amp *= 0.5;
  }
  return sum / norm;
}

export function canvasTexture(canvas, { color = false, repeat = false, anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function blurField(f, w, h, radius, passes = 2, wrap = false) {
  if (radius < 1) return f;
  const tmp = new Float32Array(f.length);
  const n = 2 * radius + 1;
  const at = (i, len) => (wrap ? ((i % len) + len) % len : Math.min(len - 1, Math.max(0, i)));
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += f[row + at(k, w)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = sum / n;
        sum += f[row + at(x + radius + 1, w)] - f[row + at(x - radius, w)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += tmp[at(k, h) * w + x];
      for (let y = 0; y < h; y++) {
        f[y * w + x] = sum / n;
        sum += tmp[at(y + radius + 1, h) * w + x] - tmp[at(y - radius, h) * w + x];
      }
    }
  }
  return f;
}

export function normalCanvas(f, w, h, strength, wrap = false) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const at = (x, y) => {
    x = wrap ? (x + w) % w : Math.min(w - 1, Math.max(0, x));
    y = wrap ? (y + h) % h : Math.min(h - 1, Math.max(0, y));
    return f[y * w + x];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = (0.5 - (0.5 * dx) / l) * 255;
      img.data[i + 1] = (0.5 - (0.5 * dy) / l) * 255;
      img.data[i + 2] = (0.5 + 0.5 / l) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function canvasToField(canvas) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const f = new Float32Array(w * h);
  for (let i = 0; i < f.length; i++) f[i] = d[i * 4] / 255;
  return f;
}

export function spacedText(ctx, text, cx, cy, tracking) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (widths.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, cy);
    x += widths[i] + tracking;
  });
  return total;
}
