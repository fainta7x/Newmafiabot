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
  getTournamentNominations: vi.fn(),
  buildOfficialTournamentResultsPresentation: vi.fn(),
  generateOfficialTournamentResultsPages: vi.fn(),
  renderSvgToPngBlob: vi.fn(),
  getSafeFilenameForOfficial: vi.fn(),
}));

vi.mock('../lib/api.ts', () => ({
  api: {
    getTournament: mocks.getTournament,
    getTournamentFinalReadiness: mocks.getTournamentFinalReadiness,
    getTournamentStandings: mocks.getTournamentStandings,
    getTournamentAwards: mocks.getTournamentAwards,
    getTournamentNominations: mocks.getTournamentNominations,
    getPlayerAvatar: vi.fn(),
    getGameProtocol: vi.fn(),
  },
}));

vi.mock('../lib/tournamentResultsExport.ts', () => ({
  buildGameExportRows: vi.fn(),
  buildOfficialTournamentResultsPresentation: mocks.buildOfficialTournamentResultsPresentation,
  generateGameResultsPages: vi.fn(),
  generateOfficialTournamentResultsPages: mocks.generateOfficialTournamentResultsPages,
  generateStandingsPages: vi.fn(),
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

const assets = [
  { section: 'winners', label: 'Победители', file_suffix: 'winners', block_ids: ['podium-1'], svg: '<svg width="1080" height="1350"></svg>', width: 1080, height: 1350 },
  { section: 'ranking', label: 'Рейтинг', file_suffix: 'final-rating', block_ids: ['ranking-1'], svg: '<svg width="1080" height="1800"></svg>', width: 1080, height: 1800 },
  { section: 'awards', label: 'Номинации', file_suffix: 'awards', block_ids: ['award-mvp'], svg: '<svg width="1080" height="1300"></svg>', width: 1080, height: 1300 },
] as any[];

describe('ResultsImageExportModal semantic official PNG lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let objectUrlIndex = 0;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => `blob:official-results-${++objectUrlIndex}`),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    mocks.getTournament.mockResolvedValue(tournament);
    mocks.getTournamentFinalReadiness.mockResolvedValue({ ready: true });
    mocks.getTournamentStandings.mockResolvedValue({ standings: [], completed_games_count: 10 });
    mocks.getTournamentAwards.mockResolvedValue({ slots: [] });
    mocks.getTournamentNominations.mockResolvedValue({ nominations: [] });
    mocks.buildOfficialTournamentResultsPresentation.mockReturnValue({ tournament, standings: [], podium: [], nominations: [] });
    mocks.generateOfficialTournamentResultsPages.mockReturnValue(assets);
    mocks.renderSvgToPngBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    mocks.getSafeFilenameForOfficial.mockReturnValue('test-official-results-2026-08-08.png');
  });

  afterEach(cleanup);

  it('generates exactly three reusable semantic images under StrictMode', async () => {
    render(
      <StrictMode>
        <ResultsImageExportModal isOpen onClose={() => {}} tournament={tournament} exportType="official" />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByTestId('results-preview-page-1')).toBeTruthy());
    expect(screen.getByText(/3 изображения/)).toBeTruthy();
    expect(screen.getByText('Победители')).toBeTruthy();
    expect(screen.getByText(/01-winners\.png/)).toBeTruthy();
    expect(mocks.generateOfficialTournamentResultsPages).toHaveBeenCalled();
    expect(mocks.renderSvgToPngBlob).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(screen.queryByText(/Скачать одним файлом/)).toBeNull();
  });
});
