# PROJECT-AUDIT-001 — Phase 3 Telegram/VK automation findings

Status: in progress  
Parent: #330  
Phase issue: #340

## 1. Canonical integration lifecycle

For both Telegram and VK the product DB is the source of truth for the evening. Transport layers render that state.

Target lifecycle:

`domain mutation -> durable queue/publication state -> transport send/edit -> persisted transport identity -> later edits reuse identity -> close/settle finalizes`

Transport failure must never roll back RSVP/game/payment state.

## 2. Telegram

### Publication identity

`evening_telegram_publications` uses a composite primary key:

`(evening_id, destination_id)`

This is the canonical message identity and prevents more than one current publication row per evening/destination.

### Durable sync

`telegram_sync_outbox` coalesces evening mutations by `sync_key=evening:<id>` and increments a version. The worker only deletes the same version that it delivered, so a mutation arriving during delivery cannot be lost.

`telegram_dispatch_outbox` is separate for tournament / announcement / reminder dispatch.

### First creation vs edit

Python `sync_evening_telegram()` follows:
- publication exists -> edit that exact message;
- no publication -> create only when `allow_create` and destination is active/configured;
- public destination is router-only and must not own per-evening announcements.

### Weekly automation

The rolling Friday calendar can create future `published` evenings. First announcement is due at approximately 4 days + 1 hour before start.

Two previous defects were found:
- schema bootstrap bulk-enqueued every open evening (#328);
- later DB mutations could enqueue a far-future evening again after cleanup.

The second defect was fixed at the actual delivery boundary in #339:
- automatic first creation is blocked outside the announcement window;
- an existing publication may always refresh;
- explicit organizer sync can intentionally override the automatic window;
- closed/settled final sync is still delivered because it cannot create a new desired post.

This is stronger than cleanup-only protection because it protects every producer of the outbox.

## 3. Telegram direct messages

`telegram_message_outbox` is a separate durable personal/organizer/betting delivery queue.

Properties:
- stable `message_key` idempotency;
- bounded retry count;
- exponential backoff;
- Telegram 429 `retry_after` support;
- concurrent delivery with in-process key protection;
- persisted diagnostics.

Risk to revisit later:
- on conflict, message content is refreshed but a permanently exhausted row is not automatically reset. This may be intentional idempotency, but every producer must use a new semantic `message_key` when a genuinely new delivery should occur.

## 4. VK public publishing

Current direct evening publishing uses the product DB and `vk_evening_publications`.

First publish:
- `wall.post` using publisher credentials;
- stores `post_owner_id`, `post_id`, URL and publication timestamps.

Existing post:
- `wall.edit` through `editVkWallPostWithPublisher`;
- preserves the same post ID;
- clears prior error state after a successful edit.

The community publisher token is valid for the current public wall edit path. An audit inconsistency was found: integration status still reported edit support using the retired legacy user-token-only adapter. Phase 3 corrects `public_post_edit_supported` to report the capability actually used by direct evening publishing.

## 5. VK live refresh

`vkLiveEveningSyncWorker`:
- starts after normal app bootstrap;
- waits 30 seconds before the first refresh;
- runs every 10 minutes;
- only selects future open evenings that already have a stored VK post ID;
- calls sync with `onlyExisting: true`.

Therefore the live worker cannot create a new VK evening post and cannot fan out across unpublished future Fridays.

## 6. VK personal delivery

`vk_message_outbox` provides:
- stable `message_key` and stable `random_id`;
- retry/backoff;
- distinction between permission-denied, temporary, permanent and configuration failures;
- permission diagnostics for organizers.

Like Telegram DM, exhausted idempotency keys should be reviewed per producer before any automatic retry-reset behavior is introduced.

## 7. Cross-channel source of truth

Current direct Telegram and VK evening rendering reads:
- `game_evenings`;
- canonical participant response state;
- canonical exact slot plan.

Neither transport is allowed to become the roster source of truth.

Telegram quick RSVP writes back through the Node bot API into canonical `evening_participants` / slot selection rather than updating the Python legacy booking DB for this path.

VK direct joins likewise operate through canonical Node routes/services.

## 8. Restart and deployment behavior

Telegram:
- webhook is set by startup;
- rolling shutdown does not delete the shared webhook (#329);
- sync and DM queues persist in product SQLite.

VK:
- personal delivery worker starts during app bootstrap;
- that worker also starts the live evening refresh worker;
- publication identity persists in product SQLite.

## 9. Remaining risks / follow-ups

1. Verify every UI/manual action clearly distinguishes “publish now” from automatic scheduled publishing.
2. Review all Telegram DM/VK DM producer message-key strategies for exhausted-key behavior.
3. Remove/retire old VK poll-based evening integration routes if direct-join mode has fully replaced them.
4. Confirm the old Python booking/profile/payment/bet handlers are not used as a second transport source.
5. Add integration-level close/cancel tests proving existing Telegram/VK posts are finalized but new posts cannot appear after start/close.
6. Add system-status visibility for oldest pending/retrying transport jobs by channel.
7. Review module-global worker locks/timers if the runtime ever moves to multiple Node processes in one container.

## 10. Current Phase 3 conclusion

The current integration architecture is substantially safer than before the audit:
- publication identities are durable;
- Telegram mutations are coalesced;
- VK live refresh is edit-only;
- automatic Telegram first creation is now guarded at the delivery boundary;
- rolling webhook ownership is safe.

The main remaining architectural risk is not duplicate transport identity but coexistence with legacy Python business flows and the amount of implicit automation started from runtime/bootstrap paths.
