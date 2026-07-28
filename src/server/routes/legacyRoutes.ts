import { Router } from 'express';
import { getDb } from '../../db/index.ts';
import crypto from 'crypto';

const router = Router();

// 1. Dashboard Stats
router.get('/dashboard-stats', async (_req, res, next) => {
  try {
    const db = await getDb();
    const playersCountRow = await db.get('SELECT COUNT(*) as count FROM players');
    const gamesCountRow = await db.get('SELECT COUNT(*) as count FROM games');
    const bookingsCountRow = await db.get(
      "SELECT COUNT(*) as count FROM evening_participants WHERE registration_status IN ('registered', 'confirmed') OR attendance_status = 'attended'"
    );
    const debtRow = await db.get(
      'SELECT SUM(amount_due - amount_paid) as total_debt FROM evening_participants WHERE amount_due > amount_paid'
    );
    const topEloRows = await db.all('SELECT nickname, elo FROM players ORDER BY elo DESC LIMIT 5');

    res.json({
      totalPlayers: playersCountRow?.count || 0,
      totalGames: gamesCountRow?.count || 0,
      activeBookings: bookingsCountRow?.count || 0,
      totalDebt: debtRow?.total_debt || 0,
      topElo: topEloRows || [],
    });
  } catch (err) {
    next(err);
  }
});

// 2. Bookings
router.get('/bookings', async (_req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.all(`
      SELECT ep.id, ep.player_id, p.telegram_user_id as user_id, p.nickname, ep.arrival_status as status, ep.created_at, ge.title as evening_title
      FROM evening_participants ep
      JOIN players p ON ep.player_id = p.id
      JOIN game_evenings ge ON ep.evening_id = ge.id
      ORDER BY ep.created_at DESC
    `);
    res.json(rows || []);
  } catch (err) {
    next(err);
  }
});

router.post('/bookings', async (req, res, next) => {
  try {
    const db = await getDb();
    const { user_id, nickname, status } = req.body;

    // Find latest active or published evening
    let evening = await db.get(
      "SELECT id FROM game_evenings WHERE status IN ('active', 'published') ORDER BY starts_at DESC LIMIT 1"
    );
    if (!evening) {
      evening = await db.get("SELECT id FROM game_evenings ORDER BY starts_at DESC LIMIT 1");
    }

    if (!evening) {
      return res.status(400).json({ error: 'Нет активных вечеров для записи' });
    }

    // Find player by nickname or user_id or id
    let player = await db.get('SELECT id, nickname FROM players WHERE nickname = ? OR telegram_user_id = ? OR id = ?', [
      nickname,
      user_id ? String(user_id) : '',
      user_id ? String(user_id) : '',
    ]);

    if (!player && nickname) {
      const newPlayerId = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.run(
        'INSERT INTO players (id, telegram_user_id, nickname, elo, tokens, created_at, updated_at) VALUES (?, ?, ?, 1000, 0, ?, ?)',
        [newPlayerId, user_id ? String(user_id) : null, nickname, now, now]
      );
      player = { id: newPlayerId, nickname };
    }

    if (player) {
      if (status === 'Отмена') {
        await db.run('DELETE FROM evening_participants WHERE evening_id = ? AND player_id = ?', [
          evening.id,
          player.id,
        ]);
      } else {
        const existing = await db.get('SELECT id FROM evening_participants WHERE evening_id = ? AND player_id = ?', [
          evening.id,
          player.id,
        ]);
        const now = new Date().toISOString();
        if (existing) {
          await db.run('UPDATE evening_participants SET arrival_status = ?, updated_at = ? WHERE id = ?', [
            status || 'Вовремя',
            now,
            existing.id,
          ]);
        } else {
          await db.run(
            `INSERT INTO evening_participants (id, evening_id, player_id, registration_status, attendance_status, arrival_status, payment_status, amount_due, amount_paid, created_at, updated_at)
             VALUES (?, ?, ?, 'confirmed', 'pending', ?, 'unpaid', 400, 0, ?, ?)`,
            [crypto.randomUUID(), evening.id, player.id, status || 'Вовремя', now, now]
          );
        }
      }
    }

    // Return updated bookings
    const rows = await db.all(`
      SELECT ep.id, ep.player_id, p.telegram_user_id as user_id, p.nickname, ep.arrival_status as status, ep.created_at
      FROM evening_participants ep
      JOIN players p ON ep.player_id = p.id
      ORDER BY ep.created_at DESC
    `);
    res.json(rows || []);
  } catch (err) {
    next(err);
  }
});

router.post('/bookings/archive', (_req, res) => {
  res.json({ success: true });
});

router.get('/admin/bookings', async (_req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.all(`
      SELECT ep.id, ep.player_id, p.telegram_user_id as user_id, p.nickname, ep.arrival_status as status, ep.created_at
      FROM evening_participants ep
      JOIN players p ON ep.player_id = p.id
      ORDER BY ep.created_at DESC
    `);
    res.json(rows || []);
  } catch (err) {
    next(err);
  }
});

router.post('/admin/bookings', (_req, res) => {
  res.json({ success: true });
});

// 3. Achievements List
router.get('/achievements-list', (_req, res) => {
  res.json([
    { id: 'first_win', title: 'Первая победа', description: 'Победа в любой игре клуба' },
    { id: 'mafia_boss', title: 'Дон Клуба', description: 'Успешная игра за роль Дона' },
    { id: 'sheriff_master', title: 'Шериф', description: 'Точные проверки ночью' },
    { id: 'clean_sheet', title: 'Чистый лист', description: 'Игра без замечаний и фолов' },
    { id: 'club_veteran', title: 'Ветеран Клуба', description: 'Посещение более 10 игровых вечеров' },
  ]);
});

// 4. Shop Items & Purchases
const SHOP_ITEMS = [
  { id: 1, name: 'Скидка на вечер (100%)', description: 'Бесплатное участие в одном игровом вечере', price: 1000, icon: '🎟️' },
  { id: 2, name: 'Выбор роли на 1 игру', description: 'Гарантированная выдача желаемой карты в одной игре', price: 2500, icon: '🎭' },
  { id: 3, name: 'Кастомный аватар', description: 'Уникальная рамка и плашка в профиле игрока', price: 1500, icon: '👑' },
  { id: 4, name: 'Фирменный напиток', description: 'Коктейль или чай от заведения', price: 500, icon: '🍹' },
];

router.get('/shop-items', (_req, res) => {
  res.json(SHOP_ITEMS);
});

router.post('/shop-purchase', async (req, res, next) => {
  try {
    const { player_id, item_id } = req.body;
    const db = await getDb();

    const player = await db.get('SELECT * FROM players WHERE id = ? OR telegram_user_id = ?', [
      String(player_id),
      String(player_id),
    ]);

    if (!player) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }

    const item = SHOP_ITEMS.find((i) => i.id === Number(item_id));
    if (!item) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    if ((player.tokens || 0) < item.price) {
      return res.status(400).json({ error: 'Недостаточно жетонов для покупки' });
    }

    const newTokens = (player.tokens || 0) - item.price;
    const now = new Date().toISOString();

    await db.run('UPDATE players SET tokens = ?, updated_at = ? WHERE id = ?', [newTokens, now, player.id]);

    await db.run(
      `INSERT INTO financial_transactions (id, type, amount, category, description, player_id, created_at)
       VALUES (?, 'expense', ?, 'Магазин', ?, ?, ?)`,
      [crypto.randomUUID(), item.price, `Покупка товара "${item.name}"`, player.id, now]
    );

    res.json({
      success: true,
      purchase: {
        nickname: player.nickname,
        item_name: item.name,
        price: item.price,
      },
      player: {
        ...player,
        tokens: newTokens,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/purchases', (_req, res) => {
  res.json([]);
});

// 5. Transactions
router.get('/transactions', async (_req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM financial_transactions ORDER BY created_at DESC');
    res.json(rows || []);
  } catch (err) {
    next(err);
  }
});

router.post('/transactions', async (req, res, next) => {
  try {
    const db = await getDb();
    const { type, amount, category, description, player_id, evening_id } = req.body;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO financial_transactions (id, type, amount, category, description, player_id, evening_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, type || 'income', amount || 0, category || 'Прочее', description || '', player_id || null, evening_id || null, now]
    );

    const created = await db.get('SELECT * FROM financial_transactions WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// 6. Admin Players & Debts Settle
router.get('/admin/players', async (_req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM players ORDER BY elo DESC');
    res.json(rows || []);
  } catch (err) {
    next(err);
  }
});

router.post('/admin/players', (_req, res) => {
  res.json({ success: true });
});

router.post('/evenings/settle-debts', (_req, res) => {
  res.json({ success: true });
});

export default router;
