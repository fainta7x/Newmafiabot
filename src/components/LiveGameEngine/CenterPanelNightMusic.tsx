import React from 'react';
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
  const isRegularNightIntro = props.phase === 'night' && props.nightSubPhase === 'intro';

  React.useEffect(() => {
    if (props.phase !== 'night') {
      setMusicStartedRound(null);
      setMusicStoppedRound(null);
    }
  }, [props.phase, props.roundNumber]);

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

  /*
   * The mobile center card is height-limited and scrollable. After the voting UI
   * became richer, flex centering could keep an old scroll offset and visually
   * move the whole voting block up/down between candidates. During voting keep
   * the body anchored to the top and reset only that inner scroll area when the
   * voting step changes. Header/footer stay fixed in place.
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
      alignItems: body.style.alignItems,
      justifyContent: body.style.justifyContent,
      minHeight: body.style.minHeight,
      overflowX: body.style.overflowX,
    };

    center.style.minWidth = '0';
    center.style.overflow = 'hidden';
    body.style.alignItems = 'flex-start';
    body.style.justifyContent = 'flex-start';
    body.style.minHeight = '0';
    body.style.overflowX = 'hidden';
    body.scrollTop = 0;

    return () => {
      center.style.minWidth = previous.centerMinWidth;
      center.style.overflow = previous.centerOverflow;
      body.style.alignItems = previous.alignItems;
      body.style.justifyContent = previous.justifyContent;
      body.style.minHeight = previous.minHeight;
      body.style.overflowX = previous.overflowX;
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
   * The base voting guard locks the table once the division becomes mathematically
   * decided. That accidentally made the votes which caused the decision impossible
   * to correct. Keep uncast seats protected, but always let an explicitly cast vote
   * for the candidate currently being counted be tapped again. LiveGameEngine's
   * existing toggle then removes that exact vote and the normal voting flow reopens.
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

  return <BaseCenterPanel {...props} getNextStepInfo={getNextStepInfo} />;
}
