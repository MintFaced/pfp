/* @mintfaced/pfp: a hexagon for every collector.
 *
 * The parts of a face that are the same on every site and safe in a browser:
 * the shape, the sizes, where the small copies live beside the big one, what
 * may be said about a picture in public, and the caption a held work carries.
 * The server half (sources, pipeline, the round) is in ./server; the React
 * half is in ./react. Nothing here knows which site it is in.
 */

/** The picture as kept: one square, this many pixels a side. */
export const MASTER = 512;
/** The small copies kept beside it, for every size under a profile header. */
export const VARIANTS = [128, 64, 32];
/** The sizes a face is drawn at: nav, chat, rows, profile header, OG card. */
export const SIZES = { nav: 22, chat: 28, row: 32, profile: 120, og: 160 };
/** Where a face can come from, in the order they are tried. The placeholder
    is not a source: it is what a site draws when the chain finds nothing. */
export const ORDER = ['upload', 'peer', 'opensea', 'ens', 'x'];

/* The shape: a pointy-top regular hexagon, in a hundred-unit box. */
export const HEX_POINTS = '50,0 93.3,25 93.3,75 50,100 6.7,75 6.7,25';
/** The same shape as a CSS clip-path. */
export const CLIP_PATH = 'polygon(50% 0,93.3% 25%,93.3% 75%,50% 100%,6.7% 75%,6.7% 25%)';

/** The shape as an SVG clipPath, for a page that draws without CSS clip-path
    (an OG card, an email): reference it as clip-path="url(#id)". */
export const clipPathSvg = (id = 'pfp-hex') => `<svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs><clipPath id="${id}" clipPathUnits="objectBoundingBox"><polygon points="0.5,0 0.933,0.25 0.933,0.75 0.5,1 0.067,0.75 0.067,0.25"/></clipPath></defs></svg>`;

export const lower = (a) => String(a || '').toLowerCase();
export const isAddress = (a) => /^0x[0-9a-f]{40}$/.test(lower(a));

/* A kept picture is <name>.webp, and each small copy is <name>-<n>.webp beside
   it. A new picture gets a new name, so no cache anywhere can go on serving
   the old face under the new one's. */
export const variantUrl = (url, n) => (url && n && n < MASTER
  ? String(url).replace(/\.webp$/, `-${n}.webp`) : url || null);

/** The smallest copy that is still sharp at this size on a screen this dense,
    or the full picture when none of them is. */
export const variantFor = (size, dpr = 2) => {
  const want = Math.ceil(size * dpr);
  return [...VARIANTS].sort((a, b) => a - b).find((n) => n >= want) || MASTER;
};

/** srcset over every copy, so the browser picks. */
export const srcSet = (url) => (url
  ? [...VARIANTS.map((n) => `${variantUrl(url, n)} ${n}w`), `${url} ${MASTER}w`].join(', ') : '');

/** What anybody may know: the picture, where it came from, when. Never who
    set it. */
export const said = (r, address) => (r && r.source !== 'none' && r.url
  ? { address: lower(address), source: r.source, url: r.url, small: variantUrl(r.url, 128), updated: r.updated }
  : { address: lower(address), source: 'none', url: null, updated: r ? r.updated : null });

/**
 * What one site tells the other about a wallet (GET /api/pfp/{address}).
 *
 * A picture this site found or was given, as { source, url, updated }; a
 * collector who chose no picture here, as source none, so the other site does
 * not fill them with an automatic one; and otherwise nothing, a 404. Never a
 * picture this site only has because the other site had it first, or the two
 * would go on pointing at each other long after the source had changed. Never
 * the placeholder, which is each site's own drawing.
 */
export function peerSaid(r) {
  if (!r || r.source === 'peer') return null;
  if (r.source === 'none') return r.chosen ? { source: 'none', url: null, updated: r.updated || null } : null;
  if (!r.url) return null;
  return { source: r.source, url: r.url, updated: r.updated || null };
}

/** How long a work has been held, in whole days, from when it was acquired. */
export const heldDays = (since, now = Date.now()) => {
  const t = Date.parse(since || '');
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86400000)) : null;
};

/** The caption under a held work: "HELD 412 DAYS · ARTIST · WORK". */
export function caption({ days = null, label = '', artist = '' } = {}) {
  const clean = (s) => String(s || '').replace(/#/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const parts = [clean(artist), clean(label)].filter(Boolean).join(' · ');
  const held = days == null ? 'HELD' : `HELD ${days.toLocaleString('en-NZ')} DAY${days === 1 ? '' : 'S'}`;
  return parts ? `${held} · ${parts}` : held;
}
