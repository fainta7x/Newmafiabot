/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import EventsPanel from '../components/LiveGameEngine/EventsPanel';
import { LEGACY_PROTOCOL_NOTES_KEY } from '../lib/liveClubSession';

vi.mock('../components/crm/LiveGameStateSheet.js', () => ({ default: () => null }));

function Harness() {
  const [notes, setNotes] = useState('');
  return (
    <EventsPanel
      phase="day_speeches"
      activePlayers={[]}
      nightLogs={[]}
      protocolNotes={notes}
      setProtocolNotes={setNotes}
      winTeam={null}
      handleEndGameWithWinner={vi.fn()}
    />
  );
}

describe('live protocol note recovery', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it('hydrates judge notes from the recovery bridge after re-entry', async () => {
    localStorage.setItem(LEGACY_PROTOCOL_NOTES_KEY, 'Не забыть отметить спорное голосование');
    render(<Harness />);

    expect(await screen.findByDisplayValue('Не забыть отметить спорное голосование')).toBeTruthy();
  });

  it('writes edited judge notes immediately to recovery storage', async () => {
    render(<Harness />);
    const textarea = screen.getByPlaceholderText('Свободные примечания ведущего к протоколу...');
    fireEvent.change(textarea, { target: { value: 'Проверить ЛХ после игры' } });

    await waitFor(() => {
      expect(localStorage.getItem(LEGACY_PROTOCOL_NOTES_KEY)).toBe('Проверить ЛХ после игры');
    });
  });
});
