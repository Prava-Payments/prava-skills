/**
 * prava setup — Link agent to Prava account
 *
 * Generates Ed25519 keypair + link_id locally, constructs a linking URL,
 * prints it, and exits immediately. The user opens the URL in their browser,
 * logs into the Prava dashboard, and clicks Approve.
 *
 * prava setup poll — Polls for approval
 *
 * Reads the pending link_id from ~/.prava/agent.json and polls the server
 * until the user approves or the timeout expires.
 */

import { AgentStore } from '../storage/agent-store.js';
import { generateKeyPair } from '../crypto/keys.js';
import { signCreateParams } from '../crypto/link-sig.js';
import { PravaClient } from '../http/client.js';
import { config } from '../config.js';

const POLL_INITIAL_INTERVAL_MS = 3_000;
const POLL_MAX_WAIT_MS = 15 * 60 * 1000; // 15 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function setupCommand(opts: {
  name: string;
  platform?: string;
  description?: string;
}): Promise<void> {
  const store = new AgentStore();

  // Guard: already linked
  const existing = store.load();
  if (existing?.linked) {
    console.log(`Already linked as "${existing.name}" (${existing.agentId}).`);
    process.exit(0);
  }

  // Generate keypair and sign a lid-less create request. The backend issues
  // the link id; the signature proves we hold the private key for this pk.
  const keys = generateKeyPair();
  const iat = Math.floor(Date.now() / 1000);
  const platform = opts.platform ?? '';
  const description = opts.description ?? '';

  const sig = signCreateParams(keys.privateKey, {
    pk: keys.publicKey,
    name: opts.name,
    platform,
    description,
    iat,
  });

  // Register the pending link with the backend → returns the server-issued lid.
  const client = new PravaClient();
  let lid: string;
  try {
    const res = await client.request<{
      lid?: string;
      expires_at?: string;
      error?: { code?: string; message?: string };
    }>({
      method: 'POST',
      path: '/v1/agents/link/create',
      body: {
        public_key: keys.publicKey,
        name: opts.name,
        platform: opts.platform,
        description: opts.description,
        iat,
        sig,
      },
    });

    if (res.status >= 400 || !res.data.lid) {
      const code = res.data.error?.code;
      if (code === 'LINK_EXPIRED' || code === 'LINK_FUTURE_IAT') {
        console.error(
          'Your system clock appears to be incorrect. Please sync your clock and retry.',
        );
      } else {
        console.error(
          `Failed to create link${res.data.error?.message ? `: ${res.data.error.message}` : ` (HTTP ${res.status})`}.`,
        );
      }
      process.exit(1);
    }
    lid = res.data.lid;
  } catch {
    console.error(
      'Could not reach the Prava server to create a link. Check your connection and retry.',
    );
    process.exit(1);
  }

  // Short linking URL — just the opaque lid.
  const linkUrl = `${config.dashboardUrl}/link-agent?lid=${encodeURIComponent(lid)}`;

  // Persist state BEFORE printing.
  store.save({
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    linkId: lid,
    name: opts.name,
    description: opts.description,
    linked: false,
    linkCreatedAt: new Date(iat * 1000).toISOString(),
    linkUrl,
  });

  console.log(`\nTo link this agent, open this URL and approve:\n`);
  console.log(linkUrl);
  console.log(`\nLink expires in 15 minutes.`);
  console.log(`Run \`prava setup poll\` to wait for approval.`);
}

export async function setupPollCommand(): Promise<void> {
  const store = new AgentStore();
  const client = new PravaClient();

  const data = store.load();

  if (!data) {
    console.error('No agent configured. Run: prava setup --name "<name>"');
    process.exit(2);
  }

  if (data.linked) {
    console.log(`Already linked as "${data.name}" (${data.agentId}).`);
    process.exit(0);
  }

  // Fail fast if the link is locally past TTL — no point spinning the poll loop.
  if (data.linkCreatedAt && Date.now() - Date.parse(data.linkCreatedAt) > POLL_MAX_WAIT_MS) {
    console.error('Link expired. Run `prava setup` again.');
    process.exit(2);
  }

  console.log(`Waiting for approval of "${data.name}"...`);

  // The lid is the only thing the status endpoint needs now.
  const statusPath = `/v1/agents/link/status?lid=${encodeURIComponent(data.linkId)}`;

  const startTime = Date.now();
  let interval = POLL_INITIAL_INTERVAL_MS;

  while (Date.now() - startTime < POLL_MAX_WAIT_MS) {
    await sleep(interval);
    process.stdout.write('.');

    let response;
    try {
      response = await client.request<{
        status: string;
        agent_id?: string;
      }>({
        method: 'GET',
        path: statusPath,
      });
    } catch {
      // Network error — keep polling. The catch is narrowed to the request
      // itself so the approved/expired handlers below can call process.exit
      // without being swallowed.
      interval = Math.min(interval * 1.5, 20_000);
      continue;
    }

    if (response.data.status === 'approved' && response.data.agent_id) {
      data.linked = true;
      data.agentId = response.data.agent_id;
      data.linkedAt = new Date().toISOString();
      store.save(data);

      console.log(`\n\nLinked! Agent ID: ${response.data.agent_id}`);
      console.log('Ready to create sessions.');
      return;
    }

    if (response.data.status === 'denied') {
      console.error('\nSetup denied by user.');
      process.exit(2);
    }

    if (response.data.status === 'expired') {
      console.error('\nLink expired. Run `prava setup` again.');
      process.exit(2);
    }

    // Exponential backoff: 3s → 4.5s → 6.75s → ... cap at 20s
    interval = Math.min(interval * 1.5, 20_000);
  }

  console.error('\nLink expired. Run `prava setup` again.');
  process.exit(2);
}
