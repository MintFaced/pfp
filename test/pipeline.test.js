import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { prepare, render, variants, decode, sniff, hashOf } from '../src/pipeline.js';

/* Stored 200 wide by 100 high, red on the left and blue on the right, with an
   orientation tag that says: turn me a quarter clockwise to see me. Upright,
   that is 100 wide by 200 high with the red on top. */
const sideways = async () => {
  const blue = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#0000ff' } }).png().toBuffer();
  return sharp({ create: { width: 200, height: 100, channels: 3, background: '#ff0000' } })
    .composite([{ input: blue, left: 100, top: 0 }])
    .withExif({ IFD0: { Copyright: 'somebody', ImageDescription: 'the street it was taken on' } })
    .withMetadata({ orientation: 6 })
    .jpeg().toBuffer();
};
const colourAt = async (buf, x, y) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return data[i] > data[i + 2] ? 'red' : 'blue';
};

test('the fixture really carries EXIF and an orientation', async () => {
  const m = await sharp(await sideways()).metadata();
  assert.equal(m.orientation, 6);
  assert.ok(m.exif);
});

test('prepare: upright, EXIF gone, a JPEG', async () => {
  const out = await prepare(await sideways());
  assert.equal(out.type, 'image/jpeg');
  assert.deepEqual([out.w, out.h], [100, 200]);
  const m = await sharp(out.bytes).metadata();
  assert.equal(m.exif, undefined);
  assert.equal(m.orientation, undefined);
  assert.equal(await colourAt(out.bytes, 50, 20), 'red');
  assert.equal(await colourAt(out.bytes, 50, 180), 'blue');
});

test('render: a 512 webp with nothing in it but the picture, cut where the crop says', async () => {
  const src = await sideways();
  const top = await render(src, { cx: 0.5, cy: 0.1, zoom: 1 });
  const bottom = await render(src, { cx: 0.5, cy: 0.9, zoom: 1 });
  const m = await sharp(top.bytes).metadata();
  assert.deepEqual([m.format, m.width, m.height, m.exif, m.orientation], ['webp', 512, 512, undefined, undefined]);
  assert.equal(await colourAt(top.bytes, 256, 256), 'red');
  assert.equal(await colourAt(bottom.bytes, 256, 256), 'blue');
});

test('render takes the AVIFs and GIFs a source answers with; prepare does not', async () => {
  const avif = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#11aa44' } }).avif().toBuffer();
  const gif = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#aa7711' } }).gif().toBuffer();
  assert.equal(sniff(avif), 'image/avif');
  assert.ok((await render(avif)).bytes);
  assert.ok((await render(gif)).bytes);
  assert.ok((await prepare(avif)).error);
});

test('a transparent picture is laid on the site\'s paper', async () => {
  const clear = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const out = await render(clear, null, { background: '#faf9f6' });
  const { data } = await sharp(out.bytes).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 240 && data[1] > 240);
});

test('variants: the picture and its 128, 64 and 32 copies', async () => {
  const { bytes } = await render(await sideways());
  const v = await variants(bytes);
  assert.deepEqual(Object.keys(v).map(Number).sort((a, b) => a - b), [32, 64, 128, 512]);
  for (const n of [32, 64, 128]) assert.equal((await sharp(v[n]).metadata()).width, n);
  assert.match(hashOf(bytes), /^[0-9a-f]{12}$/);
});

test('what is not a picture says so', async () => {
  assert.ok((await decode(Buffer.from('not a picture at all, just words'))).error);
  assert.ok((await decode(Buffer.alloc(0))).error);
});
