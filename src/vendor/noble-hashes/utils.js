/**
 * Internal utils for noble-hashes.
 */
export function rotr(word, shift) {
  return (word >>> shift) | (word << (32 - shift));
}
