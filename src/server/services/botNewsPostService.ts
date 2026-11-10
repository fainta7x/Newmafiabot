import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureDailyWordSchema } from '../../db/ensureDailyWordSchema.ts';
import { BOT_CHANGES_DIGEST } from '../data/botChangesDigest.ts';
import { dailyWordDay } from './dailyWordService.ts';
import { appUrl } from './gameResultCardService.ts';
import { claim, ensureClubResultPostSchema, finish, sendText } from './clubResultPostService.ts';
import { isEveningPublishingPaused } from './eveningPublishingPause.ts';

/** The «Новости» topic of the main group (owner, 2026-11-10): a daily daily-word invitation and an interesting digest of bot changes. */
const NEWS_DESTINATION = 'club_mvp';
const INVITE_HOUR_MSK = 10;
const DIGEST_HOUR_MSK = 18;
const DIGEST_EVERY_MS = 3 * 24 * 3_600_000;
const mskHour = (now: number) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));

const previousDayOf = (day: string) => dailyWordDay(new Date(new Date(`${day}T12:00:00+03:00`).getTime() - 86_400_000));

export async function dailyWordInviteText(db: DatabaseWrapper, day: string) {
  await ensureDailyWordSchema(db);
  const yesterday = previousDayOf(day);
  const puzzle = await db.get<{ answer: string }>('SELECT answer FROM daily_word_puzzles WHERE day = ?', [yesterday]);
  const lines = ['🔤 Слово дня уже ждёт! Угадаешь за 6 попыток — получишь 200 жетонов.'];
  if (puzzle) {
    const stats = await db.get<{ total: number; won: number }>(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END), 0) AS won FROM daily_word_sessions WHERE day = ?`, [yesterday]);
    const total = Number(stats?.total || 0);
    lines.push('', total > 0 ? `Вчера слово было «${puzzle.answer}»: отгадали ${Number(stats?.won || 0)} из ${total}.` : `Вчера слово было «${puzzle.answer}».`);
  }
  return lines.join('\n');
}

export async function runDailyWordInvitation(db: DatabaseWrapper, fetchImpl: typeof fetch, now: number) {
  if (mskHour(now) < INVITE_HOUR_MSK) return 0;
  const day = dailyWordDay(new Date(now));
  const key = `daily-word-invite:${day}`;
  if (!(await claim(db, key, 'daily-word-invite', '', null))) return 0;
  try {
    const link = appUrl('/player/daily-word');
    const result = await sendText(db, NEWS_DESTINATION, await dailyWordInviteText(db, day), fetchImpl, undefined,
      link ? { inline_keyboard: [[{ text: '🔤 Играть', url: link }]] } : undefined, { key: `club:${key}`, kind: 'club-result' });
    await finish(db, key, result);
    return result.ok ? 1 : 0;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return 0;
  }
}

export async function runBotChangesDigest(db: DatabaseWrapper, fetchImpl: typeof fetch, now: number) {
  if (mskHour(now) < DIGEST_HOUR_MSK) return 0;
  const last = await db.get<{ sent_at: string | null }>(`SELECT MAX(sent_at) AS sent_at FROM club_result_posts WHERE kind = 'bot-digest' AND status = 'sent'`);
  if (last?.sent_at && now - new Date(last.sent_at).getTime() < DIGEST_EVERY_MS) return 0;
  const sent = new Set((await db.all<{ post_key: string }>(`SELECT post_key FROM club_result_posts WHERE kind = 'bot-digest-entry'`)).map((row) => row.post_key));
  const pending = BOT_CHANGES_DIGEST.filter((entry) => !sent.has(`bot-digest-entry:${entry.id}`));
  if (!pending.length) return 0;
  const key = `bot-digest:${dailyWordDay(new Date(now))}`;
  if (!(await claim(db, key, 'bot-digest', '', null))) return 0;
  try {
    const text = ['✨ Что нового в боте клуба', ...pending.map((entry) => entry.text)].join('\n\n');
    const result = await sendText(db, NEWS_DESTINATION, text, fetchImpl, undefined, undefined, { key: `club:${key}`, kind: 'club-result' });
    await finish(db, key, result);
    if (result.ok) {
      const stamp = new Date(now).toISOString();
      for (const entry of pending) {
        await db.run(`INSERT OR IGNORE INTO club_result_posts (post_key, kind, status, attempts, sent_at, created_at, updated_at) VALUES (?, 'bot-digest-entry', 'sent', 1, ?, ?, ?)`, [`bot-digest-entry:${entry.id}`, stamp, stamp, stamp]);
      }
    }
    return result.ok ? 1 : 0;
  } catch (error: any) {
    await finish(db, key, { ok: false, temporary: true, error: error?.message || String(error) });
    return 0;
  }
}

export async function runBotNewsPosts(db: DatabaseWrapper, fetchImpl: typeof fetch = fetch, now = Date.now()) {
  if (isEveningPublishingPaused()) return 0;
  await ensureClubResultPostSchema(db);
  return (await runDailyWordInvitation(db, fetchImpl, now)) + (await runBotChangesDigest(db, fetchImpl, now));
}
