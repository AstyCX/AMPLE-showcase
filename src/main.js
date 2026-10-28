import { nearestPosition, setKey, sourceId, sourceSet } from './snap.js';
import { blindRounds, createStore, defaultSelection, formatHash, orderedTargets, parseHash } from './state.js';
import { COPY } from '../copy.js';
import { announce, formatEsr, h, renderBlind, renderCard, renderDock, renderResults, renderTransport, renderTwins } from './ui.js';
import { createFallbackScene } from './fallback.js';

export async function start({ createAmpScene, createAudioEngine, root = document.body, standUrl = './stand.json' }) {
  const $ = (sel) => root.querySelector(sel);
  fillCopy(root);
  $('.skip-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    const target = $('#listen');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
  });
  const standHref = new URL(standUrl, document.baseURI).href;
  let stand;
  try {
    const res = await fetch(standHref);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    stand = await res.json();
  } catch (e) {
    loadFailed(root, e);
    return undefined;
  }
  const clipBase = new URL('.', standHref);
  const amps = orderedTargets(stand);
  const colors = positionColors(stand);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  applyName(root, stand);

  const fallback = defaultSelection(stand);
  const store = createStore({
    ...parseHash(location.hash, stand, fallback),
    listen: 'real',
    lastListen: 'real',
    cab: false,
    volume: 0.8,
    playing: false,
    pending: false,
    applied: null,
    loading: null,
    audioError: '',
    blind: null,
  });

  let amp = null;
  let sceneDrag = -1;
  let sceneApplied = {};
  let audio = null;
  let unlocked = false;
  let syncToken = 0;
  let audioWanted = {};
  let roundNote = '';
  const loadedKeys = new Set();
  let ringRaf = 0;
  let firstRender = true;
  let lastHash = '';
  let readyOnce = false;

  const live = $('[data-ui="live"]');
  const targetOf = (id) => stand.targets.find((t) => t.id === id) || stand.targets[0];
  const ampName = (id) => amps.find((a) => a.target.id === id)?.name ?? id;
  const posLabel = (id) => stand.positions.find((p) => p.id === id)?.label ?? id;
  const methodInfo = (id) => stand.methods.find((m) => m.id === id) || { id, label: id, trains: '' };
  const labels = Object.fromEntries(stand.positions.map((p) => [p.id, p.label]));
  const takeOf = (id) => stand.takes.find((t) => t.id === id) || stand.takes[0];

  function view(st) {
    const round = st.blind && !st.blind.done ? st.blind.rounds[st.blind.index] : null;
    const sel = round || st;
    const take = takeOf(st.take);
    const target = targetOf(sel.amp);
    const position = target.positions.find((p) => p.id === sel.pos) || target.positions[0];
    const model = position.models?.[sel.method]?.[String(sel.n)] ?? null;
    const modelId = sourceId(sel.method, sel.n);
    let source = st.listen === 'real' ? 'real' : st.listen === 'di' ? 'di' : modelId;
    if (round) source = st.blind.ab === round.realIs ? 'real' : modelId;
    const ids = setIds(modelId, round);
    return { take, target, position, method: sel.method, n: sel.n, model, clip: model?.takes?.[take.id] ?? null, source,
      ids, setKey: setKey(take.id, target, position, ids), posKey: `${target.id}/${position.id}`,
      ampName: ampName(target.id), methodInfo: methodInfo(sel.method), round };
  }
  const setIds = (modelId, round) => (round ? ['real', modelId] : ['real', 'di', modelId]);
  const setOf = (target, position, takeId, ids) => {
    const set = sourceSet(stand, target, position, takeId, ids);
    for (const src of Object.values(set.sources)) src.url = new URL(src.url, clipBase).href;
    return set;
  };

  const card = renderCard($('[data-ui="card"]'), { stand, amps, colors }, {
    take: (id) => selectTake(id),
    amp: (id) => select({ amp: id }),
    pos: (id) => selectPosition(id),
    method: (id) => select({ method: id }),
    n: (n) => select({ n }),
    blind: () => startBlind(),
  });
  const blindUi = renderBlind(card.blindHost, {
    ab: (x) => patchBlind({ ab: x }),
    answer: (x) => answerBlind(x),
    next: () => nextBlind(),
    exit: () => exitBlind(),
    restart: () => startBlind(),
  });
  const transport = renderTransport($('[data-ui="transport"]'), {
    play: () => togglePlay(),
    listen: (id) => setListen(id),
    ab: (x) => patchBlind({ ab: x }),
    volume: (v) => {
      store.set({ volume: v });
      audio?.setVolume?.(v);
    },
    cab: () => {
      const on = !store.get().cab;
      store.set({ cab: on });
      audio?.setCab?.(on);
    },
  });
  const twins = renderTwins($('[data-ui="twins"]'), stand.knobs, {
    onInput: (i, v) => knobInput(i, v, 'twin'),
    onRelease: (i) => knobRelease(i),
    onFocus: (i) => amp?.focusKnob?.(i),
  });
  const dock = renderDock($('[data-ui="dock"]'), {
    play: () => togglePlay(),
    listen: (id) => setListen(id),
    ab: (x) => patchBlind({ ab: x }),
  });
  renderResults($('[data-ui="results"]'), stand);
  fillLegend($('[data-ui="legend"]'), stand, colors);
  const phone = matchMedia('(max-width: 600px)');
  const placePick = () => card.placePick(phone.matches ? $('[data-ui="pick-slot"]') : null);
  phone.addEventListener?.('change', placePick);
  placePick();
  const stageChip = $('[data-ui="stage-chip"]');
  fillAbout($('[data-ui="about"]'), stand);
  fillCredits(root, stand);

  const stage = $('[data-ui="stage"]');
  const stageCanvas = $('[data-ui="stage-canvas"]');
  createScene().then((a) => {
    amp = a;
    amp.on('knobinput', ({ index, value }) => knobInput(index, value, 'scene'));
    amp.on('knobrelease', ({ index }) => knobRelease(index));
    amp.on('channel', ({ id }) => selectPosition(id));
    amp.on('power', () => togglePlay());
    amp.on('ready', () => stageReady());
    amp.setLevelSource(() => (audio?.isPlaying?.() ? audio.level() : 0));
    setTimeout(stageReady, 2500);
    sceneApplied = {};
    if (!firstRender) render();
  });

  async function createScene() {
    const opts = { container: stageCanvas, knobNames: stand.knobs, name: stand.name, positionColors: colors, reducedMotion };
    try {
      if (typeof createAmpScene !== 'function' || !hasWebGL()) throw new Error('WebGL is not available');
      return await createAmpScene(opts);
    } catch (e) {
      console.info('[stand] 3D scene unavailable, using the 2D panel:', e?.message || e);
      stageCanvas.replaceChildren();
      stage.classList.add('is-fallback');
      return createFallbackScene(opts);
    }
  }

  function stageReady() {
    if (readyOnce) return;
    readyOnce = true;
    stage.classList.add('ready');
    setTimeout(() => stage.querySelector('.stage-veil')?.setAttribute('hidden', ''), 700);
  }

  try {
    audio = typeof createAudioEngine === 'function'
      ? await createAudioEngine({ excerpt: takeOf(store.get().take), sampleRate: stand.sample_rate })
      : null;
  } catch (e) {
    console.info('[stand] audio engine unavailable:', e?.message || e);
  }
  if (audio) {
    audio.setVolume?.(store.get().volume);
    audio.on?.('state', ({ playing }) => store.set({ playing: Boolean(playing) }));
    audio.on?.('loading', ({ key, loaded, total }) => {
      if (key !== view(store.get()).setKey) return;
      store.set({ loading: loaded < total ? { loaded, total } : null });
    });
    audio.on?.('error', ({ message }) =>
      store.set({ audioError: COPY.audio.problem(String(message).replaceAll(clipBase.href, '')) }));
    const unlockOnce = () => {
      unlock();
      for (const ev of ['pointerdown', 'keydown']) document.removeEventListener(ev, unlockOnce, true);
    };
    for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, unlockOnce, true);
  } else {
    store.set({ audioError: COPY.audio.unavailable });
  }

  function unlock() {
    if (!audio || unlocked) return undefined;
    unlocked = true;
    const p = Promise.resolve(audio.unlock()).catch((e) => report(e));
    syncAudio();
    return p;
  }

  async function syncAudio() {
    if (!audio) return;
    const token = ++syncToken;
    const v = view(store.get());
    const set = setOf(v.target, v.position, v.take.id, v.ids);
    let hush = 0;
    try {
      if (!loadedKeys.has(set.key)) {
        store.set({ loading: { loaded: 0, total: new Set(Object.values(set.sources).map((x) => x.url)).size } });
        hush = setTimeout(() => {
          if (token !== syncToken || !audio.isPlaying()) return;
          audio.pause();
          store.set({ playing: false, pending: true });
        }, 150);
      }
      await audio.load(set, {
        onProgress: (a, b) => {
          const loaded = typeof a === 'object' ? a.loaded : a;
          const total = typeof a === 'object' ? a.total : b;
          if (token === syncToken && Number.isFinite(loaded) && Number.isFinite(total)) {
            store.set({ loading: loaded < total ? { loaded, total } : null });
          }
        },
      });
      clearTimeout(hush);
      loadedKeys.add(set.key);
      if (token !== syncToken) return;
      store.set({ loading: null, audioError: '' });
      const fresh = view(store.get());
      if (fresh.setKey !== set.key || !unlocked) return;
      const ok = await audio.select(set.key, fresh.source);
      if (!ok || token !== syncToken) return;
      store.set({ applied: { key: set.key, source: fresh.source } });
      if (store.get().pending) startPlayback();
      prefetchNext(fresh);
    } catch (e) {
      clearTimeout(hush);
      if (token === syncToken) store.set({ loading: null, pending: false });
      report(e);
    }
  }

  function prefetchNext(v) {
    const st = store.get();
    const sets = [];
    if (st.blind && !st.blind.done) {
      const next = st.blind.rounds[st.blind.index + 1];
      if (next) sets.push([targetOf(next.amp), next.pos, setIds(sourceId(next.method, next.n), next)]);
    } else {
      for (const p of v.target.positions) if (p.id !== v.position.id) sets.push([v.target, p.id, ['real', 'di']]);
    }
    for (const [t, pid, ids] of sets) {
      const p = t.positions.find((x) => x.id === pid);
      if (!p) continue;
      try {
        Promise.resolve(audio.prefetch?.(setOf(t, p, v.take.id, ids))).catch(() => {});
      } catch {
      }
    }
  }

  async function togglePlay() {
    if (!audio) return;
    if (audio.isPlaying() || store.get().pending) {
      audio.pause();
      store.set({ playing: false, pending: false });
      return;
    }
    store.set({ pending: true });
    await (unlock() || audio.unlock().catch((e) => report(e)));
    syncAudio();
  }

  async function startPlayback() {
    store.set({ pending: false });
    try {
      await audio.play();
      store.set({ playing: Boolean(audio.isPlaying()) });
      silentSwitchHint();
    } catch (e) {
      report(e);
    }
  }

  let silentHintShown = false;
  function silentSwitchHint() {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios || silentHintShown) return;
    silentHintShown = true;
    twins.toast(-1, COPY.audio.silentSwitch);
  }

  function report(e) {
    console.warn('[stand] audio:', e);
    store.set({ audioError: COPY.audio.playFailed });
  }

  function ringLoop() {
    const phase = audio?.phase?.() ?? 0;
    transport.setPhase(phase);
    dock.setPhase(phase);
    ringRaf = store.get().playing ? requestAnimationFrame(ringLoop) : 0;
  }

  function select(patch) {
    if (store.get().blind) return;
    store.set(patch);
  }

  function selectPosition(id, knob = -1) {
    const st = store.get();
    if (st.blind && !st.blind.done) {
      if (amp) amp.setKnobs(view(st).position.g);
      return;
    }
    if (st.blind) return;
    if (id === st.pos) {
      if (knob < 0 && amp) amp.setKnobs(view(st).position.g);
      return;
    }
    store.set({ pos: id });
    const label = posLabel(id);
    if (knob >= 0) twins.toast(knob, COPY.knobs.measured(label), colors[id]);
    announce(live, COPY.announce.measured(label, ampName(store.get().amp)));
  }

  function selectTake(id) {
    const st = store.get();
    if (st.blind || id === st.take) return;
    store.set({ take: id });
    announce(live, COPY.announce.take(takeOf(id).label));
  }

  function knobInput(index, value, from) {
    const st = store.get();
    if (from === 'scene') sceneDrag = index;
    if (st.blind) return;
    const v = view(st);
    const current = amp ? amp.getKnobs() : v.position.g.slice();
    current[index] = value;
    const id = nearestPosition(v.target.positions, index, value, current);
    if (id !== v.position.id) selectPosition(id, index);
  }

  function knobRelease() {
    sceneDrag = -1;
    if (amp) amp.setKnobs(view(store.get()).position.g);
  }

  function setListen(id) {
    const st = store.get();
    if (st.blind) return;
    store.set({ listen: id, lastListen: id === 'di' ? (st.listen === 'di' ? st.lastListen : st.listen) : id });
    announce(live, id === 'real' ? COPY.announce.real : id === 'di' ? COPY.announce.di : COPY.announce.model(methodInfo(st.method).label, st.n));
  }

  function startBlind() {
    const rounds = blindRounds(stand);
    const rd = rounds[0];
    roundNote = COPY.announce.blindStart(rounds.length, ampName(rd.amp), posLabel(rd.pos));
    store.set({ blind: { rounds, index: 0, ab: 'A', answer: null, score: 0, results: [], done: false } });
    requestAnimationFrame(() => blindUi.focus());
    if (!store.get().playing && !store.get().pending) togglePlay();
  }
  function patchBlind(patch) {
    const b = store.get().blind;
    if (b && !b.done) store.set({ blind: { ...b, ...patch } });
  }
  function answerBlind(x) {
    const b = store.get().blind;
    if (!b || b.done || b.answer) return;
    const rd = b.rounds[b.index];
    const correct = x === rd.realIs;
    const m = targetOf(rd.amp).positions.find((p) => p.id === rd.pos)?.models?.[rd.method]?.[String(rd.n)];
    const esr = m?.esr ?? null;
    const clipEsr = m?.takes?.[store.get().take]?.clip_esr ?? null;
    const results = b.results.slice();
    results[b.index] = { correct, esr, clipEsr, answer: x };
    const score = b.score + (correct ? 1 : 0);
    store.set({ blind: { ...b, answer: x, results, score } });
    const other = rd.realIs === 'A' ? 'B' : 'A';
    announce(live, COPY.announce.blindAnswer({ correct, real: rd.realIs, other, method: methodInfo(rd.method).label, n: rd.n,
      takeEsr: formatEsr(clipEsr), score, answered: results.length }));
    requestAnimationFrame(() => blindUi.focusNext());
  }
  function nextBlind() {
    const b = store.get().blind;
    if (!b) return;
    if (b.index + 1 >= b.rounds.length) {
      store.set({ blind: { ...b, done: true } });
      announce(live, COPY.announce.blindDone(b.score, b.rounds.length));
      requestAnimationFrame(() => blindUi.focusNext());
      return;
    }
    const index = b.index + 1;
    const rd = b.rounds[index];
    roundNote = COPY.announce.blindRound(index + 1, b.rounds.length, ampName(rd.amp), posLabel(rd.pos));
    store.set({ blind: { ...b, index, ab: 'A', answer: null } });
    requestAnimationFrame(() => blindUi.focus());
  }
  function exitBlind() {
    roundNote = '';
    store.set({ blind: null });
    announce(live, COPY.announce.blindClosed);
    requestAnimationFrame(() => card.focusBlind());
  }

  function render() {
    const st = store.get();
    const v = view(st);
    card.update(st, v);
    dock.update(st, v);
    transport.update(st, v);
    const round = st.blind && !st.blind.done ? st.blind.rounds[st.blind.index] : null;
    stageChip.hidden = !round;
    if (round) stageChip.replaceChildren(h('span', { class: 'dot', style: { background: colors[round.pos] } }), `${ampName(round.amp)} · ${posLabel(round.pos)}`);
    const ready = Boolean(audio) && st.applied?.key === v.setKey;
    if (st.blind) {
      blindUi.update(st.blind, { ampLabel: ampName, posLabel, methodLabel: (id) => methodInfo(id).label,
        ready, loading: st.loading, error: st.audioError });
    }
    if (roundNote && st.blind && !st.blind.done && ready) {
      announce(live, `${roundNote}${st.playing ? COPY.announce.blindPlaying : ''}`);
      roundNote = '';
    }
    root.classList.toggle('is-blind', Boolean(st.blind));
    twins.update({ values: v.position.g, positions: v.target.positions, active: v.position.id, labels, colors });

    if (amp) {
      const cardVec = v.model?.card ?? null;
      if (sceneApplied.posKey !== v.posKey) {
        amp.setMarkers(stand.knobs.map((_, i) => v.target.positions.map((p) => ({ id: p.id, value: p.g[i], active: p.id === v.position.id }))));
        amp.setChannel(v.position.id);
        amp.setKnobs(v.position.g, { except: sceneDrag, animate: sceneApplied.posKey !== undefined });
      }
      if (sceneApplied.card !== cardVec) amp.setCard(cardVec, stand.card_stats, { animate: sceneApplied.card !== undefined });
      const powered = st.playing || st.pending;
      if (sceneApplied.playing !== powered) amp.setPowered(powered);
      sceneApplied = { posKey: v.posKey, card: cardVec, playing: powered };
    }
    if (audioWanted.key !== v.setKey || audioWanted.source !== v.source) {
      audioWanted = { key: v.setKey, source: v.source };
      syncAudio();
    }
    if (st.playing && !ringRaf) ringRaf = requestAnimationFrame(ringLoop);
    const hash = formatHash(st);
    if (!st.blind && !firstRender && hash !== lastHash && hash !== location.hash) history.replaceState(null, '', hash);
    if (!st.blind) lastHash = hash;
    firstRender = false;
  }
  store.subscribe(render);
  render();

  window.addEventListener('hashchange', () => {
    if (!store.get().blind) store.set(parseHash(location.hash, stand, store.get()));
  });
  document.addEventListener('keydown', (e) => onKey(e));

  if (new URLSearchParams(location.search).get('debug') === '1') {
    window.__stand = {
      store,
      stand,
      view: () => view(store.get()),
      get amp() {
        return amp;
      },
      get audio() {
        return audio;
      },
      knobScreen: (i) => amp?.debug?.knobScreen?.(i) ?? null,
      audioState: () => {
        const d = audio?._debug?.();
        return d ? { ctx: d.ctx?.state ?? null, active: d.active ?? null, playing: d.playing, L: d.L,
          cached: d.cache?.size ?? null, cachedBytes: d.cachedBytes ?? null, voices: d.voices ?? [],
          applied: store.get().applied ?? {}, loaded: [...loadedKeys] } : null;
      },
    };
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const t =  (e.target);
    const typing = t.closest?.('input, textarea, select, [contenteditable]');
    if (e.key === ' ' || e.code === 'Space') {
      if (t.closest?.('button:not([role="radio"]), a, summary, [role="slider"], [role="switch"]') || typing) return;
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'x' || e.key === 'X') {
      if (typing) return;
      const st = store.get();
      if (st.blind && !st.blind.done) patchBlind({ ab: st.blind.ab === 'A' ? 'B' : 'A' });
      else if (!st.blind) setListen(st.listen === 'real' ? 'model' : 'real');
    } else if (e.key === 'Escape') {
      if (store.get().blind) exitBlind();
    } else if (/^[1-9]$/.test(e.key)) {
      if (typing) return;
      const p = stand.positions[Number(e.key) - 1];
      if (p) selectPosition(p.id);
    }
  }

  return { store, stand };
}

function loadFailed(root, e) {
  const stage = root.querySelector('[data-ui="stage"]');
  stage?.classList.add('ready', 'is-error');
  for (const id of ['stage', 'twins', 'transport', 'dock']) {
    const el = root.querySelector(`[data-ui="${id}"]`);
    if (el) el.hidden = true;
  }
  const msg = Object.assign(document.createElement('p'), {
    className: 'status', textContent: COPY.page.loadFailed(e.message) });
  msg.setAttribute('role', 'alert');
  root.querySelector('[data-ui="card"]')?.append(msg);
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function positionColors(stand) {
  const css = getComputedStyle(document.documentElement);
  const token = { moderate: '--c-moderate', high_gain: '--c-high', extreme: '--c-extreme' };
  const fallback = { moderate: '#8fd19e', high_gain: '#c98a35', extreme: '#d8614b' };
  return Object.fromEntries(stand.positions.map((p) => {
    const v = css.getPropertyValue(token[p.id] || `--c-${p.id.replace(/_/g, '-')}`).trim();
    return [p.id, v || fallback[p.id] || '#c9a76a'];
  }));
}

function applyName(root, stand) {
  const title = COPY.page.title(stand.name);
  document.title = title;
  for (const sel of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) document.querySelector(sel)?.setAttribute('content', title);
  for (const el of root.querySelectorAll('[data-name]')) el.textContent = stand.name;
  for (const el of root.querySelectorAll('[data-name-long]')) el.textContent = stand.name_long;
  const h1 = root.querySelector('[data-ui="title"]');
  if (h1) {
    h1.replaceChildren(...stand.name_long.split(/(?<=^|[\s-])(?=[A-Z])/).flatMap((part) =>
      [h('span', { class: 'initial' }, part[0]), part.slice(1)]));
  }
}

function fillLegend(el, stand, colors) {
  el?.replaceChildren(...stand.positions.map((p) =>
    h('span', { class: 'legend__item' }, h('span', { class: 'dot', style: { background: colors[p.id] } }), p.label)));
}

const clock = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;

function fillAbout(el, stand) {
  if (!el) return;
  const takes = stand.takes
    .map((t) => COPY.results.aboutTake({ label: t.label, length: t.length_s, from: clock(t.start_s) }))
    .join(' and ');
  el.textContent = COPY.results.about({ rule: stand.selection_rule, guitar: stand.di_source?.label, takes,
    khz: stand.sample_rate / 1000 });
}

function fillCredits(root, stand) {
  const el = root.querySelector('[data-ui="di-credit"]');
  const src = stand.di_source;
  if (!el || !src) return;
  const a = (href, text) => Object.assign(document.createElement('a'), { href, textContent: text });
  el.replaceChildren(
    COPY.footer.guitar.before(src.label),
    a(src.url, src.url.replace(/^https?:\/\//, '')),
    COPY.footer.guitar.middle(src.credit),
    a('https://creativecommons.org/licenses/by/4.0/', src.license),
    COPY.footer.guitar.after,
  );
}

function copyAt(path) {
  const v = path.split('.').reduce((o, k) => o?.[k], COPY);
  if (v == null) throw new Error(`copy.js has no ${path}`);
  return v;
}

function fillCopy(root) {
  for (const el of root.querySelectorAll('[data-copy]')) el.innerHTML = copyAt(el.dataset.copy);
  for (const el of root.querySelectorAll('[data-copy-aria]')) el.setAttribute('aria-label', copyAt(el.dataset.copyAria));
  for (const el of root.querySelectorAll('[data-copy-list]')) {
    const leaf = el.dataset.copyIcon;
    el.replaceChildren(...copyAt(el.dataset.copyList).map((html) => {
      const li = document.createElement('li');
      li.innerHTML = leaf ? `<svg class="${leaf}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-leaf"/></svg><span>${html}</span>` : html;
      return li;
    }));
  }
}
