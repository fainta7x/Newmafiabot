import React, { useState, useEffect } from 'react';
import { X, Download, Share2, AlertCircle, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { api, Tournament } from '../../../lib/api.ts';
import {
  buildGameExportRows,
  generateGameResultsSvg,
  generateStandingsSvg,
  renderSvgToPngDataUrl,
  getSafeFilenameForGame,
  getSafeFilenameForStandings,
} from '../../../lib/tournamentResultsExport.ts';

interface ResultsImageExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournament: Tournament;
  exportType: 'game' | 'standings';
  gameId?: string; // Required if exportType === 'game'
  gameNumber?: number; // Optional metadata
}

export const ResultsImageExportModal: React.FC<ResultsImageExportModalProps> = ({
  isOpen,
  onClose,
  tournament,
  exportType,
  gameId,
  gameNumber,
}) => {
  const [loading, setLoading] = useState(true);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [fileName, setFileName] = useState<string>('export.png');

  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setPngUrl(null);
      setErrorMsg(null);
      setLoading(true);
      return;
    }

    const prepareImage = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        if (exportType === 'game') {
          if (!gameId) {
            throw new Error('Не указан идентификатор игры для экспорта');
          }

          // Fetch game protocol and standings in parallel
          const [protocolRes, standingsRes] = await Promise.all([
            api.getGameProtocol(tournament.id, gameId),
            api.getTournamentStandings(tournament.id),
          ]);

          const exportRows = buildGameExportRows(
            protocolRes.player_results || [],
            standingsRes.standings || [],
            protocolRes.game.game_number
          );

          const svg = generateGameResultsSvg(tournament, protocolRes.game, exportRows);
          const url = await renderSvgToPngDataUrl(svg, 1080, 1600);
          setPngUrl(url);
          setFileName(getSafeFilenameForGame(tournament.title, protocolRes.game.game_number));
        } else {
          // standings export
          const standingsRes = await api.getTournamentStandings(tournament.id);
          const totalGames = tournament.total_games_count ?? 10;
          const completedGames = standingsRes.completed_games_count ?? 0;

          const svg = generateStandingsSvg(
            tournament,
            standingsRes.standings || [],
            completedGames,
            totalGames
          );
          const url = await renderSvgToPngDataUrl(svg, 1080, 1600);
          setPngUrl(url);
          setFileName(getSafeFilenameForStandings(tournament.title, completedGames));
        }
      } catch (err: any) {
        console.error('Failed to generate results image:', err);
        setErrorMsg(err.message || 'Ошибка генерации PNG-изображения');
      } finally {
        setLoading(false);
      }
    };

    prepareImage();
  }, [isOpen, tournament, exportType, gameId]);

  if (!isOpen) return null;

  const canWebShare = typeof navigator !== 'undefined' && Boolean(navigator.share);

  const handleDownload = () => {
    if (!pngUrl) return;
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = async () => {
    if (!pngUrl || sharing) return;
    setSharing(true);
    try {
      const res = await fetch(pngUrl);
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: exportType === 'game' ? `Результаты игры №${gameNumber}` : `Турнирная таблица`,
          text: exportType === 'game' ? `Итоговый протокол игры №${gameNumber}` : `Промежуточная турнирная таблица турнира "${tournament.title}"`,
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: exportType === 'game' ? `Результаты игры №${gameNumber}` : `Турнирная таблица`,
          url: window.location.href,
        });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md" id="results-export-overlay">
      <div className="bg-surface-1 border border-border-soft rounded-3xl max-w-2xl w-full flex flex-col max-h-[calc(100dvh-16px)] text-text-primary shadow-2xl relative overflow-hidden" id="results-export-modal-container">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border-soft shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shrink-0">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold">
                {exportType === 'game' ? `Результаты игры №${gameNumber || '—'} (PNG)` : 'Турнирная таблица (PNG)'}
              </h3>
              <p className="text-[11px] text-text-secondary">
                {exportType === 'game' ? 'Итоговый вертикальный протокол с баллами' : 'Вертикальная турнирная таблица по правилам ФСМ'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            id="btn-close-results-export"
            className="text-text-muted hover:text-text-primary p-2 rounded-full hover:bg-surface-hover cursor-pointer transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Preview Body */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 flex flex-col items-center justify-center">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-text-muted">
              <RefreshCw className="w-8 h-8 animate-spin text-accent" />
              <p className="text-xs font-semibold">Формируем изображение высокого разрешения…</p>
            </div>
          ) : errorMsg ? (
            <div className="p-5 bg-danger/10 border border-danger/30 rounded-2xl text-center max-w-md space-y-2">
              <AlertCircle className="w-8 h-8 text-danger mx-auto" />
              <h4 className="text-sm font-bold text-danger">Не удалось экспортировать результаты</h4>
              <p className="text-xs text-text-secondary">{errorMsg}</p>
            </div>
          ) : pngUrl ? (
            <div className="w-full max-w-lg bg-surface-2 p-3 rounded-2xl border border-border-soft flex flex-col items-center space-y-3">
              <div className="w-full max-h-[50vh] overflow-y-auto rounded-xl border border-border-soft shadow-inner bg-black/40 p-2 flex justify-center">
                <img
                  src={pngUrl}
                  alt={exportType === 'game' ? `Итоговый протокол игры №${gameNumber}` : `Турнирная таблица`}
                  className="w-full h-auto max-w-full rounded-lg shadow-md object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <p className="text-[11px] text-text-muted text-center font-mono break-all max-w-full">
                Имя файла: {fileName}
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        {!loading && !errorMsg && pngUrl && (
          <div className="p-4 sm:p-5 border-t border-border-soft bg-surface-2/40 shrink-0 flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={handleDownload}
              id="btn-download-results-png"
              className="flex-1 bg-accent hover:bg-accent-hover text-white font-bold py-3 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-accent/10"
            >
              <Download className="w-4 h-4" />
              <span>Скачать PNG</span>
            </button>

            {canWebShare && (
              <button
                onClick={handleShare}
                id="btn-share-results-png"
                disabled={sharing}
                className="flex-1 bg-surface-2 hover:bg-surface-3 text-text-primary border border-border-soft font-bold py-3 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {sharing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4 text-accent" />}
                <span>Поделиться</span>
              </button>
            )}

            <button
              onClick={onClose}
              id="btn-cancel-results-export"
              className="bg-surface-3 hover:bg-surface-4 text-text-secondary font-bold py-3 px-4 rounded-2xl text-xs transition-all cursor-pointer"
            >
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
