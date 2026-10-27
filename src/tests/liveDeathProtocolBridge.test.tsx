// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EveningDeathProtocolBridge } from '../components/crm/EveningDeathProtocolOverlay';

const writeSession = (activePlayers: Array<{ slot_num: number; nickname: string; team: 'Красные' | 'Чёрные' | 'red' | 'black'; alive: boolean }>) => {
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

  it('reads the canonical teams the engine saves since #1018 and still finishes the game', async () => {
    writeSession([
      { slot_num: 1, nickname: 'Красный 1', team: 'red', alive: true },
      { slot_num: 2, nickname: 'Красный 2', team: 'red', alive: true },
      { slot_num: 3, nickname: 'Красный 3', team: 'red', alive: true },
      { slot_num: 4, nickname: 'Последняя мафия', team: 'black', alive: false },
    ]);
    const finishGame = vi.fn();
    render(<>
      <div className="evening-live-engine-shell">
        <button type="button" onClick={finishGame}>Завершить игру</button>
      </div>
      <EveningDeathProtocolBridge />
    </>);
    fireEvent.click(await screen.findByRole('button', { name: 'Сохранить → протокол' }));
    expect(finishGame).toHaveBeenCalledTimes(1);
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

  it('gives the death-protocol task only in the guided training, not in the free test game', async () => {
    const players = Array.from({ length: 10 }, (_, index) => ({ slot_num: index + 1, nickname: `Игрок ${index + 1}`, team: index < 3 ? 'black' : 'red', alive: index !== 0 }));
    localStorage.setItem('mafia_live_session', JSON.stringify({ postNightStage: 'death_protocol', shotPlayerSlot: 1, timeLeft: 12, roundNumber: 1, sessionKey: 'club:-2147483000', activePlayers: players }));

    const free = render(<EveningDeathProtocolBridge />);
    expect((await screen.findByTestId('live-death-protocol-save') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('judge-training-death-task')).toBeNull();
    free.unmount();

    render(<><div className="evening-live-training-modal" /><EveningDeathProtocolBridge /></>);
    expect(await screen.findByTestId('judge-training-death-task')).toBeTruthy();
    expect((screen.getByTestId('live-death-protocol-save') as HTMLButtonElement).disabled).toBe(true);
  });
});
