import { test } from 'node:test';
import assert from 'node:assert/strict';
import { peerSaid, said, variantUrl, variantFor, srcSet, caption, heldDays, isAddress } from '../src/index.js';

const URL_ = 'https://assets.example/pfp/0xabc/0123456789ab.webp';

test('small copies live beside the picture', () => {
  assert.equal(variantUrl(URL_, 128), 'https://assets.example/pfp/0xabc/0123456789ab-128.webp');
  assert.equal(variantUrl(URL_, 512), URL_);
  assert.equal(variantFor(32), 64);
  assert.equal(variantFor(22), 64);
  assert.equal(variantFor(32, 1), 32);
  assert.equal(variantFor(120), 512);
  assert.match(srcSet(URL_), /-32\.webp 32w, .*-64\.webp 64w|-128\.webp 128w/);
});

test('said: the picture, its source, its date, never who set it', () => {
  const r = { source: 'upload', url: URL_, updated: 't', uploaded_by: 'artist' };
  assert.deepEqual(said(r, '0xABC'), { address: '0xabc', source: 'upload', url: URL_, small: variantUrl(URL_, 128), updated: 't' });
  assert.deepEqual(said(null, '0xabc'), { address: '0xabc', source: 'none', url: null, updated: null });
});

test('peerSaid: what one site tells the other', () => {
  assert.deepEqual(peerSaid({ source: 'upload', url: URL_, updated: 't', uploaded_by: 'self' }), { source: 'upload', url: URL_, updated: 't' });
  assert.deepEqual(peerSaid({ source: 'opensea', url: URL_, updated: 't' }), { source: 'opensea', url: URL_, updated: 't' });
  assert.deepEqual(peerSaid({ source: 'none', chosen: true, url: null, updated: 't' }), { source: 'none', url: null, updated: 't' }, 'a chosen none is said');
  assert.equal(peerSaid({ source: 'none', url: null, updated: 't' }), null, 'nothing found is not a choice');
  assert.equal(peerSaid({ source: 'none', via: 'peer', url: null }), null, 'a none from the other site is not said back');
  assert.equal(peerSaid({ source: 'peer', url: URL_, origin: 'upload' }), null, 'a face from the other site is not said back');
  assert.equal(peerSaid(null), null);
});

test('the caption under a held work', () => {
  assert.equal(caption({ days: 412, artist: 'Apocalypse', label: 'Work #3' }), 'HELD 412 DAYS · APOCALYPSE · WORK 3');
  assert.equal(caption({ days: 1, label: 'x' }), 'HELD 1 DAY · X');
  assert.equal(caption({ days: 1200, label: 'x' }), 'HELD 1,200 DAYS · X');
  assert.equal(heldDays('2026-01-01T00:00:00Z', Date.parse('2026-01-11T12:00:00Z')), 10);
  assert.equal(heldDays(null), null);
  assert.equal(isAddress('0x' + 'a'.repeat(40)), true);
});
