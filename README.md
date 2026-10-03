# @mintfaced/pfp

A hexagon for every collector: the faces on [mintface.art](https://mintface.art) and [theline.wtf](https://www.theline.wtf).

One package so one fix lands in both galleries. Each site keeps its own store, sign-in and pages behind a small adapter; nothing in here knows which site it is in.

```sh
npm install github:MintFaced/pfp#v0.1.0
```

## What's in it

| Entry | Runs | What |
|---|---|---|
| `@mintfaced/pfp` | anywhere | shape, sizes, small-copy URLs, `said` / `peerSaid`, the held-work caption |
| `@mintfaced/pfp/server` | Node 20+ | `createPfp` (keep, stage, save, use, remove, the round), sources, the image pipeline, `resolve` |
| `@mintfaced/pfp/react` | React 18+ | `Hexagon`, `HexagonEditor`, `useFirstReveal` |
| `@mintfaced/pfp/hexagon.css` | browser | the hexagon's styles, themed by `--pfp-ink`, `--pfp-paper`, `--pfp-meta` (and `--pfp-sunk`, `--pfp-rule`, `--pfp-alert`, `--pfp-mono`) |

Peer dependencies, all optional, installed by the host: `sharp` and `viem` for the server half, `heic-decode` to take iPhone uploads, `react` for the components.

## The chain

`upload > peer > opensea > ens > x > placeholder`. Each source is a function the host provides or leaves out (`openseaSource`, `ensSource`, `xSource`, `peerSource`); `resolve` only orders them. The placeholder is the host's own drawing (the work held longest), so the chain ending in nothing is `{ source: null }`.

Every picture is fetched server-side, decoded, turned upright, cropped and written out as a 512 webp with no metadata, plus 128, 64 and 32 copies beside it. A new picture gets a new name (`<hash>.webp`, `<hash>-128.webp`, ...), so no cache can serve an old face under a new one's name. Nothing is hotlinked.

## One face across both galleries

Each site answers `GET /api/pfp/{address}` with `peerSaid(record)`: `{ source, url, updated }` for a picture it found or was given, `{ source: 'none' }` for a collector who chose no picture there, and a 404 otherwise. A face that came from the other site is never said back to it. `peerSource({ base })` asks the other site before OpenSea, fails open in 1.5s, and with `index: true` reads the other site's `GET /api/pfp/list` (`{ addresses }`) every ten minutes and asks only about wallets on it (and about nobody while it has no list).

A collector's REMOVE on either site is passed through: the other site's round sets that wallet to none rather than filling it from OpenSea.

## The store

`createPfp({ store, sources, background, version })` needs a `StoreAdapter`; see `src/service.js` and `types/server.d.ts`. Records are `{ address, source, url, key, updated, src_url, uploaded_by, chosen?, origin?, via? }`.

## Tests

```sh
npm test
```

The pipeline (EXIF gone, orientation applied, the crop where it was put), the source order, the round (peer first, a chosen none passed through, uploads and choices kept, rate limits resumed), and the components' markup.
