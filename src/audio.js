export const CAB_FILTERS = Object.freeze([
  { type: 'highpass', frequency: 75, Q: -3.01 },
  { type: 'peaking', frequency: 110, Q: 1.1, gain: 3.5 },
  { type: 'peaking', frequency: 400, Q: 0.9, gain: -3.5 },
  { type: 'peaking', frequency: 2200, Q: 1.3, gain: 4.5 },
  { type: 'lowpass', frequency: 5000, Q: -3.01 },
  { type: 'lowpass', frequency: 5000, Q: -6 },
]);
export const CAB_MAKEUP_DB = 0;

export const MP3_PRIMING_FRAMES = 1105;

const SEAM_S = 0.04;
const SET_FADE_S = 0.06;
const PLAY_FADE_S = 0.02;
const CAB_FADE_S = 0.08;
const VOLUME_FADE_S = 0.04;
const START_LEAD_S = 0.03;
const TICK_MS = 250;
const SUSPEND_AFTER_MS = 150;
const CACHE_SIZE = 16;
const CACHE_BYTES = 100 * 1024 * 1024;
const LIMITER = { threshold: -1, knee: 0, ratio: 20, attack: 0.001, release: 0.1 };

export function loopDelta(length, bufferRate, clipFrames, sampleRate) {
  const ratio = bufferRate / sampleRate;
  return Math.abs(length - clipFrames * ratio) <= 64 * ratio ? 0 : MP3_PRIMING_FRAMES / sampleRate;
}

export function volumeGain(v) {
  const x = Math.min(1, Math.max(0, Number(v) || 0));
  return x * x;
}

const curve = (fn, n = 128) => Float32Array.from({ length: n }, (_, i) => fn(i / (n - 1)));
const FADE_IN = curve((x) => Math.sin((x * Math.PI) / 2));
const FADE_OUT = curve((x) => Math.cos((x * Math.PI) / 2));

const plans = new WeakMap();

function initGain(param, v, t) {
  param.value = v;
  plans.set(param, [{ t, v, ramp: false }]);
}

function valueAt(param, t) {
  const p = plans.get(param);
  if (!p) return param.value;
  const i = p.findIndex((q) => q.t > t);
  if (i === -1) return p[p.length - 1].v;
  if (i === 0) return p[0].v;
  const a = p[i - 1];
  const b = p[i];
  return b.ramp ? a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t) : a.v;
}

function holdAt(param, t) {
  const v = valueAt(param, t);
  const next = (plans.get(param) || []).find((q) => q.t > t);
  if (next && next.ramp) param.linearRampToValueAtTime(v, t);
  else param.setValueAtTime(v, t);
  param.cancelScheduledValues(t + 1e-6);
  plans.set(param, [{ t, v, ramp: false }]);
  return v;
}

function setAt(param, v, t) {
  param.setValueAtTime(v, t);
  plans.get(param)?.push({ t, v, ramp: false });
}

function rampAt(param, v, t) {
  param.linearRampToValueAtTime(v, t);
  plans.get(param)?.push({ t, v, ramp: true });
}

function rampTo(param, target, t, dur) {
  holdAt(param, t);
  rampAt(param, target, t + Math.max(dur, 1e-4));
}

function powerRampTo(param, target, t, dur) {
  const from = holdAt(param, t);
  rampAt(param, Math.sqrt((from * from + target * target) / 2), t + dur / 2);
  rampAt(param, target, t + dur);
}

function safetyCurve(range = 4, n = 8193) {
  return curve((x) => {
    const v = (x * 2 - 1) * range;
    const a = Math.abs(v);
    return Math.sign(v) * (a <= 0.9 ? a : 0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
  }, n);
}

function buildMaster(ctx, { cab, volume }) {
  const bus = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  initGain(dry.gain, cab ? 0 : 1, ctx.currentTime);
  initGain(wet.gain, cab ? 10 ** (CAB_MAKEUP_DB / 20) : 0, ctx.currentTime);
  let node = bus;
  for (const f of CAB_FILTERS) {
    const b = ctx.createBiquadFilter();
    b.type = f.type;
    b.frequency.value = f.frequency;
    b.Q.value = f.Q;
    if (f.gain !== undefined) b.gain.value = f.gain;
    node.connect(b);
    node = b;
  }
  node.connect(wet);
  bus.connect(dry);
  const vol = ctx.createGain();
  initGain(vol.gain, volumeGain(volume), ctx.currentTime);
  dry.connect(vol);
  wet.connect(vol);
  const limiter = ctx.createDynamicsCompressor();
  for (const [k, v] of Object.entries(LIMITER)) limiter[k].value = v;
  const removedDb = -(LIMITER.threshold + -LIMITER.threshold / LIMITER.ratio);
  const pre = ctx.createGain();
  pre.gain.value = 0.25 * 10 ** ((-0.6 * removedDb) / 20);
  const clip = ctx.createWaveShaper();
  clip.curve = safetyCurve();
  clip.oversample = 'none';
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  vol.connect(limiter).connect(pre).connect(clip).connect(analyser).connect(ctx.destination);
  return {
    input: bus,
    analyser,
    setCab(on, t) {
      rampTo(dry.gain, on ? 0 : 1, t, CAB_FADE_S);
      rampTo(wet.gain, on ? 10 ** (CAB_MAKEUP_DB / 20) : 0, t, CAB_FADE_S);
    },
    setVolume(v, t) {
      rampTo(vol.gain, volumeGain(v), t, VOLUME_FADE_S);
    },
  };
}

class Voice {
  constructor(ctx, dest, key, def, buffers, loop) {
    this.ctx = ctx;
    this.key = key;
    this.def = def;
    this.buffers = buffers;
    this.loop = loop;
    this.out = ctx.createGain();
    initGain(this.out.gain, 0, ctx.currentTime);
    this.out.connect(dest);
    this.sel = new Map();
    for (const id of buffers.keys()) {
      const g = ctx.createGain();
      initGain(g.gain, 0, ctx.currentTime);
      g.connect(this.out);
      this.sel.set(id, g);
    }
    this.nodes = new Set();
    this.nextK = 0;
    this.stopped = false;
  }

  select(id, t, dur) {
    for (const [sid, g] of this.sel) {
      const target = sid === id ? this.def.sources[sid].gain : 0;
      if (dur > 0) rampTo(g.gain, target, t, dur);
      else {
        holdAt(g.gain, t);
        setAt(g.gain, target, t);
      }
    }
  }

  start(t) {
    const { T0, L } = this.loop;
    let k = Math.floor((t - T0) / L + 1e-9);
    if (!this.scheduleIteration(k, t)) this.scheduleIteration(++k, t);
    this.nextK = k + 1;
  }

  scheduleUntil(until) {
    const { T0, L, h } = this.loop;
    while (!this.stopped && T0 + this.nextK * L - h < until) this.scheduleIteration(this.nextK++, -Infinity);
  }

  scheduleIteration(k, tMin) {
    const { T0, L, h } = this.loop;
    const Tk = T0 + k * L;
    const natural = Tk - h;
    const t0 = Math.max(tMin, natural);
    const fadeOut = Tk + L - h;
    if (t0 > fadeOut - 0.002) return false;
    const seam = t0 <= natural + 1e-7 && h > 0;
    const into = t0 - Tk;
    const dur = Tk + L + h - t0;
    for (const [id, { buffer, loopStart }] of this.buffers) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const env = this.ctx.createGain();
      if (seam) {
        env.gain.value = 0;
        env.gain.setValueCurveAtTime(FADE_IN, t0, 2 * h);
      } else env.gain.value = 1;
      if (h > 0) env.gain.setValueCurveAtTime(FADE_OUT, fadeOut, 2 * h);
      src.connect(env).connect(this.sel.get(id));
      const item = { src, env };
      this.nodes.add(item);
      src.onended = () => {
        this.nodes.delete(item);
        src.disconnect();
        env.disconnect();
      };
      src.start(t0, Math.max(0, loopStart + into), dur);
    }
    return true;
  }

  fadeTo(target, t, dur) {
    powerRampTo(this.out.gain, target, t, dur);
  }

  retire(t, dur, live) {
    this.fadeTo(0, t, dur);
    this.stopped = true;
    const end = t + dur + 0.01;
    for (const { src } of this.nodes) {
      try {
        src.stop(end);
      } catch {
      }
    }
    if (live) setTimeout(() => this.stop(), (end - this.ctx.currentTime) * 1000 + 100);
  }

  stop() {
    this.stopped = true;
    for (const { src, env } of this.nodes) {
      src.onended = null;
      try {
        src.stop();
      } catch {
      }
      src.disconnect();
      env.disconnect();
    }
    this.nodes.clear();
    for (const g of this.sel.values()) g.disconnect();
    this.out.disconnect();
  }
}

function newContext(sampleRate) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) throw new Error('Web Audio is not supported in this browser');
  try {
    return new AC({ sampleRate, latencyHint: 'interactive' });
  } catch {
    return new AC();
  }
}

function newDecoder(sampleRate) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  return OAC ? new OAC(1, 1, sampleRate) : null;
}

function decode(ctx, data) {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(data, resolve, (e) => reject(e || new Error('decode failed')));
    if (p && p.catch) p.catch(() => {});
  });
}

export function createAudioEngine({
  excerpt,
  sampleRate = 48000,
  volume = 0.8,
  cab = false,
  cacheSize = CACHE_SIZE,
  cacheBytes = CACHE_BYTES,
  context = null,
  loader = null,
} = {}) {
  if (!excerpt) throw new Error('createAudioEngine: excerpt is required');
  const loopOf = (def) => def?.loop || excerpt;
  const headroomOf = (x) => Math.min(x.preroll_s, x.postroll_s ?? x.preroll_s);
  let L = excerpt.length_s;
  const offline = !!context && typeof context.startRendering === 'function';

  let ctx = context;
  let master = ctx ? buildMaster(ctx, { cab, volume }) : null;
  let decoder = null;
  const state = { cab, volume };

  const listeners = new Map();
  const sets = new Map();
  const cache = new Map();
  let cachedBytes = 0;
  const inflight = new Map();
  const voices = new Map();

  let active = null;
  let playing = false;
  let reqToken = 0;
  let playToken = 0;
  let lastSelect = null;
  let T0 = 0;
  let startAt = 0;
  let pausedPhase = 0;
  let tickTimer = 0;
  let suspendTimer = 0;
  let lvl = 0;
  let lvlT = 0;
  let lvlBuf = null;
  let prefetchQueue = [];
  let prefetching = false;

  const emit = (type, detail) => {
    for (const cb of listeners.get(type) || []) {
      try {
        cb(detail);
      } catch (e) {
        console.error(e);
      }
    }
  };
  const fail = (e) => emit('error', { message: e && e.message ? e.message : String(e) });
  const snap = (t) => Math.round(t * ctx.sampleRate) / ctx.sampleRate;
  const now = () => ctx.currentTime + (offline ? 0 : 0.005);
  const h = (x) => Math.min(SEAM_S / 2, headroomOf(x));

  function onVisible() {
    if (document.visibilityState === 'visible' && playing && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  function ensureContext() {
    if (ctx) return;
    ctx = newContext(sampleRate);
    master = buildMaster(ctx, state);
    document.addEventListener('visibilitychange', onVisible);
  }

  function decoderContext() {
    if (ctx && ctx.sampleRate === sampleRate) return ctx;
    decoder ||= newDecoder(sampleRate);
    if (decoder) return decoder;
    ensureContext();
    return ctx;
  }

  function cacheGet(url) {
    const b = cache.get(url);
    if (b) {
      cache.delete(url);
      cache.set(url, b);
    }
    return b;
  }

  const bytesOf = (b) => (b && b.length ? b.length * (b.numberOfChannels || 1) * 4 : 0);

  function cachePut(url, b) {
    if (cache.has(url)) cachedBytes -= bytesOf(cache.get(url));
    cache.delete(url);
    cache.set(url, b);
    cachedBytes += bytesOf(b);
    while (cache.size > 1 && (cache.size > cacheSize || cachedBytes > cacheBytes)) {
      const oldest = cache.keys().next().value;
      cachedBytes -= bytesOf(cache.get(oldest));
      cache.delete(oldest);
    }
  }

  async function fetchDecode(url, priority) {
    const res = await fetch(url, { priority });
    if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
    const data = await res.arrayBuffer();
    try {
      return await decode(decoderContext(), data);
    } catch (e) {
      throw new Error(`Could not decode ${url}${e && e.message ? `: ${e.message}` : ''}`);
    }
  }

  function getBuffer(url, priority) {
    const hit = cacheGet(url);
    if (hit) return Promise.resolve(hit);
    let p = inflight.get(url);
    if (!p) {
      p = (loader ? loader(url, { priority }) : fetchDecode(url, priority)).then(
        (b) => {
          inflight.delete(url);
          cachePut(url, b);
          return b;
        },
        (e) => {
          inflight.delete(url);
          throw e;
        },
      );
      inflight.set(url, p);
    }
    return p;
  }

  async function ensureBuffers(def, { quiet = false, priority = 'high', onProgress } = {}) {
    const urls = [...new Set(Object.values(def.sources).map((s) => s.url))];
    const total = urls.length;
    const missing = new Set(urls.filter((u) => !cache.has(u)));
    let loaded = total - missing.size;
    const report = () => {
      if (quiet) return;
      const d = { key: def.key, loaded, total };
      emit('loading', d);
      if (onProgress) onProgress(d);
    };
    report();
    const byUrl = new Map();
    await Promise.all(
      urls.map((u) =>
        getBuffer(u, priority).then((b) => {
          byUrl.set(u, b);
          if (missing.has(u)) {
            loaded++;
            report();
          }
        }),
      ),
    );
    const out = new Map();
    const x = loopOf(def);
    for (const [id, s] of Object.entries(def.sources)) {
      const buffer = byUrl.get(s.url);
      const delta = loopDelta(buffer.length, buffer.sampleRate, x.clip_frames, sampleRate);
      out.set(id, { buffer, loopStart: x.preroll_s + delta, delta });
    }
    return out;
  }

  function register(set) {
    if (!set || !set.key || !set.sources) throw new Error('audio: a set needs { key, sources }');
    sets.set(set.key, set);
    return set;
  }

  function reconcile(buffers, { selFade = 0.012, setFade = SET_FADE_S } = {}) {
    if (!playing || !ctx || !active) return;
    const t = now();
    let v = voices.get(active.key);
    let tFade = t;
    if (!v) {
      const first = voices.size === 0;
      tFade = snap(t + (offline ? 0 : START_LEAD_S));
      const def = sets.get(active.key);
      const x = loopOf(def);
      if (first) {
        L = x.length_s;
        startAt = tFade;
        T0 = snap(startAt - pausedPhase * L);
      } else if (Math.abs(x.length_s - L) > 1e-9) {
        const p = (tFade - T0) / L;
        L = x.length_s;
        T0 = snap(tFade - (p - Math.floor(p)) * L);
      }
      v = new Voice(ctx, master.input, active.key, def, buffers, { T0, L, h: h(x) });
      v.select(active.sourceId, t, 0);
      v.start(tFade);
      v.scheduleUntil(t + L + 1);
      v.fadeTo(1, tFade, first ? PLAY_FADE_S : setFade);
      voices.set(active.key, v);
    } else v.select(active.sourceId, t, selFade);
    for (const [key, other] of voices) {
      if (key === active.key) continue;
      voices.delete(key);
      other.retire(tFade, setFade, !offline);
    }
    if (!offline && !tickTimer) tickTimer = setInterval(tick, TICK_MS);
  }

  async function applySelect(def, sourceId, token, selFade) {
    let buffers = playing && voices.has(def.key) ? voices.get(def.key).buffers : null;
    if (!buffers) {
      try {
        buffers = await ensureBuffers(def);
      } catch (e) {
        if (token === reqToken) fail(e);
        return false;
      }
      if (token !== reqToken) return false;
    }
    active = { key: def.key, sourceId };
    reconcile(buffers, { selFade });
    return true;
  }

  function tick() {
    if (!playing || !ctx) return;
    const until = ctx.currentTime + L + 1;
    for (const v of voices.values()) v.scheduleUntil(until);
  }

  function phaseNow() {
    if (!playing || !ctx || voices.size === 0 || ctx.currentTime < startAt) return pausedPhase;
    const p = (ctx.currentTime - T0) / L;
    return p - Math.floor(p);
  }

  const engine = {
    async unlock() {
      ensureContext();
      if (offline) return;
      clearTimeout(suspendTimer);
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch {
      }
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
      const resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => {});
      await Promise.race([resumed, new Promise((r) => setTimeout(r, 400))]);
    },

    async load(set, { onProgress } = {}) {
      register(set);
      try {
        const bufs = await ensureBuffers(set, { onProgress });
        const sources = {};
        for (const [id, b] of bufs) sources[id] = { frames: b.buffer.length, delta: b.delta };
        return { key: set.key, sources };
      } catch (e) {
        fail(e);
        throw e;
      }
    },

    prefetch(set) {
      try {
        register(set);
      } catch {
        return;
      }
      prefetchQueue = prefetchQueue.filter((k) => k !== set.key);
      prefetchQueue.push(set.key);
      if (prefetchQueue.length > 6) prefetchQueue.shift();
      pumpPrefetch();
    },

    async select(key, sourceId, { fadeMs = 12 } = {}) {
      const def = sets.get(key);
      if (!def) {
        fail(new Error(`audio: unknown set ${key} (load it first)`));
        return false;
      }
      if (!def.sources[sourceId]) {
        fail(new Error(`audio: set ${key} has no source ${sourceId}`));
        return false;
      }
      const token = ++reqToken;
      const run = applySelect(def, sourceId, token, fadeMs / 1000);
      lastSelect = run;
      return run;
    },

    async play() {
      if (playing) return;
      playing = true;
      emit('state', { playing: true });
      clearTimeout(suspendTimer);
      const token = ++playToken;
      const unlocked = engine.unlock();
      if (lastSelect) await lastSelect;
      if (!playing || token !== playToken) return;
      if (!active) {
        playing = false;
        fail(new Error('audio: nothing selected'));
        emit('state', { playing: false });
        return;
      }
      const want = active;
      let buffers;
      try {
        buffers = await ensureBuffers(sets.get(want.key));
      } catch (e) {
        if (token === playToken && playing) {
          playing = false;
          fail(e);
          emit('state', { playing: false });
        }
        return;
      }
      await unlocked;
      if (!playing || token !== playToken || active !== want) return;
      reconcile(buffers);
    },

    pause() {
      if (!playing) return;
      pausedPhase = phaseNow();
      playing = false;
      playToken++;
      clearInterval(tickTimer);
      tickTimer = 0;
      if (ctx) {
        const t = now();
        for (const v of voices.values()) v.retire(t, PLAY_FADE_S, !offline);
        if (!offline && ctx.state === 'running') {
          clearTimeout(suspendTimer);
          suspendTimer = setTimeout(() => {
            if (!playing) ctx.suspend().catch(() => {});
          }, SUSPEND_AFTER_MS);
        }
      }
      voices.clear();
      emit('state', { playing: false });
    },

    isPlaying: () => playing,

    setVolume(v) {
      state.volume = v;
      if (master) master.setVolume(v, now());
    },

    setCab(on) {
      state.cab = !!on;
      if (master) master.setCab(state.cab, now());
    },

    level() {
      const tNow = performance.now();
      const dt = lvlT ? Math.min(0.5, (tNow - lvlT) / 1000) : 0;
      lvlT = tNow;
      let target = 0;
      if (playing && master && ctx.state === 'running') {
        const a = master.analyser;
        lvlBuf ||= new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(lvlBuf);
        let s = 0;
        for (let i = 0; i < lvlBuf.length; i++) s += lvlBuf[i] * lvlBuf[i];
        const db = 10 * Math.log10(s / lvlBuf.length + 1e-12);
        target = Math.min(1, Math.max(0, (db + 54) / 48));
      }
      const tau = target > lvl ? 0.04 : 0.25;
      lvl += (target - lvl) * (1 - Math.exp(-dt / tau));
      return lvl;
    },

    phase: phaseNow,

    on(type, cb) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(cb);
      return () => listeners.get(type).delete(cb);
    },

    dispose() {
      engine.pause();
      for (const v of voices.values()) v.stop();
      if (ctx && !offline) {
        document.removeEventListener('visibilitychange', onVisible);
        if (ctx.close) ctx.close().catch(() => {});
      }
    },

    _tick: tick,
    _debug: () => ({ active, playing, T0, L, startAt, voices: [...voices.keys()], cache, cachedBytes, ctx }),
  };

  async function pumpPrefetch() {
    if (prefetching) return;
    prefetching = true;
    while (prefetchQueue.length) {
      const def = sets.get(prefetchQueue.shift());
      if (def) await ensureBuffers(def, { quiet: true, priority: 'low' }).catch(() => {});
    }
    prefetching = false;
  }

  return engine;
}
