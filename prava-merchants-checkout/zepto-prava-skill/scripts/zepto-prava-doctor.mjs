#!/usr/bin/env node

import { execFile } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const skillVersion = "2.2.0";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const runnerPath = join(scriptDir, "zepto-mcp-runner.mjs");

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

function findExecutable(name, envVar) {
  const explicit = process.env[envVar];
  if (explicit) return isExecutable(explicit) ? explicit : null;

  for (const bin of candidateBins()) {
    const candidate = join(bin, name);
    if (isExecutable(candidate)) return candidate;
  }

  return null;
}

async function run(label, file, args = [], options = {}) {
  try {
    const result = await execFileAsync(file, args, {
      timeout: options.timeout ?? 30000,
      env: options.env ?? process.env,
    });
    return {
      label,
      ok: true,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    return {
      label,
      ok: false,
      stdout: (error.stdout ?? "").trim(),
      stderr: (error.stderr ?? error.message ?? "").trim(),
      code: error.code,
      signal: error.signal,
    };
  }
}

function printCheck(name, check) {
  const icon = check.ok ? "OK" : "FAIL";
  console.log(`${icon} ${name}`);
  if (check.detail) console.log(`   ${check.detail}`);
  if (check.hint) console.log(`   Hint: ${check.hint}`);
}

const npx = findExecutable("npx", "ZEPTO_NPX_PATH");
const prava = findExecutable("prava", "PRAVA_CLI_PATH");
const codex = "/Applications/Codex.app/Contents/Resources/codex";

printCheck("npx discovery", {
  ok: Boolean(npx),
  detail: npx || "not found",
  hint: npx ? "" : "Set ZEPTO_NPX_PATH or install/enable Node/npm in PATH.",
});

printCheck("Prava CLI discovery", {
  ok: Boolean(prava),
  detail: prava || "not found",
  hint: prava ? "" : "Set PRAVA_CLI_PATH or add the existing prava binary to PATH before installing a new one.",
});

if (prava) {
  const pravaBin = dirname(prava);
  const status = await run("prava status", prava, ["status"], {
    env: {
      ...process.env,
      PATH: `${pravaBin}:${process.env.PATH || ""}`,
      PRAVA_SKILL_VERSION: skillVersion,
    },
  });
  printCheck("Prava status", {
    ok: status.ok && /Status:\s+active/.test(status.stdout),
    detail: status.stdout || status.stderr,
    hint: status.ok ? "" : "If this is pending or expired, follow prava-pay setup. If it is active (offline), it can still be usable.",
  });
}

if (isExecutable(codex)) {
  const mcp = await run("codex mcp get zepto", codex, ["mcp", "get", "zepto"], {
    timeout: 15000,
  });
  printCheck("Codex Zepto MCP config", {
    ok: mcp.ok && /mcp-remote https:\/\/mcp\.zepto\.co\.in\/mcp/.test(mcp.stdout),
    detail: mcp.stdout || mcp.stderr,
    hint: mcp.ok ? "" : "Configure Zepto as: npx --yes mcp-remote https://mcp.zepto.co.in/mcp",
  });
}

if (npx) {
  const npxBin = dirname(npx);
  const tools = await run("zepto list tools", process.execPath, [runnerPath, "--list-tools"], {
    timeout: 90000,
    env: {
      ...process.env,
      PATH: `${npxBin}:${process.env.PATH || ""}`,
      ZEPTO_NPX_PATH: npx,
    },
  });

  const likelySandboxPortBlock = /listen EPERM|operation not permitted/.test(`${tools.stdout}\n${tools.stderr}`);
  printCheck("Zepto MCP tool reachability", {
    ok: tools.ok && /list_saved_addresses/.test(tools.stdout),
    detail: tools.ok ? "Zepto tools are reachable through the fallback runner." : tools.stderr || tools.stdout,
    hint: likelySandboxPortBlock
      ? "The host blocked mcp-remote's local OAuth callback/listener. Rerun with the agent host's network/local-port approval."
      : tools.ok
        ? ""
        : "If auth is stale, run the Zepto OAuth/mobile OTP flow through mcp-remote.",
  });
}
