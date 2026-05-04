import { describe, it, expect } from 'vitest';
import { generateLinkId } from '../link-id';

describe('generateLinkId', () => {
  it('starts with lk_ prefix', () => {
    const id = generateLinkId();
    expect(id.startsWith('lk_')).toBe(true);
  });

  it('is between 14-20 characters total', () => {
    const id = generateLinkId();
    expect(id.length).toBeGreaterThanOrEqual(14);
    expect(id.length).toBeLessThanOrEqual(20);
  });

  it('contains only alphanumeric chars after prefix', () => {
    const id = generateLinkId();
    const afterPrefix = id.slice(3);
    expect(afterPrefix).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateLinkId()));
    expect(ids.size).toBe(100);
  });

  it('is roughly sortable (later IDs >= earlier IDs)', () => {
    const id1 = generateLinkId();
    const id2 = generateLinkId();
    // Same millisecond IDs may differ in random part, but timestamp prefix should be equal or greater
    expect(id2 >= id1).toBe(true);
  });
});
