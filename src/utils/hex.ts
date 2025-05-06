/**
 * Converts a Uint8Array to a hexadecimal string.
 * @param bytes The Uint8Array to convert.
 * @returns The hexadecimal string representation.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
}

/**
 * Converts a hexadecimal string to a Uint8Array.
 * @param hex The hexadecimal string to convert.
 * @returns The Uint8Array representation.
 * @throws Error if the hex string has an odd length.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string: Odd length.");
  }
  // Ensure hex string is valid (optional, parseInt handles basic validation)
  if (!/^[0-9a-fA-F]*$/.test(hex)) {
      throw new Error("Invalid hex string: Contains non-hex characters.");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
} 