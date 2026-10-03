/* The chain: upload > peer > opensea > ens > x > placeholder.
 *
 * Each source is a function the host provides or leaves out; this only puts
 * them in order and says what the first one with an answer said. An upload is
 * the record itself and is never looked past. The placeholder is the host's
 * own drawing, so the chain ending in nothing is { source: null }.
 */
import { ORDER } from './index.js';

/**
 * @returns {Promise<
 *   { source: string, url: string, origin?: string|null } |   a picture
 *   { source: 'none', via: 'peer', chosen: true } |            the other site's collector chose none
 *   { retry: true, source: string, error?: string } |          a source said slow down: stop here, ask later
 *   { source: null }>}                                          nothing: the placeholder
 */
export async function resolve(address, { record = null, sources = {}, order = ORDER, ctx = {} } = {}) {
  if (record && record.source === 'upload' && record.url) return { source: 'upload', url: record.url };
  for (const name of order) {
    const fn = name !== 'upload' && sources[name];
    if (!fn) continue;
    const found = (await fn(address, ctx[name] || {})) || {};
    if (found.retry) return { retry: true, source: name, error: found.error };
    if (found.url) return { source: name, url: found.url, origin: found.origin || null };
    if (name === 'peer' && found.chosen) return { source: 'none', via: 'peer', chosen: true };
  }
  return { source: null };
}
