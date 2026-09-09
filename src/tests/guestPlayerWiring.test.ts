import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const eveningUi = read('../components/crm/EveningGameCreateSheet.tsx');
const protocolUi = read('../components/crm/tournaments/protocol/ProtocolSummaryTab.tsx');
const eveningsRoute = read('../server/routes/eveningsRoutes.ts');
const gamesRoute = read('../server/routes/gamesRoutes.ts');
const tokenSettlement = read('../server/services/clubGameTokenSettlementService.ts');
const eloService = read('../server/services/eloRatingService.ts');
const postSave = read('../server/services/clubGamePostSaveService.ts');
const migration = read('../db/ensureGuestPlayerPlaceholderSchema.ts');

describe('GUEST-PLAYER-001 wiring contract', () => {
  it('keeps quick guest creation on the placeholder API without contact/account fields', () => {
    expect(eveningUi).toContain('Гость без профиля');
    expect(eveningUi).toContain("nickname: guestNickname.trim() || 'Гость'");
    expect(eveningUi).not.toContain('guestPhone');
    expect(eveningUi).toContain('Профиль, рейтинг, жетоны и контакты игрока не создаются');
  });

  it('exposes explicit guest-to-registered-player correction and never recreates a guest from seat repair', () => {
    expect(protocolUi).toContain('Заменить гостя на зарегистрированного игрока');
    expect(protocolUi).toContain('clubGamesApi.repairSeatIdentity');
    expect(protocolUi).toContain('replacement_player_id: selectedReplacementPlayer.id');
    expect(gamesRoute).toContain('replaceGuestWithRegisteredPlayer');
    expect(gamesRoute).toContain("if (req.body?.guest) return res.status(400)");
    expect(gamesRoute).toContain("if ((replacement.changed || replacement.idempotent) && previousStatus === 'completed')");
  });

  it('keeps mixed guest and registered bulk participant updates atomic', () => {
    const bulkStart = eveningsRoute.indexOf("router.patch('/:id/participants/bulk'");
    const settleStart = eveningsRoute.indexOf("router.post('/:id/settle'", bulkStart);
    const bulkRoute = eveningsRoute.slice(bulkStart, settleStart);
    expect(bulkStart).toBeGreaterThanOrEqual(0);
    expect(bulkRoute).toContain('await db.transaction(async(tx)=>');
    expect(bulkRoute).toContain('updateGuestPlaceholder(tx');
    expect(bulkRoute).toContain('assignParticipantToTable(tx');
    expect(bulkRoute).toContain('setParticipantResponse(tx');
    expect(bulkRoute).toContain('setParticipantAttendance(tx');
    expect(bulkRoute).not.toContain('updateGuestPlaceholder(db');
    expect(eveningsRoute).toContain("console.warn('[CRM] Could not load announcement state for evening:'");
  });

  it('keeps unresolved guests outside player-level derived effects', () => {
    expect(tokenSettlement).toContain("results.filter((result: any) => String(result?.player_id || '').trim())");
    expect(eloService).toContain('Boolean(result?.guest_placeholder_id) || !playerId || guestPlayerIds.has(playerId)');
    expect(eloService).toContain('if (guestSeat) continue;');
    expect(postSave).toContain('...[...input.playerIds].map(String).filter(Boolean)');
  });

  it('uses reliable legacy markers and durable diagnostics instead of nickname matching', () => {
    expect(migration).toContain("const LEGACY_GUEST_SOURCES = new Set(['quick_guest'])");
    expect(migration).toContain("'external_identity_linked'");
    expect(migration).toContain("'ambiguous_game_seat'");
    expect(migration).toContain("'migration_requires_review'");
    expect(migration).toContain("source IN ('quick_guest','legacy_guest_migrated')");
    expect(migration).not.toMatch(/WHERE\s+[^;]*nickname\s*=\s*\?/i);
  });
});
