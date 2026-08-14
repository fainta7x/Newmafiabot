import React from 'react';
import BaseCenterPanel from './CenterPanel.tsx';
import { requestJudgeNightMusicStart } from '../JudgeGameMusicController.tsx';

type CenterPanelProps = React.ComponentProps<typeof BaseCenterPanel>;

/**
 * Keeps the core live-game flow untouched while inserting one explicit action
 * before the first night action of every regular night.
 *
 * Flow: day/voting -> night intro -> "Музыка ночи" -> "Стрельба мафии".
 */
export default function CenterPanelNightMusic(props: CenterPanelProps) {
  const [musicStartedRound, setMusicStartedRound] = React.useState<number | null>(null);
  const isRegularNightIntro = props.phase === 'night' && props.nightSubPhase === 'intro';

  React.useEffect(() => {
    if (!isRegularNightIntro) setMusicStartedRound(null);
  }, [isRegularNightIntro, props.roundNumber]);

  const getNextStepInfo = React.useCallback(() => {
    if (isRegularNightIntro && musicStartedRound !== props.roundNumber) {
      return {
        label: '♫ Включить музыку ночи',
        onClick: () => {
          requestJudgeNightMusicStart();
          setMusicStartedRound(props.roundNumber);
        },
      };
    }
    return props.getNextStepInfo();
  }, [isRegularNightIntro, musicStartedRound, props]);

  return <BaseCenterPanel {...props} getNextStepInfo={getNextStepInfo} />;
}
