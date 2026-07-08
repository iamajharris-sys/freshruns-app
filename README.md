# Fresh Runs

Hyperlocal grocery delivery — Gainey Ranch beta. Anything from Sprouts, delivered by a neighbor.

## What's here

```
public/
  index.html      → customer app (address gate → store map → review → place order)
  shopper.html    → alex's shopper app (live queue → pick → price → request approval)
  approve.html    → customer approval + Stripe pay screen
netlify/functions/
  create-checkout.js   → creates a Stripe Checkout Session for an order's exact total
  confirm-payment.js   → verifies payment, marks order paid in Supabase
netlify.toml      → Netlify config (serves public/, builds functions)
package.json      → declares the `stripe` dependency
```

## One-time setup

### 1. Supabase
Run `freshruns-schema.sql` (from the build) once in your Supabase SQL editor.
Project: `ivxrocsvjlxtlidqnion`.

### 2. Connect this repo to Netlify
Netlify → Add new site → Import from Git → pick this repo.
It auto-detects `netlify.toml`.

### 3. Set environment variables (Netlify → Site settings → Environment variables)

| Name | Value |
|------|-------|
| `STRIPE_SECRET_KEY` | your `sk_test_...` (⚠️ secret — only goes here, never in code) |
| `SUPABASE_URL` | `https://ivxrocsvjlxtlidqnion.supabase.co` |
| `SUPABASE_ANON_KEY` | your anon `eyJ...` key |
| `SITE_URL` | your live Netlify URL, e.g. `https://freshruns.netlify.app` |

After adding vars, trigger a redeploy so the functions pick them up.

## Test the full flow (test mode — no real money)

1. Open the site (index.html) → pass the gate → build an order → place it.
2. Open `/shopper.html` → the order appears live → shop it, enter prices → **request approval**.
3. Open `/approve.html` → shows the exact total → tap **Pay**.
4. Stripe Checkout opens → pay with test card **4242 4242 4242 4242**, any future expiry, any CVC, any ZIP.
5. Redirects back → order marked **paid** → the shopper screen flips to "check out at register."

## Going live (later)

- Swap `STRIPE_SECRET_KEY` to your `sk_live_...` and the publishable key in `approve.html` to `pk_live_...`.
- Consider a Stripe **webhook** instead of the return-URL confirm for bulletproof payment confirmation.
- Tighten Supabase RLS before real customer data flows.

## Notes

- Amount charged is looked up **server-side** from Supabase, so the client can't tamper with the total.
- Apple Pay appears automatically on the Stripe Checkout page for eligible devices.
