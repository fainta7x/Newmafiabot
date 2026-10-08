import type { StatGame, StatRole } from '../../lib/gameStatistics.ts';
import { blackRole, redRole, gameActionFacts } from '../../lib/gameActionFacts.ts';
import { ACHIEVEMENT_STORIES, type StoryResult } from '../../lib/achievementStories.ts';
import { loadStatGames } from './gameStatisticsService.ts';

export function buildAchievementStories(games: StatGame[], playerId: string): Record<string, StoryResult> {
  const result: Record<string, StoryResult> = Object.fromEntries(ACHIEVEMENT_STORIES.map(a => [a.id, { current: 0 }]));
  const winRoles = new Set<StatRole>();
  const evenings = new Map<string, Set<string>>();
  const award = (id: string, game: StatGame, detail: string) => {
    if (result[id].current) return;
    result[id] = { current: 1, evidence: { gameId: game.id, eventId: game.eventId, date: game.date, detail } };
  };
  const seen = new Set<string>();
  for (const game of [...games].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    if (seen.has(game.id)) continue;
    seen.add(game.id);
    const mine = game.seats.find(s => s.playerId === playerId);
    if (!mine?.role || !game.winner) continue;
    const facts = gameActionFacts(game);
    const won = (redRole(mine.role) ? 'red' : 'black') === game.winner;
    if (won) {
      winRoles.add(mine.role);
      const key = `${game.source}:${game.eventId}`;
      if (game.eventId) {
        const colors = evenings.get(key) || new Set(); colors.add(game.winner); evenings.set(key, colors);
        if (colors.size === 2) award('full_shift', game, 'Победы обоими цветами за один вечер.');
      }
      if (winRoles.size === 4) award('four_faces', game, 'Получена победа четвёртой ролью.');
    }
    if (mine.role === 'citizen' && won && facts.ordinary) {
      for (const voting of facts.votings) {
        const target = voting.votes.get(mine.seat);
        if (!target || target !== voting.eliminated || !blackRole(facts.roleOf(target))) continue;
        if (voting.nominations.some(n => n.by === mine.seat && n.seat === target)) award('case_closed', game, `Выставил и проголосовал за чёрного №${target}, который заголосован.`);
        if (voting.alive?.size === 3 && voting.alive.has(mine.seat)
          && [...voting.alive].filter(s => blackRole(facts.roleOf(s))).length === 1
          && facts.alive && [...facts.alive].every(s => redRole(facts.roleOf(s)))) award('last_argument', game, `Голос за последнего чёрного №${target} на тройке.`);
      }
    }
    const blacks = game.seats.filter(s => blackRole(s.role)).map(s => s.seat);
    if (redRole(mine.role) && game.seats.length === 10 && blacks.length === 3) {
      // The log is additive: restoration retracts the PU marker, and a new marker replaces the old one.
      let first: (typeof facts.events)[number] | undefined;
      let move: (typeof facts.events)[number] | undefined;
      for (const event of facts.events) {
        if (event.kind === 'first_killed') { first = event; move = undefined; }
        else if (event.kind === 'restored' && event.seat === first?.seat) { first = undefined; move = undefined; }
        else if (event.kind === 'best_move' && first && event.seat === first.seat) move = event;
      }
      const guesses = String(move?.value || '').split(',').map(Number);
      if (first?.seat === mine.seat && move && guesses.length === 3 && new Set(guesses).size === 3 && guesses.every(s => game.seats.some(p => p.seat === s) && s !== mine.seat)) {
        const hits = guesses.filter(s => blacks.includes(s));
        if (hits.length >= 2) award('two_shadows', game, `ЛХ ПУ: ${guesses.join(', ')}; чёрных: ${hits.length}.`);
        if (hits.length === 3) award('whole_picture', game, `В ЛХ ПУ названа вся чёрная тройка: ${guesses.join(', ')}.`);
        if (facts.full && won && hits.length >= 2 && hits.every(s => facts.events.some(e => e.kind === 'exit' && e.seat === s && e.seq > move.seq && String(e.value) === 'voted_day')))
          award('trail_remains', game, 'Названные в ЛХ чёрные затем заголосованы, красные выиграли.');
      }
    }
    if (!facts.full || !won || !facts.ordinary) continue;
    if (mine.role === 'sheriff') {
      const checks = facts.checks.filter(c => c.kind === 'sheriff' && blackRole(facts.roleOf(c.target)));
      if (new Set(checks.map(c => c.target)).size >= 2) award('two_cases', game, 'Две разные чёрные проверки в выигранной партии.');
      const death = facts.events.find(e => e.kind === 'exit' && e.seat === mine.seat && e.value === 'killed');
      if (death && checks.some(c => c.seq < death.seq && facts.events.some(e => e.kind === 'exit' && e.seat === c.target && e.value === 'voted_day' && e.seq > death.seq)))
        award('case_handed_over', game, 'Проверенный чёрный заголосован после убийства шерифа.');
    }
    if (mine.role === 'don' && facts.checks.some(c => c.kind === 'don' && facts.roleOf(c.target) === 'sheriff'))
      award('identity_found', game, 'Шериф найден действительной ночной проверкой до его ухода.');
    if (blackRole(mine.role) && facts.alive?.has(mine.seat)) {
      const alone = [...facts.atSeq.values()].some(state => state.has(mine.seat) && [...state].filter(s => blackRole(facts.roleOf(s))).length === 1 && [...state].filter(s => redRole(facts.roleOf(s))).length >= 2);
      if (alone) award('alone_in_shadow', game, 'Единственный живой чёрный против минимум двух красных дожил до победы.');
    }
  }
  result.four_faces.steps = ['citizen','sheriff','mafia','don'].filter(r => winRoles.has(r as StatRole));
  result.four_faces.target = 4;
  // The evaluator threshold is 1; fractional completion is only used by the UI.
  if (!result.four_faces.current) result.four_faces.current = winRoles.size / 4;
  return result;
}

export async function loadPlayerAchievementStories(db: any, playerId: string): Promise<Record<string, StoryResult>> {
  const games = await loadStatGames(db);
  const stories = buildAchievementStories(games, playerId);
  const evidence = (id: string, current: number, date: string, detail: string, gameId: string | null = null) => {
    if (current >= 1 && stories[id].evidence && stories[id].evidence!.date <= date) return;
    stories[id] = { current, evidence: current >= 1 ? { gameId, date, detail } : undefined };
  };
  const own = games.filter(g => g.seats.some(s => s.playerId === playerId));
  const club = await db.all(`SELECT g.id, g.evening_id, g.judge_player_id, g.protocol_text, e.status evening_status
    FROM games g JOIN game_evenings e ON e.id=g.evening_id WHERE g.archived_at IS NULL AND e.status!='cancelled'`);
  const played = (row: any) => { try { const p = JSON.parse(row.protocol_text || '{}'); return p.kind === 'club_evening_protocol' && p.protocol?.status === 'completed'; } catch { return false; } };
  const judged = club.filter((g: any) => g.judge_player_id === playerId && played(g));
  const tournamentJudges = await db.all(`SELECT tg.id FROM tournament_games tg JOIN tournament_game_protocols p ON p.game_id=tg.id JOIN tournaments t ON t.id=tg.tournament_id
    WHERE tg.status='completed' AND p.status='completed' AND COALESCE(tg.judge_player_id,t.judge_player_id)=?`, [playerId]);
  const judgedGames = games.filter(g => judged.some((r: any) => g.id === `club:${r.id}`) || tournamentJudges.some((r: any) => g.id === `tournament:${r.id}`));
  if (own.length && judgedGames.length) evidence('other_side_of_table', 1, [own[0].date,judgedGames[0].date].sort().at(-1)!, 'Подтверждены сыгранная игра и игра назначенным судьёй.');
  const byEvening = new Map<string, any[]>();
  for (const row of club) byEvening.set(String(row.evening_id), [...(byEvening.get(String(row.evening_id)) || []), row]);
  for (const [eventId, rows] of byEvening) if (rows.length >= 3 && rows.every(r => r.evening_status === 'completed' && played(r) && r.judge_player_id === playerId)) {
    const game = games.filter(g => g.source === 'club' && g.eventId === eventId).at(-1);
    if (game) evidence('full_judge_evening', 1, game.date, `Все ${rows.length} игр закрытого вечера проведены судьёй.`, game.id);
  }
  if (await db.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='player_referrals'")) {
    const referrals = await db.all('SELECT invited_player_id FROM player_referrals WHERE inviter_player_id=?', [playerId]);
    let returning = 0; let first: StatGame | undefined; const returns: StatGame[] = [];
    for (const id of new Set<string>(referrals.map((r: any) => String(r.invited_player_id)))) {
      if (id === playerId) continue;
      const theirs = games.filter(g => g.seats.some(s => s.playerId === id));
      if (theirs[0] && (!first || theirs[0].date < first.date)) first = theirs[0];
      const seenEvents = new Set<string>();
      for (const game of theirs) {
        if (!game.eventId) continue;
        seenEvents.add(`${game.source}:${game.eventId}`);
        if (seenEvents.size >= 2) { returning += 1; returns.push(game); break; }
      }
    }
    if (first) evidence('brought_to_game', 1, first.date, 'Подтверждённый приглашённый завершил игру.');
    evidence('own_company', Math.min(returning,3)/3, returns.sort((a,b)=>a.date.localeCompare(b.date))[2]?.date || '', `${returning} приглашённых сыграли на двух разных вечерах.`);
    stories.own_company.target = 3;
  }
  const tournamentRounds = await db.all(`SELECT tg.id,tg.status,tg.tournament_id,t.game_count
    FROM tournament_games tg JOIN tournaments t ON t.id=tg.tournament_id WHERE t.status='completed'`);
  const byTournament = new Map<string, any[]>();
  for (const row of tournamentRounds) byTournament.set(String(row.tournament_id), [...(byTournament.get(String(row.tournament_id)) || []),row]);
  for (const [id,rounds] of byTournament) {
    const ownRounds = own.filter(g => g.source === 'tournament' && g.eventId === id);
    if (rounds.length === Number(rounds[0].game_count) && rounds.length > 0 && rounds.every((r: any) => r.status === 'completed' && ownRounds.some(g => g.id === `tournament:${r.id}`)))
      evidence('first_distance', 1, ownRounds.at(-1)!.date, `Сыграна вся фактическая дистанция: ${rounds.length} игр.`, ownRounds.at(-1)!.id);
  }
  return stories;
}
