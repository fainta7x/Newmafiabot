// @vitest-environment jsdom
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
