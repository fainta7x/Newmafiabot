import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';

import { exportPokerOpponentStats, observePokerHand, withOpponentMemory, type OpponentMemory } from '../services/pokerBot.ts';
import type { StoredPokerHand } from '../services/pokerLobbyService.ts';

const router = Router();

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireDeveloperReadAccess(req: Request, res: Response, next: NextFunction) {
  const dedicatedSecret = String(process.env.DEVELOPER_READ_KEY || '').trim();
  const botSecret = String(process.env.BOT_API_SECRET || '').trim();
  const supplied = String(req.header('X-Developer-Read-Key') || req.header('X-Bot-Token') || '').trim();

  if (!dedicatedSecret && !botSecret) {
    return res.status(503).json({ error: 'Developer read access is not configured' });
  }
  if (!supplied) {
    return res.status(401).json({ error: 'Missing developer read credential' });
  }

  const accepted = (dedicatedSecret && safeEqual(dedicatedSecret, supplied))
    || (botSecret && safeEqual(botSecret, supplied));
  if (!accepted) {
    return res.status(401).json({ error: 'Invalid developer read credential' });
  }
  return next();
}

router.use(requireDeveloperReadAccess);

/**
 * How every person plays at the poker tables, counted from the stored hands (read-only, no hands are returned):
 * the numbers the bots learn from, to tune them against real play.
 */
router.post('/poker/stats', async (req, res) => {
  try {
    const memory: OpponentMemory = new Map();
    const rows = await req.db.all<{ hand_json: string }>(`SELECT hand_json FROM poker_hand_log ORDER BY played_at ASC`).catch(() => []);
    let hands = 0;
    for (const row of rows) {
      try {
        const hand = JSON.parse(row.hand_json) as StoredPokerHand;
        withOpponentMemory(memory, () => observePokerHand({ players: hand.players, action_log: hand.actions.map(([street, player_id, type]) => ({ street, player_id, type })) }));
        hands += 1;
      } catch { /* a damaged row is skipped */ }
    }
    const stats = withOpponentMemory(memory, () => exportPokerOpponentStats()).filter((item) => !item.id.startsWith('bot-') && item.hands > 0);
    const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
    const players = [];
    for (const item of stats.sort((a, b) => b.hands - a.hands)) {
      const found = await req.db.get<{ nickname?: string }>('SELECT nickname FROM players WHERE id = ? LIMIT 1', [item.id]);
      players.push({
        player_id: item.id, nickname: found?.nickname || null, hands: item.hands,
        vpip_pct: pct(item.vpip, item.hands), pfr_pct: pct(item.pfr, item.hands),
        fold_to_bet_pct: pct(item.foldedToBet, item.facedBet), faced_bets: item.facedBet,
        postflop_bets_raises: item.postflopAggro, postflop_calls: item.postflopPassive,
        aggression_factor: item.postflopPassive > 0 ? Math.round((item.postflopAggro / item.postflopPassive) * 100) / 100 : null,
      });
    }
    return res.json({ stored_hands: hands, players });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to load poker stats' });
  }
});

/**
 * Did the payment reminders go out (read-only, no text of the messages): one row per reminder with its channel and delivery state.
 */
router.post('/payment-reminders', async (req, res) => {
  try {
    const rows = await req.db.all<any>(
      `SELECT d.entity_id AS evening_id, p.nickname, d.selected_channel, d.status, d.reason, d.created_at, d.updated_at,
              (SELECT o.status FROM telegram_message_outbox o WHERE o.message_key = d.notification_key LIMIT 1) AS telegram_outbox_status
         FROM personal_notification_deliveries d LEFT JOIN players p ON p.id = d.player_id
        WHERE d.event_type = 'evening_payment_reminder' ORDER BY d.created_at DESC LIMIT 200`,
    ).catch(() => []);
    return res.json({ count: rows.length, reminders: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to load payment reminders' });
  }
});

router.post('/evenings', async (req, res) => {
  try {
    const rows = await req.db.all<any>(
      `SELECT id, title, starts_at, ends_at, venue, status, default_price, settled_at
         FROM game_evenings
        ORDER BY starts_at DESC`,
    );
    return res.json({ evenings: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to load evenings' });
  }
});

router.post('/evenings/:id', async (req, res) => {
  try {
    const eveningId = String(req.params.id);
    const evening = await req.db.get<any>(
      `SELECT id, title, starts_at, ends_at, venue, status, default_price, settled_at
         FROM game_evenings
        WHERE id = ?`,
      [eveningId],
    );
    if (!evening) return res.status(404).json({ error: 'Evening not found' });

    const participants = await req.db.all<any>(
      `SELECT
         ep.id,
         ep.player_id,
         p.nickname,
         ep.response_status,
         ep.registration_status,
         ep.attendance_status,
         ep.arrival_status,
         ep.payment_status,
         ep.amount_due,
         ep.amount_paid,
         ep.registered_at,
         ep.confirmed_at,
         ep.checked_in_at
       FROM evening_participants ep
       JOIN players p ON p.id = ep.player_id
       WHERE ep.evening_id = ?
       ORDER BY ep.created_at ASC, p.nickname COLLATE NOCASE ASC`,
      [eveningId],
    );

    return res.json({ evening, participants });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to load evening' });
  }
});

router.post('/evenings/by-date/:date', async (req, res) => {
  try {
    const date = String(req.params.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
    }

    const evenings = await req.db.all<any>(
      `SELECT id, title, starts_at, ends_at, venue, status, default_price, settled_at
         FROM game_evenings
        WHERE substr(starts_at, 1, 10) = ?
        ORDER BY starts_at ASC`,
      [date],
    );

    const result = [];
    for (const evening of evenings) {
      const participants = await req.db.all<any>(
        `SELECT
           ep.id,
           ep.player_id,
           p.nickname,
           ep.response_status,
           ep.registration_status,
           ep.attendance_status,
           ep.arrival_status,
           ep.payment_status,
           ep.amount_due,
           ep.amount_paid,
           ep.registered_at,
           ep.confirmed_at,
           ep.checked_in_at
         FROM evening_participants ep
         JOIN players p ON p.id = ep.player_id
         WHERE ep.evening_id = ?
         ORDER BY ep.created_at ASC, p.nickname COLLATE NOCASE ASC`,
        [evening.id],
      );
      result.push({ evening, participants });
    }

    return res.json({ date, evenings: result });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to load evening by date' });
  }
});

export default router;
