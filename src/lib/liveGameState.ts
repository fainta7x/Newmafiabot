export type LiveGameStatePlayer = {
  seat: number;
  nickname: string;
  role: string;
  team: 'Красные' | 'Чёрные' | string;
  alive: boolean;
  status: string;
  fouls: number;
  minorTech: number;
  majorTech: number;
  has30SecPenalty: boolean;
  pendingAction: string | null;
  ppk: boolean;
};

export type LiveGameStateView = {
  phaseTitle: string;
  phaseDetail: string;
  nextStep: string;
  roundNumber: number;
  aliveCount: number;
  redAlive: number;
  blackAlive: number;
  currentSpeakerSeat: number | null;
  timerText: string | null;
  players: LiveGameStatePlayer[];
  nominations: number[];
  votingRound: number | null;
  votingStage: string | null;
  voteCounts: Record<number, number>;
  assignedVotes: number;
  eligibleVoters: number | null;
  shotPlayerSlot: number | null;
  donCheck: string | null;
  sheriffCheck: string | null;
  firstKilledSlot: number | null;
  zeroRoundVotedSlot: number | null;
  bestMove: string | null;
  votingCancellationPending: boolean;
  ppkCulpritSeat: number | null;
  warnings: string[];
  lastEvent: string | null;
  savedAt: string | null;
};

const asObject = (value: unknown): Record<string, any> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;

const toSeat = (value: unknown): number | null => {
  const seat = Number(value);
  return Number.isInteger(seat) && seat >= 1 && seat <= 10 ? seat : null;
};

const phaseTitle = (phase: string, round: number): string => {
  if (phase === 'setup') return 'Подготовка';
  if (phase === 'zero_night') return 'Нулевая ночь';
  if (phase === 'day_speeches') return `День ${round} · речи`;
  if (phase === 'day_voting') return `День ${round} · голосование`;
  if (phase === 'shootout') return `День ${round} · переголосование`;
  if (phase === 'night') return `Ночь ${round}`;
  return 'Игра в процессе';
};

const zeroNightDetail = (sub: unknown): string => {
  if (sub === 'agreement') return 'Договорка мафии';
  if (sub === 'sheriff') return 'Вызов шерифа';
  if (sub === 'seating') return 'Свободная посадка';
  return 'Подготовка нулевой ночи';
};

const nightDetail = (sub: unknown, postNightStage: unknown): string => {
  if (postNightStage === 'farewell') return 'Прощальная речь убитого';
  if (postNightStage === 'death_protocol') return 'Протокол убитого';
  if (sub === 'shooting') return 'Стрельба мафии';
  if (sub === 'don') return 'Проверка Дона';
  if (sub === 'sheriff') return 'Проверка Шерифа';
  if (sub === 'best_move') return 'Лучший ход первого убитого';
  if (sub === 'morning') return 'Итоги ночи';
  return 'Запуск ночи';
};

const votingStageLabel = (stage: unknown): string => {
  if (stage === 'collecting') return 'Сбор голосов';
  if (stage === 'round_result') return 'Результат голосования';
  if (stage === 'revote_speeches') return 'Дополнительные речи';
  if (stage === 'table_decision') return 'Решение стола';
  if (stage === 'resolved') return 'Голосование завершено';
  return 'Подготовка голосования';
};

const exitLabel = (player: Record<string, any>): string => {
  if (player.alive !== false) return 'В игре';
  if (player.exit_reason === 'killed') return 'Убит ночью';
  if (player.exit_reason === 'voted_zero_round') return 'Заголосован в нулевой круг';
  if (player.exit_reason === 'voted_day') return 'Заголосован';
  if (player.exit_reason === 'removed') return player.eliminated_phase || 'Удалён';
  return player.eliminated_phase || 'Покинул стол';
};

const getNextSpeaker = (players: Record<string, any>[], round: number): number | null => {
  const start = ((Math.max(1, round) - 1) % 10) + 1;
  for (let offset = 0; offset < 10; offset += 1) {
    const seat = ((start - 1 + offset) % 10) + 1;
    const player = players.find((item) => Number(item?.slot_num) === seat);
    if (player?.alive !== false && !player?.has_spoken_this_round) return seat;
  }
  return null;
};

const deriveNextStep = (
  snapshot: Record<string, any>,
  players: Record<string, any>[],
  round: number,
): string => {
  const phase = String(snapshot.phase || 'setup');
  const speaker = toSeat(snapshot.activeSpeakerSlot);

  if (phase === 'setup') return 'Запустить игру';
  if (phase === 'zero_night') {
    if (!snapshot.zeroNightSubPhase) return 'Договорка мафии · 75с';
    if (snapshot.zeroNightSubPhase === 'agreement') return 'Вызов шерифа · 10с';
    if (snapshot.zeroNightSubPhase === 'sheriff') return 'Посадка · 40с';
    return 'Разбудить город';
  }
  if (phase === 'day_speeches') {
    if (speaker) return `Завершить речь #${speaker}`;
    const nextSpeaker = getNextSpeaker(players, round);
    return nextSpeaker ? `Речь #${nextSpeaker}` : 'К голосованию';
  }
  if (phase === 'day_voting') {
    const farewellQueue = Array.isArray(snapshot.votingFarewellQueue) ? snapshot.votingFarewellQueue : [];
    if (farewellQueue.length > 0 && speaker) return 'Завершить прощальную речь';
    if (snapshot.votingStage === 'collecting') return 'Зафиксировать голоса';
    if (snapshot.votingStage === 'round_result') return 'Подтвердить результат';
    if (snapshot.votingStage === 'revote_speeches') return 'Продолжить переголосование';
    return 'Завершить голосование';
  }
  if (phase === 'night') {
    if (snapshot.postNightStage === 'farewell') return 'Протокол убитого · 15с';
    if (snapshot.postNightStage === 'death_protocol') return 'К дневным речам';
    if (snapshot.nightSubPhase === 'intro') return 'Стрельба мафии';
    if (snapshot.nightSubPhase === 'shooting') return 'Проверка Дона';
    if (snapshot.nightSubPhase === 'don') return 'Проверка Шерифа';
    if (snapshot.nightSubPhase === 'sheriff') return 'Итоги ночи';
    if (snapshot.nightSubPhase === 'best_move') return 'Подтвердить лучший ход';
    return 'Зафиксировать ночь';
  }
  return 'Продолжить игру';
};

export const parseLiveGameSnapshot = (value: unknown): Record<string, any> | null => {
  const object = asObject(value);
  if (!object) return null;
  if (!Array.isArray(object.activePlayers)) return null;
  return object;
};

export const readLiveGameSnapshot = (): Record<string, any> | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('mafia_live_session');
    if (!raw) return null;
    return parseLiveGameSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const buildLiveGameStateView = (rawSnapshot: unknown): LiveGameStateView | null => {
  const snapshot = parseLiveGameSnapshot(rawSnapshot);
  if (!snapshot) return null;

  const playersRaw = snapshot.activePlayers.filter((value: unknown) => asObject(value)) as Record<string, any>[];
  const discipline = asObject(snapshot.discipline) || {};
  const disciplinePlayers = asObject(discipline.players) || {};
  const roundNumber = Math.max(1, Number(snapshot.roundNumber || 1));
  const phase = String(snapshot.phase || 'setup');

  const players: LiveGameStatePlayer[] = playersRaw
    .map((player) => {
      const seat = toSeat(player.slot_num);
      if (!seat) return null;
      const disciplinePlayer = asObject(disciplinePlayers[String(seat)]) || {};
      return {
        seat,
        nickname: String(player.nickname || `Игрок ${seat}`),
        role: String(player.role || '—'),
        team: String(player.team || '—'),
        alive: player.alive !== false,
        status: exitLabel(player),
        fouls: Number(disciplinePlayer.regularFouls ?? player.fouls ?? 0),
        minorTech: Number(disciplinePlayer.minorTechFouls ?? player.minor_tech_fouls ?? 0),
        majorTech: Number(disciplinePlayer.majorTechFouls ?? player.major_tech_fouls ?? 0),
        has30SecPenalty: Boolean(disciplinePlayer.has30SecPenalty ?? player.has_foul_penalty),
        pendingAction: disciplinePlayer.pendingAction ? String(disciplinePlayer.pendingAction) : null,
        ppk: Boolean(disciplinePlayer.ppkCaused ?? player.ppk),
      } satisfies LiveGameStatePlayer;
    })
    .filter((value): value is LiveGameStatePlayer => Boolean(value))
    .sort((a, b) => a.seat - b.seat);

  const alivePlayers = players.filter((player) => player.alive);
  const currentSpeakerSeat = toSeat(snapshot.activeSpeakerSlot);
  const timerValue = Number(snapshot.timeLeft);
  const timerText = Number.isFinite(timerValue) && (snapshot.isTimerRunning || currentSpeakerSeat || snapshot.customTimerLabel)
    ? `${Math.max(0, Math.round(timerValue))}с${snapshot.isTimerRunning ? ' · идёт' : ' · пауза'}`
    : null;

  let phaseDetail = phaseTitle(phase, roundNumber);
  if (phase === 'zero_night') phaseDetail = zeroNightDetail(snapshot.zeroNightSubPhase);
  else if (phase === 'day_speeches') phaseDetail = currentSpeakerSeat ? `Сейчас говорит #${currentSpeakerSeat}` : 'Очередь дневных речей';
  else if (phase === 'day_voting') phaseDetail = votingStageLabel(snapshot.votingStage);
  else if (phase === 'night') phaseDetail = nightDetail(snapshot.nightSubPhase, snapshot.postNightStage);

  const votingRounds = Array.isArray(snapshot.votingRounds) ? snapshot.votingRounds : [];
  const activeVotingRoundIndex = Math.max(0, Number(snapshot.activeVotingRoundIndex || 0));
  const activeVotingRound = asObject(votingRounds[activeVotingRoundIndex]);
  const nominations = (activeVotingRound?.nominated_seats || snapshot.nominations || [])
    .map(toSeat)
    .filter((seat: number | null): seat is number => seat !== null);
  const rawVoteCounts = asObject(activeVotingRound?.vote_counts || snapshot.votes) || {};
  const voteCounts: Record<number, number> = {};
  Object.entries(rawVoteCounts).forEach(([rawSeat, rawCount]) => {
    const seat = toSeat(rawSeat);
    const count = Number(rawCount);
    if (seat && Number.isFinite(count)) voteCounts[seat] = count;
  });
  const votesByPlayer = asObject(snapshot.votesByPlayer) || {};

  const shotPlayerSlot = toSeat(snapshot.shotPlayerSlot);
  const donCheckSlot = toSeat(snapshot.donCheckSlot);
  const sheriffCheckSlot = toSeat(snapshot.sheriffCheckSlot);
  const donCheck = donCheckSlot
    ? `#${donCheckSlot} · ${snapshot.donCheckResult === true ? 'Шериф' : snapshot.donCheckResult === false ? 'не Шериф' : 'результат не зафиксирован'}`
    : null;
  const sheriffCheck = sheriffCheckSlot
    ? `#${sheriffCheckSlot} · ${snapshot.sheriffCheckResult || 'результат не зафиксирован'}`
    : null;

  const markers = asObject(snapshot.protocolMarkers) || {};
  const firstKilledSlot = toSeat(markers.firstKilledSlot);
  const zeroRoundVotedSlot = toSeat(markers.zeroRoundVotedSlot);
  const bestMoveSeats = Array.isArray(markers.bestMoveSeats)
    ? markers.bestMoveSeats.map(toSeat).filter((seat: number | null): seat is number => seat !== null)
    : [];
  const bestMove = bestMoveSeats.length
    ? `${markers.bestMoveSource === 'zero_round_voted' ? 'нулевой круг' : 'первый убитый'}: ${bestMoveSeats.map((seat: number) => `#${seat}`).join(', ')}`
    : null;

  const warnings: string[] = [];
  if (discipline.isNextVotingCancelled) warnings.push('Ближайшее голосование отменено из-за удаления');
  players.forEach((player) => {
    if (player.has30SecPenalty) warnings.push(`#${player.seat}: следующая речь 30 секунд`);
    if (player.pendingAction) warnings.push(`#${player.seat}: ожидается подтверждение дисциплинарного действия`);
  });
  if (discipline.isPpk) warnings.push('Зафиксирован ППК — игра должна завершиться');

  const ppkCulpritSeat = toSeat(discipline.ppkCulpritId);
  const logs = Array.isArray(snapshot.nightLogs) ? snapshot.nightLogs : [];
  const lastLog = asObject(logs[logs.length - 1]);

  return {
    phaseTitle: phaseTitle(phase, roundNumber),
    phaseDetail,
    nextStep: deriveNextStep(snapshot, playersRaw, roundNumber),
    roundNumber,
    aliveCount: alivePlayers.length,
    redAlive: alivePlayers.filter((player) => player.team === 'Красные').length,
    blackAlive: alivePlayers.filter((player) => player.team === 'Чёрные').length,
    currentSpeakerSeat,
    timerText,
    players,
    nominations,
    votingRound: activeVotingRound ? Number(activeVotingRound.round_number || activeVotingRoundIndex + 1) : null,
    votingStage: phase === 'day_voting' ? votingStageLabel(snapshot.votingStage) : null,
    voteCounts,
    assignedVotes: Object.keys(votesByPlayer).length,
    eligibleVoters: activeVotingRound && Number.isFinite(Number(activeVotingRound.eligible_voters))
      ? Number(activeVotingRound.eligible_voters)
      : null,
    shotPlayerSlot,
    donCheck,
    sheriffCheck,
    firstKilledSlot,
    zeroRoundVotedSlot,
    bestMove,
    votingCancellationPending: Boolean(discipline.isNextVotingCancelled),
    ppkCulpritSeat,
    warnings,
    lastEvent: lastLog?.log ? String(lastLog.log) : null,
    savedAt: snapshot.savedAt ? String(snapshot.savedAt) : null,
  };
};
