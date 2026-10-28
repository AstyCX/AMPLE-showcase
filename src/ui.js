import { COPY } from '../copy.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props = {}, ...children) {
  return build(document.createElement(tag), props, children);
}

export function s(tag, props = {}, ...children) {
  return build(document.createElementNS(SVG_NS, tag), props, children);
}

function build(el, props, children) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'string') el.setAttribute('style', v);
    else if (k === 'style') for (const [prop, val] of Object.entries(v)) el.style.setProperty(prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), val);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

const ICONS = {
  leaf: ['M4.5 19.5C4.5 10.5 10 4.8 19.5 4.5c-.3 9.5-6 15-15 15Z', 'M4.5 19.5 14 10'],
  sprig: ['M5 20C9 15 13 10 19 4', 'M8.6 15.6c-2.6-.3-4-2-4.2-4.6 2.6.2 4 1.8 4.2 4.6Z',
    'M11.4 12.2c.4-2.6 2.2-4 4.8-4-.3 2.6-2 4-4.8 4Z', 'M14.2 8.8c-1.4-2.1-1.1-4.2.6-6 1.3 2.1 1.1 4.2-.6 6Z'],
  arrow: ['M5 12h14M13 6l6 6-6 6'],
  down: ['M12 5v14M6 13l6 6 6-6'],
  check: ['M5 12.5 10 17l9-10'],
};

export function icon(name, cls = 'icon') {
  return s('svg', { class: cls, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, ...ICONS[name].map((d) => s('path', { d })));
}

export function formatEsr(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v >= 1000) return v.toFixed(0);
  return Number(v).toPrecision(3);
}

export function formatDb(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const r = Math.round(v * 10) / 10;
  const sign = r > 0 ? '+' : r < 0 ? '−' : '±';
  return `${sign}${Math.abs(r).toFixed(1)} dB`;
}

const capitalize = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

export function ampDescription(target) {
  const parts = [capitalize(target.kind_label)];
  if (target.tube_name) parts.push(`tube ${target.tube_name}`);
  if (target.tonestack_name) parts.push(`tonestack ${target.tonestack_name}`);
  return parts.join(' · ');
}

export function radioGroup({ label, options, onSelect, className = '', base = 'seg', button = 'seg__b' }) {
  const el = h('div', { role: 'radiogroup', 'aria-label': label, class: `${base} ${className}` });
  const buttons = options.map((o) => {
    const b = h(
      'button',
      { type: 'button', role: 'radio', class: `seg-btn ${button}`, 'data-id': o.id, 'aria-checked': 'false', tabindex: '-1',
        title: o.title, onclick: () => onSelect(o.id) },
      ...o.content,
    );
    if (o.color) b.style.setProperty('--c', o.color);
    return b;
  });
  el.append(...buttons);
  el.addEventListener('keydown', (e) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'first', End: 'last' };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const live = buttons.filter((b) => !b.disabled);
    const i = live.indexOf(document.activeElement);
    const k = keys[e.key];
    const j = k === 'first' ? 0 : k === 'last' ? live.length - 1 : (i + k + live.length) % live.length;
    live[j].focus();
    onSelect(live[j].dataset.id);
  });
  let current = null;
  return {
    el,
    buttons,
    update(id) {
      current = id;
      let focusable = null;
      for (const b of buttons) {
        const on = b.dataset.id === id;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = -1;
        if (on) focusable = b;
      }
      (focusable || buttons[0]).tabIndex = 0;
    },
    get value() {
      return current;
    },
  };
}

function field(label, ...children) {
  return h('div', { class: 'field' }, h('span', { class: 'label' }, label), ...children);
}

function popover(button, tip) {
  const set = (open) => {
    tip.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => set(!tip.classList.contains('open')));
  document.addEventListener('pointerdown', (e) => {
    if (!tip.contains(e.target) && !button.contains(e.target)) set(false);
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') set(false);
  });
}

const abBadge = () => h('span', { class: 'blindbtn__ab', 'aria-hidden': 'true' }, h('span', {}, 'A'), h('span', {}, 'B'));

export function renderCard(root, { stand, amps, colors }, on) {
  const t = COPY.card;
  const amp = radioGroup({
    label: t.amp,
    className: 'seg-amps',
    onSelect: on.amp,
    options: amps.map((a) => ({
      id: a.target.id,
      title: `${a.name}: ${ampDescription(a.target)}`,
      content: [
        h('span', { class: 'amp-letter', 'aria-hidden': 'true' }, a.letter),
        h('span', { class: 'sr-only' }, `${a.name}: ${ampDescription(a.target)}`),
      ],
    })),
  });
  amp.buttons.forEach((b) => b.classList.add('seg__b--letter'));
  const ampNote = h('p', { class: 'note amp-note' });

  const pos = radioGroup({
    label: t.position,
    className: 'seg-pos',
    onSelect: on.pos,
    options: stand.positions.map((p) => ({ id: p.id, color: colors[p.id], title: p.rule, content: [h('span', { class: 'dot' }), p.label] })),
  });
  const pick = h('div', { class: 'card-pick' }, field(t.amp, amp.el, ampNote), field(t.position, pos.el));

  const method = radioGroup({
    label: t.method,
    className: 'seg-methods seg--tall',
    onSelect: on.method,
    options: stand.methods.map((m) => ({ id: m.id, content: [m.label] })),
  });
  const methodNote = h('p', { class: 'note' });
  const methodField = field(t.method, method.el, methodNote);

  const n = radioGroup({
    label: t.n,
    className: 'seg-n',
    onSelect: (id) => on.n(Number(id)),
    options: stand.ns.map((v) => ({ id: String(v), content: [String(v)] })),
  });
  const take = radioGroup({
    label: t.take,
    className: 'seg-take',
    onSelect: on.take,
    options: stand.takes.map((k) => ({ id: k.id, content: [k.label], title: t.takeTitle(k.label, k.length_s) })),
  });
  const takeNote = h('p', { class: 'note take-note' }, t.takeNote(stand.di_source?.label));
  const nTake = h('div', { class: 'field' }, h('div', { class: 'field__pair' }, field(t.n, n.el), field(t.take, take.el)), takeNote);

  const who = h('span', { class: 'readout__who readout-who' });
  const esrTip = h('div', { class: 'tip tip--up esr-help', id: 'esr-help', role: 'tooltip' }, COPY.esr);
  const esrInfo = h('button', { type: 'button', class: 'linkbtn', 'aria-expanded': 'false', 'aria-controls': 'esr-help' }, t.esrInfo);
  popover(esrInfo, esrTip);
  const big = h('div', { class: 'readout__big esr-big num' });
  const meter = esrMeter();
  const level = h('div', { class: 'stat__v num' });
  const status = h('p', { class: 'caption status', role: 'status' });
  const readout = h(
    'section',
    { class: 'readout', 'aria-label': t.readoutLabel },
    h('div', { class: 'readout__top' }, who, h('span', { class: 'tip-anchor tip-anchor--right' }, esrInfo, esrTip)),
    h('div', { class: 'readout__grid' },
      h('div', {}, h('span', { class: 'label esr-label' }, t.esrLabel), big, meter.el),
      h('div', { class: 'readout__side' }, h('div', { class: 'caption' }, t.levelLabel), level)),
    status,
  );

  const blindBtn = h('button', { type: 'button', class: 'blindbtn btn-blind', onclick: on.blind },
    abBadge(),
    h('span', {}, h('span', { class: 'blindbtn__t' }, t.blindButton), h('span', { class: 'blindbtn__s' }, t.blindButtonSub)),
    icon('arrow', 'icon blindbtn__arrow'));

  const normal = h(
    'div',
    { class: 'card-normal' },
    h('div', { class: 'card-head' },
      h('h2', { class: 'panel__title' }, icon('sprig', 'icon panel__icon'), t.title),
      h('p', { class: 'note card-intro' }, t.intro)),
    pick,
    methodField,
    nTake,
    readout,
    blindBtn,
  );
  const blindHost = h('div', { class: 'card-blind', hidden: true });
  root.append(normal, blindHost);
  const fade = () => root.classList.toggle('can-scroll', root.scrollTop + root.clientHeight < root.scrollHeight - 4);
  root.addEventListener('scroll', fade, { passive: true });
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(fade);
    for (const el of [root, normal, blindHost]) ro.observe(el);
  }

  return {
    blindHost,
    pick,
    placePick(host) {
      if (host) {
        if (pick.parentElement !== host) host.append(pick);
      } else if (pick.parentElement !== normal) normal.insertBefore(pick, methodField);
    },
    focusBlind: () => blindBtn.focus(),
    update(st, v) {
      take.update(v.take.id);
      amp.update(v.target.id);
      ampNote.replaceChildren(h('b', {}, v.ampName), ` · ${ampDescription(v.target)}`);
      pos.update(v.position.id);
      method.update(v.method);
      methodNote.textContent = COPY.methods[v.method] || v.methodInfo.trains;
      if (v.model?.card) methodNote.textContent += t.cardLeaves;
      n.update(String(v.n));
      const posInfo = stand.positions.find((p) => p.id === v.position.id);
      who.textContent = t.who({ method: v.methodInfo.label, n: v.n, amp: v.ampName, position: posInfo.label, take: v.take.label });
      big.textContent = formatEsr(v.clip?.clip_esr);
      meter.update(v.clip?.clip_esr);
      level.textContent = formatDb(v.clip?.clip_rms_delta_db);
      root.classList.toggle('is-loading', Boolean(st.loading));
      status.textContent = st.audioError ? st.audioError : st.loading ? t.loading(st.loading.loaded, st.loading.total) : '';
      const blind = Boolean(st.blind);
      normal.hidden = blind;
      blindHost.hidden = !blind;
      root.classList.toggle('is-blind', blind);
      fade();
    },
  };
}

function esrMeter() {
  const mark = h('span', { class: 'scale__mark' });
  const ticks = ['0.001', '0.01', '0.1', '1'].map((x, i) => h('span', { style: { left: `${(i / 3) * 100}%` } }, x));
  const el = h('div', { class: 'scale', 'aria-hidden': 'true' }, h('span', { class: 'scale__track' }), mark, h('span', { class: 'scale__ticks' }, ...ticks));
  return {
    el,
    update(v) {
      mark.hidden = v == null || !Number.isFinite(v);
      if (!mark.hidden) mark.style.left = `${scalePct(v)}%`;
    },
  };
}
const scalePct = (v) => Math.min(100, Math.max(0, ((Math.log10(Math.max(v, 1e-3)) + 3) / 3) * 100));

export function renderBlind(host, on) {
  const t = COPY.blind;
  const bars = h('div', { class: 'rounds', 'aria-hidden': 'true' });
  const progress = h('p', { class: 'caption blind-progress num' });
  const where = h('p', { class: 'blind-where' });
  const ab = radioGroup({
    label: t.play,
    base: 'ab',
    button: 'ab__b',
    className: 'seg-blind',
    onSelect: on.ab,
    options: ['A', 'B'].map((x) => ({ id: x, content: [x] })),
  });
  const question = h('p', { class: 'blind-q', id: 'blind-q' }, t.question);
  const answers = h('div', { class: 'blind-answers', role: 'group', 'aria-labelledby': 'blind-q' },
    ...['A', 'B'].map((x) => h('button', { type: 'button', class: 'btn btn--lg answer btn-answer', 'data-x': x, 'aria-pressed': 'false',
      onclick: () => on.answer(x) }, icon('check', 'icon answer__check'), t.answer(x))));
  const wait = h('p', { class: 'caption blind-status', role: 'status' });
  const reveal = h('div', { class: 'verdict blind-reveal', role: 'status', hidden: true });
  const nextBtn = h('button', { type: 'button', class: 'btn btn--primary btn--block btn-next' }, t.next);
  const exitBtn = h('button', { type: 'button', class: 'btn btn--sm btn-ghost', onclick: on.exit }, t.exit);
  const keyHint = h('p', { class: 'caption key-hint' }, t.keys);
  const round = h('div', { class: 'blind-round' }, where, h('hr', { class: 'rule' }), field(t.play, ab.el), question, answers, wait, reveal);
  const summary = h('div', { class: 'blind-summary', hidden: true });
  host.append(
    h('div', { class: 'blind-head' }, h('h2', { class: 'panel__title' }, abBadge(), t.title), exitBtn),
    h('div', { class: 'blind-progress-wrap' }, bars, progress),
    round,
    summary,
    nextBtn,
    keyHint,
  );

  return {
    focus: () => (ab.buttons.find((b) => b.tabIndex === 0) || ab.buttons[0]).focus(),
    focusNext: () => nextBtn.focus(),
    update(b, info) {
      const total = b.rounds.length;
      const answered = b.results.length;
      bars.replaceChildren(...b.rounds.map((_, i) => {
        const r = b.results[i];
        return h('i', { class: r ? (r.correct ? 'is-right' : 'is-wrong') : i === b.index && !b.done ? 'is-now' : '' });
      }));
      progress.textContent = b.done ? t.final(b.score, total) : t.progress(b.index + 1, total, b.score, answered);
      round.hidden = b.done;
      summary.hidden = !b.done;
      if (b.done) {
        summary.replaceChildren(
          h('p', { class: 'blind-score' }, h('span', { class: 'num' }, `${b.score} / ${total}`), t.summaryScore),
          h('p', { class: 'note' }, t.chance),
          h('ol', { class: 'blind-list' }, ...b.results.map((r, i) => {
            const rd = b.rounds[i];
            return h('li', { class: r.correct ? 'ok' : 'miss' },
              h('span', { class: 'mark', 'aria-hidden': 'true' }, r.correct ? '✓' : '✗'),
              h('span', {}, t.rowModel(info.ampLabel(rd.amp), info.posLabel(rd.pos), info.methodLabel(rd.method), rd.n),
                h('span', { class: 'num' }, formatEsr(r.clipEsr)), t.rowTake, r.correct ? '' : t.missed));
          })),
        );
        nextBtn.disabled = false;
        nextBtn.textContent = t.again;
        nextBtn.onclick = on.restart;
        return;
      }
      nextBtn.onclick = on.next;
      nextBtn.textContent = b.index + 1 >= total ? t.last : t.next;
      const rd = b.rounds[b.index];
      where.textContent = t.where(info.ampLabel(rd.amp), info.posLabel(rd.pos));
      ab.update(b.ab);
      const done = b.answer != null;
      const blocked = !info.ready || Boolean(info.error);
      wait.textContent = done || !blocked ? ''
        : info.error || (info.loading ? t.loadingCount(info.loading.loaded, info.loading.total) : t.loading);
      const r = b.results[b.index];
      for (const btn of answers.querySelectorAll('button')) {
        const chosen = btn.dataset.x === b.answer;
        btn.disabled = done ? !chosen : blocked;
        btn.setAttribute('aria-pressed', String(chosen));
        btn.classList.toggle('is-wrong', chosen && Boolean(r) && !r.correct);
      }
      nextBtn.disabled = !done;
      reveal.hidden = !done;
      if (done) {
        const other = rd.realIs === 'A' ? 'B' : 'A';
        reveal.className = `verdict blind-reveal ${r.correct ? 'verdict--right' : 'verdict--wrong'}`;
        reveal.replaceChildren(
          h('span', { class: 'verdict__head' }, r.correct ? t.right : t.wrong), t.wasReal(rd.realIs), ' ',
          t.revealModel(other, info.methodLabel(rd.method), rd.n), h('b', { class: 'num' }, formatEsr(r.clipEsr)), t.revealTake,
        );
      }
    },
  };
}

export function renderTwins(root, knobs, on) {
  const items = knobs.map((name, i) => {
    const value = h('span', { class: 'twin__val twin-value num' });
    const fill = h('span', { class: 'twin__fill' });
    const marks = h('span', { class: 'twin-marks' });
    const thumb = h('span', { class: 'twin__thumb' });
    const bar = h('span', { class: 'twin__rail twin-bar', 'aria-hidden': 'true' }, h('span', { class: 'twin__track' }), fill, marks, thumb);
    const el = h('div', { class: 'twin', role: 'slider', tabindex: '0', 'aria-label': name, 'aria-valuemin': '0', 'aria-valuemax': '1', 'aria-orientation': 'horizontal' },
      h('span', { class: 'twin__head' }, h('span', { class: 'label twin-name' }, name), value), bar);
    return { el, value, fill, marks, thumb, bar, shown: 0, virtual: null, timer: 0 };
  });
  const toast = h('div', { class: 'toast', 'aria-hidden': 'true' });
  root.append(...items.map((it) => it.el), toast);
  let last = { values: knobs.map(() => 0), positions: [], active: null, labels: {}, colors: {} };

  const show = (it, v) => {
    it.value.textContent = v.toFixed(2);
    it.fill.style.width = `${v * 100}%`;
    it.thumb.style.left = `${v * 100}%`;
  };
  const aria = (it, i, v) => {
    it.el.setAttribute('aria-valuenow', v.toFixed(2));
    it.el.setAttribute('aria-valuetext', COPY.knobs.valueText(knobs[i], v.toFixed(2), last.labels[last.active]));
  };
  const release = (i) => {
    const it = items[i];
    clearTimeout(it.timer);
    if (it.virtual == null) return;
    it.virtual = null;
    show(it, last.values[i]);
    aria(it, i, last.values[i]);
    on.onRelease(i);
  };
  const input = (i, v) => {
    const it = items[i];
    it.virtual = Math.min(1, Math.max(0, v));
    show(it, it.virtual);
    it.el.setAttribute('aria-valuenow', it.virtual.toFixed(2));
    on.onInput(i, it.virtual);
  };
  const measuredStep = (i, cur, dir) => {
    const vals = [...new Set(last.positions.map((p) => p.g[i]))].sort((a, b) => a - b);
    if (!vals.length) return null;
    if (dir === -Infinity) return vals[0];
    if (dir === Infinity) return vals[vals.length - 1];
    return dir > 0 ? (vals.find((x) => x > cur + 1e-6) ?? null) : (vals.findLast((x) => x < cur - 1e-6) ?? null);
  };

  items.forEach((it, i) => {
    it.el.addEventListener('keydown', (e) => {
      const dir = { ArrowRight: 1, ArrowUp: 1, PageUp: 1, ArrowLeft: -1, ArrowDown: -1, PageDown: -1, Home: -Infinity, End: Infinity }[e.key];
      if (dir == null) return;
      e.preventDefault();
      const v = measuredStep(i, it.virtual ?? last.values[i], dir);
      if (v == null) return;
      input(i, v);
      clearTimeout(it.timer);
      it.timer = setTimeout(() => release(i), 900);
    });
    it.el.addEventListener('focus', () => on.onFocus(i));
    it.el.addEventListener('blur', () => {
      release(i);
      on.onFocus(-1);
    });
    const fromX = (e) => {
      const r = it.bar.getBoundingClientRect();
      return (e.clientX - r.left) / r.width;
    };
    let drag = null;
    const arm = (e) => {
      drag.armed = true;
      it.el.setPointerCapture(e.pointerId);
      it.el.focus({ preventScroll: true });
      it.el.classList.add('dragging');
      input(i, fromX(e));
    };
    const end = () => {
      drag = null;
      it.el.classList.remove('dragging');
      release(i);
    };
    it.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, armed: false };
      if (e.pointerType !== 'touch') arm(e);
    });
    it.el.addEventListener('pointermove', (e) => {
      if (drag?.id !== e.pointerId) return;
      if (drag.armed) input(i, fromX(e));
      else if (Math.abs(e.clientX - drag.x0) > 8 && Math.abs(e.clientX - drag.x0) > Math.abs(e.clientY - drag.y0)) arm(e);
    });
    it.el.addEventListener('pointerup', (e) => {
      if (drag?.id !== e.pointerId) return;
      if (!drag.armed) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) >= 8) {
          drag = null;
          return;
        }
        it.el.focus({ preventScroll: true });
        input(i, fromX(e));
      }
      if (it.el.hasPointerCapture(e.pointerId)) it.el.releasePointerCapture(e.pointerId);
      end();
    });
    it.el.addEventListener('pointercancel', (e) => {
      if (drag?.id !== e.pointerId) return;
      if (drag.armed) end();
      else drag = null;
    });
  });

  let toastTimer = 0;
  return {
    update(d) {
      last = d;
      root.style.setProperty('--c', d.colors[d.active] || 'var(--c-brass)');
      items.forEach((it, i) => {
        const v = it.virtual ?? d.values[i];
        show(it, v);
        aria(it, i, v);
        it.marks.replaceChildren(...d.positions.filter((p) => p.id !== d.active).map((p) =>
          h('span', { class: 'twin__m twin-mark', style: { left: `${p.g[i] * 100}%`, background: d.colors[p.id] } })));
      });
    },
    toast(index, text, color) {
      const it = items[Math.max(0, index)];
      const r = it.el.getBoundingClientRect();
      const pr = root.getBoundingClientRect();
      toast.textContent = text;
      toast.style.setProperty('--tc', color || 'var(--c-brass)');
      const w = Math.min(index < 0 ? 340 : 260, pr.width);
      const x = index < 0 ? pr.width / 2 : Math.min(pr.width - w / 2, Math.max(w / 2, r.left - pr.left + r.width / 2));
      toast.style.left = `${x}px`;
      toast.style.maxWidth = `${w}px`;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), text.length > 40 ? 6000 : 1200);
    },
  };
}

function playControl(onPlay) {
  const C = 2 * Math.PI * 30;
  const ring = s('circle', { class: 'ring-fg', cx: 32, cy: 32, r: 30, 'stroke-dasharray': C.toFixed(2), 'stroke-dashoffset': C.toFixed(2) });
  const button = h('button', { type: 'button', class: 'play', 'aria-label': COPY.transport.play, onclick: onPlay },
    playIcon(), h('span', { class: 'spin', 'aria-hidden': 'true' }));
  const wrap = h('div', { class: 'play-wrap' },
    s('svg', { class: 'play__ring', viewBox: '0 0 64 64', 'aria-hidden': 'true' }, s('circle', { class: 'ring-bg', cx: 32, cy: 32, r: 30 }), ring),
    button);
  return {
    wrap,
    button,
    setPhase(p) {
      ring.setAttribute('stroke-dashoffset', (C * (1 - p)).toFixed(2));
    },
  };
}

export function renderTransport(root, on) {
  const t = COPY.transport;
  const play = playControl(on.play);
  const listen = radioGroup({
    label: COPY.card.listenTo,
    className: 'seg--primary seg-ab seg-listen',
    onSelect: on.listen,
    options: [{ id: 'real', content: [COPY.card.realAmp] }, { id: 'model', content: [COPY.card.model] }, { id: 'di', content: [COPY.card.dryDi] }],
  });
  const ab = radioGroup({
    label: COPY.blind.play,
    className: 'seg--primary seg-ab-console',
    onSelect: on.ab,
    options: ['A', 'B'].map((x) => ({ id: x, content: [x] })),
  });
  const listenBlock = h('div', { class: 'console__group' }, listen.el);
  const abBlock = h('div', { class: 'console__group console__group--ab', hidden: true }, ab.el);
  const note = h('p', { class: 'note console__note' });

  const fill = h('span', { class: 'range__fill' });
  const thumb = h('span', { class: 'range__thumb' });
  const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.01', 'aria-label': t.volume, oninput: (e) => on.volume(Number(e.target.value)) });
  const volEl = h('label', { class: 'vol' }, volumeIcon(), h('span', { class: 'range' }, h('span', { class: 'range__track' }), fill, thumb, vol));

  const cab = h('button', { type: 'button', role: 'switch', class: 'switch', 'aria-checked': 'false', onclick: () => on.cab() },
    h('span', { class: 'switch__ui', 'aria-hidden': 'true' }), t.cab);
  const info = h('button', { type: 'button', class: 'info tip-btn', 'aria-label': t.cabAbout, 'aria-expanded': 'false', 'aria-controls': 'cab-tip' }, 'i');
  const tip = h('div', { class: 'tip tip--up', id: 'cab-tip', role: 'tooltip' }, t.cabTip);
  popover(info, tip);

  root.append(play.wrap, listenBlock, abBlock, note, h('span', { class: 'console__spacer' }), volEl,
    h('div', { class: 'console__cab tip-anchor tip-anchor--right' }, cab, info, tip));
  return {
    update(st, v) {
      playState(play.button, st);
      const blind = Boolean(st.blind && !st.blind.done);
      listenBlock.hidden = Boolean(st.blind);
      abBlock.hidden = !blind;
      if (blind) ab.update(st.blind.ab);
      listen.update(st.listen);
      note.textContent = st.blind ? COPY.blind.keys
        : st.listen === 'real' ? COPY.card.listenNote.real(v.ampName)
          : st.listen === 'di' ? COPY.card.listenNote.di
            : COPY.card.listenNote.model(v.methodInfo.label, v.n, v.ampName);
      if (document.activeElement !== vol) vol.value = String(st.volume);
      fill.style.width = `${st.volume * 100}%`;
      thumb.style.left = `${st.volume * 100}%`;
      cab.setAttribute('aria-checked', String(st.cab));
    },
    setPhase: play.setPhase,
  };
}

function playState(btn, st) {
  const on = st.playing || st.pending;
  const busy = st.pending || (st.playing && Boolean(st.loading));
  btn.classList.toggle('playing', on);
  btn.classList.toggle('is-busy', busy);
  btn.setAttribute('aria-label', on ? COPY.transport.pause : COPY.transport.play);
  btn.setAttribute('aria-busy', String(busy));
}

export function playIcon() {
  return s('svg', { class: 'icon-play', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    s('path', { class: 'i-play', d: 'M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z' }),
    s('path', { class: 'i-pause', d: 'M6.5 5h4v14h-4zM13.5 5h4v14h-4z' }));
}

function volumeIcon() {
  return s('svg', { class: 'icon-vol', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
  s('path', { d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z' }), s('path', { d: 'M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11' }));
}

export function renderDock(root, on) {
  const t = COPY.dock;
  const play = playControl(on.play);
  const listen = radioGroup({
    label: COPY.card.listenTo,
    className: 'seg--primary seg--touch seg-ab seg-dock',
    onSelect: on.listen,
    options: [{ id: 'real', content: [t.real] }, { id: 'model', content: [t.model] }],
  });
  const ab = radioGroup({
    label: COPY.blind.play,
    className: 'seg--primary seg--touch seg-dock',
    onSelect: on.ab,
    options: ['A', 'B'].map((x) => ({ id: x, content: [x] })),
  });
  const esr = h('div', { class: 'dock-esr', title: t.esrTitle }, h('div', { class: 'label dock-esr-label' }, t.esr), h('div', { class: 'num dock-esr__v' }));
  root.append(play.wrap, listen.el, ab.el, esr);
  return {
    update(st, v) {
      playState(play.button, st);
      const blind = Boolean(st.blind && !st.blind.done);
      listen.el.hidden = Boolean(st.blind);
      ab.el.hidden = !blind;
      if (blind) ab.update(st.blind.ab);
      listen.update(st.listen === 'di' ? null : st.listen);
      const answered = blind && st.blind.answer != null;
      esr.hidden = Boolean(st.blind) && !answered;
      const r = answered ? st.blind.results[st.blind.index] : null;
      esr.lastChild.textContent = formatEsr(r ? r.clipEsr : v.clip?.clip_esr);
    },
    setPhase: play.setPhase,
  };
}

const barPct = (v) => Math.max(3, Math.min(100, ((Math.log10(Math.max(v, 1e-6)) + 2) / Math.log10(300)) * 100));

export function renderResults(root, stand) {
  const amps = stand.targets.length;
  const settings = stand.targets[0]?.test_settings ?? 50;
  const t = COPY.results;
  const stats = Object.entries(t.stats)
    .map(([id, x]) => ({ id, label: x.label, note: x.note({ amps, settings }) }))
    .filter((x) => stand.panel?.[x.id]);
  const tbody = h('tbody');
  const caption = h('caption', { class: 'tbl__caption' });
  const table = h('table', { class: 'tbl results' }, caption,
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, t.methodColumn), ...stand.ns.map((n) => h('th', { scope: 'col', class: 'tbl__n' }, t.nColumn(n))))),
    tbody);
  let current = stats.find((x) => x.id === 'esr_median')?.id ?? stats[0]?.id;
  const toggle = radioGroup({
    label: t.statGroup,
    className: 'seg-stat',
    onSelect: (id) => {
      current = id;
      draw();
    },
    options: stats.map((x) => ({ id: x.id, content: [x.label] })),
  });
  function draw() {
    const st = stats.find((x) => x.id === current);
    toggle.update(current);
    caption.textContent = t.caption(st.label, st.note);
    tbody.replaceChildren(...stand.methods.map((m) => {
      const row = stand.panel[current][m.id] || [];
      const card = m.id === 'card';
      return h('tr', { class: card ? 'tbl__card hl' : '' },
        h('th', { scope: 'row' }, h('div', { class: 'tbl__m' }, card ? icon('leaf', 'icon tbl__leaf') : null, m.label),
          h('div', { class: 'tbl__d' }, COPY.methods[m.id] || m.trains)),
        ...stand.ns.map((_, i) => h('td', { class: 'tbl__v num' }, formatEsr(row[i]),
          h('div', { class: 'tbl__bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${barPct(row[i])}%` } })))));
    }));
  }
  draw();
  root.append(
    finding(stand, t) || '',
    h('div', { class: 'results-head' },
      h('p', { class: 'results-lower' }, icon('down', 'icon'), t.lowerIsBetter),
      h('div', { class: 'field results-stat' }, h('span', { class: 'label' }, t.statLabel), toggle.el)),
    h('div', { class: 'table-wrap' }, table),
  );
}

function finding(stand, t) {
  const row = stand.panel?.esr_median;
  if (!row?.scratch || !row.card || !row.finetune || stand.ns.length < 2) return null;
  const ratios = (i) => [row.scratch[i] / row.card[i], row.scratch[i] / row.finetune[i]];
  const span = (idx) => {
    const r = idx.flatMap(ratios);
    return [Math.floor(Math.min(...r)), Math.round(Math.max(...r))];
  };
  const small = stand.ns.slice(0, -1);
  const [smallLo, smallHi] = span(small.map((_, i) => i));
  const [lastLo, lastHi] = span([stand.ns.length - 1]);
  return h('p', { class: 'results-key' }, t.finding({
    small: `N = ${small.join(' and ')}`, smallLo, smallHi, last: stand.ns[stand.ns.length - 1], lastLo, lastHi }));
}

export function announce(live, text) {
  live.textContent = '';
  requestAnimationFrame(() => {
    live.textContent = text;
  });
}
