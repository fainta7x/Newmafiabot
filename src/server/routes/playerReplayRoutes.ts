import { Router } from 'express';
import { getPlayerSessionId } from '../auth.ts';

const router = Router();

const safeParse = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return JSON.parse(value); } catch { return null; }
};

const requirePlayerId = (req: any, res: any): string | null => {
  const playerId = getPlayerSessionId(req);
  if (!playerId) {
    res.status(401).json({ error: 'Player authentication required.' });
    return null;
  }
  return playerId;
};

const stringArray = (value: any) => Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];

const normalizeVoteRows = (value: any) => {
  if (!value) return [] as Array<{ candidate: string; votes: number }>;
  if (Array.isArray(value)) {
    return value.flatMap((item: any) => {
      if (item == null) return [];
      if (typeof item === 'string' || typeof item === 'number') return [{ candidate: String(item), votes: 1 }];
      const candidate = item.candidate_id ?? item.candidate ?? item.player_id ?? item.seat ?? item.seat_number;
      const votes = Number(item.votes ?? item.count ?? item.vote_count ?? 0);
      return candidate != null ? [{ candidate: String(candidate), votes: Number.isFinite(votes) ? votes : 0 }] : [];
    });
  }
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([candidate, count]) => {
      const votes = Number(count);
      return Number.isFinite(votes) ? [{ candidate, votes }] : [];
    });
  }
  return [];
};

router.get('/games/:gameKey/replay', async (req, res) => {
  const viewerId = requirePlayerId(req, res);
  if (!viewerId) return;
  const gameKey = String(req.params.gameKey || '');
  const [source, rawId] = gameKey.split(':', 2);
  if (!source || !rawId) return res.status(400).json({ error: 'Некорректный идентификатор игры' });

  try {
    const db = (req as any).db;
    if (source !== 'club') {
      return res.json({
        game_key: gameKey,
        replay_available: false,
        events: [],
        analysis: ['Подробный Replay сейчас доступен для клубных игр с сохранённым пошаговым протоколом.'],
      });
    }

    const row = await db.get(`
      SELECT g.id, g.global_game_number, g.protocol_text, g.winner_team, g.created_at,
             e.title AS evening_title
        FROM games g
   LEFT JOIN game_evenings e ON e.id = g.evening_id
       WHERE CAST(g.id AS TEXT) = ?
         AND g.archived_at IS NULL
       LIMIT 1
    `, [rawId]);
    if (!row) return res.status(404).json({ error: 'Игра не найдена' });
    const payload = safeParse(row.protocol_text);
    if (!payload || payload.kind !== 'club_evening_protocol' || payload.protocol?.status !== 'completed') {
      return res.status(409).json({ error: 'Replay доступен после завершения игры' });
    }

    const results = Array.isArray(payload.player_results) ? payload.player_results : [];
    const byId = new Map<string, string>();
    const bySeat = new Map<string, string>();
    for (const player of results) {
      const nickname = String(player.display_name || player.nickname || 'Игрок');
      if (player.player_id != null) byId.set(String(player.player_id), nickname);
      if (player.participant_id != null) byId.set(String(player.participant_id), nickname);
      if (player.seat_number != null) bySeat.set(String(player.seat_number), nickname);
    }
    const nameOf = (value: any) => {
      if (value == null) return null;
      const key = String(value);
      return byId.get(key) || bySeat.get(key) || (/^\d+$/.test(key) ? `Игрок #${key}` : key);
    };

    const protocol = payload.protocol || {};
    const rawRounds = Array.isArray(protocol.rounds) ? protocol.rounds
      : Array.isArray(protocol.voting_rounds) ? protocol.voting_rounds
        : Array.isArray(payload.rounds) ? payload.rounds
          : Array.isArray(payload.voting_rounds) ? payload.voting_rounds
            : [];

    const events: Array<any> = [];
    rawRounds.forEach((round: any, index: number) => {
      const number = Number(round.number ?? round.round ?? round.round_number ?? index + 1);
      events.push({ id: `round:${index}`, type: 'round', round: number, title: `Круг ${number}`, text: 'Дневная фаза' });
      const nominations = stringArray(round.nominations ?? round.nominated ?? round.candidates).map(nameOf).filter(Boolean);
      if (nominations.length) events.push({ id: `nominations:${index}`, type: 'nominations', round: number, title: 'Выставлены', text: nominations.join(', '), players: nominations });
      const voteRows = normalizeVoteRows(round.votes ?? round.voting ?? round.vote_result ?? round.results).map((vote) => ({ ...vote, candidate_name: nameOf(vote.candidate) }));
      if (voteRows.length) events.push({ id: `votes:${index}`, type: 'votes', round: number, title: 'Голосование', text: voteRows.map((vote) => `${vote.candidate_name}: ${vote.votes}`).join(' · '), votes: voteRows });
      const eliminated = round.eliminated ?? round.voted_out ?? round.removed ?? round.kicked;
      if (eliminated != null) events.push({ id: `eliminated:${index}`, type: 'eliminated', round: number, title: 'Стол покинул', text: String(nameOf(eliminated)), player: nameOf(eliminated) });
      const killed = round.night_kill ?? round.killed ?? round.night_killed ?? round.shot;
      if (killed != null) events.push({ id: `night:${index}`, type: 'night', round: number, title: 'Ночь', text: `Убит: ${nameOf(killed)}`, player: nameOf(killed) });
    });

    const firstKilled = protocol.first_killed ?? protocol.first_killed_player ?? payload.first_killed;
    if (firstKilled != null && !events.some((event) => event.type === 'night' && event.player === nameOf(firstKilled))) {
      events.push({ id: 'first-killed', type: 'first_killed', title: 'Первое убийство', text: String(nameOf(firstKilled)), player: nameOf(firstKilled) });
    }

    const ppk = protocol.ppk_culprit ?? protocol.ppk_player ?? payload.ppk_culprit;
    if (ppk != null) events.push({ id: 'ppk', type: 'ppk', title: 'ППК', text: String(nameOf(ppk)), player: nameOf(ppk) });

    const bestMoves = results.filter((player: any) => player.best_move || player.is_best_move || (Array.isArray(player.best_move_seats) && player.best_move_seats.length));
    for (const player of bestMoves) {
      const seats = stringArray(player.best_move_seats ?? player.best_move).map(nameOf).filter(Boolean);
      events.push({
        id: `best:${String(player.participant_id || player.player_id || player.seat_number)}`,
        type: 'best_move',
        title: 'Лучший ход',
        text: `${String(player.display_name || player.nickname || 'Игрок')}${seats.length ? ` оставил: ${seats.join(', ')}` : ''}`,
      });
    }

    const winner = String(protocol.winner_team || row.winner_team || '').toLowerCase();
    const winnerLabel = winner === 'red' ? 'Красные' : winner === 'black' ? 'Чёрные' : winner || 'Команда';
    events.push({ id: 'finish', type: 'finish', title: 'Игра завершена', text: `Победа: ${winnerLabel}` });

    const analysis: string[] = [];
    const voteEvents = events.filter((event) => event.type === 'votes');
    const eliminationEvents = events.filter((event) => event.type === 'eliminated');
    if (voteEvents.length) analysis.push(`За игру зафиксировано ${voteEvents.length} голосовани${voteEvents.length === 1 ? 'е' : 'й'} и ${eliminationEvents.length} уход(а) со стола по дневному решению.`);
    if (ppk != null) analysis.push(`Ключевым событием стал ППК игрока ${nameOf(ppk)} — по правилам он завершает игру победой противоположной команды.`);
    if (firstKilled != null) analysis.push(`Первым ночью стол покинул ${nameOf(firstKilled)}; его посмертная информация отмечена в протоколе.`);
    if (bestMoves.length) analysis.push(`Лучший ход зафиксирован у ${bestMoves.map((player: any) => String(player.display_name || player.nickname || 'игрока')).join(', ')}.`);
    if (!analysis.length) analysis.push('Протокол завершён; дополнительных автоматически выделяемых переломных событий не найдено.');

    return res.json({
      game_key: gameKey,
      replay_available: true,
      game: {
        id: String(row.id),
        number: Number(row.global_game_number || 0),
        title: String(row.evening_title || 'Клубная игра'),
        created_at: row.created_at || null,
        winner_team: winner === 'red' || winner === 'black' ? winner : null,
      },
      players: results.map((player: any) => ({
        participant_id: String(player.participant_id || ''),
        player_id: player.player_id ? String(player.player_id) : null,
        nickname: String(player.display_name || player.nickname || 'Игрок'),
        seat_number: Number(player.seat_number || 0),
        role: player.role || null,
      })).sort((a: any, b: any) => a.seat_number - b.seat_number),
      events,
      analysis,
      meta: {
        source: 'События восстановлены из сохранённого завершённого клубного протокола. Если старый протокол не содержал пошаговые раунды, Replay показывает только доступные ключевые события.',
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Не удалось собрать Replay игры' });
  }
});

export default router;
