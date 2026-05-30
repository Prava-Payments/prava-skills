import { describe, it, expect } from 'vitest';
import { cliVersionVerdict, skillVersionVerdict } from '../client';

describe('cliVersionVerdict', () => {
  it("returns 'ok' when current equals the minimum", () => {
    expect(cliVersionVerdict('2.0.0', '2.0.0')).toBe('ok');
  });

  it("returns 'ok' when current is ahead of the minimum", () => {
    expect(cliVersionVerdict('2.1.0', '2.0.0')).toBe('ok');
    expect(cliVersionVerdict('2.0.1', '2.0.0')).toBe('ok');
    expect(cliVersionVerdict('3.0.0', '2.9.9')).toBe('ok');
  });

  it("returns 'warn' when only the PATCH digit is behind", () => {
    expect(cliVersionVerdict('2.0.0', '2.0.1')).toBe('warn');
    expect(cliVersionVerdict('2.3.4', '2.3.9')).toBe('warn');
  });

  it("returns 'block' when MINOR is behind", () => {
    expect(cliVersionVerdict('2.0.0', '2.1.0')).toBe('block');
    expect(cliVersionVerdict('2.0.5', '2.1.0')).toBe('block');
    // Patch ahead but minor behind → still block.
    expect(cliVersionVerdict('2.0.9', '2.1.0')).toBe('block');
  });

  it("returns 'block' when MAJOR is behind", () => {
    expect(cliVersionVerdict('1.9.9', '2.0.0')).toBe('block');
    expect(cliVersionVerdict('1.0.0', '2.0.0')).toBe('block');
  });

  it('handles short/partial version strings safely', () => {
    expect(cliVersionVerdict('2.0', '2.0.0')).toBe('ok'); // 2.0 == 2.0.0
    expect(cliVersionVerdict('2', '2.1.0')).toBe('block'); // 2.0.0 < 2.1.0, minor behind
  });
});

describe('skillVersionVerdict', () => {
  it("returns 'ok' when the agent's skill version is at/above the minimum", () => {
    expect(skillVersionVerdict('2.2.0', '2.2.0')).toBe('ok');
    expect(skillVersionVerdict('2.3.0', '2.2.0')).toBe('ok');
    expect(skillVersionVerdict('3.0.0', '2.9.9')).toBe('ok');
  });

  it("returns 'warn' when the agent's skill version is below the minimum", () => {
    expect(skillVersionVerdict('2.1.0', '2.2.0')).toBe('warn');
    expect(skillVersionVerdict('1.0.0', '2.0.0')).toBe('warn');
  });

  it("returns 'warn' when no skill version was supplied (env var unset)", () => {
    // Falls back to warning so genuinely-outdated agents that don't pass the
    // version still get a signal; the SKILL.md compare is the backstop.
    expect(skillVersionVerdict(undefined, '2.2.0')).toBe('warn');
    expect(skillVersionVerdict('', '2.2.0')).toBe('warn');
  });
});
