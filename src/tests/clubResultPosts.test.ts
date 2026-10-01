import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadEveningSummary, loadGameBlank, loadSeasonTable } from '../server/services/clubResultData.ts';
import { eveningSummarySvg, gameBlankSvg, renderPng, seasonTableSvg } from '../server/services/clubResultImages.ts';
import { ensureClubResultPostSchema, queueEveningPlayerCards, runClubResultPosts } from '../server/services/clubResultPostService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });

const PLAYERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const ROLES = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];

async function setup(format = 'CASUAL', startsAt = new Date(Date.now() - 3 * 3600_000).toISOString()) {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const now = new Date().toISOString();
  for (const id of PLAYERS) {
    await db.run(`INSERT INTO players (id,nickname,lifecycle_status,source,created_at,updated_at) VALUES (?,?,'normal','manual',?,?)`, [id, `Игрок ${id.toUpperCase()}`, now, now]);
  }
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Пятничный вечер',?,'Europe/Moscow',?,'active',20,100,?,?)`, [startsAt, format, now, now]);
  await db.run(`INSERT OR REPLACE INTO telegram_destinations (id,name,chat_id,topic_id,active,created_at,updated_at)
    VALUES ('club','Клуб','-100500',77,1,?,?), ('rating','Рейтинг','-100600',NULL,1,?,?)`, [now, now, now, now]);
  // The feature was switched on a day ago.
  await ensureClubResultPostSchema(db);
  const switchedOn = new Date(Date.now() - 86400_000).toISOString();
  await db.run("INSERT INTO club_result_posts (post_key, kind, status, created_at, updated_at) VALUES ('enabled','marker','sent',?,?), ('enabled-public','marker','sent',?,?)", [switchedOn, switchedOn, switchedOn, switchedOn]);
  // Player «a» is always the sheriff; the rest rotate.
  const addGame = async (number: number, winner: 'red' | 'black', extra: Record<string, unknown> = {}, status = 'completed') => {
    const envelope = {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: { status, winner_team: winner, first_killed_participant_id: 'p2', best_moves: [{ participant_id: 'p2', seat_numbers: [8, 9, 10] }], ...extra },
      player_results: ROLES.map((role, index) => ({
        participant_id: `p${index + 1}`, player_id: PLAYERS[index], seat_number: index + 1, role,
        judge_bonus: index === 0 && number === 1 ? 0.5 : 0, protocol_bonus: 0, regular_fouls: index === 4 ? 2 : 0,
        minor_technical_fouls: 0, major_technical_fouls: 0, exit_type: index === 8 ? 'removed' : 'alive',
      })),
    };
    const inserted = await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,protocol_text,slots_json,created_at)
      VALUES ('ev',?,?,?,'','Судья Ночь',?,'[]',?)`, [number, now, winner, JSON.stringify(envelope), now]);
    return String(inserted.lastID);
  };
  return { db, addGame };
}

const addPeriod = (db: DatabaseWrapper, format: string) => db.run(`INSERT INTO rating_periods (id,title,type,starts_at,ends_at,status,auto_include,created_at,updated_at)
  VALUES ('rp','Осень 2026',?,?,?,'active',1,?,?)`, [format, new Date(Date.now() - 30 * 86400_000).toISOString(), new Date(Date.now() + 30 * 86400_000).toISOString(), new Date().toISOString(), new Date().toISOString()]);

const telegram = () => {
  const calls: FormData[] = [];
  const urls: string[] = [];
  const fetchImpl = (async (url: string, init: any) => {
    urls.push(String(url));
    calls.push(init.body as FormData);
    return new Response(JSON.stringify({ ok: true }));
  }) as unknown as typeof fetch;
  return { calls, urls, fetchImpl };
};

describe('club game blank', () => {
  it('lists every seat with role, game events and no points on an ordinary evening', async () => {
    const { db, addGame } = await setup('CASUAL');
    const id = await addGame(12, 'red');
    const blank = await loadGameBlank(db, id);
    expect(blank).toMatchObject({ gameNumber: '12', eveningTitle: 'Пятничный вечер', winnerTeam: 'red', judge: 'Судья Ночь', scored: false });
    expect(blank!.seats).toHaveLength(10);
    expect(blank!.seats[0]).toMatchObject({ seat: 1, nickname: 'Игрок A', role: 'sheriff', won: true, points: null });
    expect(blank!.seats[1]).toMatchObject({ firstKilled: true, bestMoveSeats: [8, 9, 10] });
    expect(blank!.seats[4].fouls).toBe(2);
    expect(blank!.seats[8]).toMatchObject({ removed: true, won: false });
    const svg = gameBlankSvg(blank!);
    expect(svg).toContain('ИГРА №12');
    expect(svg).toContain('ПОБЕДА КРАСНЫХ');
    expect(svg).toContain('Лучший ход: 8, 9, 10');
    // Ordinary evenings move Elo: winners up, losers down.
    expect(blank!.seats[0].eloDelta).toBeGreaterThan(0);
    expect(blank!.seats[9].eloDelta).toBeLessThan(0);
    expect(svg).toContain('Эло +');
    expect(renderPng(svg).subarray(1, 4).toString()).toBe('PNG');
  });

  it('shows points on a rating evening', async () => {
    const { db, addGame } = await setup('RATING');
    const blank = await loadGameBlank(db, await addGame(1, 'red'));
    expect(blank!.scored).toBe(true);
    expect(blank!.seats[0].points).toBeCloseTo(1.5, 2);
    expect(gameBlankSvg(blank!)).toMatch(/\+1,5/);
  });
});

describe('evening summary', () => {
  it('ordinary evening: games, red : black, most wins and the best by role by wins', async () => {
    const { db, addGame } = await setup('CASUAL');
    await addGame(1, 'red'); await addGame(2, 'red'); await addGame(3, 'black');
    const summary = await loadEveningSummary(db, 'ev');
    expect(summary).toMatchObject({ games: 3, redWins: 2, blackWins: 1, players: 10, scored: false, bestAverage: [] });
    expect(summary!.mostWins[0]).toMatchObject({ nickname: 'Игрок A', value: '2 победы', detail: 'из 3 игр' });
    expect(summary!.bestByRole.find((item) => item.role === 'sheriff')!.player).toMatchObject({ nickname: 'Игрок A' });
    expect(summary!.bestByRole.find((item) => item.role === 'don')!.player).toMatchObject({ nickname: 'Игрок J', value: '1 победа' });
    expect(eveningSummarySvg(summary!)).toContain('БОЛЬШЕ ВСЕХ ПОБЕД');
    expect(summary!.eloGain[0].detail).toBe('Эло за вечер');
    expect(eveningSummarySvg(summary!)).toContain('РОСТ ЭЛО ЗА ВЕЧЕР');
  });

  it('a walk-in guest without a profile still counts', async () => {
    const { db, addGame } = await setup('CASUAL');
    const id = await addGame(1, 'red');
    const game = await db.get<any>('SELECT protocol_text FROM games WHERE id = ?', [id]);
    const envelope = JSON.parse(game.protocol_text);
    Object.assign(envelope.player_results[0], { player_id: null, guest_placeholder_id: 'guest-1', display_name: 'Гость Олег' });
    await db.run('UPDATE games SET protocol_text = ? WHERE id = ?', [JSON.stringify(envelope), id]);
    const summary = await loadEveningSummary(db, 'ev');
    expect(summary!.players).toBe(10);
    expect(summary!.bestByRole.find((item) => item.role === 'sheriff')!.player).toMatchObject({ nickname: 'Гость Олег', avatar: null });
  });

  it('rating evening: the best is the average points per game, not the sum', async () => {
    const { db, addGame } = await setup('RATING');
    await addGame(1, 'red'); await addGame(2, 'black');
    const summary = await loadEveningSummary(db, 'ev');
    // «b» guessed three blacks in his best move both games; «a»: game 1 = 1 + 0.5, game 2 = 0 → 0.75;
    // the other citizens: 0.5.
    expect(summary!.bestAverage.map((item) => item.nickname)).toEqual(['Игрок B', 'Игрок A', expect.any(String)]);
    expect(summary!.bestAverage[1]).toMatchObject({ value: '+0,75', detail: 'в среднем за 2 игры' });
    expect(summary!.bestByRole.find((item) => item.role === 'sheriff')!.player!.value).toBe('+0,75');
    expect(eveningSummarySvg(summary!)).toContain('ЛУЧШИЙ СРЕДНИЙ БАЛЛ');
  });
});

describe('season so far', () => {
  it('ordinary season: top by wins and the best by role over the rating period', async () => {
    const { db, addGame } = await setup('CASUAL');
    await addPeriod(db, 'CASUAL');
    await addGame(1, 'red'); await addGame(2, 'red');
    const season = await loadSeasonTable(db, 'ev');
    expect(season).toMatchObject({ periodTitle: 'Осень 2026', scored: false, games: 2 });
    expect(season!.rows).toHaveLength(10);
    expect(season!.rows[9].value).toBe('0 побед');
    expect(season!.rows[0]).toMatchObject({ place: 1, value: '2 победы', detail: 'из 2 игр' });
    expect(season!.bestByRole.find((item) => item.role === 'sheriff')!.player).toMatchObject({ nickname: 'Игрок A' });
    expect(seasonTableSvg(season!)).toContain('ТОП-10 ПО ПОБЕДАМ');
  });

  it('rating season: the top needs 40% of the most active player\'s games; the rest are listed as close', async () => {
    const { db, addGame } = await setup('RATING');
    await addPeriod(db, 'RATING');
    for (let n = 1; n <= 5; n += 1) await addGame(n, n % 2 ? 'red' : 'black');
    // Two newcomers play one game instead of «i» and «j».
    const now = new Date().toISOString();
    await db.run(`INSERT INTO players (id,nickname,lifecycle_status,source,created_at,updated_at) VALUES ('x','Новичок Х','normal','manual',?,?),('y','Новичок У','normal','manual',?,?)`, [now, now, now, now]);
    const id = await addGame(6, 'red');
    const game = await db.get<any>('SELECT protocol_text FROM games WHERE id = ?', [id]);
    const envelope = JSON.parse(game.protocol_text);
    envelope.player_results[8].player_id = 'x'; envelope.player_results[9].player_id = 'y';
    await db.run('UPDATE games SET protocol_text = ? WHERE id = ?', [JSON.stringify(envelope), id]);
    const season = await loadSeasonTable(db, 'ev');
    // The most active played 6 games → the minimum is 3.
    expect(season!.minGames).toBe(3);
    expect(season!.rows.map((row) => row.nickname)).not.toContain('Новичок Х');
    expect(season!.pending).toEqual([{ nickname: 'Новичок У', games: 1 }, { nickname: 'Новичок Х', games: 1 }]);
    // The period decides: an ordinary evening included in this rating period still gets the rating rules.
    await db.run("UPDATE game_evenings SET format = 'CASUAL' WHERE id = 'ev'");
    await db.run(`INSERT INTO rating_period_evening_overrides (period_id, evening_id, included, created_at, updated_at) VALUES ('rp','ev',1,?,?)`, [now, now]).catch(async () => {
      await db.run(`INSERT INTO rating_period_evening_overrides (period_id, evening_id, included) VALUES ('rp','ev',1)`);
    });
    expect((await loadSeasonTable(db, 'ev'))!.minGames).toBe(3);
    const svg = seasonTableSvg(season!);
    expect(svg).toContain('БЛИЗКО К ЗАЧЁТУ · НУЖНО 3 ИГРЫ');
    expect(svg).toContain('Новичок Х 1/3');
  });

  it('rating season ranks by the average, and there is no table without a period', async () => {
    const { db, addGame } = await setup('RATING');
    await addGame(1, 'red');
    expect(await loadSeasonTable(db, 'ev')).toBeNull();
    await addPeriod(db, 'RATING');
    const season = await loadSeasonTable(db, 'ev');
    expect(season!.scored).toBe(true);
    expect(season!.rows[0].detail).toBe('в среднем · 1 игру');
    expect(seasonTableSvg(season!)).toContain('ТОП-10 ПО СРЕДНЕМУ БАЛЛУ');
  });
});

describe('one personal message per evening', () => {
  it('after closing each player gets their games, roles, Elo and buttons, once', async () => {
    vi.stubEnv('PLAYER_APP_URL', 'https://club.example');
    vi.stubEnv('TELEGRAM_BOT_USERNAME', 'NoireBot');
    const { db, addGame } = await setup('RATING');
    await db.run("UPDATE players SET telegram_user_id = '500' WHERE id = 'a'");
    await addGame(1, 'red'); await addGame(2, 'black');
    expect(await queueEveningPlayerCards(db, 'ev')).toBeGreaterThan(0);
    expect(await queueEveningPlayerCards(db, 'ev')).toBe(0);
    const card = await db.get<any>("SELECT text FROM personal_notification_deliveries WHERE notification_key = 'evening-result:ev:a'");
    expect(card.text).toContain('🏁 Твой вечер · Пятничный вечер');
    expect(card.text).toContain('Сыграно: 2 игры · 1 победа');
    expect(card.text).toContain('№1 Шериф — победа');
    expect(card.text).toContain('№2 Шериф — поражение');
    expect(card.text).toContain('Баллы за вечер: +1,5 · в среднем +0,75');
    expect(card.text).toMatch(/Эло: [+−]\d+ · теперь \d+/);
    const outbox = await db.get<any>("SELECT reply_markup_json FROM telegram_message_outbox WHERE message_key = 'evening-result:ev:a'");
    const [row] = JSON.parse(outbox.reply_markup_json).inline_keyboard;
    expect(row.map((button: any) => button.text)).toEqual(['📋 Мои игры', '🤝 Позвать друга']);
  });
});

describe('posting to the club chat', () => {
  it('posts each completed game once to the evening group, then the summary after closing', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { db, addGame } = await setup('CASUAL');
    await addGame(1, 'red');
    await addGame(2, 'black', {}, 'draft');
    const { calls, fetchImpl } = telegram();
    expect(await runClubResultPosts(db, fetchImpl)).toBe(1);
    expect(await runClubResultPosts(db, fetchImpl)).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].get('chat_id')).toBe('-100500');
    expect(calls[0].get('message_thread_id')).toBe('77');
    expect(calls[0].get('caption')).toBe('🎭 Игра №1 · победа красных');
    expect((calls[0].get('photo') as Blob).type).toBe('image/png');

    await db.run("UPDATE game_evenings SET status = 'completed' WHERE id = 'ev'");
    expect(await runClubResultPosts(db, fetchImpl)).toBe(1);
    expect(calls[1].get('caption')).toBe('🏁 Итоги вечера «Пятничный вечер»');
    expect(await runClubResultPosts(db, fetchImpl)).toBe(0);
  });

  it('with a season the evening summary and the season table go as one album', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { db, addGame } = await setup('CASUAL');
    await addPeriod(db, 'CASUAL');
    await addGame(1, 'red');
    await db.run("UPDATE game_evenings SET status = 'completed' WHERE id = 'ev'");
    const { calls, urls, fetchImpl } = telegram();
    expect(await runClubResultPosts(db, fetchImpl)).toBe(2);
    expect(urls[1]).toMatch(/\/sendMediaGroup$/);
    const media = JSON.parse(String(calls[1].get('media')));
    expect(media.map((item: any) => item.media)).toEqual(['attach://p0', 'attach://p1']);
    expect(media[0].caption).toBe('🏁 Итоги вечера «Пятничный вечер» и промежуточная таблица «Осень 2026»');
    expect(calls[1].get('message_thread_id')).toBe('77');
    expect((calls[1].get('p1') as Blob).type).toBe('image/png');
  });

  it('an evening closed days after it started still gets its summary and personal messages', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { db, addGame } = await setup('CASUAL', new Date(Date.now() - 3 * 86400_000).toISOString());
    await db.run("UPDATE club_result_posts SET created_at = ? WHERE post_key = 'enabled'", [new Date(Date.now() - 5 * 86400_000).toISOString()]);
    await db.run("UPDATE players SET telegram_user_id = '500' WHERE id = 'a'");
    await addGame(1, 'red');
    await db.run("UPDATE game_evenings SET status = 'completed', settled_at = ? WHERE id = 'ev'", [new Date().toISOString()]);
    const { calls, fetchImpl } = telegram();
    expect(await runClubResultPosts(db, fetchImpl)).toBe(1);
    expect(calls[0].get('caption')).toBe('🏁 Итоги вечера «Пятничный вечер»');
    expect(await db.get("SELECT 1 FROM personal_notification_deliveries WHERE notification_key = 'evening-result:ev:a'")).toBeTruthy();
    expect(await runClubResultPosts(db, fetchImpl)).toBe(0);
  });

  it('never posts an evening that started before the feature was switched on', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { db, addGame } = await setup('CASUAL');
    await db.run("DELETE FROM club_result_posts WHERE post_key = 'enabled'");
    await addGame(1, 'red');
    const { calls, fetchImpl } = telegram();
    expect(await runClubResultPosts(db, fetchImpl)).toBe(0);
    await db.run("UPDATE game_evenings SET status = 'completed' WHERE id = 'ev'");
    expect(await runClubResultPosts(db, fetchImpl)).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('a Telegram outage is retried, a missing group is not', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { db, addGame } = await setup('CASUAL');
    await addGame(1, 'red');
    const down = (async () => new Response('{}', { status: 502 })) as unknown as typeof fetch;
    expect(await runClubResultPosts(db, down)).toBe(0);
    const { calls, fetchImpl } = telegram();
    expect(await runClubResultPosts(db, fetchImpl)).toBe(1);
    expect(calls).toHaveLength(1);

    await db.run("DELETE FROM telegram_destinations WHERE id = 'club'");
    await addGame(2, 'red');
    expect(await runClubResultPosts(db, fetchImpl)).toBe(0);
    expect(await db.get<any>("SELECT status, last_error FROM club_result_posts WHERE post_key LIKE 'game:%' AND status = 'failed'"))
      .toMatchObject({ status: 'failed', last_error: 'Не настроена Telegram-группа для этого вечера' });
  });
});

describe('the entry channel', () => {
  const addPublic = (db: DatabaseWrapper) => db.run(`INSERT OR REPLACE INTO telegram_destinations (id,name,chat_id,topic_id,active,created_at,updated_at)
    VALUES ('public','Вход','@noire_entry',NULL,1,?,?)`, [new Date().toISOString(), new Date().toISOString()]);

  it('gets the evening summary picture after closing, for any format, with a link to the bot', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('TELEGRAM_BOT_USERNAME', 'NoireBot');
    const { db, addGame } = await setup('RATING');
    await addPublic(db);
    await addGame(1, 'red');
    await db.run("UPDATE game_evenings SET status = 'completed', settled_at = ? WHERE id = 'ev'", [new Date().toISOString()]);
    const { calls, fetchImpl } = telegram();
    await runClubResultPosts(db, fetchImpl);
    const entry = calls.filter((form) => form.get('chat_id') === '@noire_entry');
    expect(entry).toHaveLength(1);
    expect(String(entry[0].get('caption'))).toMatch(/^🏁 Итоги вечера «Пятничный вечер»/);
    expect(String(entry[0].get('caption'))).toContain('https://t.me/NoireBot');
    await runClubResultPosts(db, fetchImpl);
    expect(calls.filter((form) => form.get('chat_id') === '@noire_entry')).toHaveLength(1);
  });

  it('an upgrade does not post evenings closed before the entry channel was switched on', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { db, addGame } = await setup('CASUAL');
    await addPublic(db);
    await db.run("DELETE FROM club_result_posts WHERE post_key = 'enabled-public'");
    await addGame(1, 'red');
    await db.run("UPDATE game_evenings SET status = 'completed', settled_at = ? WHERE id = 'ev'", [new Date().toISOString()]);
    const { calls, fetchImpl } = telegram();
    await runClubResultPosts(db, fetchImpl);
    expect(calls.filter((form) => form.get('chat_id') === '@noire_entry')).toHaveLength(0);
    // The club chat still gets the game blank and the summary.
    expect(calls.filter((form) => form.get('chat_id') === '-100500')).toHaveLength(2);
  });

  it('gets the «Мы собрались» photo once it reached the evening group', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { db } = await setup('CASUAL');
    await addPublic(db);
    const { ensureEveningGatheredPostSchema } = await import('../server/services/eveningGatheredPostService.ts');
    await ensureEveningGatheredPostSchema(db);
    const now = new Date().toISOString();
    await db.run(`INSERT INTO evening_gathered_posts (evening_id, image_data, mime_type, caption, telegram_status, created_at, updated_at)
      VALUES ('ev', ?, 'image/jpeg', '📸 Мы собрались!', 'published', ?, ?)`, [Buffer.from('jpeg-bytes').toString('base64'), now, now]);
    const { calls, fetchImpl } = telegram();
    await runClubResultPosts(db, fetchImpl);
    await runClubResultPosts(db, fetchImpl);
    const entry = calls.filter((form) => form.get('chat_id') === '@noire_entry');
    expect(entry).toHaveLength(1);
    expect(String(entry[0].get('caption'))).toMatch(/^📸 Мы собрались!/);
    expect((entry[0].get('photo') as Blob).type).toBe('image/jpeg');
  });

  it('gets the running seasons once a week, on Monday afternoon', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { db, addGame } = await setup('CASUAL');
    await addPublic(db);
    await addPeriod(db, 'CASUAL');
    await addGame(1, 'red');
    const { postWeeklySeasonTables } = await import('../server/services/clubResultPostService.ts');
    const { calls, fetchImpl } = telegram();
    // 2026-10-05 is a Monday; 10:00 UTC = 13:00 Moscow. Tuesday does nothing.
    expect(await postWeeklySeasonTables(db, fetchImpl, Date.parse('2026-10-06T10:00:00Z'))).toBe(false);
    expect(await postWeeklySeasonTables(db, fetchImpl, Date.parse('2026-10-05T07:00:00Z'))).toBe(false);
    expect(await postWeeklySeasonTables(db, fetchImpl, Date.parse('2026-10-05T10:00:00Z'))).toBe(true);
    expect(await postWeeklySeasonTables(db, fetchImpl, Date.parse('2026-10-05T12:00:00Z'))).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].get('chat_id')).toBe('@noire_entry');
    expect(String(calls[0].get('caption'))).toContain('«Осень 2026»');
  });
});
