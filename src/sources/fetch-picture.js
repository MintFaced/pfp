/* A fetch of somebody else's picture: https only, a public host, a timeout,
   a size cap. An ENS avatar can say anything, and this is a server. */
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?|\[?f[cd]|.*\.(local|internal|localhost)$)/i;
const CAP = 12 * 1024 * 1024;

export async function fetchPicture(url, { timeout = 15000, fetch: f = null } = {}) {
  let u;
  try { u = new URL(String(url)); } catch (e) { return { error: 'not a URL' }; }
  if (u.protocol !== 'https:' || PRIVATE_HOST.test(u.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) {
    return { error: 'not a public https URL' };
  }
  try {
    const r = await (f || globalThis.fetch)(u.href, { redirect: 'follow', signal: AbortSignal.timeout(timeout), headers: { accept: 'image/*' } });
    if (!r.ok) return { error: `answered ${r.status}` };
    const len = Number(r.headers.get('content-length') || 0);
    if (len > CAP) return { error: 'too large' };
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > CAP) return { error: 'too large' };
    return { bytes, type: r.headers.get('content-type') || null };
  } catch (e) { return { error: String(e.name === 'TimeoutError' ? 'timed out' : e.message).slice(0, 80) }; }
}
