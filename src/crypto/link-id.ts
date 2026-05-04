/**
 * Link ID Generator
 *
 * Generates timestamp-prefixed IDs for agent link sessions.
 * Format: lk_ + 6-char base62 timestamp + 8-char base62 random = ~17 chars
 *
 * Timestamp prefix ensures sequential B-tree inserts for efficient indexing.
 * Random suffix ensures uniqueness within the same millisecond.
 */

import { randomBytes } from 'node:crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function encodeBase62(num: number, length: number): string {
  let result = '';
  let n = num;
  for (let i = 0; i < length; i++) {
    result = BASE62[n % 62] + result;
    n = Math.floor(n / 62);
  }
  return result;
}

function randomBase62(length: number): string {
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((b) => BASE62[b % 62])
    .join('');
}

/**
 * Generate a link_id for agent setup.
 * Returns: lk_<6-char-timestamp><8-char-random> (~17 chars total)
 */
export function generateLinkId(): string {
  const timestamp = encodeBase62(Date.now(), 6);
  const random = randomBase62(8);
  return `lk_${timestamp}${random}`;
}
