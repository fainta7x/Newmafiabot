# Developer read access

This endpoint exists for bounded, read-only diagnostics and exports when the normal organizer UI is authenticated through Telegram/VK and is not practical for automated project maintenance.

## Security contract

- Read-only: the router exposes no write methods and performs no mutations.
- Authentication is required on every request.
- Preferred credential: `DEVELOPER_READ_KEY` via `X-Developer-Read-Key`.
- Compatibility fallback: the existing `BOT_API_SECRET` via `X-Bot-Token`.
- Never commit either secret to Git.
- Responses use `Cache-Control: no-store`.
- The endpoint is intentionally outside `/api` and uses POST so it remains reachable after the production SPA/API catchalls are installed by `createApp`.

## Endpoint

Base path:

`POST /__developer-read/...`

Available reads:

- `/evenings` — compact list of evenings.
- `/evenings/:id` — one evening plus participant nicknames, RSVP state, actual attendance state, and payment totals.
- `/evenings/by-date/YYYY-MM-DD` — same participant data for every evening on the requested date.

The returned participant fields are deliberately bounded to operational club data needed for diagnostics: player id, nickname, response/registration/attendance/arrival state, payment state, amount due/paid, and registration/check-in timestamps. It does not expose phone numbers, Telegram usernames, tokens, secrets, or arbitrary database access.

## Example

```bash
curl -X POST \
  -H "X-Developer-Read-Key: $DEVELOPER_READ_KEY" \
  https://<app-domain>/__developer-read/evenings/by-date/2026-08-14
```

If `DEVELOPER_READ_KEY` is not configured, the same read can be authenticated with the existing bot service secret:

```bash
curl -X POST \
  -H "X-Bot-Token: $BOT_API_SECRET" \
  https://<app-domain>/__developer-read/evenings/by-date/2026-08-14
```

## Deployment/runtime note

A merged Git commit does not make the endpoint available in the running service. Deploy the intended main SHA first, then verify the endpoint against the live Turso-backed runtime. Do not restore or import a repository checkpoint for this purpose.
