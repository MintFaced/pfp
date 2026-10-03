/* The picture service: making a face, keeping it, changing it, and the round
 * that fills a whole register of them.
 *
 * The host gives it a store and its sources and nothing else. The store is
 * where records and pictures live (a key-value store and a bucket, on both
 * sites); the sources are the functions from ./sources, configured with the
 * host's keys. Everything about who may change whose face is the host's.
 *
 * StoreAdapter:
 *   get(address)                 -> record | null
 *   getMany?(addresses)          -> (record | null)[]
 *   set(address, record)         keep the record, and whatever index the host draws from
 *   putImage(address, { hash, images: { 512, 128, 64, 32 } }) -> { key, url }   url is the 512's
 *   stagePut(id, bytes, meta)    -> { url }   an upload waiting to be cropped, for an hour
 *   stageGet(id)                 -> meta | null   (meta.owner is the wallet it was staged for)
 *   stageRead(meta)              -> bytes | null
 *   stageDrop(id, meta)
 *   getJob() / setJob(job)       where the round is up to
 *
 * A record: { address, source, url, key, updated, src_url, uploaded_by,
 * chosen?, origin?, via? }. source is upload | peer | opensea | ens | x | none.
 * chosen means the collector picked it (a source, or none), and the round
 * keeps to it; origin is what a peer's picture was over there.
 */
import { randomBytes } from 'node:crypto';
import { ORDER, lower, isAddress, said } from './index.js';
import { prepare, render, variants, hashOf } from './pipeline.js';
import { fetchPicture } from './sources/fetch-picture.js';
import { resolve } from './resolve.js';

const NAMES = { opensea: 'OpenSea', ens: 'ENS', x: 'X' };
const nameOf = (s) => NAMES[s] || s;

export function createPfp({ store, sources = {}, auto = ORDER.filter((s) => s !== 'upload'), choosable = ['opensea', 'ens', 'x'],
  background = '#ffffff', version = 1, fetchPicture: fetchPic = fetchPicture } = {}) {
  if (!store) throw new Error('createPfp needs a store');
  /* Only the sources this host was given, in the chain's order. */
  const AUTO = auto.filter((s) => sources[s]);
  const getMany = (as) => (store.getMany ? store.getMany(as) : Promise.all(as.map((a) => store.get(a))));

  const record = (address) => (isAddress(address) ? store.get(lower(address)) : null);

  /* Kept, and pointed at. A new picture gets a new name. */
  async function keep(address, master, fields) {
    const images = await variants(master);
    const { key, url } = await store.putImage(lower(address), { hash: hashOf(master), images });
    const rec = { address: lower(address), key, url, updated: new Date().toISOString(), ...fields };
    await store.set(lower(address), rec);
    return rec;
  }

  /** One source, fetched, rendered and kept, and chosen: the refresh will keep
      to this source rather than going back to the first one in the order. */
  async function useSource(address, source, { by = 'self', ens = null } = {}) {
    if (!choosable.includes(source) || !sources[source]) return { error: 'no such source', status: 400 };
    const found = await sources[source](address, { name: ens });
    if (found.error) return { error: `Could not reach ${nameOf(source)} just now.`, status: 502, retry: found.retry };
    if (found.none || !found.url) return { error: `No ${nameOf(source)} picture for this wallet.`, status: 404 };
    const got = await fetchPic(found.url);
    if (got.error) return { error: `That picture would not come: ${got.error}.`, status: 502 };
    const made = await render(got.bytes, null, { background });
    if (made.error) return { error: made.error, status: 422 };
    const rec = await keep(address, made.bytes, { source, src_url: found.url, uploaded_by: by && by !== 'self' ? by : null, chosen: true });
    return { ok: true, pfp: said(rec, address) };
  }

  /** The first half of an upload: the picture as sent, made safe, kept for an
      hour to be cropped over. */
  async function stage(address, bytes, { by = 'self' } = {}) {
    const out = await prepare(bytes);
    if (out.error) return { error: out.error, status: 400 };
    const id = randomBytes(9).toString('hex');
    const { url } = await store.stagePut(id, out.bytes, { w: out.w, h: out.h, owner: lower(address), by });
    return { ok: true, tmp: id, url, w: out.w, h: out.h };
  }

  /** The second half: that picture, cut where the crop says, and kept. */
  async function save(address, tmpId, crop, { by = 'self' } = {}) {
    const id = String(tmpId || '');
    const t = id ? await store.stageGet(id) : null;
    if (!t || t.owner !== lower(address)) return { error: 'That upload has expired. Choose the picture again.', status: 410 };
    const bytes = await store.stageRead(t);
    if (!bytes) return { error: 'That upload could not be read back. Try again.', status: 502 };
    const made = await render(bytes, crop, { background });
    if (made.error) return { error: made.error, status: 422 };
    const rec = await keep(address, made.bytes, { source: 'upload', src_url: null, uploaded_by: by || 'self' });
    await store.stageDrop(id, t);
    return { ok: true, pfp: said(rec, address) };
  }

  /** Back to the placeholder, and chosen: the refresh will not fill it again,
      and the other site is told so. */
  async function remove(address, { by = 'self' } = {}) {
    const rec = { address: lower(address), source: 'none', key: null, url: null, chosen: true, by, updated: new Date().toISOString() };
    await store.set(lower(address), rec);
    return { ok: true, pfp: said(rec, address) };
  }

  /**
   * Filling the register, a batch at a time, in the order given: the first
   * time through for everybody who has no picture yet, and after that once a
   * month for everybody whose picture came from a source, replacing it only if
   * that source now says something different. An upload is never replaced, and
   * a collector who chose none is never filled.
   *
   * rows: [{ address, rank?, ens?, fwd?, avatar?, private? }], best first (or
 * ranked). avatar is an ENS avatar URL the host already knows, which saves
 * asking the chain.
   * batch: collectors per run. pause: ms between collectors, or perMinute to
   * say it as a rate. budget: ms this run may take before it saves its place.
   */
  async function round({ rows, batch = 40, pause = 300, perMinute = 0, now = Date.now(), budget = 0, refreshDays = 30 } = {}) {
    const deadline = budget ? Date.now() + budget : 0;
    const wait = perMinute ? Math.ceil(60000 / perMinute) : pause;
    let job = await store.getJob();
    if (!job || job.v !== version) job = { v: version, phase: 'backfill', cursor: 0, hits: {}, started: new Date(now).toISOString() };
    if (job.phase === 'idle') {
      if (now < Date.parse(job.next_refresh || 0)) return { ...job, did: 0 };
      Object.assign(job, { phase: 'refresh', cursor: 0, hits: {}, started: new Date(now).toISOString() });
    }
    const order = rows.filter((r) => !r.private && isAddress(r.address)).sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9));
    const slice = order.slice(job.cursor, job.cursor + batch);
    const recs = slice.length ? await getMany(slice.map((r) => lower(r.address))) : [];
    const count = (k) => { job.hits[k] = (job.hits[k] || 0) + 1; };
    let did = 0;
    let stopped = false;
    let i = 0;
    for (; i < slice.length; i += 1) {
      if (deadline && Date.now() > deadline) { stopped = true; break; }
      const r = slice[i];
      const a = lower(r.address);
      const was = recs[i];
      if (was && (was.source === 'upload' || (was.chosen && was.source === 'none'))) continue;
      if (job.phase === 'backfill' && was && was.source !== 'none') continue;
      /* A source somebody picked is the only one looked at again. */
      const found = await resolve(a, { sources, order: was && was.chosen ? [was.source] : AUTO,
        ctx: { ens: { name: r.ens || r.fwd || null, avatar: r.avatar || null } } });
      /* Slow down is not no picture: this collector is left exactly as they
         were, and the batch stops here to pick up from them next time. */
      if (found.retry) { count('rate_limited'); stopped = true; break; }
      const hit = found.url ? found : null;
      if (found.via === 'peer') {
        /* The other site's collector chose no picture: neither does this one. */
        if (was && was.source === 'none' && was.via === 'peer') count('unchanged');
        else {
          await store.set(a, { address: a, source: 'none', via: 'peer', key: null, url: null, updated: new Date(now).toISOString() });
          count('peer_none');
        }
      } else if (hit && !(was && was.source === hit.source && was.src_url === hit.url)) {
        const got = await fetchPic(hit.url);
        const made = got.bytes ? await render(got.bytes, null, { background }) : null;
        if (made && made.bytes) {
          await keep(a, made.bytes, { source: hit.source, src_url: hit.url, uploaded_by: null, ...(hit.origin ? { origin: hit.origin } : {}) });
          count(hit.source);
        } else {
          /* Found and not readable: counted, and the last few kept with why, so
             a kind of picture this cannot open says what it is. */
          count('unreadable');
          let host = null;
          try { host = new URL(hit.url).host; } catch (e) { /* said as it was */ }
          job.unreadable = [...(job.unreadable || []), { address: a, source: hit.source, host,
            type: got.type || null, why: String(got.error || (made && made.error) || 'unknown').slice(0, 80) }].slice(-8);
        }
      } else if (!hit && !was) {
        await store.set(a, { address: a, source: 'none', url: null, updated: new Date(now).toISOString() });
        count('none');
      } else if (hit) count('unchanged');
      did += 1;
      if (wait) await new Promise((ok) => setTimeout(ok, wait));
    }
    job.cursor += stopped ? i : slice.length;
    if (!stopped && job.cursor >= order.length) {
      Object.assign(job, { phase: 'idle', cursor: 0, finished: new Date(now).toISOString(),
        next_refresh: new Date(now + refreshDays * 86400000).toISOString() });
    }
    await store.setJob(job);
    return { ...job, did, of: order.length };
  }

  return { record, keep, useSource, stage, save, remove, round, backfill: round, auto: AUTO };
}
