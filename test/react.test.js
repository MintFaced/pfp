import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Hexagon, HexagonEditor } from '../src/react.js';

const URL_ = 'https://assets.test/pfp/0xabc/0123456789ab.webp';

test('a face: the small copy at row size, every copy offered, the outline a pixel wide', () => {
  const html = renderToStaticMarkup(h(Hexagon, { size: 32, src: URL_ }));
  assert.match(html, /class="pfp"/);
  assert.match(html, /--s:32px/);
  assert.match(html, /src="https:\/\/assets\.test\/pfp\/0xabc\/0123456789ab-64\.webp"/);
  assert.match(html, /srcSet="[^"]*-32\.webp 32w[^"]*512w"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /stroke-width="3\.125"/);
  assert.match(html, /aria-hidden="true"/);
});

test('no picture: the held work, faintly; and nothing at all is still the right size', () => {
  const ph = renderToStaticMarkup(h(Hexagon, { size: 32, placeholder: 'https://art.test/w.jpg' }));
  assert.match(ph, /class="face none"><img[^>]*src="https:\/\/art\.test\/w\.jpg"/);
  const empty = renderToStaticMarkup(h(Hexagon, { size: 28 }));
  assert.match(empty, /class="face none"><\/span>/);
  assert.match(empty, /class="pfp empty"/, 'drawn as a hairline, not as nothing');
  assert.doesNotMatch(ph, /pfp empty/);
});

test('their own: a button, and "Add a picture" under an empty one at 96 and up', () => {
  const mine = renderToStaticMarkup(h(Hexagon, { size: 120, mine: true, onSelect: () => {} }));
  assert.match(mine, /class="pfp empty mine"/);
  assert.match(mine, /role="button"/);
  assert.match(mine, /Add a picture/);
  assert.doesNotMatch(renderToStaticMarkup(h(Hexagon, { size: 32, mine: true, onSelect: () => {} })), /Add a picture/);
});

test('the held work is not fetched with the page, and its caption waits for a picture', () => {
  const hold = { src: 'https://art.test/held.jpg', caption: 'HELD 412 DAYS · X' };
  const html = renderToStaticMarkup(h(Hexagon, { size: 32, src: URL_, hold }));
  assert.doesNotMatch(html, /held\.jpg/);
  assert.match(html, /class="cap hold">HELD 412 DAYS · X</);
  assert.doesNotMatch(renderToStaticMarkup(h(Hexagon, { size: 32, hold })), /cap hold/);
});

test('the editor: choose, the sources this site offers, remove, cancel', () => {
  const html = renderToStaticMarkup(h(HexagonEditor, { post: async () => ({}), sources: ['opensea', 'ens'] }));
  for (const p of ['choose', 'opensea', 'ens', 'remove', 'cancel']) assert.match(html, new RegExp(`data-p="${p}"`));
  assert.doesNotMatch(html, /data-p="x"/);
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp,image\/heic/);
});
