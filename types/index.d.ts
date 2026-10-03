export declare const MASTER: 512;
export declare const VARIANTS: number[];
export declare const SIZES: { nav: 22; chat: 28; row: 32; profile: 120; og: 160 };
export declare const ORDER: Array<'upload' | 'peer' | 'opensea' | 'ens' | 'x'>;
export declare const HEX_POINTS: string;
export declare const CLIP_PATH: string;
export declare function clipPathSvg(id?: string): string;
export declare function lower(a: unknown): string;
export declare function isAddress(a: unknown): boolean;
export declare function variantUrl(url: string | null | undefined, n: number): string | null;
export declare function variantFor(size: number, dpr?: number): number;
export declare function srcSet(url: string | null | undefined): string;

export type Source = 'upload' | 'peer' | 'opensea' | 'ens' | 'x' | 'none';
export interface PfpRecord {
  address: string;
  source: Source;
  url: string | null;
  key?: string | null;
  updated: string;
  src_url?: string | null;
  uploaded_by?: string | null;
  chosen?: boolean;
  /** For a picture from the other site: what it was there. */
  origin?: string | null;
  /** 'peer' on a none that follows the other site's choice. */
  via?: 'peer';
  [extra: string]: unknown;
}
export interface Said { address: string; source: Source; url: string | null; small?: string | null; updated: string | null }
export declare function said(r: PfpRecord | null, address: string): Said;
export declare function peerSaid(r: PfpRecord | null): { source: Source; url: string | null; updated: string | null } | null;
export declare function heldDays(since: string | null | undefined, now?: number): number | null;
export declare function caption(o?: { days?: number | null; label?: string; artist?: string }): string;
