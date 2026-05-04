/**
 * Prava Configuration
 *
 * Single source of truth for all environment-driven settings.
 * Override any value via the corresponding environment variable.
 */

export const config = {
  /** Base URL for the Prava API server */
  apiServerUrl: process.env['PRAVA_SERVER_URL'] ?? 'https://sandbox.api.prava.space',

  /** Base URL for the Prava dashboard / wallet UI */
  dashboardUrl: process.env['PRAVA_DASHBOARD_URL'] ?? 'https://wallet.prava.space',

  /** Request timeout in milliseconds */
  requestTimeoutMs: Number(process.env['PRAVA_TIMEOUT_MS'] ?? 30_000),
} as const;
