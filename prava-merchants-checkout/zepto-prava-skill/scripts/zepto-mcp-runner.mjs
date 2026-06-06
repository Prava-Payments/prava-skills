#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const endpoint = "https://mcp.zepto.co.in/mcp";

function usage() {
  console.error(`Usage:
  zepto-mcp-runner.mjs <tool-name> [json-args]
  zepto-mcp-runner.mjs --list-tools
  zepto-mcp-runner.mjs --batch <json-file>

Batch file shape:
  [
    {"name":"list_saved_addresses","arguments":{}},
    {"name":"select_saved_address","arguments":{"addressId":"..."}}
  ]
`);
}

function isExecutable(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function nvmBins() {
  const root = join(homedir(), ".nvm", "versions", "node");
  if (!existsSync(root)) return [];

  return readdirSync(root)
    .filter((version) => version.startsWith("v"))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .map((version) => join(root, version, "bin"));
}

function candidateBins() {
  return unique([
    ...nvmBins(),
    join(homedir(), ".npm-global", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/Applications/Codex.app/Contents/Resources",
    ...(process.env.PATH || "").split(":"),
  ]);
}

function resolveExecutable(name, envVar) {
  const explicit = process.env[envVar];
  if (explicit) {
    if (isExecutable(explicit)) return explicit;
    throw new Error(`${envVar} is set but is not executable: ${explicit}`);
  }

  for (const bin of candidateBins()) {
    const candidate = join(bin, name);
    if (isExecutable(candidate)) return candidate;
  }

  throw new Error(
    `Could not find ${name}. Checked PATH, NVM, ~/.npm-global/bin, Homebrew, and Codex app resources. ` +
      `Set ${envVar}=/absolute/path/to/${name} if it is installed elsewhere.`
  );
}

function parseToolResult(result) {
  if (result?.structuredContent) return result.structuredContent;

  const text = (result?.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");

  if (!text) return result ?? null;

  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

class McpClient {
  constructor() {
    const npx = resolveExecutable("npx", "ZEPTO_NPX_PATH");
    const npxBin = dirname(npx);
    this.child = spawn(npx, ["--yes", "mcp-remote", endpoint], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${npxBin}:${process.env.PATH || ""}`,
        NPM_CONFIG_PREFIX: process.env.NPM_CONFIG_PREFIX || join(homedir(), ".npm-global"),
      },
    });
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.handleStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      if (!/npm warn|Local.STDIO|Proxy established|Press Ctrl|Remote.Local|Local.Remote|Connected|Discovering|Discovered|Using transport|Connecting|Shutting down/.test(chunk)) {
        process.stderr.write(chunk);
      }
    });
    this.child.on("exit", (code, signal) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(`mcp-remote exited before response (code=${code}, signal=${signal})`));
      }
      this.pending.clear();
    });
  }

  handleStdout(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.startsWith("{")) continue;

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }

      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject, timeout } = this.pending.get(message.id);
        clearTimeout(timeout);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      }
    }
  }

  request(method, params, timeoutMs = 30000) {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    return promise;
  }

  notify(method, params) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async init() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "zepto-prava-skill-runner", version: "0.1.0" },
    });
    this.notify("notifications/initialized", {});
  }

  async callTool(name, args = {}) {
    const result = await this.request("tools/call", { name, arguments: args }, 60000);
    return parseToolResult(result);
  }

  async listTools() {
    const result = await this.request("tools/list", {}, 60000);
    return (result.tools ?? []).map((tool) => ({
      name: tool.name,
      required: tool.inputSchema?.required ?? [],
      properties: Object.keys(tool.inputSchema?.properties ?? {}),
    }));
  }

  close() {
    this.child.kill("SIGINT");
  }
}

async function main() {
  const [, , first, second] = process.argv;
  if (!first) {
    usage();
    process.exit(2);
  }

  let calls;
  const listTools = first === "--list-tools";

  if (first === "--batch") {
    if (!second) {
      usage();
      process.exit(2);
    }
    calls = JSON.parse(await readFile(second, "utf8"));
  } else if (listTools) {
    calls = [];
  } else {
    calls = [{ name: first, arguments: second ? JSON.parse(second) : {} }];
  }

  const client = new McpClient();
  try {
    await client.init();
    if (listTools) {
      console.log(JSON.stringify(await client.listTools(), null, 2));
      return;
    }

    const results = [];
    for (const call of calls) {
      results.push({
        name: call.name,
        result: await client.callTool(call.name, call.arguments ?? {}),
      });
    }
    console.log(JSON.stringify(results.length === 1 ? results[0].result : results, null, 2));
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
