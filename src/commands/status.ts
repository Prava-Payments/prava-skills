/**
 * prava status — Check agent link status
 *
 * Reads ~/.prava/agent.json and reports the current state.
 * If linked, verifies with the server via GET /v1/agents/link/me.
 *
 * Exit codes: 0 = active, 2 = not configured or not linked
 */

import { AgentStore } from '../storage/agent-store.js';
import { PravaClient } from '../http/client.js';

export async function statusCommand(): Promise<void> {
  const store = new AgentStore();
  const data = store.load();

  // No agent file
  if (!data) {
    console.log('No agent configured. Run: prava setup --name "<name>"');
    process.exit(2);
  }

  // Pending (not yet approved) — check server in case user approved since last check
  if (!data.linked) {
    const client = new PravaClient();
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
        // Fall through to the linked branch below
      }
    } catch {
      // Network error — report as pending
    }

    if (!data.linked) {
      console.log(`Agent:   ${data.name}`);
      console.log(`Status:  pending`);
      console.log(`Link:    Waiting for approval.`);
      process.exit(2);
    }
  }

  // Linked — verify with server
  const client = new PravaClient();
  try {
    const response = await client.request<{
      agent_id: string;
      label: string;
      status: string;
      created_at: string;
    }>({
      method: 'GET',
      path: '/v1/agents/link/me',
      agentId: data.agentId,
      privateKey: data.privateKey,
    });

    if (response.status === 200) {
      console.log(`Agent:   ${response.data.label} (${response.data.agent_id})`);
      console.log(`Status:  ${response.data.status}`);
      console.log(`Linked:  ${data.linkedAt?.split('T')[0] ?? 'unknown'}`);
    } else {
      // Server returned non-200 — fall back to local data
      console.log(`Agent:   ${data.name} (${data.agentId})`);
      console.log(`Status:  active (offline)`);
      console.log(`Linked:  ${data.linkedAt?.split('T')[0] ?? 'unknown'}`);
    }
  } catch {
    // Server unreachable — fall back to local data
    console.log(`Agent:   ${data.name} (${data.agentId})`);
    console.log(`Status:  active (offline)`);
    console.log(`Linked:  ${data.linkedAt?.split('T')[0] ?? 'unknown'}`);
  }
}
