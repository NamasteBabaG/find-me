# PayMe adapter (`src/infra/payment/payme.ts`)

Written 2026-11-19 against the public PayMe Payments API docs. Nothing here has run against a real PayMe account yet.

## What it does

| Need | PayMe call | Notes |
|---|---|---|
| Checkout | `POST /api/generate-sale` (JSON) | `sale_price` is in minor units (2900 = 29 ILS). `transaction_id` is our order id. The buyer is sent to `sale_url` exactly as returned. |
| Payment / refund callback | form POST to `/api/webhooks/payment` | **Never trusted on its own.** It is confirmed with `get-sales`, and the event carries the confirmed sale's order id, amount and currency. |
| Refund (admin, $7 ceiling) | `POST /api/refund-sale` | Synchronous. 309 (already fully refunded) counts as success. Documented refusals return `ok:false`. Anything else throws an unknown outcome. |
| Refund status | `POST /api/get-sales` | `refunded` → refunded. `completed` → in-progress. Everything else → unknown. **It never answers `no-transfer`.** |

## Money rules that follow from the docs

- **No idempotency key.** PayMe has none, and `transaction_id` is not deduplicated. A repeated `generate-sale` creates a second sale.
- **Checkout retry contract** (`checkoutRetryLeavesUnreachableSale`, not idempotency). The checkout leases the order and calls `generate-sale`. It stores only the `sale_url` that came back.
  - If the answer is lost, the order is retried after its lease. That can leave one extra `initial` sale whose address nobody was ever given.
  - A hosted sale is paid only by a buyer on its page, and the adapter never sends a saved-card `buyer_key`. So such a sale cannot be paid.
  - Once an address is stored, it is returned again and no new sale is made.
- **A callback is a notification, not proof.** A seller without a partner key cannot verify `payme_signature`. Each callback is confirmed by `get-sales`:
  - the status must match (`completed` for paid, `refunded` for an order refund);
  - `transaction_id` must equal the order;
  - the callback price must equal `sale_price`.
- **Partial refunds are not order refunds.** A sale refunded in parts stays `partial-refund`, and that is ignored.
- **Failed attempts and chargebacks are not order events.** `sale-failure` leaves the sale open for another card. Chargebacks go to a person.
- **De-duplication key.** `notify_type` + `payme_sale_id` + `payme_transaction_id`, which is what PayMe documents; it has no event id.
- **Unknown outcome.** These throw:
  - a timeout or transport error;
  - a non-JSON body;
  - error codes 991, 20002, 999, or 998 ("a matching call may still be running");
  - any code that isn't documented.

  The ceiling refund keeps its attempt window and asks `refundStatus` before anything is sent again.
- **No automatic second refund with PayMe.** No documented sale status proves that a refund did not and cannot happen, so the adapter never answers `no-transfer`. After a lost refund answer, either positive proof (`refunded`) finishes it or a person decides.
- **No buyer details kept.** Card, name, email and phone from the callback are never stored with the payment event.

## Configuration (Guy enters these in Vercel; never in the repo or chat)

- `PAYMENT_PROVIDER=payme`
- `PAYME_SELLER_ID`: the seller MPL. Sandbox and live are separate accounts with separate keys.
- `PAYME_ENVIRONMENT=sandbox` or `live`. There is no default to live.
- `APP_URL` must be a public https host. PayMe refuses `localhost` or dotless callback hosts for the whole call (error 21).

### Sandbox in FindMe QA

Use the `payme-sandbox` environment in the dedicated `find-me-qa` project. The merchant's sandbox MPL belongs in `PAYME_SELLER_ID` as a sensitive variable scoped only to this environment.

The app admits `APP_ENV=qa`, `PAYMENT_PROVIDER=payme`, `PAYME_ENVIRONMENT=sandbox`, `GENERATION_PROVIDER=mock`, `STORAGE_PROVIDER=db`, and `EMAIL_PROVIDER=console`. The checkout uses the QA tester list. Prisma and the storage adapter use the private PostgreSQL schema `qa_payme_sandbox`. On Vercel, the callback URL defaults to the sandbox deployment host. The environment holds no OpenAI or Resend credential for the test.

Only the POST form callback at `/api/webhooks/payment` can pass the application QA entry gate without a session. The adapter checks the sale at PayMe before the webhook can move an order into the generation queue. Vercel deployment protection is a separate layer. Enable callback reachability for the exact sandbox deployment and verify that the rest of the app still requires its QA session.

`npm run payments:preflight -- --target qa --provider payme --payme-environment sandbox` checks the source admission rule. A test card and a verified PayMe notification are required for merchant evidence.

## Before real payments (`PAYME_QUALIFICATION_GAPS` still blocks production)

1. A sandbox account, then one full run on a non-production deployment:
   - pay with a test card;
   - receive the callback and see it confirmed by `get-sales`;
   - the order becomes PAID and the world is queued;
   - an admin refund leads to a `refund` callback and the order becomes REFUNDED;
   - a lost refund answer goes to a person.
2. Verify the sandbox callback reaches the exact deployment from PayMe and is confirmed by `get-sales`.
3. The other gaps stay open until proven: terminal close of an unpaid checkout, duplicate-refund entitlement, the admin refund's durable claim, late-paid and historical reconciliation, PostgreSQL concurrency.

## Sources (read 2026-11-19)

- https://docs.payme.io/payments/hosted-payment-page/post-generate-sale
- https://docs.payme.io/payments/getting-started/callbacks
- https://docs.payme.io/payments/getting-started/authentication
- https://docs.payme.io/payments/getting-started/errors
- https://docs.payme.io/payments/getting-started/idempotency-and-retries
- https://docs.payme.io/payments/post-sale-actions/post-refund-sale
- https://docs.payme.io/payments/query-apis/post-get-sales
- https://docs.payme.io/payments/codes-statuses/sale-statuses
- https://docs.payme.io/payments/codes-statuses/sale-lifecycle
