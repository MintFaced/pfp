/* ENS: the avatar text record of the wallet's primary name, resolved to
   something fetchable. https, ipfs:// and eip155 NFT avatars all come back
   as an https URL from viem. */
import { normalize } from 'viem/ens';
import { createPublicClient, fallback, http } from 'viem';
import { mainnet } from 'viem/chains';
import { lower } from '../index.js';

export const DEFAULT_RPCS = ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com'];

export const ensClient = (rpcs = DEFAULT_RPCS) => createPublicClient({ chain: mainnet,
  transport: fallback(rpcs.map((u) => http(u, { timeout: 10000 }))) });

/**
 * client is a viem public client, or a function returning one (read at each
 * call, so a host or a test can swap it). A name the host already knows is
 * passed as { name } and saves the reverse lookup; an avatar URL it already
 * knows, as { avatar }, saves both.
 */
export function ensSource({ client = null } = {}) {
  let made = null;
  const get = () => (typeof client === 'function' ? client() : client) || made || (made = ensClient());
  return async function ens(address, { name = null, avatar = null } = {}) {
    /* An avatar the host already resolved (a board built nightly does this
       for every named wallet) is the record's answer without asking again. */
    if (typeof avatar === 'string' && avatar.startsWith('https://')) return { url: avatar };
    try {
      let n = name;
      if (!n) n = await get().getEnsName({ address: lower(address) });
      if (!n) return { none: true };
      const url = await get().getEnsAvatar({ name: normalize(n) });
      return url ? { url } : { none: true };
    } catch (e) { return { none: true }; }
  };
}
