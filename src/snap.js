export function nearestPosition(positions, index, value, current) {
  let best = null;
  for (const p of positions) {
    const own = Math.abs(p.g[index] - value);
    const all = Math.hypot(...p.g.map((v, i) => v - current[i]));
    if (!best || own < best.own - 1e-9 || (Math.abs(own - best.own) <= 1e-9 && all < best.all - 1e-9)) {
      best = { id: p.id, own, all };
    }
  }
  return best.id;
}

export function clipGain(storageDb, playbackDb) {
  return 10 ** ((playbackDb - storageDb) / 20);
}

export function sourceId(method, n) {
  return `${method}_n${n}`;
}

function modelOf(position, id) {
  const m = /^(.+)_n(\d+)$/.exec(id);
  return m ? (position.models?.[m[1]]?.[m[2]] ?? null) : null;
}

export function setKey(takeId, target, position, ids) {
  return `${takeId}/${target.id}/${position.id}/${ids.join('+')}`;
}

export function sourceSet(stand, target, position, takeId, sourceIds) {
  const loop = stand.takes.find((t) => t.id === takeId);
  if (!loop) throw new Error(`unknown take ${takeId}`);
  const playbackDb = position.playback_gain_db[takeId];
  const sources = {};
  for (const id of sourceIds) {
    let clip;
    let db = playbackDb;
    if (id === 'real') clip = position.real.takes[takeId];
    else if (id === 'di') {
      clip = stand.di.takes[takeId];
      db = clip?.playback_gain_db;
    } else clip = modelOf(position, id)?.takes?.[takeId];
    if (!clip) throw new Error(`no clip ${id} for ${target.id}/${position.id} on take ${takeId}`);
    sources[id] = { url: clip.clip, gain: clipGain(clip.storage_gain_db, db) };
  }
  return { key: setKey(takeId, target, position, sourceIds), take: takeId, loop, sources };
}
