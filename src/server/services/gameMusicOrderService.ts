import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { getGame } from './gameService.ts';
import { reconcileOtherFormatExtensions, reconcileRegularEveningPayments } from './eveningPaymentPricingService.ts';

export const GAME_MUSIC_PRICE_RUB = 50;
export type MusicOrderStatus = 'ordered' | 'played' | 'cancelled';
type MusicOrder = {
  id: string; game_id: number; evening_id: string; player_id: string;
  track_reference: string; status: MusicOrderStatus; amount_rub: number; created_at: string;
};
function fail(msg: string, statusCode = 409): never {
  throw Object.assign(new Error(msg), { statusCode });
}

export async function ensureGameMusicOrderSchema(db: DatabaseWrapper) {
  await db.exec(`CREATE TABLE IF NOT EXISTS game_music_orders (
    id TEXT PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    track_reference TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('ordered','played','cancelled')),
    amount_rub INTEGER NOT NULL DEFAULT 50,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_game_music_orders_evening ON game_music_orders(evening_id,status);
  CREATE INDEX IF NOT EXISTS idx_game_music_orders_game ON game_music_orders(game_id,status);`);
}

const normalizeTrack = (value: unknown, fromJudge: boolean) => {
  const track = String(value ?? '').trim();
  if (!track || track.length > 500) fail('Укажите трек (до 500 символов)', 400);
  if (!fromJudge) {
    let url: URL;
    try { url = new URL(track); } catch { return fail('Укажите ссылку Яндекс Музыки', 400); }
    if (url.protocol !== 'https:' || !['music.yandex.ru', 'music.yandex.com'].includes(url.hostname)) {
      fail('Используйте ссылку Яндекс Музыки', 400);
    }
    return url.href;
  }
  return track.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 500);
};

async function reconcile(db: DatabaseWrapper, eveningId: string) {
  await reconcileRegularEveningPayments(db, eveningId);
  await reconcileOtherFormatExtensions(db, eveningId);
}

/** One paid order per requested song; repeat songs are separate explicit orders. */
export async function orderGameMusic(
  db: DatabaseWrapper, gameId: number, playerId: string, track: unknown,
  fromJudge = false,
): Promise<{ id: string; priceRub: number }> {
  await ensureGameMusicOrderSchema(db);
  const reference = normalizeTrack(track, fromJudge);
  return db.transaction(async (tx) => {
    const game = await getGame(tx, `club:${gameId}`);
    if (!game || game.storage !== 'club' || !game.eventId) fail('Игра не найдена', 404);
    if (!['published', 'active'].includes(String(game.eventStatus)) ||
        ['completed', 'cancelled', 'archived'].includes(game.status)) {
      fail('Заказ музыки для этой игры закрыт');
    }
    if (!game.seats.some((seat) => seat.playerId === playerId)) fail('Вы не участвуете в этой игре', 403);
    const now = new Date().toISOString();
    const id = randomUUID();
    await tx.run(
      `INSERT INTO game_music_orders
        (id,game_id,evening_id,player_id,track_reference,status,amount_rub,created_at,updated_at)
        VALUES (?,?,?,?,?,'ordered',50,?,?)`,
      [id, gameId, game.eventId, playerId, reference, now, now],
    );
    await reconcile(tx, game.eventId);
    return { id, priceRub: GAME_MUSIC_PRICE_RUB };
  });
}

export async function markGameMusicPlayed(db: DatabaseWrapper, orderId: string, gameId: number) {
  await ensureGameMusicOrderSchema(db);
  return db.transaction(async (tx) => {
    const order = await tx.get<MusicOrder>(
      'SELECT * FROM game_music_orders WHERE id=? AND game_id=?', [orderId, gameId],
    );
    if (!order) fail('Заказ не найден', 404);
    if (order.status === 'cancelled') fail('Заказ отменён');
    if (order.status === 'played') return { played: true };
    await tx.run("UPDATE game_music_orders SET status='played',updated_at=? WHERE id=?",
      [new Date().toISOString(), orderId]);
    return { played: true };
  });
}

/** Only organizers can cancel; cancelling a played track is not a silent refund. */
export async function cancelGameMusicOrder(db: DatabaseWrapper, orderId: string) {
  await ensureGameMusicOrderSchema(db);
  return db.transaction(async (tx) => {
    const order = await tx.get<MusicOrder>('SELECT * FROM game_music_orders WHERE id=?', [orderId]);
    if (!order) fail('Заказ не найден', 404);
    if (order.status === 'played') fail('Музыка уже исполнена');
    if (order.status === 'cancelled') return { cancelled: true };
    await tx.run("UPDATE game_music_orders SET status='cancelled',updated_at=? WHERE id=?",
      [new Date().toISOString(), orderId]);
    await reconcile(tx, order.evening_id);
    return { cancelled: true };
  });
}

export async function cancelOutstandingGameMusicOrders(db: DatabaseWrapper, eveningId: string) {
  await ensureGameMusicOrderSchema(db);
  return db.transaction(async (tx) => {
    const result = await tx.run(
      "UPDATE game_music_orders SET status='cancelled',updated_at=? WHERE evening_id=? AND status='ordered'",
      [new Date().toISOString(), eveningId],
    );
    if (result.changes) await reconcile(tx, eveningId);
    return Number(result.changes);
  });
}
