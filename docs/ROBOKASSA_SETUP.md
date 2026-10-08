# Robokassa preparation — first release

Owner request: 2026-10-08. Start with payment for a concrete club evening; provider is Robokassa, merchant is an individual on NPD. Registration/withdrawal details are postponed until tomorrow.

## Implemented preparation

Server-only pure test adapter: `src/server/services/robokassaTestAdapter.ts`.
Creates signed POST checkout fields with integer kopecks, numeric invoice id and compulsory IsTest=1 / signed Shp_mode=test. Result verification uses Password2, exact provider decimal spelling, constant-time signature comparison and expected invoice/amount. Extra custom fields and array parameters fail closed. Test secrets have no live-secret fallback.

Not wired into routes or Player Wallet yet. It cannot collect real money or mutate payment records. Existing online_payment_available remains false. Verification of a callback is not settlement and not a receipt.

## Tomorrow: account setup

1. Confirm completed NPD registration and download the registration certificate.
2. Complete the merchant questionnaire and withdrawal account in Robokassa.
3. Create/activate the 2LA Noire store with the application's public HTTPS origin.
4. Enable Robocheki SMZ and approve the partner request in My Tax; confirm automatic receipt delivery and supported receipt nomenclature with the provider. Do not substitute a generic 54-FZ receipt for an NPD receipt.
5. Technical settings: use SHA256 (or explicitly match MD5 if selected); obtain separate TEST Password1/Password2. Set server environment only; never send/store secrets in chats, code or browser bundles.
6. ResultURL will use POST with application/x-www-form-urlencoded. SuccessURL/FailURL will return the player to the wallet without marking anything paid. Configure URLs only after those endpoints exist and are deployed.
7. Check SBP availability in this exact store; do not invent a payment-method code or promise that SBP is already enabled.

## Required application wiring before readiness

- Authenticated invoice creation obtains participant and amount from the existing canonical pricing/payment services, not the buyer's amount.
- Persist unique numeric provider invoice ids and a stable player/obligation idempotency key before exposing checkout fields. Reuse one pending attempt; validate amounts again when obligations change.
- Separate sandbox/test intents from real accounting. Test callback never closes a production debt, credits tokens or issues a real receipt.
- ResultURL: reject duplicate/form-array inputs, verify signature, invoice, provider, expected amount and signed mode; settle through the canonical evening-payment service exactly once in a DB transaction. Reply OK{id} only after durable recording; repeated callback must acknowledge without a second credit.
- Cancelled evenings or changed obligations require explicit reconciliation, not silent reassignment or loss of received money.
- Player wallet: pay a concrete evening, open provider checkout, reload authoritative status after return. A successful browser redirect is not proof of payment.
- Store receipt status/source from real provider evidence and expose the receipt when available. Never infer receipt issuance from payment success.
- Verify failed signature, wrong amount/id, repeated callback, concurrent creation, no-session access, sandbox isolation, cancelled evening and provider/test redirects. Inspect mobile payment UX.
- Only after a successful configured test flow and confirmed SMZ activation prepare live credentials/explicit live activation and a real small payment.

## Configuration placeholders

ROBOKASSA_TEST_ENABLED=false (default)
ROBOKASSA_MERCHANT_LOGIN=
ROBOKASSA_TEST_PASSWORD1=
ROBOKASSA_TEST_PASSWORD2=
ROBOKASSA_HASH_ALGORITHM=sha256

These configure the adapter only, not a working checkout screen. No current callback URL is advertised as ready.

## Sources

- https://docs.robokassa.ru/ru/pay-interface
- https://docs.robokassa.ru/ru/notifications-and-redirects
- https://robokassa.com/online-check/robocheck-smz/

Initial local adapter smoke: eight assertions pass. Full repository typecheck/lint/unit gates are tracked on the preparation PR; merchant credentials, provider call, deployment and receipts are not verified.
