import { describe, it, expect } from 'vitest';
import { verify, createPublicKey } from 'node:crypto';
import { generateKeyPair } from '../keys';
import {
  signLinkParams,
  canonicalLinkMessage,
  signCreateParams,
  canonicalCreateMessage,
} from '../link-sig';

describe('canonicalLinkMessage (CLI)', () => {
  it('matches the backend canonical-message contract exactly', () => {
    const msg = canonicalLinkMessage({
      lid: 'lk_x',
      pk: 'PK+/=',
      name: 'Claude Code',
      platform: 'claude-code',
      description: '',
      iat: 1716969600,
    });
    expect(msg).toBe(
      'd=&iat=1716969600&lid=lk_x&n=Claude%20Code&p=claude-code&pk=PK%2B%2F%3D',
    );
  });

  it('emits empty p and d slots when fields are missing', () => {
    const msg = canonicalLinkMessage({
      lid: 'lk_x', pk: 'pk', name: 'A', platform: '', description: '', iat: 100,
    });
    expect(msg).toBe('d=&iat=100&lid=lk_x&n=A&p=&pk=pk');
  });
});

describe('signLinkParams', () => {
  it('produces a signature verifiable by Ed25519 over the canonical message', () => {
    const keys = generateKeyPair();
    const params = {
      lid: 'lk_abc1234567', pk: keys.publicKey, name: 'Claude Code',
      platform: 'claude-code', description: '', iat: Math.floor(Date.now() / 1000),
    };
    const sig = signLinkParams(keys.privateKey, params);
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(40);

    const canonical = canonicalLinkMessage(params);
    const pub = createPublicKey({
      key: Buffer.from(keys.publicKey, 'base64'), format: 'der', type: 'spki',
    });
    const ok = verify(null, Buffer.from(canonical, 'utf-8'), pub, Buffer.from(sig, 'base64url'));
    expect(ok).toBe(true);
  });

  it('uses base64url (no padding, no +/)', () => {
    const keys = generateKeyPair();
    const sig = signLinkParams(keys.privateKey, {
      lid: 'lk_x', pk: keys.publicKey, name: 'a', platform: '', description: '', iat: 1,
    });
    expect(sig).not.toMatch(/=/);
    expect(sig).not.toMatch(/\+/);
    expect(sig).not.toMatch(/\//);
  });
});

describe('canonicalCreateMessage (CLI)', () => {
  it('matches the backend create canonical-message contract exactly (no lid slot)', () => {
    const msg = canonicalCreateMessage({
      pk: 'PK+/=',
      name: 'Claude Code',
      platform: 'claude-code',
      description: '',
      iat: 1716969600,
    });
    expect(msg).toBe(
      'd=&iat=1716969600&n=Claude%20Code&p=claude-code&pk=PK%2B%2F%3D',
    );
  });
});

describe('signCreateParams', () => {
  it('produces a signature verifiable by Ed25519 over the create canonical', () => {
    const keys = generateKeyPair();
    const params = {
      pk: keys.publicKey, name: 'Claude Code',
      platform: 'claude-code', description: '', iat: Math.floor(Date.now() / 1000),
    };
    const sig = signCreateParams(keys.privateKey, params);
    expect(sig.length).toBeGreaterThan(40);

    const canonical = canonicalCreateMessage(params);
    const pub = createPublicKey({
      key: Buffer.from(keys.publicKey, 'base64'), format: 'der', type: 'spki',
    });
    const ok = verify(null, Buffer.from(canonical, 'utf-8'), pub, Buffer.from(sig, 'base64url'));
    expect(ok).toBe(true);
  });
});
