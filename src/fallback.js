import { COPY } from '../copy.js';
import { s } from './ui.js';

const KNOB_X = [-20, -13.2, -6.4, 0.4, 7.2, 14.0];
const SWEEP = 150;
const LEAF = 'M0 0C.25 .26 .7 .24 1 0C.7 -.2 .25 -.24 0 0Z';
const ease = (t) => 1 - (1 - t) ** 3;

export async function createFallbackScene({ container, knobNames, name, positionColors, reducedMotion }) {
  const handlers = {};
  const emit = (ev, d = {}) => (handlers[ev] || []).forEach((cb) => cb(d));
  let values = knobNames.map(() => 0.5);
  let anim = null;
  let dragging = -1;
  let powered = false;
  let levelFn = () => 0;
  let raf = 0;

  const svg = s('svg', { class: 'fb-amp', viewBox: '-31 -13.5 62 27', 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' });
  svg.append(defs(), body(name));
  const glow = s('rect', { x: -29.3, y: -11.8, width: 58.6, height: 14.6, rx: 0.6, fill: 'url(#fb-glow)', opacity: 0.06 });
  const grille = svg.querySelector('.fb-grille');
  grille.parentNode.insertBefore(glow, grille);

  const knobs = KNOB_X.map((x, i) => knob(x, knobNames[i]));
  knobs.forEach((k) => svg.append(k.g));
  const channelIds = Object.keys(positionColors);
  const jewels = channelIds.map((id, i) => jewel(20.2 + i * 2.4, positionColors[id], COPY.amp.jewels[i] || id));
  jewels.forEach((j, i) => {
    j.g.addEventListener('click', () => emit('channel', { id: channelIds[i] }));
    svg.append(j.g);
  });
  const power = powerSwitch();
  power.g.addEventListener('click', () => emit('power', {}));
  svg.append(power.g);
  const sprig = sprigGroup();
  svg.append(sprig.g);

  const wrap = document.createElement('div');
  wrap.className = 'fb-wrap';
  wrap.append(svg);
  container.append(wrap);

  knobs.forEach((k, i) => wireKnob(k, i));
  draw();
  requestAnimationFrame(() => emit('ready', {}));

  function wireKnob(k, i) {
    let start = null;
    k.g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      k.g.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, v: values[i] };
      dragging = i;
      svg.classList.add('grabbing');
    });
    k.g.addEventListener('pointermove', (e) => {
      if (!start) return;
      const fine = e.shiftKey ? 0.25 : 1;
      const v = clamp(start.v + ((start.y - e.clientY + (e.clientX - start.x)) / 220) * fine);
      values[i] = v;
      draw();
      emit('knobinput', { index: i, value: v });
    });
    const up = (e) => {
      if (!start) return;
      start = null;
      dragging = -1;
      svg.classList.remove('grabbing');
      if (k.g.hasPointerCapture(e.pointerId)) k.g.releasePointerCapture(e.pointerId);
      emit('knobrelease', { index: i, value: values[i] });
    };
    k.g.addEventListener('pointerup', up);
    k.g.addEventListener('pointercancel', up);
    k.g.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = clamp(values[i] + (e.deltaY < 0 ? 0.02 : -0.02));
      values[i] = v;
      draw();
      emit('knobinput', { index: i, value: v });
      clearTimeout(k.wheelTimer);
      k.wheelTimer = setTimeout(() => emit('knobrelease', { index: i, value: values[i] }), 250);
    }, { passive: false });
  }

  function draw() {
    knobs.forEach((k, i) => k.rot.setAttribute('transform', `rotate(${(values[i] * 2 - 1) * SWEEP})`));
  }

  function loop() {
    raf = 0;
    const lv = powered ? (reducedMotion ? 0.6 : 0.25 + 0.75 * clamp(levelFn() || 0)) : 0.06;
    glow.setAttribute('opacity', lv.toFixed(3));
    if (powered) raf = requestAnimationFrame(loop);
  }

  return {
    setKnobs(next, { animate = true, duration = 650, except = -1 } = {}) {
      const from = values.slice();
      const to = next.map((v, i) => (i === except || i === dragging ? null : clamp(v)));
      cancelAnimationFrame(anim);
      if (!animate || reducedMotion) {
        to.forEach((v, i) => v != null && (values[i] = v));
        draw();
        return;
      }
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / duration);
        to.forEach((v, i) => v != null && i !== dragging && (values[i] = from[i] + (v - from[i]) * ease(p)));
        draw();
        if (p < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    },
    getKnobs: () => values.slice(),
    setMarkers(markers) {
      knobs.forEach((k, i) => {
        k.markers.replaceChildren(...(markers[i] || []).map((m) => {
          const a = ((m.value * 2 - 1) * SWEEP - 90) * (Math.PI / 180);
          return s('circle', { cx: 2.55 * Math.cos(a), cy: 2.55 * Math.sin(a), r: m.active ? 0.24 : 0.16,
            fill: positionColors[m.id], opacity: m.active ? 1 : 0.55, class: m.active ? 'fb-mark on' : 'fb-mark' });
        }));
      });
    },
    setChannel(id) {
      jewels.forEach((j, i) => j.g.classList.toggle('on', channelIds[i] === id));
    },
    setCard(card, stats, { animate = true } = {}) {
      sprig.set(card, stats, animate && !reducedMotion);
    },
    setPowered(on) {
      powered = Boolean(on);
      power.g.classList.toggle('on', powered);
      power.bat.setAttribute('transform', powered ? 'rotate(0)' : 'rotate(180)');
      if (powered && !raf) raf = requestAnimationFrame(loop);
      if (!powered) loop();
    },
    setLevelSource(fn) {
      levelFn = typeof fn === 'function' ? fn : () => 0;
    },
    focusKnob(i) {
      knobs.forEach((k, j) => k.g.classList.toggle('focus', i === j));
    },
    on(ev, cb) {
      (handlers[ev] ||= []).push(cb);
    },
    dispose() {
      cancelAnimationFrame(anim);
      cancelAnimationFrame(raf);
      wrap.remove();
    },
  };
}

const clamp = (v) => Math.min(1, Math.max(0, v));

function defs() {
  return s('defs', {},
    s('linearGradient', { id: 'fb-brass', x1: 0, y1: 0, x2: 0, y2: 1 },
      s('stop', { offset: 0, 'stop-color': '#e3c58d' }), s('stop', { offset: 0.55, 'stop-color': '#c9a76a' }), s('stop', { offset: 1, 'stop-color': '#a8854c' })),
    s('linearGradient', { id: 'fb-tolex', x1: 0, y1: 0, x2: 0, y2: 1 },
      s('stop', { offset: 0, 'stop-color': '#264535' }), s('stop', { offset: 1, 'stop-color': '#16291f' })),
    s('radialGradient', { id: 'fb-glow', cx: 0.5, cy: 0.55, r: 0.6 },
      s('stop', { offset: 0, 'stop-color': '#ff9a3c' }), s('stop', { offset: 0.6, 'stop-color': '#a8461a', 'stop-opacity': 0.5 }), s('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0 })),
    s('radialGradient', { id: 'fb-cap', cx: 0.35, cy: 0.3, r: 0.8 },
      s('stop', { offset: 0, 'stop-color': '#f2dcaa' }), s('stop', { offset: 1, 'stop-color': '#a8854c' })),
    s('pattern', { id: 'fb-leaves', width: 2.2, height: 1.6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-18)' },
      s('path', { d: LEAF, transform: 'translate(.3 .55) scale(.9)', fill: '#000' }),
      s('path', { d: LEAF, transform: 'translate(1.4 1.35) scale(.7) rotate(25)', fill: '#000' })),
    s('mask', { id: 'fb-grille-mask' }, s('rect', { x: -31, y: -13.5, width: 62, height: 27, fill: '#fff' }),
      s('rect', { x: -29.3, y: -11.8, width: 58.6, height: 14.6, fill: 'url(#fb-leaves)' })));
}

function body(name) {
  const g = s('g', {});
  g.append(
    s('rect', { x: -31, y: -13.5, width: 62, height: 27, rx: 1.6, fill: 'url(#fb-tolex)' }),
    s('rect', { x: -29.6, y: -12.2, width: 59.2, height: 24.4, rx: 1, fill: 'none', stroke: '#ece2c8', 'stroke-width': 0.3 }),
    s('rect', { x: -29.3, y: -11.8, width: 58.6, height: 14.6, rx: 0.6, fill: '#0a0807' }),
  );
  const grille = s('rect', { class: 'fb-grille', x: -29.3, y: -11.8, width: 58.6, height: 14.6, rx: 0.6, fill: '#2a2017', mask: 'url(#fb-grille-mask)' });
  const plate = s('rect', { x: -29.3, y: 3.3, width: 58.6, height: 8.6, rx: 0.6, fill: 'url(#fb-brass)' });
  const badge = s('g', { transform: 'translate(-18 -4.5)' },
    s('rect', { x: -6.5, y: -1.6, width: 13, height: 3.2, rx: 0.4, fill: 'url(#fb-brass)' }),
    s('text', { x: 0, y: 0.75, 'text-anchor': 'middle', class: 'fb-word' }, String(name || '').toUpperCase()));
  const jack = s('g', { transform: 'translate(-26 7.2)' }, s('circle', { r: 0.7, fill: '#cfd3d6' }), s('circle', { r: 0.33, fill: '#050505' }));
  g.append(grille, plate, badge, jack);
  g.setAttribute('transform', 'scale(1 -1)');
  badge.setAttribute('transform', 'translate(-18 -4.5) scale(1 -1)');
  return g;
}

function knob(x, label) {
  const g = s('g', { class: 'fb-knob', transform: `translate(${x} -7.2)` });
  const ticks = s('g', {});
  for (let t = 0; t <= 10; t++) {
    const a = (((t / 10) * 2 - 1) * SWEEP - 90) * (Math.PI / 180);
    ticks.append(s('line', { x1: 2.15 * Math.cos(a), y1: 2.15 * Math.sin(a), x2: 2.4 * Math.cos(a), y2: 2.4 * Math.sin(a), stroke: '#6b5430', 'stroke-width': 0.09 }));
  }
  const markers = s('g', {});
  const rot = s('g', {},
    s('circle', { r: 1.8, fill: '#e8dfc6' }),
    s('circle', { r: 1.5, fill: '#d9cfb4' }),
    s('circle', { r: 1.2, fill: 'url(#fb-cap)' }),
    s('line', { x1: 0, y1: -0.3, x2: 0, y2: -1.15, stroke: '#2a2017', 'stroke-width': 0.16, 'stroke-linecap': 'round' }),
    s('rect', { x: -0.08, y: -1.8, width: 0.16, height: 0.35, fill: '#2a2017' }));
  const text = s('text', { y: 3.45, 'text-anchor': 'middle', class: 'fb-label' }, label.toUpperCase());
  const hit = s('circle', { r: 2.6, fill: 'transparent' });
  g.append(s('circle', { class: 'fb-focus', r: 2.75, fill: 'none' }), ticks, markers, rot, text, hit);
  return { g, rot, markers };
}

function jewel(x, color, label) {
  const g = s('g', { class: 'fb-jewel', transform: `translate(${x} -7)`, style: `--c:${color}` },
    s('circle', { r: 0.62, fill: '#3a2e1c' }),
    s('circle', { class: 'fb-jewel-core', r: 0.45, fill: color }),
    s('text', { y: 1.65, 'text-anchor': 'middle', class: 'fb-label' }, label.toUpperCase()));
  return { g };
}

function powerSwitch() {
  const g = s('g', { class: 'fb-power', transform: 'translate(27.6 -6.6)' },
    s('circle', { class: 'fb-pilot', cy: -3, r: 0.4 }),
    s('circle', { r: 0.55, fill: '#8d6c3a' }),
    s('circle', { r: 1.6, fill: 'transparent' }));
  const bat = s('rect', { class: 'fb-bat', x: -0.18, y: -1.4, width: 0.36, height: 1.4, rx: 0.18, fill: '#e8cc93', transform: 'rotate(180)' });
  g.insertBefore(bat, g.lastChild);
  return { g, bat };
}

function sprigGroup() {
  const P = (t) => {
    const x = -10 + 9 * t;
    const y = -(-8 + 6.5 * t + 1.2 * Math.sin(t * Math.PI * 2));
    return [x, y];
  };
  const pts = Array.from({ length: 24 }, (_, i) => P(i / 23));
  const g = s('g', { class: 'fb-sprig' },
    s('path', { d: `M${pts.map((p) => p.map((v) => v.toFixed(2)).join(' ')).join('L')}`, fill: 'none', stroke: '#c9a76a', 'stroke-width': 0.2, 'stroke-linecap': 'round' }));
  const leaves = Array.from({ length: 8 }, (_, i) => {
    const t = 0.12 + (i * (0.96 - 0.12)) / 7;
    const [x, y] = P(t);
    const [x2, y2] = P(Math.min(1, t + 0.01));
    const dir = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI;
    const leaf = s('path', { d: LEAF, fill: '#c9a76a', class: 'fb-leaf' });
    const holder = s('g', { transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})` }, leaf);
    g.append(holder);
    return { leaf, dir, side: i % 2 ? 1 : -1 };
  });
  return {
    g,
    set(card, stats, animate) {
      leaves.forEach((l, i) => {
        l.leaf.style.transition = animate ? 'transform .45s cubic-bezier(.2,.9,.3,1), opacity .5s, fill .45s' : 'none';
        if (!card) {
          l.leaf.style.opacity = '0';
          l.leaf.setAttribute('transform', `rotate(${l.dir + l.side * 42}) scale(0.01)`);
          return;
        }
        const z = (card[i] - (stats?.mean?.[i] ?? 0)) / (stats?.std?.[i] || 1);
        const u = Math.tanh(z / 1.5);
        const len = 2.3 * (1 + 0.38 * u);
        const ang = l.dir + l.side * (42 + 18 * u);
        l.leaf.style.opacity = '1';
        l.leaf.style.fill = mix(u);
        l.leaf.setAttribute('transform', `rotate(${ang.toFixed(1)}) scale(${len.toFixed(2)})`);
      });
    },
  };
}

function mix(u) {
  const a = [0xc9, 0xa7, 0x6a];
  const m = [0xb9, 0xa6, 0x6e];
  const b = [0x7f, 0xae, 0x8e];
  const t = (u + 1) / 2;
  const [p, q, k] = t < 0.5 ? [a, m, t * 2] : [m, b, (t - 0.5) * 2];
  return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * k)).join(',')})`;
}
