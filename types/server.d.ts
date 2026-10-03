export * from './index.js';
import type { PfpRecord, Said } from './index.js';

export type Found = { url?: string; none?: boolean; chosen?: boolean; error?: string; retry?: boolean; origin?: string | null };
export type SourceFn = (address: string, ctx?: { name?: string | null; avatar?: string | null }) => Promise<Found>;

export interface StoreAdapter {
  get(address: string): Promise<PfpRecord | null>;
  getMany?(addresses: string[]): Promise<Array<PfpRecord | null>>;
  set(address: string, record: PfpRecord): Promise<void>;
  putImage(address: string, img: { hash: string; images: Record<number, Buffer> }): Promise<{ key: string; url: string }>;
  stagePut(id: string, bytes: Buffer, meta: { w: number; h: number; owner: string; by: string }): Promise<{ url: string }>;
  stageGet(id: string): Promise<({ owner: string; by: string; w: number; h: number } & Record<string, unknown>) | null>;
  stageRead(meta: Record<string, unknown>): Promise<Buffer | null>;
  stageDrop(id: string, meta: Record<string, unknown>): Promise<void>;
  getJob(): Promise<Job | null>;
  setJob(job: Job): Promise<void>;
}
export interface Job {
  v: number;
  phase: 'backfill' | 'refresh' | 'idle';
  cursor: number;
  hits: Record<string, number>;
  started?: string;
  finished?: string;
  next_refresh?: string;
  unreadable?: Array<{ address: string; source: string; host: string | null; type: string | null; why: string }>;
}
export interface Row { address: string; rank?: number; ens?: string | null; fwd?: string | null; avatar?: string | null; private?: boolean }
export type Result = { ok: true; pfp: Said } | { error: string; status: number; retry?: boolean };

export interface Pfp {
  record(address: string): Promise<PfpRecord | null>;
  keep(address: string, master: Buffer, fields: Partial<PfpRecord>): Promise<PfpRecord>;
  useSource(address: string, source: string, o?: { by?: string; ens?: string | null }): Promise<Result>;
  stage(address: string, bytes: Buffer, o?: { by?: string }): Promise<{ ok: true; tmp: string; url: string; w: number; h: number } | { error: string; status: number }>;
  save(address: string, tmp: string, crop: { cx?: number; cy?: number; zoom?: number } | null, o?: { by?: string }): Promise<Result>;
  remove(address: string, o?: { by?: string }): Promise<Result>;
  round(o: { rows: Row[]; batch?: number; pause?: number; perMinute?: number; now?: number; budget?: number; refreshDays?: number }): Promise<Job & { did: number; of?: number }>;
  backfill: Pfp['round'];
  auto: string[];
}
export declare function createPfp(o: {
  store: StoreAdapter;
  sources?: Partial<Record<'peer' | 'opensea' | 'ens' | 'x', SourceFn>>;
  auto?: string[];
  choosable?: string[];
  background?: string;
  version?: number;
  fetchPicture?: typeof fetchPicture;
}): Pfp;
export declare function resolve(address: string, o?: { record?: PfpRecord | null; sources?: Record<string, SourceFn>; order?: string[]; ctx?: Record<string, object> }): Promise<
  { source: string; url: string; origin?: string | null } | { source: 'none'; via: 'peer'; chosen: true } | { retry: true; source: string; error?: string } | { source: null }>;

export declare const IN_MAX_BYTES: number;
export declare const LONG_EDGE: number;
export declare const NOT_A_PICTURE: string;
export declare function sniff(b: Buffer): string | null;
export declare function decode(bytes: Buffer, o?: { wide?: boolean }): Promise<{ img: unknown; kind: string; width: number; height: number } | { error: string }>;
export declare function prepare(bytes: Buffer): Promise<{ bytes: Buffer; type: 'image/jpeg'; w: number; h: number; from: string } | { error: string }>;
export declare function render(bytes: Buffer, crop?: { cx?: number; cy?: number; zoom?: number } | null, o?: { background?: string }): Promise<{ bytes: Buffer } | { error: string }>;
export declare function variants(master: Buffer): Promise<Record<number, Buffer>>;
export declare function hashOf(b: Buffer): string;
export declare function fetchPicture(url: string, o?: { timeout?: number; fetch?: typeof fetch }): Promise<{ bytes: Buffer; type: string | null } | { error: string; bytes?: undefined; type?: string | null }>;
export declare function isOpenSeaDefault(url: string | null | undefined): boolean;
export declare function openseaSource(o?: { apiKey?: string | (() => string | undefined); fetch?: typeof fetch; timeout?: number }): SourceFn;
export declare const DEFAULT_RPCS: string[];
export declare function ensClient(rpcs?: string[]): unknown;
export declare function ensSource(o?: { client?: unknown }): SourceFn;
export declare function fullSizeX(url: string): string;
export declare function xSource(lookup: (address: string) => Promise<string | null | undefined>): SourceFn;
export declare function peerSource(o: { base: string; timeout?: number; index?: boolean; indexTtl?: number; fetch?: typeof fetch }): SourceFn;
