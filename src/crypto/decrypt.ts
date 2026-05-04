/**
 * Token Decryption
 *
 * Decrypts encrypted token payloads returned by the server.
 * The server encrypts using AES-256-GCM with a key derived from
 * the agent's public key + a nonce.
 *
 * The CLI can reproduce the same AES key using:
 *   SHA-256(agent_public_key_der + nonce)
 */

import { createDecipheriv, createHash } from 'node:crypto';

export interface DecryptedToken {
  token: string;
  cryptogram: string;
  expiry_month: string;
  expiry_year: string;
}

export interface EncryptedPayload {
  ephemeral_public_key: string; // base64 (nonce in v1)
  iv: string;                   // base64
  auth_tag: string;             // base64
  data: string;                 // base64
}

/**
 * Decrypt an encrypted token payload from the server.
 * Requires the agent's public key (base64 DER) to derive the AES key.
 */
export function decryptTokenPayload(
  encrypted: EncryptedPayload,
  agentPublicKeyBase64: string,
): DecryptedToken {
  // Derive the same AES key the server used: SHA-256(pubkey + nonce)
  const nonce = Buffer.from(encrypted.ephemeral_public_key, 'base64');
  const aesKey = createHash('sha256')
    .update(Buffer.from(agentPublicKeyBase64, 'base64'))
    .update(nonce)
    .digest();

  const iv = Buffer.from(encrypted.iv, 'base64');
  const authTag = Buffer.from(encrypted.auth_tag, 'base64');
  const encryptedData = Buffer.from(encrypted.data, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf-8'));
}
