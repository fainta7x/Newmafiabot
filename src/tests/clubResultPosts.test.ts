import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadEveningSummary, loadGameBlank } from '../server/services/clubResultData.ts';
import { eveningSummarySvg, gameBlankSvg, renderPng } from '../server/services/clubResultImages.ts';
import { runClubResultPosts } from '../server/services/clubResultPostService.ts';

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

const telegram = () => {
  const calls: FormData[] = [];
  const fetchImpl = (async (_url: string, init: any) => {
    calls.push(init.body as FormData);
    return new Response(JSON.stringify({ ok: true }));
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
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

  it('never posts evenings from before the feature was switched on', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const { db, addGame } = await setup('CASUAL', new Date(Date.now() - 30 * 3600_000).toISOString());
    await addGame(1, 'red');
    const { calls, fetchImpl } = telegram();
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
