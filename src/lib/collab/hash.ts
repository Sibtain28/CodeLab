/**
 * Small, fast, non-cryptographic hash (FNV-1a, 32-bit) used to compare the
 * live text with the last saved text without shipping the saved text around.
 * Not used for anything security-related.
 */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length.toString(36)}-${(h >>> 0).toString(36)}`;
}
