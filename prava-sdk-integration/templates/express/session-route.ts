/**
 * Prava Session Route — Express.js
 *
 * This route creates a Prava session by calling the Prava backend.
 * It uses the MERCHANT_SECRET_KEY which is ONLY available server-side.
 *
 * Usage:
 *   import pravaRouter from './routes/prava-session';
 *   app.use('/api/prava', pravaRouter);
 *
 * Then from your frontend:
 *   const session = await fetch('/api/prava/create-session', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ userId: 'user_123', userEmail: 'user@example.com' }),
 *   }).then(r => r.json());
 *
 * Place this file in: routes/prava-session.ts (or src/routes/prava-session.ts)
 */

import { Router, Request, Response } from 'express';

const router = Router();

// ── Configuration ─────────────────────────────────────────
const BACKEND_URL = process.env.PRAVA_BACKEND_URL || 'https://sandbox.api.prava.space';
const MERCHANT_SECRET_KEY = process.env.MERCHANT_SECRET_KEY;

// ── Types ──────────────────────────────────────────────────

interface CreateSessionBody {
  userId: string;
  userEmail: string;
  amount?: string;
  currency?: string;
  description?: string;
}

// ── Routes ─────────────────────────────────────────────────

/**
 * POST /api/prava/create-session
 *
 * Creates a Prava session for card enrollment / payment.
 * The secret key is used here and NEVER sent to the client.
 */
router.post('/create-session', async (req: Request, res: Response) => {
  try {
    // Validate secret key is configured
    if (!MERCHANT_SECRET_KEY || MERCHANT_SECRET_KEY.includes('YOUR_SECRET_KEY')) {
      return res.status(500).json({
        error: 'MERCHANT_SECRET_KEY not configured. Add it to your .env file.',
      });
    }

    const {
      userId,
      userEmail,
      amount = '99.99',
      currency = 'USD',
      description,
    } = req.body as CreateSessionBody;

    // Validate required fields
    if (!userId || !userEmail) {
      return res.status(400).json({
        error: 'userId and userEmail are required',
      });
    }

    // Call Prava backend to create session
    const response = await fetch(`${BACKEND_URL}/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MERCHANT_SECRET_KEY}`,
      },
      body: JSON.stringify({
        user_id: userId,
        user_email: userEmail,
        amount,
        currency,
        description: description || 'Purchase',
        purchase_context: [
          {
            merchant_details: {
              name: 'My AI App',                  // ← Replace with your app name
              url: 'https://myapp.com',           // ← Replace with your URL
              country_code_iso2: 'US',            // ← Replace with your country
              category_code: '5734',
              category: 'Software Services',
            },
            product_details: [
              {
                description: description || 'Purchase',
                amount: amount,
                quantity: 1,
              },
            ],
            effective_until_minutes: 15,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData.error?.message || `Prava API error (HTTP ${response.status})`,
      });
    }

    const sessionData = await response.json();

    // Return session data to the frontend
    // session_token + iframe_url are what the frontend needs
    return res.json(sessionData);
  } catch (error) {
    console.error('[Prava] Failed to create session:', error);
    return res.status(500).json({
      error: 'Failed to create Prava session',
    });
  }
});

/**
 * GET /api/prava/health
 *
 * Check if the Prava backend is reachable.
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    const data = await response.json();
    return res.json({ healthy: response.ok, ...data });
  } catch {
    return res.json({ healthy: false });
  }
});

export default router;
