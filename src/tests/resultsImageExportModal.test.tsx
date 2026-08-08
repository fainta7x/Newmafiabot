/**
 * @vitest-environment jsdom
 */
import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTournament: vi.fn(),
  getTournamentFinalReadiness: vi.fn(),
  getTournamentStandings: vi.fn(),
  getTournamentAwards: vi.fn(),
  buildOfficialTournamentResultsPresentation: vi.fn(),
  generateOfficialTournamentResultsSvg: vi.fn(),
  renderSvgToPngBlob: vi.fn(),
  getSafeFilenameForOfficial: vi.fn(),
}));

vi.mock('../lib/api.ts', () => ({
  api: {
    getTournament: mocks.getTournament,
    getTournamentFinalReadiness: mocks.getTournamentFinalReadiness,
    getTournamentStandings: mocks.getTournamentStandings,
    getTournamentAwards: mocks.getTournamentAwards,
    getGameProtocol: vi.fn(),
  },
}));

vi.mock('../lib/tournamentResultsExport.ts', () => ({
  buildGameExportRows: vi.fn(),
  buildOfficialTournamentResultsPresentation: mocks.buildOfficialTournamentResultsPresentation,
  generateGameResultsSvg: vi.fn(),
  generateOfficialTournamentResultsSvg: mocks.generateOfficialTournamentResultsSvg,
  generateStandingsSvg: vi.fn(),
  getSafeFilenameForGame: vi.fn(() => 'game.png'),
  getSafeFilenameForOfficial: mocks.getSafeFilenameForOfficial,
  getSafeFilenameForStandings: vi.fn(() => 'standings.png'),
  renderSvgToPngBlob: mocks.renderSvgToPngBlob,
}));

import { ResultsImageExportModal } from '../components/crm/tournaments/ResultsImageExportModal.tsx';

const tournament = {
  id: 't-strict-mode',
  title: 'Тестовый турнир',
  date: '2026-08-08T18:00:00.000Z',
  venue: 'Тула',
  status: 'completed',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-08T20:00:00.000Z',
} as any;

describe('ResultsImageExportModal official PNG lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:official-results'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });

    mocks.getTournament.mockResolvedValue(tournament);
    mocks.getTournamentFinalReadiness.mockResolvedValue({ ready: true });
    mocks.getTournamentStandings.mockResolvedValue({ standings: [], completed_games_count: 10 });
    mocks.getTournamentAwards.mockResolvedValue({ slots: [] });
    mocks.buildOfficialTournamentResultsPresentation.mockReturnValue({ tournament, standings: [], podium: [], nominations: [] });
    mocks.generateOfficialTournamentResultsSvg.mockReturnValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', width: 1080, height: 1200 });
    mocks.renderSvgToPngBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    mocks.getSafeFilenameForOfficial.mockReturnValue('test-official-results-2026-08-08.png');
  });

  afterEach(() => {
    cleanup();
  });

  it('finishes generation under React.StrictMode instead of staying on the spinner forever', async () => {
    render(
      <StrictMode>
        <ResultsImageExportModal
          isOpen
          onClose={() => {}}
          tournament={tournament}
          exportType="official"
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('results-preview-image')).toBeTruthy();
    });

    expect(screen.queryByText('Формируем PNG из актуальных данных…')).toBeNull();
    expect(mocks.renderSvgToPngBlob).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});
