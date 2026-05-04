import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, rmdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentStore } from '../agent-store';

describe('AgentStore', () => {
  let testDir: string;
  let store: AgentStore;

  beforeEach(() => {
    testDir = join(tmpdir(), `prava-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    store = new AgentStore(testDir);
  });

  afterEach(() => {
    const filePath = join(testDir, 'agent.json');
    try { if (existsSync(filePath)) unlinkSync(filePath); } catch {}
    try { if (existsSync(testDir)) rmdirSync(testDir); } catch {}
  });

  it('returns null when no agent file exists', () => {
    expect(store.load()).toBeNull();
  });

  it('reports exists() as false when no file', () => {
    expect(store.exists()).toBe(false);
  });

  it('saves and loads agent data', () => {
    const data = {
      privateKey: 'test-private-key',
      publicKey: 'test-public-key',
      linkId: 'lk_abc123xyz',
      name: 'Claude Code',
      linked: false as const,
    };

    store.save(data);
    const loaded = store.load();
    expect(loaded).toEqual(data);
  });

  it('reports exists() as true after save', () => {
    store.save({
      privateKey: 'k', publicKey: 'p', linkId: 'lk_x', name: 'T', linked: false,
    });
    expect(store.exists()).toBe(true);
  });

  it('saves linked agent with all fields', () => {
    const data = {
      privateKey: 'priv',
      publicKey: 'pub',
      linkId: 'lk_abc',
      name: 'Test Agent',
      description: 'A test agent',
      linked: true as const,
      agentId: 'aa_01TEST1234567890ABCDEFGH',
      linkedAt: '2026-05-02T10:30:00Z',
    };

    store.save(data);
    const loaded = store.load();
    expect(loaded?.linked).toBe(true);
    expect(loaded?.agentId).toBe('aa_01TEST1234567890ABCDEFGH');
    expect(loaded?.linkedAt).toBe('2026-05-02T10:30:00Z');
    expect(loaded?.description).toBe('A test agent');
  });

  it('creates directory if it does not exist', () => {
    const nestedDir = join(testDir, 'nested', 'deep');
    const nestedStore = new AgentStore(nestedDir);

    nestedStore.save({
      privateKey: 'k', publicKey: 'p', linkId: 'lk_x', name: 'T', linked: false,
    });

    expect(existsSync(join(nestedDir, 'agent.json'))).toBe(true);

    // Cleanup nested
    try { unlinkSync(join(nestedDir, 'agent.json')); } catch {}
    try { rmdirSync(nestedDir); } catch {}
    try { rmdirSync(join(testDir, 'nested')); } catch {}
  });

  it('sets file permissions to 0600', () => {
    store.save({
      privateKey: 'k', publicKey: 'p', linkId: 'lk_x', name: 'T', linked: false,
    });

    const filePath = join(testDir, 'agent.json');
    const stats = statSync(filePath);
    // Check that only owner has read/write (mode & 0o777 should be 0o600)
    const perms = stats.mode & 0o777;
    expect(perms).toBe(0o600);
  });

  it('overwrites existing data on save', () => {
    store.save({
      privateKey: 'old', publicKey: 'old', linkId: 'lk_old', name: 'Old', linked: false,
    });

    store.save({
      privateKey: 'new', publicKey: 'new', linkId: 'lk_new', name: 'New', linked: true,
      agentId: 'aa_NEW', linkedAt: '2026-05-02T00:00:00Z',
    });

    const loaded = store.load();
    expect(loaded?.name).toBe('New');
    expect(loaded?.linked).toBe(true);
    expect(loaded?.agentId).toBe('aa_NEW');
  });

  it('returns null for corrupted JSON', () => {
    // Write garbage to the file
    const { writeFileSync, mkdirSync } = require('node:fs');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'agent.json'), 'not valid json{{{');

    expect(store.load()).toBeNull();
  });
});
