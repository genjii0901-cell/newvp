# Personal billing catalog

New Personal subscriptions use two dedicated Stripe lookup keys:

- `vpp_personal_monthly_1580_v1`: JPY 1,580, recurring monthly.
- `vpp_personal_intro_7days_380_v1`: JPY 380, one-time introductory charge.

First-time checkout collects JPY 380 immediately and starts monthly billing after
7 days. Returning subscribers pay JPY 1,580 without the introductory charge.
Existing subscriptions and legacy `STRIPE_PRICE_PERSONAL` values are not migrated
or deleted. Subscription metadata continues to identify the Personal plan.

The server reuses matching catalog prices, or creates them idempotently at the
first authorized checkout. A mismatched amount, billing interval, active flag,
or live/test mode fails closed. No client-supplied amount or Price ID is accepted.

## Initialize And Verify Before Launch

With the production Stripe secret already supplied through a secure environment,
run the following. Never paste the secret into chat, source files, or command-line
arguments.

```powershell
node --experimental-strip-types scripts/configure-personal-stripe.mjs --apply --verify-checkout
```

This creates/reuses the two catalog prices, checks the production webhook's
required events, and creates then immediately expires two unpaid Checkout
Sessions. Expected amounts due now are JPY 380 for a first-time signup and
JPY 1,580 for a returning subscriber. It never completes payment, creates a
subscription, or changes an existing customer contract.

`GET /api/stripe/config-status` is read-only. It verifies access to the catalog,
checks that the webhook secret is present, and distinguishes existing catalog
prices from prices that will be initialized on the first authorized checkout.
Webhook registration alone does not prove delivery or matching signing secrets;
a real account flow still requires an authenticated acceptance check.

## Checks

```powershell
node --test --experimental-strip-types tests/*.test.mjs
npm run typecheck
$env:NEXT_BUILD_DIR='.next-verify'; npm run build
```

The optional build directory avoids interfering with a running development
server. Web TypeScript excludes the separately configured mobile app and local
backup files.
