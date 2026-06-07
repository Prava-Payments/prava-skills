#!/usr/bin/env node

import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir, homedir, platform } from "node:os";
import { basename, dirname, join } from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";

const cfg = {
  menuUrl: env("MENU_URL", "https://www.chaatcornersf.com/popmenu-order/chaat-corner/menus/main-menu"),
  items: parseOrderItems(),
  expectedTotal: process.env.EXPECTED_TOTAL,
  expectedTip: env("EXPECTED_TIP", "0.00"),
  contactName: requiredEnv("CONTACT_NAME"),
  contactEmail: requiredEnv("CONTACT_EMAIL"),
  contactPhone: normalizeUsPhone(requiredEnv("CONTACT_PHONE")),
  cardNumber: requiredEnv("CARD_NUMBER"),
  cardCvv: requiredEnv("CARD_CVV"),
  cardExpiry: normalizeExpiry(env("CARD_EXPIRY", "")),
  cardZip: requiredEnv("CARD_ZIP"),
  dryRun: boolEnv("DRY_RUN"),
  cdpUrl: process.env.CDP_URL,
  cdpPort: Number(env("CDP_PORT", String(43000 + Math.floor(Math.random() * 10000)))),
  chromePath: process.env.CHROME_PATH,
  userDataDir: process.env.CHROME_USER_DATA_DIR,
  keepBrowser: boolEnv("KEEP_BROWSER"),
};

if (!cfg.cardExpiry) fail("CARD_EXPIRY is required, e.g. 06/2031 or 06/31.");
if (!cfg.items.length) fail("Provide ORDER_ITEMS JSON or ORDER_ITEM_NAME plus ORDER_ITEM_PRICE.");

let launchedChrome = null;
let temporaryProfile = null;

function env(name, fallback) {
  return process.env[name] == null || process.env[name] === "" ? fallback : process.env[name];
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) fail(`Missing required environment variable: ${name}`);
  return value;
}

function parseOrderItems() {
  if (process.env.ORDER_ITEMS) {
    let parsed;
    try {
      parsed = JSON.parse(process.env.ORDER_ITEMS);
    } catch (error) {
      fail(`ORDER_ITEMS must be valid JSON: ${error.message}`);
    }
    if (!Array.isArray(parsed)) fail("ORDER_ITEMS must be a JSON array.");
    return parsed.map(normalizeOrderItem);
  }

  if (process.env.ORDER_ITEM_NAME || process.env.ORDER_ITEM_PRICE || process.env.ORDER_QUANTITY) {
    return [
      normalizeOrderItem({
        name: requiredEnv("ORDER_ITEM_NAME"),
        unitPrice: requiredEnv("ORDER_ITEM_PRICE"),
        quantity: Number(env("ORDER_QUANTITY", "1")),
      }),
    ];
  }

  return [];
}

function normalizeOrderItem(item) {
  const name = String(item.name || item.description || "").trim();
  const unitPrice = Number(item.unitPrice ?? item.price);
  const quantity = Number(item.quantity ?? 1);
  if (!name) fail("Every order item must include name.");
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) fail(`Invalid unit price for ${name}.`);
  if (!Number.isInteger(quantity) || quantity < 1) fail(`Invalid quantity for ${name}.`);
  return { name, unitPrice, quantity };
}

function boolEnv(name) {
  return /^(1|true|yes)$/i.test(process.env[name] || "");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function normalizeUsPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function normalizeExpiry(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 4) return "";
  return `${digits.slice(0, 2)}/${digits.slice(-2)}`;
}

function isExecutable(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function pathCandidates() {
  const home = homedir();
  const candidates = [];

  if (cfg.chromePath) candidates.push(cfg.chromePath);

  if (platform() === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    );
  } else if (platform() === "win32") {
    const programFiles = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"]].filter(Boolean);
    for (const root of programFiles) {
      candidates.push(
        join(root, "Google", "Chrome", "Application", "chrome.exe"),
        join(root, "Microsoft", "Edge", "Application", "msedge.exe")
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
      candidates.push(join(bin, name));
    }
  }

  candidates.push(join(home, ".local", "bin", "google-chrome"));
  return [...new Set(candidates)];
}

function findChrome() {
  for (const candidate of pathCandidates()) {
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${body}`));
        else resolve(body);
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error(`Timed out fetching ${url}`)));
  });
}

async function waitForCdp(baseUrl, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      JSON.parse(await httpGet(`${baseUrl}/json/version`));
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`Timed out waiting for Chrome DevTools at ${baseUrl}`);
}

async function startBrowser() {
  if (cfg.cdpUrl) {
    await waitForCdp(cfg.cdpUrl);
    return cfg.cdpUrl;
  }

  const chrome = findChrome();
  if (!chrome) {
    throw new Error("Chrome/Chromium not found. Set CHROME_PATH=/path/to/chrome.");
  }

  temporaryProfile = cfg.userDataDir || mkdtempSync(join(tmpdir(), "chaat-corner-cdp-"));
  const args = [
    `--remote-debugging-address=127.0.0.1`,
    `--remote-debugging-port=${cfg.cdpPort}`,
    `--user-data-dir=${temporaryProfile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ];

  launchedChrome = spawn(chrome, args, { stdio: "ignore", detached: false });
  launchedChrome.on("error", () => {});
  const baseUrl = `http://127.0.0.1:${cfg.cdpPort}`;
  await waitForCdp(baseUrl);
  return baseUrl;
}

async function getPageWebSocket(baseUrl) {
  const tabs = JSON.parse(await httpGet(`${baseUrl}/json/list`));
  const page =
    tabs.find((tab) => tab.type === "page" && tab.url.includes("chaatcornersf.com")) ||
    tabs.find((tab) => tab.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("No Chrome page target found.");
  return page.webSocketDebuggerUrl;
}

function createWsClient(wsUrl) {
  const url = new URL(wsUrl);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const port = Number(url.port || 80);
  const path = url.pathname + url.search;
  let socket;
  let buffer = Buffer.alloc(0);
  let nextId = 1;
  const pending = new Map();
  let handshakeDone = false;
  let openResolve;
  let openReject;

  function encodeFrame(text) {
    const payload = Buffer.from(text);
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    header[0] = 0x81;
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
    return Buffer.concat([header, mask, masked]);
  }

  function parseFrames() {
    while (buffer.length >= 2) {
      const b0 = buffer[0];
      const b1 = buffer[1];
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buffer.length < 4) return;
        len = buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buffer.length < 10) return;
        len = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      const masked = Boolean(b1 & 0x80);
      let mask;
      if (masked) {
        if (buffer.length < offset + 4) return;
        mask = buffer.slice(offset, offset + 4);
        offset += 4;
      }
      if (buffer.length < offset + len) return;
      let payload = buffer.slice(offset, offset + len);
      buffer = buffer.slice(offset + len);
      if (masked) {
        const unmasked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i++) unmasked[i] = payload[i] ^ mask[i % 4];
        payload = unmasked;
      }
      const opcode = b0 & 0x0f;
      if (opcode === 0x8) {
        socket.end();
        return;
      }
      if (opcode !== 0x1) continue;
      const msg = JSON.parse(payload.toString("utf8"));
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject, timer } = pending.get(msg.id);
        clearTimeout(timer);
        pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    }
  }

  const opened = new Promise((resolve, reject) => {
    openResolve = resolve;
    openReject = reject;
  });

  socket = net.connect({ host, port }, () => {
    const key = crypto.randomBytes(16).toString("base64");
    socket.write(
      `GET ${path} HTTP/1.1\r\n` +
        `Host: ${url.host}\r\n` +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Key: ${key}\r\n` +
        "Sec-WebSocket-Version: 13\r\n\r\n"
    );
  });

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!handshakeDone) {
      const idx = buffer.indexOf("\r\n\r\n");
      if (idx === -1) return;
      const head = buffer.slice(0, idx).toString();
      buffer = buffer.slice(idx + 4);
      if (!head.includes("101")) {
        openReject(new Error(head));
        return;
      }
      handshakeDone = true;
      openResolve();
    }
    parseFrames();
  });
  socket.on("error", (error) => {
    if (!handshakeDone) openReject(error);
  });

  return {
    opened,
    send(method, params = {}, timeoutMs = 20000) {
      const id = nextId++;
      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
      });
      socket.write(encodeFrame(JSON.stringify({ id, method, params })));
      return promise;
    },
    close() {
      socket.end();
    },
  };
}

function jsString(value) {
  return JSON.stringify(value);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const baseUrl = await startBrowser();
  const cdp = createWsClient(await getPageWebSocket(baseUrl));
  await cdp.opened;
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Page.bringToFront");

  async function evalValue(expression, timeoutMs = 20000) {
    const result = await cdp.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true, userGesture: true },
      timeoutMs
    );
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  async function waitFor(expression, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const value = await evalValue(expression).catch(() => false);
      if (value) return value;
      await sleep(250);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  }

  async function clickPoint(x, y) {
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
  }

  await cdp.send("Page.navigate", { url: cfg.menuUrl });
  await waitFor(`document.body && document.body.innerText.includes(${jsString(cfg.items[0].name)})`, 40000);

  await evalValue(`(() => {
    try { localStorage.clear(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try {
      document.cookie.split(';').forEach(c => {
        document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/');
      });
    } catch (e) {}
    return true;
  })()`);
  await cdp.send("Page.navigate", { url: cfg.menuUrl });
  await waitFor(`document.body && document.body.innerText.includes(${jsString(cfg.items[0].name)})`, 40000);

  async function addMenuItem(item, index) {
    if (index > 0) {
      await evalValue(`(() => {
        const addItems = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Add items');
        if (addItems) addItems.click();
        const close = [...document.querySelectorAll('button')].find(b => /close/i.test(b.getAttribute('aria-label') || ''));
        if (close) close.click();
        return true;
      })()`);
      await sleep(700);
    }

    await waitFor(`document.body && document.body.innerText.includes(${jsString(item.name)})`, 40000);
    await evalValue(`(() => {
      const itemName = ${jsString(item.name)};
      const itemPrice = ${jsString(`$${item.unitPrice.toFixed(2)}`)};
      const btn = [...document.querySelectorAll('button')]
        .find(b => b.innerText.includes(itemName) && b.innerText.includes(itemPrice));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    await waitFor("document.querySelector('[role=dialog]')?.innerText.includes('Add to order')", 15000);

    if (item.quantity > 1) {
      await evalValue(`(() => {
        const dialog = document.querySelector('[role=dialog]');
        const itemName = ${jsString(item.name)};
        const plus = [...dialog.querySelectorAll('button')]
          .find(b => b.getAttribute('aria-label') === 'Add ' + itemName);
        for (let i = 1; plus && i < ${item.quantity}; i++) plus.click();
        const qty = dialog.querySelector('input[aria-label="' + itemName + ' quantity"], input[type="number"]');
        if (qty) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(qty, String(${item.quantity}));
          qty.dispatchEvent(new Event('input', { bubbles: true }));
          qty.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return true;
      })()`);
      await sleep(500);
    }

    await evalValue(`(() => {
      const dialog = document.querySelector('[role=dialog]');
      const add = [...dialog.querySelectorAll('button')].find(b => b.innerText.includes('Add to order'));
      if (!add) return false;
      add.click();
      return true;
    })()`);
    await waitFor(`document.body.innerText.includes('My Cart') && document.body.innerText.includes(${jsString(item.name)})`, 15000);
  }

  for (let i = 0; i < cfg.items.length; i++) {
    await addMenuItem(cfg.items[i], i);
  }

  const expectedSubtotal = cfg.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2);
  await waitFor(`document.body.innerText.includes('My Cart') && document.body.innerText.includes(${jsString(`$${expectedSubtotal}`)})`, 15000);

  await evalValue(`(() => {
    const checkout = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Checkout');
    if (!checkout) return false;
    checkout.click();
    return true;
  })()`);
  await waitFor("location.href.includes('/checkout') && document.body.innerText.includes('Place Order -')", 30000);

  await evalValue(`(() => {
    function setInput(selector, value) {
      const el = document.querySelector(selector);
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    setInput('#phone-field', ${jsString(cfg.contactPhone)});
    setInput('#name-field', ${jsString(cfg.contactName)});
    setInput('#email-field', ${jsString(cfg.contactEmail)});
    setInput('#spreedly-expiry', ${jsString(cfg.cardExpiry)});
    setInput('#spreedly-zip', ${jsString(cfg.cardZip)});
    for (const box of [...document.querySelectorAll('input[type=checkbox]')]) {
      if (box.checked) box.click();
    }
    return true;
  })()`);

  const numberRect = await evalValue(`(() => {
    const iframe = document.querySelector('iframe[id^="spreedly-number-frame"]');
    if (!iframe) return null;
    iframe.scrollIntoView({ block: 'center' });
    const r = iframe.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  if (!numberRect) throw new Error("Could not find Spreedly number iframe.");
  await sleep(500);
  await clickPoint(numberRect.x + Math.min(90, numberRect.w / 2), numberRect.y + numberRect.h / 2);
  await cdp.send("Input.insertText", { text: cfg.cardNumber });

  const cvvRect = await evalValue(`(() => {
    const iframe = document.querySelector('iframe[id^="spreedly-cvv-frame"]');
    if (!iframe) return null;
    const r = iframe.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  if (!cvvRect) throw new Error("Could not find Spreedly CVV iframe.");
  await clickPoint(cvvRect.x + Math.min(35, cvvRect.w / 2), cvvRect.y + cvvRect.h / 2);
  await cdp.send("Input.insertText", { text: cfg.cardCvv });

  await sleep(1000);
  const preSubmit = await evalValue(`(() => {
    const place = [...document.querySelectorAll('button')]
      .map(b => ({ text: b.innerText.trim(), disabled: b.disabled }))
      .find(b => b.text.includes('Place Order'));
    return {
      url: location.href,
      hasInvalidPayment: document.body.innerText.includes('Invalid payment'),
      total: document.body.innerText.match(/Order Total\\s*\\$[0-9.]+/)?.[0] || null,
      tip: document.body.innerText.match(/Tip\\s*\\$[0-9.]+/)?.[0] || null,
      place
    };
  })()`);

  const expectedTotalText = cfg.expectedTotal ? `$${Number(cfg.expectedTotal).toFixed(2)}` : null;
  const expectedTipText = cfg.expectedTip != null ? `$${Number(cfg.expectedTip).toFixed(2)}` : null;
  if (expectedTotalText && !preSubmit.total?.includes(expectedTotalText)) {
    throw new Error(`Expected total ${expectedTotalText}, saw ${JSON.stringify(preSubmit.total)}.`);
  }
  if (expectedTipText && !preSubmit.tip?.includes(expectedTipText)) {
    throw new Error(`Expected tip ${expectedTipText}, saw ${JSON.stringify(preSubmit.tip)}.`);
  }
  if (preSubmit.hasInvalidPayment || preSubmit.place?.disabled) {
    throw new Error(`Pre-submit verification failed: ${JSON.stringify(preSubmit)}`);
  }

  console.log(
    JSON.stringify(
      {
        stage: "pre-submit-ok",
        total: preSubmit.total,
        tip: preSubmit.tip,
        items: cfg.items,
        phoneSubmitted: cfg.contactPhone,
        dryRun: cfg.dryRun,
      },
      null,
      2
    )
  );

  if (cfg.dryRun) return;

  await evalValue(`(() => {
    const place = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Place Order -'));
    if (!place || place.disabled) return false;
    place.click();
    return true;
  })()`);

  await sleep(8000);
  const result = await evalValue(`(() => ({
    url: location.href,
    title: document.title,
    text: document.body.innerText.slice(0, 5000),
    errors: [...document.querySelectorAll('[role=alert], .Mui-error, [aria-invalid="true"], [class*="error"], [class*="Error"]')]
      .map(el => (el.innerText || el.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 20)
  }))()`);

  console.log(JSON.stringify({ stage: "result", ...result }, null, 2));
  cdp.close();
}

main()
  .catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    if (launchedChrome && !cfg.keepBrowser) launchedChrome.kill();
    if (temporaryProfile && !cfg.userDataDir && !cfg.keepBrowser) {
      try {
        rmSync(temporaryProfile, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup only.
      }
    }
  });
