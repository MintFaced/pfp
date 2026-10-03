/* X: the picture of an X account the collector has linked, at full size
   rather than 48 pixels. Which account is linked is the host's to know;
   lookup(address) answers its profile_image_url, or nothing. */

export const fullSizeX = (url) => String(url || '').replace(/_normal(\.[a-z]+)$/i, '$1');

export function xSource(lookup) {
  return async function x(address) {
    try {
      const got = await lookup(address);
      const url = got ? fullSizeX(got) : null;
      return url ? { url } : { none: true };
    } catch (e) { return { none: true }; }
  };
}
