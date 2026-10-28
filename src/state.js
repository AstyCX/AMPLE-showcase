import { COPY } from '../copy.js';

export const AMP_ORDER = ['t_in_0', 't_in_1', 't_out_tube_0', 't_out_ts_0', 't_out_both_0'];

export function createStore(initial) {
  let state = { ...initial };
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      const next = { ...state, ...patch };
      if (Object.keys(patch).every((k) => Object.is(prev[k], next[k]))) return;
      state = next;
      for (const fn of subs) fn(state, prev);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function orderedTargets(stand) {
  const rank = (t) => {
    const i = AMP_ORDER.indexOf(t.id);
    return i < 0 ? AMP_ORDER.length + stand.targets.indexOf(t) : i;
  };
  return [...stand.targets]
    .sort((a, b) => rank(a) - rank(b))
    .map((target, i) => {
      const letter = String.fromCharCode(65 + i);
      return { target, letter, name: COPY.ampName(letter) };
    });
}

export function defaultSelection(stand) {
  const methods = stand.methods.map((m) => m.id);
  const takes = stand.takes.map((t) => t.id);
  return {
    take: takes.includes('riff') ? 'riff' : takes[0],
    amp: orderedTargets(stand)[0].target.id,
    pos: stand.positions[0].id,
    method: methods.includes('card') ? 'card' : methods[0],
    n: stand.ns[Math.floor(stand.ns.length / 2)],
  };
}

export function parseHash(hash, stand, fallback) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const target = stand.targets.find((t) => t.id === q.get('amp'));
  const amp = target ? target.id : fallback.amp;
  const tgt = stand.targets.find((t) => t.id === amp);
  const pos = tgt.positions.some((p) => p.id === q.get('pos')) ? q.get('pos') : fallback.pos;
  const method = stand.methods.some((m) => m.id === q.get('method')) ? q.get('method') : fallback.method;
  const n = Number(q.get('n'));
  const take = stand.takes.some((t) => t.id === q.get('take')) ? q.get('take') : fallback.take;
  return { take, amp, pos, method, n: stand.ns.includes(n) ? n : fallback.n };
}

export function formatHash(s) {
  return `#take=${encodeURIComponent(s.take)}&amp=${encodeURIComponent(s.amp)}&pos=${encodeURIComponent(s.pos)}&method=${encodeURIComponent(s.method)}&n=${s.n}`;
}

export function blindRounds(stand, count = 10, rand = Math.random) {
  const methods = ['card', 'finetune', 'nearest'].filter((m) => stand.methods.some((x) => x.id === m));
  const pool = [];
  for (const t of stand.targets)
    for (const p of t.positions)
      for (const m of methods) for (const n of stand.ns) if (p.models?.[m]?.[String(n)]) pool.push({ amp: t.id, pos: p.id, method: m, n });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).map((r) => ({ ...r, realIs: rand() < 0.5 ? 'A' : 'B' }));
}
