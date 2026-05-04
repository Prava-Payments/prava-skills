import { describe, it, expect } from 'vitest';
import { createHash, randomBytes, createCipheriv } from 'node:crypto';
import { decryptTokenPayload } from '../decrypt';
import { generateKeyPair } from '../keys';

/**
 * Simulate the server-side encryption (same logic as token-encryption.service.ts).
 * This ensures the CLI can decrypt what the server produces.
 */
function serverEncrypt(
  payload: { token: string; cryptogram: string; expiry_month: string; expiry_year: string },
  agentPublicKeyBase64: string,
) {
  const plaintext = JSON.stringify(payload);
  const nonce = randomBytes(32);
  const aesKey = createHash('sha256')
    .update(Buffer.from(agentPublicKeyBase64, 'base64'))
    .update(nonce)
    .digest();

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ephemeral_public_key: nonce.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

describe('decryptTokenPayload', () => {
  it('decrypts a server-encrypted payload correctly', () => {
    const keys = generateKeyPair();

    const original = {
      token: 'tok_4x8Km2abc123',
      cryptogram: 'AABBCCDD1234',
      expiry_month: '12',
      expiry_year: '2028',
    };

    const encrypted = serverEncrypt(original, keys.publicKey);
    const decrypted = decryptTokenPayload(encrypted, keys.publicKey);

    expect(decrypted.token).toBe(original.token);
    expect(decrypted.cryptogram).toBe(original.cryptogram);
    expect(decrypted.expiry_month).toBe(original.expiry_month);
    expect(decrypted.expiry_year).toBe(original.expiry_year);
  });

  it('fails to decrypt with wrong public key', () => {
    const keysA = generateKeyPair();
    const keysB = generateKeyPair();

    const original = {
      token: 'tok_test',
      cryptogram: 'AABB',
      expiry_month: '06',
      expiry_year: '2030',
    };

    const encrypted = serverEncrypt(original, keysA.publicKey);

    // Decrypting with wrong key should throw (auth tag mismatch)
    expect(() => decryptTokenPayload(encrypted, keysB.publicKey)).toThrow();
  });
});
