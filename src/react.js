'use client';
/* @mintfaced/pfp/react: the hexagon, and the crop that changes it.
 *
 * Plain createElement rather than JSX, so the package needs no build and any
 * React host can import it as it is. Styled by hexagon.css, themed by the
 * host's --pfp-* variables. The host says what to draw (the picture, the held
 * work, whose it is); the component only draws it and answers a finger.
 */
import { createElement as h, useCallback, useEffect, useRef, useState } from 'react';
import { HEX_POINTS, srcSet, variantFor, variantUrl } from './index.js';

/* A press long enough to mean it, and a hover long enough not to happen by
   accident on the way across a row. */
const HOLD_TOUCH = 450;
const HOLD_HOVER = 600;
const SEEN = 'pfp_seen';

/**
 * The first reveal: true the first time this browser is shown a picture for
 * this wallet, and never again. Kept in localStorage, so a private window
 * says hello every time, which is harmless.
 */
export function useFirstReveal(address, src) {
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    if (!address || !src) return;
    try {
      const all = JSON.parse(localStorage.getItem(SEEN) || '{}');
      const a = String(address).toLowerCase();
      const first = !(a in all);
      all[a] = src;
      localStorage.setItem(SEEN, JSON.stringify(all));
      if (first) setReveal(true);
    } catch (e) { /* no storage, no hello */ }
  }, [address, src]);
  return reveal;
}

/**
 * A face.
 *   src          the kept picture (its 512 url; the small copies are found beside it)
 *   placeholder  what is drawn faintly when there is no picture (the work held longest)
 *   hold         { src, caption }: what a press or a long hover turns the picture into
 *   mine         their own: tappable, and "Add a picture" under an empty one at 96px and up
 *   onSelect     what a tap on their own face does
 *   reveal       draw the outline once, unprompted
 *   cropping     { url, style }: the editor's picture being placed, instead of the face
 */
export function Hexagon({ size = 32, src = null, placeholder = null, hold = null, mine = false, onSelect = null,
  reveal = false, cropping = null, label = null, addLabel = 'Add a picture', className = '', children = null }) {
  const s = Number(size) || 32;
  const [holding, setHolding] = useState(false);
  const [primed, setPrimed] = useState(false);
  const [on, setOn] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [broken, setBroken] = useState(false);
  const timer = useRef(null);
  const wanted = useRef(false);
  const swallow = useRef(false);
  const heldImg = useRef(null);

  useEffect(() => { setBroken(false); }, [src]);
  useEffect(() => {
    if (!reveal) return undefined;
    setRevealing(true);
    const t = setTimeout(() => setRevealing(false), 1600);
    return () => clearTimeout(t);
  }, [reveal]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const picture = Boolean(src && !broken);
  const canHold = Boolean(hold && hold.src && picture && !cropping);
  const stop = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    wanted.current = false;
    setHolding(false);
  }, []);
  /* The crossfade waits for the work to have arrived: a face that fades to an
     empty hexagon and then fills is worse than one that waits a moment. */
  const start = useCallback((ms, touch) => {
    stop();
    setPrimed(true);
    wanted.current = true;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (touch) swallow.current = true;
      const show = () => { if (wanted.current) setHolding(true); };
      const img = heldImg.current;
      if (!img || img.complete) show();
      else img.addEventListener('load', show, { once: true });
    }, ms);
  }, [stop]);

  const handlers = {
    onPointerEnter: (ev) => { if (ev.pointerType === 'mouse' && canHold) start(HOLD_HOVER, false); },
    onPointerLeave: (ev) => { if (ev.pointerType === 'mouse') stop(); },
    onPointerDown: (ev) => {
      if (ev.pointerType === 'mouse' || cropping) return;
      swallow.current = false;
      setOn(true);
      if (canHold) start(HOLD_TOUCH, true);
    },
    onPointerUp: (ev) => { if (ev.pointerType !== 'mouse') { setOn(false); stop(); } },
    onPointerCancel: () => { setOn(false); stop(); },
    /* A long press on a picture is the phone's cue for its own menu. */
    onContextMenu: (ev) => { if (hold) ev.preventDefault(); },
    onClickCapture: (ev) => {
      if (swallow.current) { swallow.current = false; ev.preventDefault(); ev.stopPropagation(); }
    },
    onClick: (ev) => { if (mine && onSelect && !cropping) { ev.preventDefault(); ev.stopPropagation(); onSelect(); } },
    onKeyDown: (ev) => {
      if (mine && onSelect && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); onSelect(); }
    },
  };

  const img = (props) => h('img', { alt: '', width: s, height: s, decoding: 'async', draggable: false, ...props });
  let face;
  if (cropping) {
    face = h('span', { className: 'face' }, img({ className: 'crop', src: cropping.url, style: cropping.style || undefined }));
  } else if (picture) {
    face = h('span', { className: 'face' }, img({ src: variantUrl(src, variantFor(s)), srcSet: srcSet(src), sizes: `${s}px`,
      loading: 'lazy', onError: () => setBroken(true) }));
  } else {
    face = h('span', { className: 'face none' }, placeholder ? img({ src: placeholder, loading: 'lazy', referrerPolicy: 'no-referrer',
      onError: (ev) => { ev.currentTarget.style.visibility = 'hidden'; } }) : null);
  }
  /* The held work goes in when it is first wanted, not with the page: a board
     of a hundred faces is not a hundred more pictures. */
  const held = primed && hold && hold.src
    ? h('span', { className: 'face held' }, h('img', { ref: heldImg, src: hold.src, alt: '', decoding: 'async', draggable: false, referrerPolicy: 'no-referrer' }))
    : null;
  /* The outline is a pixel wide at every size, which in a hundred-unit box is
     a different number at each one. */
  const edge = h('svg', { className: 'edge', viewBox: '0 0 100 100', 'aria-hidden': 'true' },
    h('polygon', { pathLength: 100, points: HEX_POINTS, strokeWidth: (100 / s).toFixed(3) }));
  const cap = picture && canHold && hold.caption ? h('span', { className: 'cap hold' }, hold.caption)
    : (!picture && !cropping && mine && s >= 96 ? h('span', { className: 'cap add' }, addLabel) : null);

  const empty = !picture && !placeholder && !cropping;
  const classes = ['pfp', empty && 'empty', mine && 'mine', on && 'on', holding && 'holding', revealing && 'reveal', cropping && 'cropping', className]
    .filter(Boolean).join(' ');
  const a11y = mine && onSelect
    ? { role: 'button', tabIndex: 0, 'aria-label': label || 'Change your picture' }
    : (label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' });
  return h('span', { className: classes, style: { '--s': `${s}px` }, 'data-s': s, ...a11y, ...handlers }, face, held, edge, cap, children);
}

/**
 * Changing a face, in the hexagon itself. Choose a picture and it lands inside
 * the face, to be dragged into place and pinched or scrolled to size, then
 * saved. The picture goes up first and comes back made safe (upright,
 * stripped, a JPEG), so the crop is drawn over what the server will cut, even
 * from a HEIC this browser cannot show.
 *
 *   post(body, upload?)  the host's request to its own picture service; resolves
 *                        to the JSON it answered, or throws an Error to say
 *   onDone(pfp)          the new picture (or none), as the service said it
 *   sources              the USE buttons this site offers: opensea, ens, x
 */
export function HexagonEditor({ src = null, placeholder = null, post, onDone, onClose, sources = ['opensea', 'ens'],
  size = 120, className = '' }) {
  const blank = { tmp: null, url: null, w: 0, h: 0, cx: 0.5, cy: 0.5, zoom: 1 };
  const [st, setSt] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);
  const input = useRef(null);
  const area = useRef(null);
  const pts = useRef(new Map());
  const pinch = useRef(null);
  const live = useRef(st);
  live.current = st;

  /* The crop, as the server will cut it: the largest square that fits, divided
     by the zoom, centred where cx and cy say, and never off the picture. */
  const fit = (x) => {
    if (!x.w) return x;
    const side = Math.min(x.w, x.h) / x.zoom;
    return { ...x,
      cx: Math.min(1 - side / 2 / x.w, Math.max(side / 2 / x.w, x.cx)),
      cy: Math.min(1 - side / 2 / x.h, Math.max(side / 2 / x.h, x.cy)) };
  };
  const style = (() => {
    if (!st.tmp || !st.w) return null;
    const k = size / (Math.min(st.w, st.h) / st.zoom);
    return { width: st.w * k, height: st.h * k, left: size / 2 - st.cx * st.w * k, top: size / 2 - st.cy * st.h * k };
  })();

  useEffect(() => {
    const el = area.current;
    if (!el) return undefined;
    const wheel = (ev) => {
      const x = live.current;
      if (!x.tmp) return;
      ev.preventDefault();
      setSt(fit({ ...x, zoom: Math.min(8, Math.max(1, x.zoom * Math.exp(-ev.deltaY / 400))) }));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const crop = {
    onPointerDown: (ev) => {
      if (!live.current.tmp) return;
      ev.preventDefault();
      ev.currentTarget.setPointerCapture(ev.pointerId);
      pts.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.current.size === 2) {
        const [p, q] = [...pts.current.values()];
        pinch.current = { d: Math.hypot(p.x - q.x, p.y - q.y), zoom: live.current.zoom };
      }
    },
    onPointerMove: (ev) => {
      const prev = pts.current.get(ev.pointerId);
      const x = live.current;
      if (!prev || !x.tmp) return;
      const now = { x: ev.clientX, y: ev.clientY };
      pts.current.set(ev.pointerId, now);
      if (pts.current.size >= 2 && pinch.current) {
        const [p, q] = [...pts.current.values()];
        setSt(fit({ ...x, zoom: Math.min(8, Math.max(1, pinch.current.zoom * (Math.hypot(p.x - q.x, p.y - q.y) / (pinch.current.d || 1)))) }));
      } else {
        const k = size / (Math.min(x.w, x.h) / x.zoom);
        setSt(fit({ ...x, cx: x.cx - (now.x - prev.x) / (x.w * k), cy: x.cy - (now.y - prev.y) / (x.h * k) }));
      }
    },
    onPointerUp: (ev) => { pts.current.delete(ev.pointerId); if (pts.current.size < 2) pinch.current = null; },
    onPointerCancel: (ev) => { pts.current.delete(ev.pointerId); pinch.current = null; },
  };

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (err) { setSaid({ text: String((err && err.message) || err), bad: true }); } finally { setBusy(false); }
  };
  const done = (j) => { setSt(blank); setSaid(null); if (onDone) onDone(j.pfp); };
  const choose = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    run(async () => {
      setSaid({ text: 'Sending' });
      const j = await post({ action: 'stage' }, { blob: file, name: file.name });
      setSt({ ...blank, tmp: j.tmp, url: j.url, w: j.w, h: j.h });
      setSaid({ text: 'Drag to place it. Pinch or scroll to size it.' });
    });
  };
  const NAMES = { opensea: 'Use OpenSea', ens: 'Use ENS', x: 'Use X' };
  const button = (p, text, onClick) => h('button', { key: p, type: 'button', 'data-p': p, disabled: busy, onClick }, text);
  const acts = [
    st.tmp
      ? button('save', 'Save', () => run(async () => done(await post({ action: 'save', tmp: st.tmp, crop: { cx: st.cx, cy: st.cy, zoom: st.zoom } }))))
      : button('choose', 'Choose a picture', () => input.current && input.current.click()),
    ...sources.filter((x) => NAMES[x]).map((x) => button(x, NAMES[x], () => run(async () => done(await post({ action: 'use', source: x }))))),
    button('remove', 'Remove', () => run(async () => done(await post({ action: 'remove' })))),
    button('cancel', 'Cancel', () => { setSt(blank); if (onClose) onClose(); }),
  ];
  return h('div', { className: ['pfp-panel', className].filter(Boolean).join(' ') },
    h('span', { ref: area, className: 'pfp-crop', ...crop },
      h(Hexagon, { size, src: st.tmp ? null : src, placeholder: st.tmp ? null : placeholder,
        cropping: st.tmp && style ? { url: st.url, style } : null })),
    h('input', { ref: input, type: 'file', hidden: true, onChange: choose,
      accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif' }),
    h('div', { className: 'pfp-acts' }, ...acts),
    h('p', { className: `pfp-say${said && said.bad ? ' bad' : ''}`, role: 'status' }, said ? said.text : ''));
}
