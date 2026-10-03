/* The other gallery: one face across both.
 *
 * Each site answers GET /api/pfp/{address} with the picture it holds for a
 * wallet (see peerSaid), and each asks the other before it asks OpenSea, so a
 * collector who set a face on one site is drawn with it on the other without
 * a second upload. Uploads never cross; only the picture does, and the asking
 * site fetches it into its own bucket like any other.
 *
 * Fail-open: a peer that is slow or down is a peer with nothing to say, and
 * the chain goes on to OpenSea. A peer that says the collector chose no
 * picture ends the chain: { none, chosen }.
 *
 * index: a site with far more wallets than the other has faces for can read
 * the other's whole list once (GET /api/pfp/list, { addresses }) and ask
 * only about the wallets on it, instead of once for every wallet it has. If
 * the list will not come, it asks about every wallet, as without one. (Not
 * /api/pfp/index: a host with clean URLs on redirects anything ending in
 * /index to the path without it.)
 */
import { lower } from '../index.js';

export function peerSource({ base, timeout = 1500, index = false, indexTtl = 600000, fetch: f = null } = {}) {
  const root = String(base || '').replace(/\/+$/, '');
  const get = (url, ms) => (f || globalThis.fetch)(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  let list = null;
  let listAt = 0;
  async function known() {
    if (!index) return null;
    if (list && Date.now() - listAt < indexTtl) return list;
    try {
      const r = await get(`${root}/api/pfp/list`, Math.max(timeout, 10000));
      const j = r.ok ? await r.json() : null;
      list = j && Array.isArray(j.addresses) ? new Set(j.addresses.map(lower)) : null;
    } catch (e) { list = null; }
    listAt = Date.now();
    return list;
  }
  return async function peer(address) {
    if (!root) return { none: true };
    const set = await known();
    if (set && !set.has(lower(address))) return { none: true };
    try {
      const r = await get(`${root}/api/pfp/${lower(address)}`, timeout);
      if (r.status === 404) return { none: true };
      if (!r.ok) return { error: `peer ${r.status}` };
      const j = await r.json();
      if (j && j.source === 'none') return { none: true, chosen: true };
      if (j && typeof j.url === 'string' && j.url.startsWith('https://')) return { url: j.url, origin: j.source || null };
      return { none: true };
    } catch (e) { return { error: 'peer did not answer' }; }
  };
}
