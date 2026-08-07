from pathlib import Path


def replace_once(path_str: str, old: str, new: str, label: str) -> None:
    path = Path(path_str)
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match in {path_str}, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


# 1) The live engine must expose a real end-game action after the mandatory
# death protocol when the night kill has already decided the winner.
replace_once(
    'src/components/LiveGameEngine.tsx',
    "      if (postNightStage === 'death_protocol') return { label: 'К дневным речам', onClick: finishNightToDay };",
    """      if (postNightStage === 'death_protocol') {
        const winnerAfterNight = determineLiveWinner(activePlayers);
        if (winnerAfterNight) {
          return { label: 'Завершить игру', onClick: () => handleEndGameWithWinner(winnerAfterNight) };
        }
        return { label: 'К дневным речам', onClick: finishNightToDay };
      }""",
    'death protocol next step',
)

# 2) The death-protocol bridge must distinguish "continue to day" from
# "finish the game" instead of always looking for the day button by text.
replace_once(
    'src/components/crm/EveningDeathProtocolOverlay.tsx',
    "import React from 'react';\n",
    "import React from 'react';\nimport { determineLiveWinner, type LiveFlowPlayer, type LiveWinnerTeam } from '../../lib/liveGameFlow';\n",
    'death protocol winner import',
)

replace_once(
    'src/components/crm/EveningDeathProtocolOverlay.tsx',
    "  error?: string | null;\n}",
    "  error?: string | null;\n  finishGame?: boolean;\n}",
    'death protocol overlay prop',
)

replace_once(
    'src/components/crm/EveningDeathProtocolOverlay.tsx',
    "  onBack,\n  error,\n}) => {",
    "  onBack,\n  error,\n  finishGame = false,\n}) => {",
    'death protocol overlay prop destructure',
)

replace_once(
    'src/components/crm/EveningDeathProtocolOverlay.tsx',
    "            Сохранить → день\n",
    "            {finishGame ? 'Сохранить → протокол' : 'Сохранить → день'}\n",
    'death protocol primary button label',
)

replace_once(
    'src/components/crm/EveningDeathProtocolOverlay.tsx',
    """type LiveSessionView = {
  postNightStage: string;
  shotPlayerSlot: number | null;
  timeLeft: number;
  killedName: string;
};""",
    """type LiveSessionView = {
  postNightStage: string;
  shotPlayerSlot: number | null;
  timeLeft: number;
  killedName: string;
  winner: LiveWinnerTeam | null;
};""",
    'death protocol session winner',
)

replace_once(
    'src/components/crm/EveningDeathProtocolOverlay.tsx',
    "  const [session, setSession] = React.useState<LiveSessionView>({ postNightStage: 'none', shotPlayerSlot: null, timeLeft: 0, killedName: '' });",
    "  const [session, setSession] = React.useState<LiveSessionView>({ postNightStage: 'none', shotPlayerSlot: null, timeLeft: 0, killedName: '', winner: null });",
    'death protocol initial session',
)

replace_once(
    'src/components/crm/EveningDeathProtocolOverlay.tsx',
    """        const activePlayers = Array.isArray(parsed?.activePlayers) ? parsed.activePlayers : [];
        const killedPlayer = shotPlayerSlot === null ? null : activePlayers.find((player: any) => Number(player?.slot_num) === shotPlayerSlot);
        const next: LiveSessionView = {
          postNightStage: String(parsed?.postNightStage || 'none'),
          shotPlayerSlot,
          timeLeft: Math.max(0, Number(parsed?.timeLeft || 0)),
          killedName: String(killedPlayer?.nickname || (shotPlayerSlot ? `Игрок ${shotPlayerSlot}` : '')),
        };""",
    """        const activePlayers = Array.isArray(parsed?.activePlayers) ? parsed.activePlayers : [];
        const killedPlayer = shotPlayerSlot === null ? null : activePlayers.find((player: any) => Number(player?.slot_num) === shotPlayerSlot);
        const flowPlayers: LiveFlowPlayer[] = [];
        for (const player of activePlayers) {
          const slot = Number(player?.slot_num);
          const team = player?.team;
          if (!Number.isInteger(slot) || (team !== 'Красные' && team !== 'Чёрные')) continue;
          flowPlayers.push({ slot_num: slot, team, alive: Boolean(player?.alive) });
        }
        const winner = flowPlayers.length ? determineLiveWinner(flowPlayers) : null;
        const next: LiveSessionView = {
          postNightStage: String(parsed?.postNightStage || 'none'),
          shotPlayerSlot,
          timeLeft: Math.max(0, Number(parsed?.timeLeft || 0)),
          killedName: String(killedPlayer?.nickname || (shotPlayerSlot ? `Игрок ${shotPlayerSlot}` : '')),
          winner,
        };""",
    'death protocol session winner calculation',
)

replace_once(
    'src/components/crm/EveningDeathProtocolOverlay.tsx',
    """  const handleConfirm = () => {
    storeDeathProtocol(killedSlot, normalizeDeathProtocolSelection(value));
    const nextButton = findEngineButton('К дневным речам');
    if (!nextButton) {
      setError('Протокол сохранён, но не найдена кнопка перехода к дневным речам.');
      return;
    }
    setError(null);
    nextButton.click();
  };""",
    """  const handleConfirm = () => {
    storeDeathProtocol(killedSlot, normalizeDeathProtocolSelection(value));
    const nextButton = session.winner
      ? (findEngineButton('Завершить игру') || findEngineButton('Применить авто-победу'))
      : findEngineButton('К дневным речам');
    if (!nextButton) {
      setError(session.winner
        ? 'Протокол сохранён, но не найдена команда завершения игры.'
        : 'Протокол сохранён, но не найдена кнопка перехода к дневным речам.');
      return;
    }
    setError(null);
    nextButton.click();
  };""",
    'death protocol confirm routing',
)

replace_once(
    'src/components/crm/EveningDeathProtocolOverlay.tsx',
    """      onConfirm={handleConfirm}
      onBack={handleBack}
      error={error}
    />""",
    """      onConfirm={handleConfirm}
      onBack={handleBack}
      error={error}
      finishGame={session.winner !== null}
    />""",
    'death protocol finish flag',
)

# 3) Preserve the death protocol in the completed game protocol, then clear the
# transient live-game storage only after the server save succeeds.
replace_once(
    'src/components/crm/EveningLiveGameModal.tsx',
    "import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';\n",
    "import { clubGamesApi, type ClubGameRecord } from '../../lib/clubGamesApi';\nimport { applyStoredDeathProtocolsToResults, clearStoredDeathProtocols } from '../../lib/liveDeathProtocol';\n",
    'live modal death protocol import',
)

replace_once(
    'src/components/crm/EveningLiveGameModal.tsx',
    "  const playerResults = previousResults.map((previous) => {",
    "  const playerResults = applyStoredDeathProtocolsToResults(previousResults.map((previous) => {",
    'apply stored death protocol start',
)

replace_once(
    'src/components/crm/EveningLiveGameModal.tsx',
    """    } as PlayerResultData;
  });

  const winnerTeam""",
    """    } as PlayerResultData;
  }));

  const winnerTeam""",
    'apply stored death protocol end',
)

replace_once(
    'src/components/crm/EveningLiveGameModal.tsx',
    """              const next = mapEngineResultToProtocol(game, gameData);
              const updated = await clubGamesApi.saveProtocol(game.id, next);
              onUpdated(updated);""",
    """              const next = mapEngineResultToProtocol(game, gameData);
              const updated = await clubGamesApi.saveProtocol(game.id, next);
              clearStoredDeathProtocols();
              onUpdated(updated);""",
    'clear death protocol after save',
)

# 4) A completed live game should immediately open its game protocol instead of
# dropping the judge back to the list of games.
replace_once(
    'src/components/crm/EveningGamesView.tsx',
    "      {activeLiveGame && <EveningLiveGameModal game={activeLiveGame} onClose={() => setActiveLiveGame(null)} onUpdated={applyUpdatedGame} />}",
    """      {activeLiveGame && <EveningLiveGameModal
        game={activeLiveGame}
        onClose={() => setActiveLiveGame(null)}
        onUpdated={(updated) => {
          applyUpdatedGame(updated);
          if (updated.status === 'completed') setActiveProtocolGame(updated);
        }}
      />}""",
    'open completed protocol after live game',
)

# 5) Slightly enlarge the actual highest-priority mobile avatar/name rules.
replace_once(
    'src/components/crm/eveningLiveResponsiveSafe.css',
    """  html body .evening-live-engine-shell .evening-live-player-avatar {
    width: clamp(38px, 11.5vw, 58px) !important;
    height: clamp(38px, 11.5vw, 58px) !important;
    max-width: 58% !important;
    max-height: 40% !important;
    flex: 0 0 auto !important;
  }

  html body .evening-live-engine-shell .evening-live-identity-name {
    max-width: 90% !important;
    padding: 0.18em 0.55em !important;
    font-size: clamp(8px, 2.25vw, 11px) !important;
    line-height: 1.15 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }""",
    """  html body .evening-live-engine-shell .evening-live-player-avatar {
    width: clamp(46px, 13.5vw, 66px) !important;
    height: clamp(46px, 13.5vw, 66px) !important;
    max-width: 68% !important;
    max-height: 48% !important;
    flex: 0 0 auto !important;
  }

  html body .evening-live-engine-shell .evening-live-identity-name {
    max-width: 96% !important;
    padding: 0.22em 0.6em !important;
    font-size: clamp(9.5px, 2.65vw, 12px) !important;
    line-height: 1.18 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }""",
    'mobile avatar and nickname size',
)

# 6) Regression tests for the exact bridge routing that caused the screenshot bug.
test_path = Path('src/tests/liveDeathProtocolBridge.test.tsx')
if test_path.exists():
    raise RuntimeError('liveDeathProtocolBridge.test.tsx already exists')
test_path.write_text(r'''// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EveningDeathProtocolBridge } from '../components/crm/EveningDeathProtocolOverlay';

const writeSession = (activePlayers: Array<{ slot_num: number; nickname: string; team: 'Красные' | 'Чёрные'; alive: boolean }>) => {
  localStorage.setItem('mafia_live_session', JSON.stringify({
    postNightStage: 'death_protocol',
    shotPlayerSlot: 4,
    timeLeft: 12,
    activePlayers,
  }));
};

describe('EveningDeathProtocolBridge final-night routing', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('finishes the game after the last black player dies instead of searching for the day button', async () => {
    writeSession([
      { slot_num: 1, nickname: 'Красный 1', team: 'Красные', alive: true },
      { slot_num: 2, nickname: 'Красный 2', team: 'Красные', alive: true },
      { slot_num: 3, nickname: 'Красный 3', team: 'Красные', alive: true },
      { slot_num: 4, nickname: 'Последняя мафия', team: 'Чёрные', alive: false },
    ]);
    const finishGame = vi.fn();

    render(<>
      <div className="evening-live-engine-shell">
        <button type="button" onClick={finishGame}>Завершить игру</button>
      </div>
      <EveningDeathProtocolBridge />
    </>);

    const save = await screen.findByRole('button', { name: 'Сохранить → протокол' });
    fireEvent.click(save);

    expect(finishGame).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/не найдена кнопка перехода к дневным речам/i)).toBeNull();
  });

  it('continues to the next day when the kill has not decided the winner', async () => {
    writeSession([
      { slot_num: 1, nickname: 'Красный 1', team: 'Красные', alive: true },
      { slot_num: 2, nickname: 'Красный 2', team: 'Красные', alive: true },
      { slot_num: 3, nickname: 'Красный 3', team: 'Красные', alive: false },
      { slot_num: 4, nickname: 'Убитый', team: 'Красные', alive: false },
      { slot_num: 9, nickname: 'Мафия', team: 'Чёрные', alive: true },
    ]);
    const goToDay = vi.fn();

    render(<>
      <div className="evening-live-engine-shell">
        <button type="button" onClick={goToDay}>К дневным речам</button>
      </div>
      <EveningDeathProtocolBridge />
    </>);

    const save = await screen.findByRole('button', { name: 'Сохранить → день' });
    fireEvent.click(save);

    expect(goToDay).toHaveBeenCalledTimes(1);
  });
});
''', encoding='utf-8')

print('Death protocol final-mafia routing + mobile identity sizing patched successfully')
