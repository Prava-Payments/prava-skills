/**
 * prava sessions create — Create payment session and poll for token
 *
 * Posts to /v1/sessions/agent with the flat multi-product schema.
 * Polls /v1/sessions/agent/:sessionId/payment-result for tokenization.
 * Decrypts the encrypted response and prints token/cryptogram/expiry.
 *
 * Exit codes: 0 = success, 1 = error/timeout, 2 = not linked
 */

import { AgentStore } from '../storage/agent-store.js';
import { PravaClient } from '../http/client.js';
import { decryptTokenPayload, type EncryptedPayload } from '../crypto/decrypt.js';

const POLL_INITIAL_INTERVAL_MS = 3_000;
const POLL_MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SessionCreateResponse {
  session_id: string;
  payment_url: string;
  expires_at: string;
}

interface SessionResultResponse {
  session_id: string;
  status: string;
  encrypted_payload?: EncryptedPayload;
}

export async function sessionsCreateCommand(opts: {
  totalAmount: string;
  currency: string;
  merchantName: string;
  merchantUrl: string;
  merchantCountry: string;
  product: string[];
}): Promise<void> {
  const store = new AgentStore();
  const data = store.load();

  if (!data) {
    console.error('No agent configured. Run: prava setup --name "<name>"');
    process.exit(2);
  }

  // Auto-check link status if not linked locally
  if (!data.linked) {
    const client = new PravaClient();
    try {
      const response = await client.request<{ status: string; agent_id?: string }>({
        method: 'GET',
        path: `/v1/agents/link/status?lid=${data.linkId}`,
      });

      if (response.data.status === 'approved' && response.data.agent_id) {
        data.linked = true;
        data.agentId = response.data.agent_id;
        data.linkedAt = new Date().toISOString();
        store.save(data);
      } else {
        console.error('Agent not linked. Run: prava setup --name "<name>"');
        process.exit(2);
      }
    } catch {
      console.error('Agent not linked. Run: prava setup --name "<name>"');
      process.exit(2);
    }
  }

  // Parse product JSON strings
  const products = opts.product.map((p) => {
    try {
      const parsed = JSON.parse(p);
      return {
        description: parsed.description as string,
        unit_price: parsed.unit_price as string,
        quantity: (parsed.quantity as number) || 1,
      };
    } catch {
      console.error(`Invalid product JSON: ${p}`);
      console.error('Expected format: \'{"description":"...","unit_price":"...","quantity":1}\'');
      process.exit(1);
    }
  });

  if (products.length === 0) {
    console.error('At least one --product is required.');
    process.exit(1);
  }

  const client = new PravaClient();

  // Create session
  const sessionResponse = await client.request<SessionCreateResponse>({
    method: 'POST',
    path: '/v1/sessions/agent',
    body: {
      total_amount: opts.totalAmount,
      currency: opts.currency.toUpperCase(),
      merchant_name: opts.merchantName,
      merchant_url: opts.merchantUrl,
      merchant_country: opts.merchantCountry.toUpperCase(),
      products,
    },
    agentId: data.agentId,
    privateKey: data.privateKey,
  });

  if (sessionResponse.status !== 201 && sessionResponse.status !== 200) {
    const errData = sessionResponse.data as any;
    console.error(`Failed to create session: ${errData?.error?.message || JSON.stringify(errData)}`);
    process.exit(1);
  }

  const session = sessionResponse.data;

  console.log(`\nSession created.`);
  console.log(`Session ID: ${session.session_id}`);
  console.log(`Payment URL: ${session.payment_url}`);
  console.log(`\nShare this URL to complete card entry.`);
  console.log(`Run \`prava sessions poll --session-id ${session.session_id}\` to wait for card entry.`);
}

export async function sessionsPollCommand(opts: {
  sessionId: string;
}): Promise<void> {
  const store = new AgentStore();
  const data = store.load();

  if (!data) {
    console.error('No agent configured. Run: prava setup --name "<name>"');
    process.exit(2);
  }

  if (!data.linked || !data.agentId) {
    console.error('Agent not linked. Run: prava setup --name "<name>"');
    process.exit(2);
  }

  const client = new PravaClient();

  console.log(`Waiting for card entry on session ${opts.sessionId}...`);

  const startTime = Date.now();
  let interval = POLL_INITIAL_INTERVAL_MS;

  while (Date.now() - startTime < POLL_MAX_WAIT_MS) {
    await sleep(interval);
    process.stdout.write('.');

    try {
      const resultResponse = await client.request<SessionResultResponse>({
        method: 'GET',
        path: `/v1/sessions/agent/${opts.sessionId}/payment-result`,
        agentId: data.agentId,
        privateKey: data.privateKey,
      });

      if (resultResponse.data.status === 'completed' && resultResponse.data.encrypted_payload) {
        const token = decryptTokenPayload(
          resultResponse.data.encrypted_payload,
          data.publicKey,
        );

        console.log(`\n\nCard tokenized.\n`);
        console.log(`Token:        ${token.token}`);
        console.log(`Cryptogram:   ${token.cryptogram}`);
        console.log(`Expiry:       ${token.expiry_month}/${token.expiry_year}`);
        return;
      }

      if (resultResponse.data.status === 'failed') {
        console.error(`\n\nTokenization failed.`);
        process.exit(1);
      }
    } catch {
      // Network error — continue polling
    }

    // Exponential backoff: 3s → 4.5s → 6.75s → ... cap at 20s
    interval = Math.min(interval * 1.5, 20_000);
  }

  console.log(`\n\nSession expired. Run \`prava sessions create\` again.`);
  process.exit(1);
}
