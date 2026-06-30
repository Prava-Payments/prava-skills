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
import {
  shopSearchCommand,
  shopProductCommand,
  shopQuoteCommand,
  shopCheckoutCommand,
  shopAddressListCommand,
  shopAddressAddCommand,
  shopAddressDefaultCommand,
} from './commands/shop.js';

const program = new Command();

program
  .name('prava')
  .description('Prava CLI — smart wallet for AI agents')
  .version('3.0.0');

const setup = program
  .command('setup')
  .description('Link this agent to a Prava account')
  .option('--name <name>', 'Agent display name (e.g., "Claude Code")')
  .option('--platform <platform>', 'Agent platform identifier (e.g., claude-code, codex, cursor)')
  .option('--description <desc>', 'Short description shown on approval screen')
  .action(async (opts) => {
    if (!opts.name) {
      console.error('Error: required option --name <name> not specified');
      process.exit(1);
    }
    await setupCommand({ name: opts.name, platform: opts.platform, description: opts.description });
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

const shop = program
  .command('shop')
  .description('Product discovery and checkout');

shop
  .command('search')
  .description('Search for products across merchants')
  .requiredOption('--query <text>', 'Tight keyword query (e.g., "dark roast coffee")')
  .option('--intent <text>', "The user's full natural-language request (gift context, occasion, budget phrasing) — passed to UCP as buyer intent for better ranking")
  .option('--limit <n>', 'Max results (default 10)')
  .option('--cursor <cursor>', 'Next-page cursor from a previous search')
  .option('--merchant <domain>', 'Restrict to one merchant domain')
  .option('--ships-to <country>', 'ISO 3166-1 alpha-2 destination (e.g., US)')
  .option('--json', 'Output raw JSON (for chaining)')
  .action(async (opts) => {
    await shopSearchCommand({
      query: opts.query,
      intent: opts.intent,
      limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
      cursor: opts.cursor,
      merchant: opts.merchant,
      shipsTo: opts.shipsTo,
      json: opts.json,
    });
  });

shop
  .command('product')
  .description("Show a product's details and variants")
  .requiredOption('--product-id <id>', 'product-id from search results')
  .option('--merchant <domain>', 'Merchant domain (from the search result)')
  .option('--json', 'Output raw JSON (for chaining)')
  .action(async (opts) => {
    await shopProductCommand({
      productId: opts.productId,
      merchant: opts.merchant,
      json: opts.json,
    });
  });

shop
  .command('quote')
  .description('Price a variant and open a checkout session')
  .requiredOption('--variant-id <id>', 'variant-id from product details')
  .requiredOption('--merchant <domain>', 'Merchant domain')
  .option('--quantity <n>', 'Quantity (default 1)')
  .option('--email <email>', 'Buyer email (optional)')
  .option('--address-id <id>', "Which saved address to ship to (default: the user's default address)")
  .option('--retries <n>', 'Retry on timeout/server error (default 1; 0 to disable)')
  .option('-y, --yes', 'Confirm — pass ONLY after the user has approved the seller/variant')
  .option('--json', 'Output raw JSON (for chaining)')
  .action(async (opts) => {
    await shopQuoteCommand({
      variantId: opts.variantId,
      merchant: opts.merchant,
      quantity: opts.quantity ? parseInt(opts.quantity, 10) : undefined,
      email: opts.email,
      addressId: opts.addressId,
      retries: opts.retries !== undefined ? parseInt(opts.retries, 10) : undefined,
      yes: opts.yes,
      json: opts.json,
    });
  });

const shopAddress = shop
  .command('address')
  .description('Manage delivery addresses (stored per user; the agent only ever sees masked summaries)');

shopAddress
  .command('list')
  .description('List saved delivery addresses (masked)')
  .option('--json', 'Output raw JSON')
  .action(async (opts) => {
    await shopAddressListCommand({ json: opts.json });
  });

shopAddress
  .command('add')
  .description('Add a delivery address (fallback; primary entry is the Prava dashboard)')
  .requiredOption('--first-name <name>', 'Recipient first name')
  .requiredOption('--last-name <name>', 'Recipient last name')
  .requiredOption('--line1 <street>', 'Street address line 1')
  .option('--line2 <street>', 'Street address line 2')
  .requiredOption('--city <city>', 'City / locality')
  .requiredOption('--region <region>', 'State / province / region')
  .requiredOption('--postal <code>', 'Postal / ZIP code')
  .requiredOption('--country <code>', 'ISO 3166-1 alpha-2 country (e.g., US)')
  .option('--label <label>', 'Label, e.g. "Home"')
  .option('--phone <phone>', 'Contact phone WITH country code, e.g. "+91 98765 43210" or "+1 415 555 0100" (stored on your account, not per-address)')
  .option('--default', 'Make this the default address')
  .option('--json', 'Output raw JSON')
  .action(async (opts) => {
    await shopAddressAddCommand({
      label: opts.label,
      firstName: opts.firstName,
      lastName: opts.lastName,
      line1: opts.line1,
      line2: opts.line2,
      city: opts.city,
      region: opts.region,
      postal: opts.postal,
      country: opts.country,
      phone: opts.phone,
      default: opts.default,
      json: opts.json,
    });
  });

shopAddress
  .command('set-default')
  .description('Set an address as the default')
  .requiredOption('--address-id <id>', 'address-id from `address list`')
  .action(async (opts) => {
    await shopAddressDefaultCommand({ addressId: opts.addressId });
  });

shop
  .command('checkout')
  .description('Pay for a quoted checkout session with a card token')
  .requiredOption('--checkout-session-id <id>', 'checkout-session-id from quote')
  .requiredOption('--token <token>', 'Network token from `prava sessions poll`')
  .requiredOption('--cryptogram <crypt>', 'Dynamic CVV from `prava sessions poll`')
  .option('--expiry-month <mm>', 'Card expiry month (MM)')
  .option('--expiry-year <yyyy>', 'Card expiry year (YYYY)')
  .option('--cardholder-name <name>', 'Cardholder name')
  .option('-y, --yes', 'Confirm the charge — pass ONLY after the user has approved the final total')
  .option('--json', 'Output raw JSON')
  .action(async (opts) => {
    await shopCheckoutCommand({
      checkoutSessionId: opts.checkoutSessionId,
      token: opts.token,
      cryptogram: opts.cryptogram,
      expiryMonth: opts.expiryMonth,
      expiryYear: opts.expiryYear,
      cardholderName: opts.cardholderName,
      yes: opts.yes,
      json: opts.json,
    });
  });

program.parse();
