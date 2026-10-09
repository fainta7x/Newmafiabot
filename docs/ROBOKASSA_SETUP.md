# Robokassa preparation — first release

Owner request: 2026-10-08, resumed 2026-10-09. Start with payment for a concrete club evening; provider is Robokassa, merchant is an individual on NPD. Current merchant/deployment verification state belongs to `PROJECT_STATE.md`.

## Implemented preparation

Server-only pure test adapter: `src/server/services/robokassaTestAdapter.ts`.
Creates signed POST checkout fields with integer kopecks, numeric invoice id and compulsory IsTest=1 / signed Shp_mode=test. Result verification uses Password2, exact provider decimal spelling, constant-time signature comparison and expected invoice/amount. Extra custom fields and array parameters fail closed. Test secrets have no live-secret fallback.

The isolated test flow is mounted at `/api/payments/robokassa` and appears in the test player's wallet when configured. Creation requires a signed sandbox player session; the amount is the selected evening's current server-owned outstanding sum. One pending invoice is reused in concurrent checkout requests. Random numeric IDs prevent reuse after a sandbox reseed.

Provider POST callbacks use only the isolated sandbox database, independently of browser cookies. `robokassa_test_invoices` records verified confirmations transactionally; duplicate notifications return the same `OK{id}` after durable recording. Changed, waived, paid or cancelled obligations become `needs_review`. Success/Fail redirects reopen `/player/wallet`; the wallet reads invoice status instead of treating a redirect as payment proof.

Test confirmation does not mark even the sandbox evening paid, mutate production debts/tokens or claim a receipt. Existing real online_payment_available remains false. Real settlement and receipts remain a separate next step.

## Account setup and first configured test

1. Confirm completed NPD registration and download the registration certificate.
2. Complete the merchant questionnaire and withdrawal account in Robokassa.
3. Create/activate the 2LA Noire store with the application's public HTTPS origin.
4. Enable Robocheki SMZ and approve the partner request in My Tax; confirm automatic receipt delivery and supported receipt nomenclature with the provider. Do not substitute a generic 54-FZ receipt for an NPD receipt.
5. Technical settings: use SHA256 (or explicitly match MD5 if selected); obtain separate TEST Password1/Password2. Set server environment only; never send/store secrets in chats, code or browser bundles.
6. After merging/deploying the test routes, configure the URLs below. ResultURL uses POST with application/x-www-form-urlencoded; SuccessURL/FailURL use GET. Browser redirects never mark an evening paid.
7. Check SBP availability in this exact store; do not invent a payment-method code or promise that SBP is already enabled.

Technical URLs (use only after this revision is deployed):

| Setting | Method | URL |
| --- | --- | --- |
| ResultURL | POST | https://2la-noire-chagina7x.waw0.amvera.tech/api/payments/robokassa/result |
| SuccessURL | GET | https://2la-noire-chagina7x.waw0.amvera.tech/api/payments/robokassa/success |
| FailURL | GET | https://2la-noire-chagina7x.waw0.amvera.tech/api/payments/robokassa/fail |

Set the five server variables below, with test activation `true`, then restart/deploy the application. Open `/test-login`, enter the existing sandbox password and choose player login (the existing synthetic player «Тест Иван»), then **Кошелёк → Оплата → Тест оплаты**. If the sandbox has no payable evening, use its organizer login first: create a synthetic rating evening and add «Тест Иван» with response «Иду» and unpaid entry fee; return through the test player login. Do not create this fixture in the production CRM. Complete a simulated provider payment and return to the wallet. It must show server-confirmed test payment while the evening debt remains unchanged. A cancelled provider checkout must not display confirmation unless a valid ResultURL was actually received.

## Remaining application wiring before real-money readiness

- Extend the verified test lifecycle to separate real intents only after a successful configured test. Keep unique persisted invoices, authentication/ownership, amount snapshots and idempotency.
- Real ResultURL must settle through the canonical evening-payment service exactly once in a DB transaction. Reply OK{id} only after durable recording; repeated callbacks must acknowledge without a second credit. Never permit IsTest=1 or signed Shp_mode=test to settle a real obligation.
- Cancelled evenings or changed obligations require explicit reconciliation, not silent reassignment or loss of received money.
- Enable real checkout for concrete evening obligations; reload authoritative payment/receipt status after return. A successful browser redirect is not proof of payment.
- Store receipt status/source from real provider evidence and expose the receipt when available. Never infer receipt issuance from payment success.
- Repeat financial/idempotency/isolation regression checks for real settlement. Confirm a configured provider test separately from repository tests.
- Only after a successful configured test flow and confirmed SMZ activation prepare live credentials/explicit live activation and a real small payment.

## Configuration placeholders

ROBOKASSA_TEST_ENABLED=false (default)
ROBOKASSA_MERCHANT_LOGIN=
ROBOKASSA_TEST_PASSWORD1=
ROBOKASSA_TEST_PASSWORD2=
ROBOKASSA_HASH_ALGORITHM=sha256

Default test activation is false. Enable it only with separate test credentials; no live-secret fallback. The URLs above belong to the implemented test flow and are usable only after its deployment.

## Sources

- https://docs.robokassa.ru/ru/pay-interface
- https://docs.robokassa.ru/ru/notifications-and-redirects
- https://robokassa.com/online-check/robocheck-smz/

Repository checks and screenshots verify code behavior; they do not verify merchant secrets, a real provider call, store activation, deployed revision or NPD receipt issuance.
