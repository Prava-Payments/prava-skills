#!/usr/bin/env node

import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir, homedir, platform, release } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";

const args = new Set(process.argv.slice(2));
const noLaunch = args.has("--no-launch");
const keepBrowser = args.has("--keep-browser");
const cdpPort = Number(process.env.CDP_PORT || String(44000 + Math.floor(Math.random() * 10000)));
const explicitChromePath = process.env.CHROME_PATH;
let launchedChrome = null;
let temporaryProfile = null;

function isExecutable(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function candidateBrowsers() {
  const candidates = [];
  if (explicitChromePath) candidates.push(explicitChromePath);

  if (platform() === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    );
  } else if (platform() === "win32") {
    for (const root of [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"]].filter(Boolean)) {
      candidates.push(
        join(root, "Google", "Chrome", "Application", "chrome.exe"),
        join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
        join(root, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
      );
    }
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
      "/usr/bin/brave-browser",
      "/snap/bin/chromium"
    );
  }

  for (const bin of (process.env.PATH || "").split(":")) {
    for (const name of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"]) {
      if (bin) candidates.push(join(bin, name));
    }
  }

  candidates.push(join(homedir(), ".local", "bin", "google-chrome"));
  return [...new Set(candidates)];
}

function findBrowser() {
  return candidateBrowsers().find(isExecutable) || null;
}

function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out fetching ${url}`)));
  });
}

async function waitForCdp(baseUrl, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await httpGet(`${baseUrl}/json/version`);
      if (response.statusCode && response.statusCode < 400) return JSON.parse(response.body);
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Could not connect to Chrome DevTools at ${baseUrl}`);
}

function detectHostHints() {
  const envKeys = Object.keys(process.env);
  const hints = [];
  const text = envKeys.join(" ").toLowerCase();

  if (text.includes("codex")) hints.push("codex-like");
  if (text.includes("claude")) hints.push("claude-like");
  if (text.includes("gemini")) hints.push("gemini-like");
  if (process.env.TERM_PROGRAM) hints.push(`term:${process.env.TERM_PROGRAM}`);
  if (process.env.CI) hints.push("ci");
  if (process.env.CODESPACES) hints.push("codespaces");
  if (process.env.REPL_ID || process.env.REPLIT_ENVIRONMENT) hints.push("replit");

  return hints;
}

function guiStatus() {
  if (platform() === "darwin" || platform() === "win32") return "likely-available";
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) return "available";
  return "not-detected";
}

async function launchProbe(browserPath) {
  temporaryProfile = mkdtempSync(join(tmpdir(), "chaat-browser-precheck-"));
  const args = [
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${temporaryProfile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "about:blank",
  ];

  launchedChrome = spawn(browserPath, args, { stdio: "ignore", detached: false });
  const baseUrl = `http://127.0.0.1:${cdpPort}`;
  const version = await waitForCdp(baseUrl);
  const pages = JSON.parse((await httpGet(`${baseUrl}/json/list`)).body);
  return {
    ok: true,
    baseUrl,
    browser: version.Browser,
    protocolVersion: version["Protocol-Version"],
    pageTargets: pages.filter((page) => page.type === "page").length,
  };
}

function check(name, ok, detail = "", hint = "") {
  return { name, ok, detail, hint };
}

async function main() {
  const browserPath = findBrowser();
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const checks = [
    check("node>=18", nodeMajor >= 18, process.version, nodeMajor >= 18 ? "" : "Install/use Node.js 18+ for the CDP scripts."),
    check("platform", true, `${platform()} ${release()}`),
    check("host-hints", true, detectHostHints().join(", ") || "none detected"),
    check(
      "gui-display",
      guiStatus() !== "not-detected",
      guiStatus(),
      guiStatus() === "not-detected"
        ? "No DISPLAY/WAYLAND_DISPLAY detected. Use a host browser tool, headed browser forwarding, xvfb, or manual-entry fallback."
        : ""
    ),
    check(
      "chrome-family-browser",
      Boolean(browserPath),
      browserPath || "not found",
      browserPath ? "" : "Set CHROME_PATH to a Chrome/Chromium/Brave/Edge executable."
    ),
  ];

  let launch = null;
  if (!noLaunch && browserPath) {
    try {
      launch = await launchProbe(browserPath);
      checks.push(check("chrome-cdp-launch", true, `${launch.browser} at ${launch.baseUrl}`));
      checks.push(check("chrome-page-target", launch.pageTargets > 0, `${launch.pageTargets} page target(s)`));
    } catch (error) {
      checks.push(
        check(
          "chrome-cdp-launch",
          false,
          error.message,
          "If the host blocks GUI/local ports, use native browser tools if available or ask for a controllable browser/manual entry."
        )
      );
    }
  }

  const summary = {
    ok: checks.every((item) => item.ok),
    recommendation:
      checks.every((item) => item.ok)
        ? "CDP browser automation is available. Run the checkout script, then optionally run DRY_RUN=1 against Chaat Corner before Prava."
        : "Use native browser automation if the host provides it; otherwise fix the failed checks or fall back to manual card-field entry.",
    checks,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  })
  .finally(() => {
    if (launchedChrome && !keepBrowser) launchedChrome.kill();
    if (temporaryProfile && !keepBrowser) {
      try {
        rmSync(temporaryProfile, { recursive: true, force: true });
      } catch {
        // Best effort cleanup.
      }
    }
  });
