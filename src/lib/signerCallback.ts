import { normalizeToPubkey } from 'applesauce-core/helpers';

// Logging in from a web page (and the PWA) with Amber, the NIP-55 way for web apps (zapa, feat-phone-inline
// §P21): the page opens a `nostrsigner:` link carrying a callback address; Amber asks for approval on the phone
// and then opens the callback with the public key appended. No relay, no clipboard. Pure, so it is tested
// without a browser; accounts.ts does the navigating.

/** The query parameter the answer comes back in. */
export const CALLBACK_PARAM = 'madstr-signer';
/** Where the page was (its hash route), kept while it is away at the signer. */
export const RETURN_KEY = 'madstr:signer-return';

const HEX64 = /^[0-9a-f]{64}$/;
const MAX_ANSWER = 200;

/** The `nostrsigner:` link that asks for the public key and comes back to `page` (origin + path, no hash). */
export function loginLink(page: string): string {
  const callback = `${page}?${CALLBACK_PARAM}=`;
  return `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key&callbackUrl=${encodeURIComponent(callback)}`;
}

/** The public key (hex) in a callback's query string, or null when there is none or it is not a key.
 *  The answer is untrusted: an npub or 64 hex characters only, clipped first. */
export function readAnswer(search: string): string | null {
  let raw: string | null;
  try {
    raw = new URLSearchParams(search).get(CALLBACK_PARAM);
  } catch {
    return null;
  }
  if (!raw) return null;
  const value = raw.trim().slice(0, MAX_ANSWER);
  if (HEX64.test(value)) return value;
  if (!value.startsWith('npub1')) return null;
  try {
    const hex = normalizeToPubkey(value);
    return hex && HEX64.test(hex) ? hex : null;
  } catch {
    return null;
  }
}

/** A saved return route: a hash like `#/people/follow`, nothing else. */
export function safeReturn(saved: string | null): string {
  return saved && /^#\/[A-Za-z0-9/_-]{0,100}$/.test(saved) ? saved : '#/';
}
