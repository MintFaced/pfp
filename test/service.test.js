import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createPfp } from '../src/service.js';
import { resolve } from '../src/resolve.js';
import { peerSource } from '../src/sources/peer.js';
import { ensSource } from '../src/sources/ens.js';
import { xSource } from '../src/sources/x.js';
import { openseaSource, isOpenSeaDefault } from '../src/sources/opensea.js';

const A = (n) => `0x${String(n).padStart(40, '0')}`;
const png = (c) => sharp({ create: { width: 80, height: 80, channels: 3, background: c } }).png().toBuffer();

/* A store in memory, the way both sites' adapters behave. */
function memoryStore() {
  const recs = new Map(); const imgs = new Map(); const tmp = new Map(); let job = null;
  return {
    recs, imgs,
    get: async (a) => recs.get(a) || null,
    set: async (a, r) => { recs.set(a, r); },
    putImage: async (a, { hash, images }) => {
      for (const [n, b] of Object.entries(images)) imgs.set(`pfp/${a}/${hash}${Number(n) === 512 ? '' : `-${n}`}.webp`, b);
      return { key: `pfp/${a}/${hash}.webp`, url: `https://assets.test/pfp/${a}/${hash}.webp` };
    },
    stagePut: async (id, bytes, meta) => { tmp.set(id, { ...meta, bytes }); return { url: `https://assets.test/tmp/${id}.jpg` }; },
    stageGet: async (id) => tmp.get(id) || null,
    stageRead: async (t) => t.bytes,
    stageDrop: async (id) => { tmp.delete(id); },
    getJob: async () => job,
    setJob: async (j) => { job = JSON.parse(JSON.stringify(j)); },
  };
}
const PICS = new Map();
const fetchPicture = async (url) => (PICS.has(url) ? { bytes: PICS.get(url) } : { error: 'answered 404' });

test('resolve: the first source with a picture wins, in the chain\'s order', async () => {
  const asked = [];
  const src = (name, ans) => async () => { asked.push(name); return ans; };
  const got = await resolve(A(1), { sources: {
    peer: src('peer', { none: true }), opensea: src('opensea', { error: 'OpenSea 500' }),
    ens: src('ens', { url: 'https://e/1.png' }), x: src('x', { url: 'https://x/1.png' }) } });
  assert.deepEqual(got, { source: 'ens', url: 'https://e/1.png', origin: null });
  assert.deepEqual(asked, ['peer', 'opensea', 'ens'], 'a source that could not tell falls through; x is never asked');
  assert.deepEqual(await resolve(A(1), { record: { source: 'upload', url: 'u' }, sources: { opensea: src('opensea', { url: 'o' }) } }),
    { source: 'upload', url: 'u' }, 'an upload is never looked past');
  assert.deepEqual(await resolve(A(1), { sources: { opensea: src('o', { error: 'rate limited', retry: true }) } }),
    { retry: true, source: 'opensea', error: 'rate limited' });
  assert.deepEqual(await resolve(A(1), { sources: { peer: src('p', { none: true, chosen: true }), opensea: src('o2', { url: 'o' }) } }),
    { source: 'none', via: 'peer', chosen: true }, 'the other site\'s chosen none ends the chain');
  assert.deepEqual(await resolve(A(1), { sources: {} }), { source: null });
});

test('the round: peer first, a chosen none passed through, uploads and choices kept', async () => {
  const store = memoryStore();
  const PEER = new Map(); const OS = new Map();
  PICS.set('https://peer.test/up.webp', await png('#ff0000'));
  PICS.set('https://os.test/a.png', await png('#00ff00'));
  PICS.set('https://os.test/b.png', await png('#0000ff'));
  const peer = async (a) => PEER.get(a) || { none: true };
  const opensea = async (a) => OS.get(a) || { none: true };
  const P = createPfp({ store, sources: { peer, opensea }, version: 1, fetchPicture });
  PEER.set(A(1), { url: 'https://peer.test/up.webp', origin: 'upload' });   // uploaded on the other site
  OS.set(A(1), { url: 'https://os.test/a.png' });
  PEER.set(A(2), { none: true, chosen: true });                              // chose none over there
  OS.set(A(2), { url: 'https://os.test/a.png' });
  OS.set(A(3), { url: 'https://os.test/b.png' });
  await store.set(A(4), { address: A(4), source: 'upload', url: 'https://assets.test/mine.webp' });
  const rows = [1, 2, 3, 4, 5].map((n) => ({ address: A(n), rank: n }));
  const out = await P.round({ rows, batch: 10, pause: 0 });
  assert.deepEqual([store.recs.get(A(1)).source, store.recs.get(A(1)).origin], ['peer', 'upload'], 'the other site\'s upload, before OpenSea');
  assert.ok(store.recs.get(A(1)).url.startsWith('https://assets.test/'), 'fetched into this site\'s bucket, not hotlinked');
  assert.deepEqual([store.recs.get(A(2)).source, store.recs.get(A(2)).via], ['none', 'peer'], 'not filled from OpenSea');
  assert.equal(store.recs.get(A(3)).source, 'opensea');
  assert.equal(store.recs.get(A(4)).source, 'upload', 'an upload is never touched');
  assert.equal(store.recs.get(A(5)).source, 'none');
  assert.deepEqual([out.hits.peer, out.hits.peer_none, out.hits.opensea, out.hits.none], [1, 1, 1, 1]);
  assert.equal(out.phase, 'idle');

  /* A month later: the other site's collector picks a picture after all, and
     this one removes theirs. */
  PEER.delete(A(2));
  await P.remove(A(3));
  const later = await P.round({ rows, batch: 10, pause: 0, now: Date.now() + 31 * 86400000 });
  assert.equal(store.recs.get(A(2)).source, 'opensea', 'a none from over there is followed, not frozen');
  assert.deepEqual([store.recs.get(A(3)).source, store.recs.get(A(3)).chosen], ['none', true], 'REMOVE survives the refresh');
  assert.equal(later.hits.unchanged, 1, 'the peer picture that did not change is not fetched again');
});

test('a slow down from OpenSea stops the batch at that collector, and the next run picks up there', async () => {
  const store = memoryStore();
  let limited = true;
  const opensea = async (a) => (a === A(2) && limited ? { error: 'rate limited', retry: true } : { none: true });
  const P = createPfp({ store, sources: { opensea }, fetchPicture });
  const rows = [1, 2, 3].map((n) => ({ address: A(n), rank: n }));
  const one = await P.round({ rows, pause: 0 });
  assert.deepEqual([one.cursor, one.hits.rate_limited, store.recs.has(A(2))], [1, 1, false]);
  limited = false;
  const two = await P.round({ rows, pause: 0 });
  assert.deepEqual([two.phase, store.recs.get(A(2)).source], ['idle', 'none']);
});

test('perMinute paces the round', async () => {
  const P = createPfp({ store: memoryStore(), sources: { opensea: async () => ({ none: true }) }, fetchPicture });
  const t = Date.now();
  await P.round({ rows: [1, 2, 3].map((n) => ({ address: A(n) })), perMinute: 1200 });
  assert.ok(Date.now() - t >= 140, 'three collectors at twenty a second take at least 150ms');
});

test('an upload: staged, cropped, kept with every copy, said without who', async () => {
  const store = memoryStore();
  const P = createPfp({ store, fetchPicture });
  const st = await P.stage(A(7), await png('#123456'), { by: 'admin' });
  assert.equal(st.ok, true);
  const nope = await P.save(A(8), st.tmp, null);
  assert.equal(nope.status, 410, 'nobody saves somebody else\'s staged picture');
  const sv = await P.save(A(7), st.tmp, { cx: 0.5, cy: 0.5, zoom: 1 }, { by: 'admin' });
  assert.deepEqual([sv.ok, sv.pfp.source, 'uploaded_by' in sv.pfp], [true, 'upload', false]);
  assert.equal(store.recs.get(A(7)).uploaded_by, 'admin');
  assert.equal([...store.imgs.keys()].filter((k) => k.startsWith(`pfp/${A(7)}/`)).length, 4);
  assert.equal((await P.save(A(7), st.tmp, null)).status, 410, 'used once');
  assert.equal((await P.useSource(A(7), 'x')).status, 400, 'a source this site was not given');
});

test('sources: OpenSea defaults, ENS hints, X at full size, the peer and its list', async () => {
  assert.equal(isOpenSeaDefault('https://static.opensea.io/opensea-static/opensea-profile/12.png'), true);
  const os = openseaSource({ apiKey: 'k', fetch: async () => new Response(JSON.stringify({ profile_image_url: 'https://i.seadn.io/a.png' })) });
  assert.deepEqual(await os(A(1)), { url: 'https://i.seadn.io/a.png' });
  assert.deepEqual(await openseaSource({ apiKey: '' })(A(1)), { error: 'no OpenSea key here' });
  assert.deepEqual(await openseaSource({ apiKey: 'k', fetch: async () => new Response('', { status: 429 }) })(A(1)), { error: 'rate limited', retry: true });

  let asked = 0;
  const ens = ensSource({ client: { getEnsName: async () => { asked++; return 'a.eth'; }, getEnsAvatar: async () => 'https://e/a.png' } });
  assert.deepEqual(await ens(A(1), { avatar: 'https://euc.li/a.eth' }), { url: 'https://euc.li/a.eth' });
  assert.equal(asked, 0, 'a known avatar asks the chain nothing');
  assert.deepEqual(await ens(A(1)), { url: 'https://e/a.png' });

  assert.deepEqual(await xSource(async () => 'https://pbs.twimg.com/p/abc_normal.jpg')(A(1)), { url: 'https://pbs.twimg.com/p/abc.jpg' });
  assert.deepEqual(await xSource(async () => { throw new Error('down'); })(A(1)), { none: true });

  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.endsWith('/api/pfp/index')) return new Response(JSON.stringify({ addresses: [A(1), A(2)] }));
    if (url.endsWith(A(1))) return new Response(JSON.stringify({ source: 'upload', url: 'https://other/1.webp', updated: 't' }));
    if (url.endsWith(A(2))) return new Response(JSON.stringify({ source: 'none', url: null }));
    return new Response('{}', { status: 404 });
  };
  const peer = peerSource({ base: 'https://other/', index: true, fetch: fake });
  assert.deepEqual(await peer(A(1)), { url: 'https://other/1.webp', origin: 'upload' });
  assert.deepEqual(await peer(A(2)), { none: true, chosen: true });
  assert.deepEqual(await peer(A(3)), { none: true });
  assert.deepEqual(calls, ['https://other/api/pfp/index', `https://other/api/pfp/${A(1)}`, `https://other/api/pfp/${A(2)}`],
    'the list read once, and a wallet not on it never asked about');
  const down = peerSource({ base: 'https://other', fetch: async () => { throw new Error('timeout'); } });
  assert.deepEqual(await down(A(1)), { error: 'peer did not answer' }, 'fail-open: the chain goes on');
  assert.deepEqual(await peerSource({ base: '' })(A(1)), { none: true }, 'no peer, nothing to say');
});
