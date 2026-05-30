/**
 * Sign agent-link URL params with the CLI's Ed25519 private key.
 *
 * Canonical message MUST exactly match the backend verifier in
 * prava-core-monorepo/services/backend/src/utils/agent-link-sig.ts.
 * See docs/superpowers/plans/2026-05-30-signed-link-urls.md for the contract.
 */

import { sign, createPrivateKey } from 'node:crypto';

export interface LinkParams {
  lid: string;
  pk: string;
  name: string;
  platform: string;
  description: string;
  iat: number;
}

export function canonicalLinkMessage(p: LinkParams): string {
  const enc = encodeURIComponent;
  return (
    `d=${enc(p.description)}` +
    `&iat=${p.iat}` +
    `&lid=${enc(p.lid)}` +
    `&n=${enc(p.name)}` +
    `&p=${enc(p.platform)}` +
    `&pk=${enc(p.pk)}`
  );
}

export function signLinkParams(privateKeyBase64: string, params: LinkParams): string {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const message = Buffer.from(canonicalLinkMessage(params), 'utf-8');
  return sign(null, message, privateKey).toString('base64url').replace(/=+$/, '');
}

/**
 * Lid-less canonical for the `link create` request. The backend issues the
 * link id, so the CLI cannot include it in the signed payload. MUST match
 * `canonicalCreateMessage` in the backend's agent-link-sig.ts byte-for-byte.
 */
export interface CreateParams {
  pk: string;
  name: string;
  platform: string;
  description: string;
  iat: number;
}

export function canonicalCreateMessage(p: CreateParams): string {
  const enc = encodeURIComponent;
  return (
    `d=${enc(p.description)}` +
    `&iat=${p.iat}` +
    `&n=${enc(p.name)}` +
    `&p=${enc(p.platform)}` +
    `&pk=${enc(p.pk)}`
  );
}

export function signCreateParams(privateKeyBase64: string, params: CreateParams): string {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const message = Buffer.from(canonicalCreateMessage(params), 'utf-8');
  return sign(null, message, privateKey).toString('base64url').replace(/=+$/, '');
}
