/**
 * Agent Local Storage
 *
 * Manages ~/.prava/agent.json — stores keypair, link status, and agent identity.
 * File permissions are set to 0600 (owner read/write only) for security.
 * Single agent per machine — to switch, delete the file and re-run setup.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface AgentData {
  privateKey: string;
  publicKey: string;
  linkId: string;
  name: string;
  description?: string;
  linked: boolean;
  agentId?: string;
  linkedAt?: string;
}

const DEFAULT_DIR = join(homedir(), '.prava');
const FILE_NAME = 'agent.json';

export class AgentStore {
  private filePath: string;
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? DEFAULT_DIR;
    this.filePath = join(this.dir, FILE_NAME);
  }

  /**
   * Load agent data from disk. Returns null if file doesn't exist.
   */
  load(): AgentData | null {
    if (!existsSync(this.filePath)) return null;

    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as AgentData;
    } catch {
      return null;
    }
  }

  /**
   * Save agent data to disk. Creates directory if missing.
   * Sets file permissions to 0600 (owner read/write only).
   */
  save(data: AgentData): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }

    writeFileSync(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
  }

  /**
   * Check if the agent file exists.
   */
  exists(): boolean {
    return existsSync(this.filePath);
  }

  /**
   * Get the file path (for debug output).
   */
  getPath(): string {
    return this.filePath;
  }
}
