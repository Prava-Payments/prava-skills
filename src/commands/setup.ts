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
import { generateLinkId } from '../crypto/link-id.js';
import { PravaClient } from '../http/client.js';
import { config } from '../config.js';

const POLL_INITIAL_INTERVAL_MS = 3_000;
const POLL_MAX_WAIT_MS = 15 * 60 * 1000; // 15 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function setupCommand(opts: {
  name: string;
  description?: string;
}): Promise<void> {
  const store = new AgentStore();

  // Guard: already linked
  const existing = store.load();
  if (existing?.linked) {
    console.log(`Already linked as "${existing.name}" (${existing.agentId}).`);
    process.exit(0);
  }

  // Generate keypair and link ID
  const keys = generateKeyPair();
  const linkId = generateLinkId();

  // Store locally
  store.save({
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    linkId,
    name: opts.name,
    description: opts.description,
    linked: false,
  });

  // Construct linking URL
  const params = new URLSearchParams({
    lid: linkId,
    pk: keys.publicKey,
    n: opts.name,
  });
  if (opts.description) params.set('d', opts.description);

  const linkUrl = `${config.dashboardUrl}/link-agent?${params.toString()}`;

  console.log(`\nTo link this agent, open this URL and approve:\n`);
  console.log(linkUrl);
  console.log(`\nRun \`prava setup poll\` to wait for approval.`);
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

  console.log(`Waiting for approval of "${data.name}"...`);

  const startTime = Date.now();
  let interval = POLL_INITIAL_INTERVAL_MS;

  while (Date.now() - startTime < POLL_MAX_WAIT_MS) {
    await sleep(interval);
    process.stdout.write('.');

    try {
      const response = await client.request<{
        status: string;
        agent_id?: string;
      }>({
        method: 'GET',
        path: `/v1/agents/link/status?lid=${data.linkId}`,
      });

      if (response.data.status === 'approved' && response.data.agent_id) {
        data.linked = true;
        data.agentId = response.data.agent_id;
        data.linkedAt = new Date().toISOString();
        store.save(data);

        console.log(`\n\nLinked! Agent ID: ${response.data.agent_id}`);
        console.log('Ready to create sessions.');
        return;
      }
    } catch {
      // Network error — continue polling
    }

    // Exponential backoff: 3s → 4.5s → 6.75s → ... cap at 20s
    interval = Math.min(interval * 1.5, 20_000);
  }

  console.log(`\n\nLink expired. Run \`prava setup\` again.`);
  process.exit(1);
}
