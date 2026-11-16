import { randomUUID } from 'node:crypto';
import type { DatabaseWrapper } from '../../db/index.ts';
import { ensureDrawingTelephoneSchema } from '../../db/ensureDrawingTelephoneSchema.ts';
import {
  TELEPHONE_MAX_LINKS, TELEPHONE_MIN_LINKS, TELEPHONE_REWARD, TELEPHONE_TEXT_MAX, TELEPHONE_TURN_HOURS,
  normalizeTelephonePhrase, telephoneLinkKind, telephoneWords,
  type TelephoneChainState, type TelephoneItem, type TelephoneListState, type TelephonePlayer, type TelephoneStep,
} from '../../shared/drawingTelephone.ts';
import { mutateTokenBalance } from './tokenLedgerService.ts';

/** «Испорченный телефон с рисунками» (owner, 2026-11-16); rules in docs/BUSINESS_RULES.md. */
export class TelephoneError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type Chain = {
  id: string; author_player_id: string; guesser_player_id: string; phrase: string; length: number;
  status: 'active' | 'done'; step: TelephoneStep | null; current_player_id: string | null;
  turn_started_at: string | null; deadline_at: string | null; reminded: number; excluded_json: string;
  guess: string | null; finished_at: string | null; published: number; created_at: string;
};
type Link = { position: number; player_id: string; kind: 'drawing' | 'caption'; text: string | null; image_png: string | null };
export type TelephoneNotice = { playerId: string; key: string; text: string; chainId: string };
const TURN_MS = TELEPHONE_TURN_HOURS * 3_600_000;
const MAX_PNG_BYTES = 400_000;

/** Players who can take part: a profile with Telegram or VK linked, so the bot can tell them «твой ход». */
export async function telephonePlayers(db: DatabaseWrapper): Promise<TelephonePlayer[]> {
  return db.all<TelephonePlayer>(`
    SELECT DISTINCT p.id, p.nickname FROM players p
      LEFT JOIN player_external_identities vk ON vk.player_id = p.id AND vk.platform = 'vk'
     WHERE (p.telegram_user_id IS NOT NULL AND TRIM(p.telegram_user_id) != '') OR (vk.external_user_id IS NOT NULL AND TRIM(vk.external_user_id) != '')
     ORDER BY p.nickname COLLATE NOCASE`).catch(async () => db.all<TelephonePlayer>(`SELECT id, nickname FROM players WHERE telegram_user_id IS NOT NULL AND TRIM(telegram_user_id) != '' ORDER BY nickname COLLATE NOCASE`));
}
const nicknameOf = async (db: DatabaseWrapper, id: string | null) => id ? (await db.get<{ nickname: string }>('SELECT nickname FROM players WHERE id = ?', [id]))?.nickname || '—' : '—';
const linksOf = (db: DatabaseWrapper, chainId: string) => db.all<Link>('SELECT position, player_id, kind, text, image_png FROM telephone_links WHERE chain_id = ? ORDER BY position', [chainId]);
const loadChain = async (db: DatabaseWrapper, id: string) => {
  const chain = await db.get<Chain>('SELECT * FROM telephone_chains WHERE id = ?', [id]);
  if (!chain) throw new TelephoneError(404, 'Цепочка не найдена');
  return chain;
};
/** Who may still get the turn: not the author, not the guesser, nobody who already moved, declined or let the time run out. */
async function blockedIds(db: DatabaseWrapper, chain: Chain) {
  const links = await linksOf(db, chain.id);
  return new Set([chain.author_player_id, chain.guesser_player_id, ...links.map((link) => link.player_id), ...(JSON.parse(chain.excluded_json) as string[])]);
}
async function pay(tx: DatabaseWrapper, playerId: string, chainId: string, what: string) {
  await mutateTokenBalance(tx, { playerId, delta: TELEPHONE_REWARD, debitPolicy: 'allow_negative', reasonType: 'telephone_move', description: 'Испорченный телефон: ход', sourceType: 'telephone', sourceId: chainId, idempotencyKey: `telephone:${chainId}:${what}`, actorType: 'system', metadata: { chain_id: chainId, move: what } });
}
/** Request fields are taken only as plain strings or numbers (an array or an object counts as missing). */
const idOf = (value: unknown) => typeof value === 'string' ? value : '';
const numberOf = (value: unknown) => typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
const cleanText = (value: unknown, field: string) => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!text) throw new TelephoneError(400, `Напишите ${field}`);
  if (text.length > TELEPHONE_TEXT_MAX) throw new TelephoneError(400, `Не длиннее ${TELEPHONE_TEXT_MAX} символов`);
  return text;
};
const cleanImage = (value: unknown) => {
  const raw = typeof value === 'string' ? value.replace(/^data:image\/png;base64,/, '') : '';
  const bytes = Buffer.from(raw, 'base64');
  if (!raw || bytes.length < 100 || bytes.length > MAX_PNG_BYTES || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new TelephoneError(400, 'Не удалось принять рисунок');
  return bytes.toString('base64');
};

export async function loadTelephoneList(db: DatabaseWrapper, playerId: string): Promise<TelephoneListState> {
  await ensureDrawingTelephoneSchema(db);
  const turns = await db.all<Chain & { done: number }>(`SELECT c.*, (SELECT COUNT(*) FROM telephone_links l WHERE l.chain_id = c.id) AS done FROM telephone_chains c WHERE c.status = 'active' AND c.current_player_id = ? ORDER BY c.deadline_at`, [playerId]);
  const active = await db.get<Chain & { done: number }>(`SELECT c.*, (SELECT COUNT(*) FROM telephone_links l WHERE l.chain_id = c.id) AS done FROM telephone_chains c WHERE c.status = 'active' AND c.author_player_id = ? LIMIT 1`, [playerId]);
  const finished = await db.all<Chain & { author: string; guesser: string }>(`SELECT c.*, a.nickname AS author, g.nickname AS guesser FROM telephone_chains c JOIN players a ON a.id = c.author_player_id JOIN players g ON g.id = c.guesser_player_id WHERE c.status = 'done' ORDER BY c.finished_at DESC LIMIT 30`);
  const covers = new Map((await Promise.all(finished.map(async (chain) => [chain.id, (await db.get<{ image_png: string }>(`SELECT image_png FROM telephone_links WHERE chain_id = ? AND kind = 'drawing' ORDER BY position LIMIT 1`, [chain.id]))?.image_png || null] as const))));
  return {
    my_turns: await Promise.all(turns.map(async (chain) => ({ id: chain.id, step: chain.step!, position: Number(chain.done) + 1, length: chain.length, author: await nicknameOf(db, chain.author_player_id), deadline_at: chain.deadline_at }))),
    my_active: active ? { id: active.id, done_links: Number(active.done), length: active.length, current: active.current_player_id ? await nicknameOf(db, active.current_player_id) : null } : null,
    finished: finished.map((chain) => ({ id: chain.id, author: chain.author, guesser: chain.guesser, phrase: chain.phrase, guess: chain.guess, length: chain.length, finished_at: chain.finished_at!, cover: covers.get(chain.id) || null })),
    reward: TELEPHONE_REWARD,
  };
}

export async function loadTelephoneChain(db: DatabaseWrapper, playerId: string, chainId: string): Promise<TelephoneChainState> {
  await ensureDrawingTelephoneSchema(db);
  const chain = await loadChain(db, chainId);
  const links = await linksOf(db, chain.id);
  const names = new Map<string, string>();
  const name = async (id: string) => { if (!names.has(id)) names.set(id, await nicknameOf(db, id)); return names.get(id)!; };
  const item = async (link: Link): Promise<TelephoneItem> => ({ kind: link.kind, position: link.position, nickname: await name(link.player_id), text: link.text, image: link.image_png });
  const phraseItem = async (): Promise<TelephoneItem> => ({ kind: 'phrase', position: 0, nickname: await name(chain.author_player_id), text: chain.phrase, image: null });
  const mine = chain.status === 'active' && chain.current_player_id === playerId;
  let items: TelephoneItem[] = [];
  if (chain.status === 'done') {
    items = [await phraseItem(), ...(await Promise.all(links.map(item)))];
    if (chain.guess !== null) items.push({ kind: 'guess', position: chain.length + 1, nickname: await name(chain.guesser_player_id), text: chain.guess, image: null });
  } else if (mine && chain.step === 'move') {
    items = [links.length ? await item(links[links.length - 1]) : await phraseItem()];
  } else if (mine && chain.step === 'guess') {
    items = await Promise.all(links.slice(-2).map(item));
  } else if (playerId === chain.author_player_id) {
    items = [await phraseItem()];
  }
  const position = links.length + 1;
  return {
    id: chain.id, status: chain.status, length: chain.length, done_links: links.length,
    author: { id: chain.author_player_id, nickname: await name(chain.author_player_id) },
    guesser: { id: chain.guesser_player_id, nickname: await name(chain.guesser_player_id) },
    current: chain.current_player_id ? { id: chain.current_player_id, nickname: await name(chain.current_player_id) } : null,
    step: chain.step, deadline_at: chain.deadline_at, created_at: chain.created_at, finished_at: chain.finished_at,
    my_task: !mine ? null : chain.step === 'guess' ? { step: 'guess', kind: 'guess', position, last: true }
      : chain.step === 'move' ? { step: 'move', kind: telephoneLinkKind(position), position, last: position === chain.length }
      : { step: chain.step!, kind: null, position, last: false },
    items,
    players: await Promise.all([...new Set(links.map((link) => link.player_id))].map(async (id) => ({ id, nickname: await name(id) }))),
  };
}

/** Who can get the turn now (for the author at the start: anybody but himself). */
export async function telephoneCandidates(db: DatabaseWrapper, playerId: string, chainId?: string | null) {
  await ensureDrawingTelephoneSchema(db);
  const all = await telephonePlayers(db);
  if (!chainId) return all.filter((player) => player.id !== playerId);
  const chain = await loadChain(db, chainId);
  const blocked = await blockedIds(db, chain);
  return all.filter((player) => !blocked.has(player.id));
}

const notice = (playerId: string, key: string, chainId: string, text: string): TelephoneNotice => ({ playerId, key, chainId, text });
const guessNotice = (chainId: string, to: string) => notice(to, `telephone:${chainId}:guess:${to}`, chainId, `🔎 Твоя очередь отгадывать в «Испорченном телефоне с рисунками»: посмотри последний рисунок и подпись и напиши, какой была исходная фраза. На ответ ${TELEPHONE_TURN_HOURS} часов.`);
const moveText = (position: number) => telephoneLinkKind(position) === 'drawing' ? 'нарисуй, что написано' : 'подпиши, что нарисовано';

export async function startTelephoneChain(db: DatabaseWrapper, playerId: string, input: { phrase?: unknown; links?: unknown; guesser_id?: unknown; next_id?: unknown }, now = new Date()) {
  await ensureDrawingTelephoneSchema(db);
  const phrase = cleanText(input.phrase, 'фразу');
  const key = normalizeTelephonePhrase(phrase);
  if (!key) throw new TelephoneError(400, 'Напишите фразу словами');
  const length = numberOf(input.links);
  if (!Number.isInteger(length) || length < TELEPHONE_MIN_LINKS || length > TELEPHONE_MAX_LINKS) throw new TelephoneError(400, `Звеньев — от ${TELEPHONE_MIN_LINKS} до ${TELEPHONE_MAX_LINKS}`);
  const guesser = idOf(input.guesser_id), next = idOf(input.next_id);
  const allowed = new Set((await telephonePlayers(db)).map((player) => player.id));
  if (!allowed.has(guesser) || guesser === playerId) throw new TelephoneError(400, 'Выберите, кто будет отгадывать');
  if (!allowed.has(next) || next === playerId || next === guesser) throw new TelephoneError(400, 'Выберите, кому передать первый ход');
  const id = randomUUID();
  const stamp = now.toISOString();
  await db.transaction(async (tx) => {
    if (await tx.get(`SELECT id FROM telephone_chains WHERE author_player_id = ? AND status = 'active'`, [playerId])) throw new TelephoneError(409, 'Ваша цепочка ещё идёт. Новую можно начать, когда она закончится.');
    if (await tx.get('SELECT id FROM telephone_chains WHERE phrase_key = ?', [key])) throw new TelephoneError(409, 'С такой фразы уже начинали. Придумайте другую.');
    await tx.run(`INSERT INTO telephone_chains (id, author_player_id, guesser_player_id, phrase, phrase_key, length, status, step, current_player_id, turn_started_at, deadline_at, created_at, updated_at) VALUES (?,?,?,?,?,?,'active','move',?,?,?,?,?)`,
      [id, playerId, guesser, phrase, key, length, next, stamp, new Date(now.getTime() + TURN_MS).toISOString(), stamp, stamp]);
    await pay(tx, playerId, id, 'phrase');
  });
  return { chain: await loadTelephoneChain(db, playerId, id), notices: [notice(next, `telephone:${id}:turn:1:${next}`, id, `🎨 Тебе передали ход в «Испорченном телефоне с рисунками»: ${moveText(1)}. На ход ${TELEPHONE_TURN_HOURS} часов.`)] };
}

/** A drawing or a caption, then the turn goes to the chosen player (or to the guesser after the last link). */
export async function moveTelephoneChain(db: DatabaseWrapper, playerId: string, chainId: string, input: { text?: unknown; image?: unknown; next_id?: unknown; position?: unknown }, now = new Date()) {
  await ensureDrawingTelephoneSchema(db);
  const notices: TelephoneNotice[] = [];
  await db.transaction(async (tx) => {
    const chain = await loadChain(tx, chainId);
    if (chain.status !== 'active' || chain.current_player_id !== playerId || chain.step !== 'move') throw new TelephoneError(409, 'Сейчас не ваш ход');
    const links = await linksOf(tx, chainId);
    const position = links.length + 1;
    if (input.position !== undefined && numberOf(input.position) !== position) throw new TelephoneError(409, 'Цепочка изменилась. Данные обновлены.');
    const kind = telephoneLinkKind(position);
    let text: string | null = null, image: string | null = null;
    if (kind === 'drawing') image = cleanImage(input.image);
    else {
      text = cleanText(input.text, 'подпись');
      const used = new Set(links.filter((link) => link.kind === 'caption').flatMap((link) => [...telephoneWords(link.text || '').keys()]));
      const repeated = [...telephoneWords(text)].filter(([stem]) => used.has(stem)).map(([, word]) => word);
      if (repeated.length) throw new TelephoneError(400, `Слово «${repeated[0]}» уже было в подписях этой цепочки (в этой или другой форме). Опишите другими словами.`);
    }
    const last = position === chain.length;
    let next: string | null = null;
    if (!last) {
      next = idOf(input.next_id);
      const blocked = await blockedIds(tx, chain);
      blocked.add(playerId);
      if (!next || blocked.has(next) || !(await telephonePlayers(tx)).some((player) => player.id === next)) throw new TelephoneError(400, 'Выберите, кому передать ход: тому, кто ещё не ходил');
    }
    const stamp = now.toISOString();
    await tx.run('INSERT INTO telephone_links (chain_id, position, player_id, kind, text, image_png, created_at) VALUES (?,?,?,?,?,?,?)', [chainId, position, playerId, kind, text, image, stamp]);
    const to = last ? chain.guesser_player_id : next!;
    await tx.run(`UPDATE telephone_chains SET step = ?, current_player_id = ?, turn_started_at = ?, deadline_at = ?, reminded = 0, updated_at = ? WHERE id = ?`,
      [last ? 'guess' : 'move', to, stamp, new Date(now.getTime() + TURN_MS).toISOString(), stamp, chainId]);
    await pay(tx, playerId, chainId, `link-${position}`);
    notices.push(last
      ? guessNotice(chainId, to)
      : notice(to, `telephone:${chainId}:turn:${position + 1}:${to}`, chainId, `🎨 Тебе передали ход в «Испорченном телефоне с рисунками»: ${moveText(position + 1)}. На ход ${TELEPHONE_TURN_HOURS} часов.`));
  });
  return { chain: await loadTelephoneChain(db, playerId, chainId), notices };
}

/**
 * After a return the chooser picks somebody else (8 hours): for a link — who has not moved yet; for the guesser (the
 * author, owner 2026-11-16) — a new last link who has not been in the chain.
 */
export async function chooseTelephoneNext(db: DatabaseWrapper, playerId: string, chainId: string, input: { next_id?: unknown }, now = new Date()) {
  await ensureDrawingTelephoneSchema(db);
  const notices: TelephoneNotice[] = [];
  await db.transaction(async (tx) => {
    const chain = await loadChain(tx, chainId);
    if (chain.status !== 'active' || chain.current_player_id !== playerId || (chain.step !== 'choose' && chain.step !== 'choose_guesser')) throw new TelephoneError(409, 'Сейчас не нужно выбирать');
    const next = idOf(input.next_id);
    const blocked = await blockedIds(tx, chain);
    if (!next || blocked.has(next) || !(await telephonePlayers(tx)).some((player) => player.id === next)) throw new TelephoneError(400, chain.step === 'choose' ? 'Выберите, кому передать ход: тому, кто ещё не ходил' : 'Выберите того, кто ещё не был в этой цепочке');
    const position = (await linksOf(tx, chainId)).length + 1;
    const stamp = now.toISOString();
    const deadline = new Date(now.getTime() + TURN_MS).toISOString();
    if (chain.step === 'choose_guesser') {
      await tx.run(`UPDATE telephone_chains SET step = 'guess', guesser_player_id = ?, current_player_id = ?, turn_started_at = ?, deadline_at = ?, reminded = 0, updated_at = ? WHERE id = ?`, [next, next, stamp, deadline, stamp, chainId]);
      notices.push(guessNotice(chainId, next));
      return;
    }
    await tx.run(`UPDATE telephone_chains SET step = 'move', current_player_id = ?, turn_started_at = ?, deadline_at = ?, reminded = 0, updated_at = ? WHERE id = ?`, [next, stamp, deadline, stamp, chainId]);
    notices.push(notice(next, `telephone:${chainId}:turn:${position}:${next}`, chainId, `🎨 Тебе передали ход в «Испорченном телефоне с рисунками»: ${moveText(position)}. На ход ${TELEPHONE_TURN_HOURS} часов.`));
  });
  return { chain: await loadTelephoneChain(db, playerId, chainId), notices };
}

export async function guessTelephoneChain(db: DatabaseWrapper, playerId: string, chainId: string, input: { text?: unknown }, now = new Date()) {
  await ensureDrawingTelephoneSchema(db);
  const notices: TelephoneNotice[] = [];
  await db.transaction(async (tx) => {
    const chain = await loadChain(tx, chainId);
    if (chain.status !== 'active' || chain.current_player_id !== playerId || chain.step !== 'guess') throw new TelephoneError(409, 'Сейчас не ваш ход');
    const guess = cleanText(input.text, 'отгадку');
    await finishChain(tx, chain, guess, now, notices);
    await pay(tx, playerId, chainId, 'guess');
  });
  return { chain: await loadTelephoneChain(db, playerId, chainId), notices };
}

/** «Не хочу / нет времени»: the turn returns at once, as when the 8 hours run out. */
export async function declineTelephoneTurn(db: DatabaseWrapper, playerId: string, chainId: string, now = new Date()) {
  await ensureDrawingTelephoneSchema(db);
  const notices: TelephoneNotice[] = [];
  await db.transaction(async (tx) => {
    const chain = await loadChain(tx, chainId);
    if (chain.status !== 'active' || chain.current_player_id !== playerId || (chain.step !== 'move' && chain.step !== 'guess')) throw new TelephoneError(409, 'Сейчас не ваш ход');
    await returnTurn(tx, chain, now, notices, 'отказался');
  });
  return { notices };
}

async function finishChain(tx: DatabaseWrapper, chain: Chain, guess: string | null, now: Date, notices: TelephoneNotice[]) {
  const stamp = now.toISOString();
  await tx.run(`UPDATE telephone_chains SET status = 'done', step = NULL, current_player_id = NULL, deadline_at = NULL, guess = ?, finished_at = ?, updated_at = ? WHERE id = ?`, [guess, stamp, stamp, chain.id]);
  const everyone = new Set([chain.author_player_id, chain.guesser_player_id, ...(await linksOf(tx, chain.id)).map((link) => link.player_id)]);
  for (const id of everyone) notices.push(notice(id, `telephone:${chain.id}:done:${id}`, chain.id, '🎉 Цепочка «Испорченного телефона с рисунками» готова — посмотри, во что превратилась фраза!'));
}

/**
 * Somebody declined or let 8 hours pass (owner, 2026-11-16: «логика всегда одна и та же»):
 * - a link → the one who passed him the turn chooses another player;
 * - a chooser → choosing goes one link back, up to the author;
 * - the guesser → the author chooses another last link, not one of the chain;
 * - the author himself does not choose → the chain waits for him and he is reminded every 8 hours.
 */
async function returnTurn(tx: DatabaseWrapper, chain: Chain, now: Date, notices: TelephoneNotice[], why: string) {
  const late = chain.current_player_id!;
  const lateName = await nicknameOf(tx, late);
  const links = await linksOf(tx, chain.id);
  const stamp = now.toISOString();
  const deadline = new Date(now.getTime() + TURN_MS).toISOString();
  const excluded = JSON.parse(chain.excluded_json) as string[];
  const set = async (step: TelephoneStep, to: string, addExcluded: boolean) => {
    const list = addExcluded ? [...new Set([...excluded, late])] : excluded;
    await tx.run(`UPDATE telephone_chains SET step = ?, current_player_id = ?, turn_started_at = ?, deadline_at = ?, reminded = 0, excluded_json = ?, updated_at = ? WHERE id = ?`, [step, to, stamp, deadline, JSON.stringify(list), stamp, chain.id]);
  };
  if (chain.step === 'move') {
    const back = links.length ? links[links.length - 1].player_id : chain.author_player_id;
    await set('choose', back, true);
    notices.push(notice(back, `telephone:${chain.id}:back:${links.length + 1}:${late}`, chain.id, `↩️ Ход в «Испорченном телефоне с рисунками» вернулся к тебе: ${lateName} ${why}. Выбери, кому передать его теперь. На выбор ${TELEPHONE_TURN_HOURS} часов.`));
  } else if (chain.step === 'guess') {
    await set('choose_guesser', chain.author_player_id, true);
    notices.push(notice(chain.author_player_id, `telephone:${chain.id}:guesser-back:${late}`, chain.id, `↩️ ${lateName} ${why} отгадать твою цепочку в «Испорченном телефоне с рисунками». Выбери другого отгадывающего — того, кто не был в цепочке. На выбор ${TELEPHONE_TURN_HOURS} часов.`));
  } else if (late === chain.author_player_id) {
    await set(chain.step!, late, false);
    notices.push(notice(late, `telephone:${chain.id}:author-wait:${stamp}`, chain.id, '⏳ Твоя цепочка в «Испорченном телефоне с рисунками» ждёт тебя: выбери, кому передать ход.'));
  } else {
    const at = links.findIndex((link) => link.player_id === late);
    const up = at > 0 ? links[at - 1].player_id : chain.author_player_id;
    await set('choose', up, false);
    notices.push(notice(up, `telephone:${chain.id}:up:${links.length + 1}:${late}:${stamp}`, chain.id, `↩️ В «Испорченном телефоне с рисунками» ${lateName} не выбрал, кому передать ход. Выбери ты — того, кто ещё не ходил. На выбор ${TELEPHONE_TURN_HOURS} часов.`));
  }
}

/** Every minute: a reminder halfway through the 8 hours, and the return of a turn whose time has run out. */
export async function runTelephoneTimers(db: DatabaseWrapper, now = new Date()) {
  await ensureDrawingTelephoneSchema(db);
  const notices: TelephoneNotice[] = [];
  const due = await db.all<Chain>(`SELECT * FROM telephone_chains WHERE status = 'active' AND deadline_at IS NOT NULL AND (deadline_at <= ? OR (reminded = 0 AND deadline_at <= ?))`, [now.toISOString(), new Date(now.getTime() + TURN_MS / 2).toISOString()]);
  for (const row of due) {
    await db.transaction(async (tx) => {
      const chain = await tx.get<Chain>('SELECT * FROM telephone_chains WHERE id = ?', [row.id]);
      if (!chain || chain.status !== 'active' || chain.deadline_at !== row.deadline_at || chain.current_player_id !== row.current_player_id) return;
      if (chain.deadline_at! <= now.toISOString()) { await returnTurn(tx, chain, now, notices, `не успел за ${TELEPHONE_TURN_HOURS} часов`); return; }
      await tx.run('UPDATE telephone_chains SET reminded = 1 WHERE id = ?', [chain.id]);
      notices.push(notice(chain.current_player_id!, `telephone:${chain.id}:remind:${chain.turn_started_at}`, chain.id, `⏳ Напоминание: твой ход в «Испорченном телефоне с рисунками». Осталось около ${TELEPHONE_TURN_HOURS / 2} часов, потом ход вернётся.`));
    });
  }
  return notices;
}

/** Finished chains not yet posted to «Новости». */
export async function telephoneChainsToPublish(db: DatabaseWrapper) {
  await ensureDrawingTelephoneSchema(db);
  return db.all<{ id: string }>(`SELECT id FROM telephone_chains WHERE status = 'done' AND published = 0 ORDER BY finished_at LIMIT 3`);
}
export async function markTelephonePublished(db: DatabaseWrapper, chainId: string) {
  await db.run('UPDATE telephone_chains SET published = 1 WHERE id = ?', [chainId]);
}
/** The post: the drawings as an album and the whole way of the phrase in the caption. */
export async function telephonePost(db: DatabaseWrapper, chainId: string) {
  const chain = await loadChain(db, chainId);
  const links = await linksOf(db, chainId);
  const name = (id: string) => nicknameOf(db, id);
  const lines = ['🎨 Испорченный телефон с рисунками', '', `Начало — ${await name(chain.author_player_id)}: «${chain.phrase}»`];
  for (const link of links) lines.push(link.kind === 'drawing' ? `${link.position}. ${await name(link.player_id)} — рисунок` : `${link.position}. ${await name(link.player_id)}: «${link.text}»`);
  lines.push('', chain.guess !== null ? `Отгадка — ${await name(chain.guesser_player_id)}: «${chain.guess}»` : `${await name(chain.guesser_player_id)} не успел отгадать.`);
  const photos = links.filter((link) => link.kind === 'drawing' && link.image_png).slice(0, 10).map((link) => Buffer.from(link.image_png!, 'base64'));
  return { caption: lines.join('\n').slice(0, 1000), photos };
}
