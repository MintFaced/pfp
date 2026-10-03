/* OpenSea: the account's profile picture, from the v2 accounts endpoint.
 *
 * A source answers { url } for a picture, { none: true } for none, and
 * { error } when it could not tell; { retry: true } with the error means
 * OpenSea said slow down, which is not OpenSea saying no picture. */
import { lower } from '../index.js';

/* OpenSea's own stand-ins: the coloured default avatars every account starts
   with. A collector who never chose one has not got a picture there. */
export const isOpenSeaDefault = (url) => !url
  || /opensea-static\/opensea-profile|\/default[-_]?(profile|avatar)|\/avatars\/default/i.test(String(url));

/** apiKey is the key or a function returning it, read at each call. */
export function openseaSource({ apiKey = () => process.env.OPENSEA_API_KEY, fetch: f = null, timeout = 10000 } = {}) {
  return async function opensea(address) {
    const key = typeof apiKey === 'function' ? apiKey() : apiKey;
    if (!key) return { error: 'no OpenSea key here' };
    try {
      const r = await (f || globalThis.fetch)(`https://api.opensea.io/api/v2/accounts/${lower(address)}`,
        { headers: { accept: 'application/json', 'x-api-key': key }, signal: AbortSignal.timeout(timeout) });
      if (r.status === 404) return { none: true };
      if (r.status === 429) return { error: 'rate limited', retry: true };
      if (!r.ok) return { error: `OpenSea ${r.status}` };
      const j = await r.json();
      const url = j && j.profile_image_url;
      return isOpenSeaDefault(url) ? { none: true } : { url };
    } catch (e) { return { error: 'OpenSea did not answer' }; }
  };
}
