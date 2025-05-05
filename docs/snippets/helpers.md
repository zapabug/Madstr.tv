// -- Copied helpers --

// From packages/signers/src/helpers/encryption.ts
/**
 * Checks if a string is encrypted with NIP-04 or NIP-44
 * @see https://github.com/nostr-protocol/nips/pull/1248#issuecomment-2437731316
 */
export function isNIP04(ciphertext: string): boolean {
  const l = ciphertext.length;
  if (l < 28) return false;
  return (
    ciphertext[l - 28] == "?" && ciphertext[l - 27] == "i" && ciphertext[l - 26] == "v" && ciphertext[l - 25] == "="
  );
}

// From packages/core/src/promise/deferred.ts
export type Deferred<T> = Promise<T> & {
  resolve: (value?: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
};

/** Creates a controlled promise */
export function createDefer<T>() {
  let _resolve: (value?: T | PromiseLike<T>) => void;
  let _reject: (reason?: any) => void;
  const promise = new Promise<T>((resolve, reject) => {
    // @ts-ignore
    _resolve = resolve;
    _reject = reject;
  }) as Deferred<T>;

  // @ts-ignore
  promise.resolve = _resolve;
  // @ts-ignore
  promise.reject = _reject;

  return promise;
}

// From packages/core/src/helpers/time.ts
/** Returns the current unix timestamp */
export function unixNow() {
  return Math.round(Date.now() / 1000);
}

// From packages/core/src/helpers/string.ts
/** Tests if a string is hex */
export function isHex(str?: string) {
  if (str?.match(/^[0-9a-f]+$/i)) return true;
  return false;
}

/** Tests if a string is a 64 length hex string */
export function isHexKey(key?: string) {
  if (key?.toLowerCase()?.match(/^[0-9a-f]{64}$/)) return true;
  return false;
}

/**
 * Remove invisible characters from a string
 * @see read more https://www.regular-expressions.info/unicode.html#category
 */
export function stripInvisibleChar(str: string): string;
export function stripInvisibleChar(str?: string | undefined): string | undefined;
export function stripInvisibleChar(str?: string) {
  return str && str.replaceAll(/[\p{Cf}\p{Zs}]/gu, "");
} 