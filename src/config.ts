/**
 * Prava Configuration
 *
 * Single source of truth for all environment-driven settings.
 * Override any value via the corresponding environment variable.
 */

export const config = {
  /** Base URL for the Prava API server */
  apiServerUrl: process.env['PRAVA_SERVER_URL'] ?? 'https://api.prava.space',

  /** Base URL for the Prava dashboard / wallet UI (used for user-facing links, e.g. agent link) */
  dashboardUrl: process.env['PRAVA_DASHBOARD_URL'] ?? 'https://pay.prava.space',

  /**
   * Base URL for the wallet BACKEND API that serves /v1/wallet/* (shop, addresses).
   * This is the API host, NOT the UI — in prod the UI is pay.prava.space but the API is
   * pay-api.prava.space. Override with PRAVA_WALLET_API_URL (or PRAVA_DASHBOARD_URL for
   * back-compat with local dev, e.g. http://localhost:3004).
   */
  walletApiUrl:
    process.env['PRAVA_WALLET_API_URL'] ??
    process.env['PRAVA_DASHBOARD_URL'] ??
    'https://pay-api.prava.space',

  /** Request timeout in milliseconds */
  requestTimeoutMs: Number(process.env['PRAVA_TIMEOUT_MS'] ?? 30_000),
} as const;
