#!/usr/bin/env node

/**
 * Prava CLI — Payment collection for AI agents
 *
 * Commands:
 *   prava setup       — Link agent to Prava account
 *   prava status      — Check agent link status
 *   prava sessions create — Create payment session
 */

import { Command } from 'commander';
import { setupCommand, setupPollCommand } from './commands/setup.js';
import { statusCommand } from './commands/status.js';
import { sessionsCreateCommand, sessionsPollCommand } from './commands/sessions.js';

const program = new Command();

program
  .name('prava')
  .description('CLI for AI agents to collect card payments via Prava')
  .version('0.1.0');

const setup = program
  .command('setup')
  .description('Link this agent to a Prava account')
  .requiredOption('--name <name>', 'Agent display name (e.g., "Claude Code")')
  .option('--description <desc>', 'Short description shown on approval screen')
  .action(async (opts) => {
    await setupCommand({ name: opts.name, description: opts.description });
  });

setup
  .command('poll')
  .description('Wait for the user to approve the pending link')
  .action(async () => {
    await setupPollCommand();
  });

program
  .command('status')
  .description('Check agent link status')
  .action(async () => {
    await statusCommand();
  });

const sessions = program
  .command('sessions')
  .description('Payment session management');

sessions
  .command('create')
  .description('Create a payment session')
  .requiredOption('--total-amount <amount>', 'Total amount as string (e.g., "8.50")')
  .requiredOption('--currency <code>', 'ISO 4217 currency code (e.g., USD)')
  .requiredOption('--merchant-name <name>', 'Merchant display name')
  .requiredOption('--merchant-url <url>', 'Merchant website URL')
  .requiredOption('--merchant-country <code>', 'ISO 3166-1 alpha-2 country code (e.g., US)')
  .requiredOption(
    '--product <json>',
    'Product JSON (repeatable): \'{"description":"...","unit_price":"...","quantity":1}\'',
    (value: string, previous: string[]) => previous.concat([value]),
    [] as string[],
  )
  .action(async (opts) => {
    await sessionsCreateCommand({
      totalAmount: opts.totalAmount,
      currency: opts.currency,
      merchantName: opts.merchantName,
      merchantUrl: opts.merchantUrl,
      merchantCountry: opts.merchantCountry,
      product: opts.product,
    });
  });

sessions
  .command('poll')
  .description('Wait for card tokenization on an existing session')
  .requiredOption('--session-id <id>', 'Session ID from sessions create')
  .action(async (opts) => {
    await sessionsPollCommand({ sessionId: opts.sessionId });
  });

program.parse();
