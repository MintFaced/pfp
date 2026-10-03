/* Every picture is ours before it is shown.
 *
 * A picture arrives as whatever made it ... a HEIC straight off an iPhone, a
 * JPEG with the street it was taken on written into it, an AVIF from OpenSea's
 * image host ... and every one of them is decoded here, turned the right way
 * up from its own orientation tag, and written out fresh with no metadata at
 * all. sharp writes none unless it is asked to, and it is never asked here.
 *
 * HEIC is decoded by libheif compiled to WebAssembly (heic-decode), because
 * the libvips sharp ships reads HEIF's AVIF flavour and not the HEVC one
 * iPhones write. It is loaded only when a HEIC arrives, so a host that never
 * takes uploads need not install it.
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { MASTER, VARIANTS } from './index.js';

export const IN_MAX_BYTES = 12 * 1024 * 1024;
export const LONG_EDGE = 2000;
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
export const NOT_A_PICTURE = 'That is not a JPEG, PNG, WebP or HEIC picture';
const WONT_OPEN = 'that picture would not open. Try another, or a screenshot of it.';

/** What the first bytes say the file actually is, whatever it claims. */
export function sniff(b) {
  if (!b || b.length < 16) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  /* ISO base media: a size, then 'ftyp', then the brand. */
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (HEIF_BRANDS.has(brand)) return 'image/heic';
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  return null;
}

/* Kinds nobody uploads from a phone but the pictures a face is fetched from
   come in: OpenSea answers in AVIF whatever it is asked for, and a profile
   picture can be a GIF. First frame only, and only where the caller says. */
const WIDE = new Set(['image/avif', 'image/gif']);

/**
 * Any picture, decoded and upright, as a sharp pipeline ready for whatever is
 * done to it next. Measured upright, so a crop drawn over it on a phone is
 * drawn over it the right way up.
 */
export async function decode(bytes, { wide = false } = {}) {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!b.length) return { error: 'that image did not arrive whole' };
  if (b.length > IN_MAX_BYTES) {
    return { error: `${(b.length / 1048576).toFixed(1)}MB, and the limit is ${IN_MAX_BYTES / 1048576}MB` };
  }
  const kind = sniff(b);
  if (!kind || (WIDE.has(kind) && !wide)) return { error: NOT_A_PICTURE };
  try {
    if (kind === 'image/heic') {
      let heicDecode;
      try { heicDecode = (await import('heic-decode')).default; } catch (e) { return { error: 'HEIC pictures are not taken here' }; }
      const { width, height, data } = await heicDecode({ buffer: b });
      return { img: sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } }), kind, width, height };
    }
    const upright = await sharp(b, { failOn: 'error' }).rotate().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = upright.info;
    return { img: sharp(upright.data, { raw: { width, height, channels } }), kind, width, height };
  } catch (e) {
    return { error: WONT_OPEN };
  }
}

/**
 * The first half of an upload: the picture as sent, made safe to show and to
 * crop over. Upright, stripped, sRGB, at most 2000 on its long edge, a JPEG.
 * Transparency is laid on white, because a JPEG has none.
 */
export async function prepare(bytes) {
  const d = await decode(bytes);
  if (d.error) return d;
  try {
    const out = await d.img
      .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .toColourspace('srgb')
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { bytes: out.data, type: 'image/jpeg', w: out.info.width, h: out.info.height, from: d.kind };
  } catch (e) {
    return { error: WONT_OPEN };
  }
}

/**
 * The square a crop names, cut out of the upright picture and written as a
 * 512 webp. A crop is the centre of the square as fractions of the picture,
 * and a zoom: 1 is the largest square that fits, 2 is half its side. Without
 * one, the centre. Anything transparent is laid on the site's paper.
 */
export async function render(bytes, crop = null, { background = '#ffffff' } = {}) {
  const d = await decode(bytes, { wide: true });
  if (d.error) return d;
  const { width: w, height: h } = d;
  const zoom = Math.max(1, Math.min(8, Number(crop && crop.zoom) || 1));
  const side = Math.max(1, Math.floor(Math.min(w, h) / zoom));
  const cx = Math.max(0, Math.min(1, crop && crop.cx != null ? Number(crop.cx) : 0.5));
  const cy = Math.max(0, Math.min(1, crop && crop.cy != null ? Number(crop.cy) : 0.5));
  const left = Math.max(0, Math.min(w - side, Math.round(cx * w - side / 2)));
  const top = Math.max(0, Math.min(h - side, Math.round(cy * h - side / 2)));
  const out = await d.img.extract({ left, top, width: side, height: side })
    .resize(MASTER, MASTER, { fit: 'cover' })
    .flatten({ background })
    .toColourspace('srgb')
    .webp({ quality: 82 })
    .toBuffer();
  return { bytes: out };
}

/** The picture and its small copies, keyed by side: { 512, 128, 64, 32 }. */
export async function variants(master) {
  const out = { [MASTER]: master };
  await Promise.all(VARIANTS.map(async (n) => {
    out[n] = await sharp(master).resize(n, n).webp({ quality: 80 }).toBuffer();
  }));
  return out;
}

/** A name for a picture that changes when a single byte of it does. */
export const hashOf = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
