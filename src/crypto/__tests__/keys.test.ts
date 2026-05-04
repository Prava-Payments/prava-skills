import { describe, it, expect } from 'vitest';
import { generateKeyPair, signRequest, verifySignature } from '../keys';

describe('generateKeyPair', () => {
  it('returns base64 encoded public and private keys', () => {
    const keys = generateKeyPair();
    expect(keys.publicKey).toBeTruthy();
    expect(keys.privateKey).toBeTruthy();
    expect(keys.publicKey.length).toBeGreaterThan(20);
    expect(keys.privateKey.length).toBeGreaterThan(20);
  });

  it('generates different keypairs each time', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.privateKey).not.toBe(b.privateKey);
  });
});

describe('signRequest', () => {
  it('produces a valid signature that can be verified', () => {
    const keys = generateKeyPair();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = '{"amount":"5.00"}';

    const signature = signRequest(keys.privateKey, timestamp, body);
    expect(signature).toBeTruthy();
    expect(typeof signature).toBe('string');

    const valid = verifySignature(keys.publicKey, timestamp, body, signature);
    expect(valid).toBe(true);
  });

  it('fails verification with wrong body', () => {
    const keys = generateKeyPair();
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const signature = signRequest(keys.privateKey, timestamp, '{"amount":"5.00"}');
    const valid = verifySignature(keys.publicKey, timestamp, '{"amount":"999"}', signature);
    expect(valid).toBe(false);
  });

  it('fails verification with wrong timestamp', () => {
    const keys = generateKeyPair();
    const body = '{"test":true}';

    const signature = signRequest(keys.privateKey, '1000000', body);
    const valid = verifySignature(keys.publicKey, '9999999', body, signature);
    expect(valid).toBe(false);
  });

  it('fails verification with wrong key', () => {
    const keysA = generateKeyPair();
    const keysB = generateKeyPair();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = '{"test":true}';

    const signature = signRequest(keysA.privateKey, timestamp, body);
    const valid = verifySignature(keysB.publicKey, timestamp, body, signature);
    expect(valid).toBe(false);
  });

  it('works with empty body', () => {
    const keys = generateKeyPair();
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const signature = signRequest(keys.privateKey, timestamp, '');
    const valid = verifySignature(keys.publicKey, timestamp, '', signature);
    expect(valid).toBe(true);
  });
});
