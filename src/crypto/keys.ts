/**
 * Ed25519 Key Generation and Request Signing
 *
 * Generates keypairs for agent identity and signs API requests.
 * Private key stays local in ~/.prava/agent.json (mode 0600).
 * Public key is sent to the server during linking.
 */

import {
  generateKeyPairSync,
  sign,
  verify,
  createPrivateKey,
  createPublicKey,
} from 'node:crypto';

export interface KeyPair {
  publicKey: string;   // base64 DER (SPKI format)
  privateKey: string;  // base64 DER (PKCS8 format)
}

/**
 * Generate a new Ed25519 keypair.
 * Returns base64-encoded DER keys suitable for storage and transmission.
 */
export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
}

/**
 * Sign a request with the agent's Ed25519 private key.
 * Signs: timestamp (Unix seconds as string) + raw request body.
 * Returns base64-encoded signature.
 */
export function signRequest(
  privateKeyBase64: string,
  timestamp: string,
  body: string,
): string {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });

  const message = Buffer.from(timestamp + body);
  return sign(null, message, privateKey).toString('base64');
}

/**
 * Verify an Ed25519 signature (used for local testing).
 */
export function verifySignature(
  publicKeyBase64: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });

    const message = Buffer.from(timestamp + body);
    return verify(null, message, publicKey, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}
