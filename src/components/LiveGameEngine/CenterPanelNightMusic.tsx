import React from 'react';
import { createPortal } from 'react-dom';
import BaseCenterPanel from './CenterPanel.tsx';
import { requestJudgeGameMusicStop, requestJudgeNightMusicStart } from '../JudgeGameMusicController.tsx';

type CenterPanelProps = React.ComponentProps<typeof BaseCenterPanel>;

const findLiveGrid = () => {
  const root = document.querySelector<HTMLElement>('.evening-live-engine-shell, .tournament-live-shell');
  return root?.querySelector<HTMLElement>('div[class*="grid-cols-2"][class*="md:grid-cols-5"]') || null;
};

/**
 * Keeps the core live-game flow untouched while inserting explicit music actions
 * around every regular night.
 *
 * Flow: day/voting -> night intro -> "Музыка ночи" -> night actions ->
 * "Выключить музыку" -> best move / night result.
 */
export default function CenterPanelNightMusic(props: CenterPanelProps) {
  const [musicStartedRound, setMusicStartedRound] = React.useState<number | null>(null);
  const [musicStoppedRound, setMusicStoppedRound] = React.useState<number | null>(null);
  const [bestMoveTimeLeft, setBestMoveTimeLeft] = React.useState<number | null>(null);
  const bestMoveDeadlineRef = React.useRef<number | null>(null);
  const isRegularNightIntro = props.phase === 'night' && props.nightSubPhase === 'intro';
  const isFirstKilledBestMove = props.phase === 'night' && props.nightSubPhase === 'best_move';

  React.useEffect(() => {
    if (props.phase !== 'night') {
      setMusicStartedRound(null);
      setMusicStoppedRound(null);
    }
  }, [props.phase, props.roundNumber]);

  /* The first killed player gets exactly 20 seconds for best move. The core
   * protocol modal used to stop the shared night timer entirely, so keep a small
   * absolute-deadline timer above that modal. It also catches up after Telegram
   * is minimized instead of pausing with the WebView. */
  React.useEffect(() => {
    if (!isFirstKilledBestMove) {
      bestMoveDeadlineRef.current = null;
      setBestMoveTimeLeft(null);
      return;
    }

    const deadline = Date.now() + 20_000;
    bestMoveDeadlineRef.current = deadline;
    setBestMoveTimeLeft(20);

    const sync = () => {
      const currentDeadline = bestMoveDeadlineRef.current;
      if (currentDeadline === null) return;
      setBestMoveTimeLeft(Math.max(0, Math.ceil((currentDeadline - Date.now()) / 1000)));
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sync();
    };

    const interval = window.setInterval(sync, 250);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', sync);
      bestMoveDeadlineRef.current = null;
    };
  }, [isFirstKilledBestMove, props.roundNumber]);

  /* During daytime show only the nominated seats themselves. The order in which
   * they were nominated is protocol data, not useful judge-facing copy here. */
  React.useLayoutEffect(() => {
    if (props.phase !== 'day_speeches') return;
    const grid = findLiveGrid();
    const center = grid?.children?.[10] as HTMLElement | undefined;
    if (!center) return;

    const nominationLabel = Array.from(center.querySelectorAll<HTMLElement>('div')).find((node) => (
      node.children.length === 0 && node.textContent?.trim().startsWith('Выставлены:')
    ));
    if (!nominationLabel) return;

    nominationLabel.textContent = `Выставлены: ${props.nominations.length
      ? props.nominations.map((slot) => `#${slot}`).join(' · ')
      : '—'}`;
  }, [props.phase, props.nominations]);

  /* The next-speech action must identify the player by both seat and nickname. */
  React.useLayoutEffect(() => {
    if (props.phase !== 'day_speeches' || !props.nextSpeaker) return;
    const grid = findLiveGrid();
    const center = grid?.children?.[10] as HTMLElement | undefined;
    if (!center) return;

    const slot = props.nextSpeaker.slot_num;
    const nickname = props.nextSpeaker.nickname?.trim() || `Игрок ${slot}`;
    const oldLabel = `Речь #${slot}`;
    const button = Array.from(center.querySelectorAll<HTMLButtonElement>('button')).find(
      (node) => node.textContent?.trim() === oldLabel,
    );
    if (!button) return;

    const textNode = Array.from(button.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes(oldLabel),
    );
    if (textNode) textNode.textContent = `Речь #${slot} · ${nickname}`;
    button.title = `Передать речь игроку #${slot} · ${nickname}`;
  }, [props.phase, props.nextSpeaker?.slot_num, props.nextSpeaker?.nickname]);

  /*
   * Voting has become taller than the old compact center card. On phones the
   * center used to stay sticky with its own scroll area, so the player grid could
   * literally move underneath it and some voting controls looked hidden behind
   * the center. During voting keep the whole card in normal document flow and
   * let it grow to its real height. There is then only one page scroll: the seats
   * always start below the voting card and nothing can slide underneath it.
   */
  React.useLayoutEffect(() => {
    if (props.phase !== 'day_voting') return;
    const grid = findLiveGrid();
    const center = grid?.children?.[10] as HTMLElement | undefined;
    const body = center?.children?.[1] as HTMLElement | undefined;
    if (!center || !body) return;

    const previous = {
      centerMinWidth: center.style.minWidth,
      centerOverflow: center.style.overflow,
      centerPosition: center.style.position,
      centerTop: center.style.top,
      centerZIndex: center.style.zIndex,
      centerMaxHeight: center.style.maxHeight,
      alignItems: body.style.alignItems,
      justifyContent: body.style.justifyContent,
      minHeight: body.style.minHeight,
      overflowX: body.style.overflowX,
      overflowY: body.style.overflowY,
      flex: body.style.flex,
    };

    center.style.minWidth = '0';
    center.style.position = 'relative';
    center.style.top = 'auto';
    center.style.zIndex = '20';
    center.style.maxHeight = 'none';
    center.style.overflow = 'visible';
    body.style.alignItems = 'flex-start';
    body.style.justifyContent = 'flex-start';
    body.style.minHeight = '0';
    body.style.overflowX = 'hidden';
    body.style.overflowY = 'visible';
    body.style.flex = '0 0 auto';
    body.scrollTop = 0;

    return () => {
      center.style.minWidth = previous.centerMinWidth;
      center.style.overflow = previous.centerOverflow;
      center.style.position = previous.centerPosition;
      center.style.top = previous.centerTop;
      center.style.zIndex = previous.centerZIndex;
      center.style.maxHeight = previous.centerMaxHeight;
      body.style.alignItems = previous.alignItems;
      body.style.justifyContent = previous.justifyContent;
      body.style.minHeight = previous.minHeight;
      body.style.overflowX = previous.overflowX;
      body.style.overflowY = previous.overflowY;
      body.style.flex = previous.flex;
    };
  }, [props.phase, props.votingStage, props.currentVotingNomineeIndex, props.activeVotingRoundIndex]);

  /*
   * Keep the requested "who -> where" information on player cards, but make it
   * compact enough for a two-column phone table. The long wording introduced in
   * the previous hotfix could enlarge card internals and make the center layout
   * feel unstable. Asterisk means the automatic remainder for the last nominee.
   */
  React.useLayoutEffect(() => {
    if (props.phase !== 'day_voting' || props.votingStage !== 'collecting') return;
    const round = props.votingRounds?.[props.activeVotingRoundIndex || 0];
    if (!round?.nominated_seats?.length) return;
    const grid = findLiveGrid();
    if (!grid) return;

    const candidates = round.nominated_seats;
    const nominee = candidates[props.currentVotingNomineeIndex];
    const lastNominee = candidates[candidates.length - 1];
    const seats = Array.from(grid.children).slice(0, 10) as HTMLElement[];

    seats.forEach((node, index) => {
      const voterSlot = index + 1;
      const heading = Array.from(node.querySelectorAll('span')).find((span) => span.textContent?.trim() === 'Голосование');
      const status = heading?.parentElement?.querySelectorAll('span')?.[1] as HTMLSpanElement | undefined;
      if (!status) return;

      const explicitTarget = props.votesByPlayer?.[voterSlot];
      const automatic = explicitTarget === undefined && nominee === lastNominee;
      const target = explicitTarget ?? (automatic ? lastNominee : null);
      status.textContent = target ? `#${voterSlot}→#${target}${automatic ? '*' : ''}` : `#${voterSlot}→—`;
      status.style.whiteSpace = 'nowrap';
      status.style.letterSpacing = '0';
      status.style.fontSize = '9px';
      status.title = target
        ? `Игрок #${voterSlot} голосует за #${target}${automatic ? ' (автоматический остаток)' : ''}`
        : `Игрок #${voterSlot} ещё не проголосовал`;
    });
  }, [
    props.phase,
    props.votingStage,
    props.votingRounds,
    props.activeVotingRoundIndex,
    props.currentVotingNomineeIndex,
    props.votesByPlayer,
  ]);

  /*
   * A player who already voted for the candidate currently being counted must
   * always stay tappable so the judge can remove an accidental vote.
   */
  React.useEffect(() => {
    if (props.phase !== 'day_voting' || props.votingStage !== 'collecting') return;
    const round = props.votingRounds?.[props.activeVotingRoundIndex || 0];
    const nominee = round?.nominated_seats?.[props.currentVotingNomineeIndex];
    if (!nominee) return;

    let frame = 0;
    const unlockCastVotes = () => {
      const grid = findLiveGrid();
      if (!grid) return;
      const seats = Array.from(grid.children).slice(0, 10) as HTMLElement[];
      seats.forEach((node, index) => {
        const voterSlot = index + 1;
        if (props.votesByPlayer?.[voterSlot] !== nominee) return;
        node.style.pointerEvents = 'auto';
        delete node.dataset.sequentialVoteLocked;
        node.dataset.voteUndoAvailable = 'true';
        node.title = `Нажмите ещё раз, чтобы отменить голос игрока #${voterSlot} за #${nominee}`;
      });
    };

    unlockCastVotes();
    frame = window.requestAnimationFrame(unlockCastVotes);
    return () => {
      window.cancelAnimationFrame(frame);
      const grid = findLiveGrid();
      const seats = grid ? Array.from(grid.children).slice(0, 10) as HTMLElement[] : [];
      seats.forEach((node) => {
        if (node.dataset.voteUndoAvailable === 'true') {
          delete node.dataset.voteUndoAvailable;
          node.removeAttribute('title');
        }
      });
    };
  }, [
    props.phase,
    props.votingStage,
    props.votingRounds,
    props.activeVotingRoundIndex,
    props.currentVotingNomineeIndex,
    props.votesByPlayer,
  ]);

  const getNextStepInfo = React.useCallback(() => {
    if (isRegularNightIntro && musicStartedRound !== props.roundNumber) {
      return {
        label: '♫ Включить музыку ночи',
        onClick: () => {
          const started = requestJudgeNightMusicStart();
          setMusicStartedRound(props.roundNumber);
          if (!started) setMusicStoppedRound(props.roundNumber);
        },
      };
    }

    const shouldOfferManualStop = props.phase === 'night'
      && props.nightSubPhase === 'sheriff'
      && musicStartedRound === props.roundNumber
      && musicStoppedRound !== props.roundNumber;

    if (shouldOfferManualStop) {
      return {
        label: '♫ Выключить музыку',
        onClick: () => {
          requestJudgeGameMusicStop();
          setMusicStoppedRound(props.roundNumber);
        },
      };
    }

    return props.getNextStepInfo();
  }, [isRegularNightIntro, musicStartedRound, musicStoppedRound, props]);

  return (
    <>
      <BaseCenterPanel {...props} getNextStepInfo={getNextStepInfo} />
      {bestMoveTimeLeft !== null && typeof document !== 'undefined' && createPortal(
        <div className="fixed left-1/2 top-3 z-[145] -translate-x-1/2 rounded-2xl border border-amber-400/50 bg-slate-950/95 px-5 py-2 text-center shadow-2xl backdrop-blur-xl">
          <div className="text-[9px] font-black uppercase tracking-widest text-amber-300">Лучший ход · 20 секунд</div>
          <div className={`font-mono text-3xl font-black ${bestMoveTimeLeft <= 5 ? 'text-rose-400' : 'text-white'}`}>{bestMoveTimeLeft}с</div>
        </div>,
        document.body,
      )}
    </>
  );
}
