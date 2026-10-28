const FACES = ['700 32px "Source Code Pro"', '600 32px "Source Code Pro"', '500 32px "Source Code Pro"'];

export async function waitForFonts(timeoutMs = 1500) {
  const fonts = typeof document !== 'undefined' ? document.fonts : null;
  if (!fonts?.load) return { ready: false, late: Promise.resolve(false) };
  const all = () => FACES.every((f) => fonts.check(f));
  const loading = Promise.all(FACES.map((f) => fonts.load(f).catch(() => []))).then(all);
  const timedOut = new Promise((resolve) => setTimeout(() => resolve('timeout'), timeoutMs));
  const first = await Promise.race([loading, timedOut]);
  if (first !== 'timeout') return { ready: first, late: Promise.resolve(false) };
  return { ready: false, late: loading };
}
