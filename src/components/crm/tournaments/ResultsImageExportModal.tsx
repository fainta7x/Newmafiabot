import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, Image as ImageIcon, RefreshCw, Share2 } from 'lucide-react';
import { api, type Tournament } from '../../../lib/api.ts';
import {
  buildGameExportRows,
  buildOfficialTournamentResultsPresentation,
  generateGameResultsSvg,
  generateOfficialTournamentResultsSvg,
  generateStandingsSvg,
  getSafeFilenameForGame,
  getSafeFilenameForOfficial,
  getSafeFilenameForStandings,
  renderSvgToPngBlob,
} from '../../../lib/tournamentResultsExport.ts';
import { MobileSheet } from '../../ui/MobileSheet.tsx';

interface ResultsImageExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournament: Tournament;
  exportType: 'game' | 'standings' | 'official';
  gameId?: string;
  gameNumber?: number;
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
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [fileName, setFileName] = useState('export.png');

  const requestSeqRef = useRef(0);
  const objectUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const shareBusyRef = useRef(false);
  const downloadBusyRef = useRef(false);

  const revokePreviewUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPngUrl(null);
  }, []);

  const clearPreview = useCallback(() => {
    revokePreviewUrl();
    setPngBlob(null);
  }, [revokePreviewUrl]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      requestSeqRef.current += 1;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const prepareImage = useCallback(async () => {
    if (!isOpen) return;

    const requestSeq = ++requestSeqRef.current;
    clearPreview();
    setGenerationError(null);
    setActionError(null);
    setLoading(true);

    try {
      let blob: Blob;
      let nextFileName = 'export.png';

      if (exportType === 'official') {
        const [freshTournament, readiness, standingsRes, awardsRes] = await Promise.all([
          api.getTournament(tournament.id),
          api.getTournamentFinalReadiness(tournament.id),
          api.getTournamentStandings(tournament.id),
          api.getTournamentAwards(tournament.id),
        ]);

        if (freshTournament.status !== 'completed') {
          throw new Error(
            freshTournament.status === 'correction'
              ? 'Завершите корректировку турнира и повторно зафиксируйте итоги — после этого можно будет сформировать новое изображение.'
              : 'Официальный PNG доступен только после завершения турнира.'
          );
        }
        if (!readiness?.ready) {
          throw new Error('Сначала разрешите все равенства мест и номинаций.');
        }

        const presentation = buildOfficialTournamentResultsPresentation(
          freshTournament,
          standingsRes.standings || [],
          awardsRes.slots || [],
          new Date(),
        );
        const rendered = generateOfficialTournamentResultsSvg(presentation);
        blob = await renderSvgToPngBlob(rendered.svg, rendered.width, rendered.height);
        nextFileName = getSafeFilenameForOfficial(freshTournament.title, freshTournament.date);
      } else if (exportType === 'game') {
        if (!gameId) throw new Error('Не указан идентификатор игры для экспорта');

        const [protocolRes, standingsRes] = await Promise.all([
          api.getGameProtocol(tournament.id, gameId),
          api.getTournamentStandings(tournament.id),
        ]);
        const exportRows = buildGameExportRows(
          protocolRes.player_results || [],
          standingsRes.standings || [],
          protocolRes.game.game_number,
        );
        const svg = generateGameResultsSvg(tournament, protocolRes.game, exportRows);
        blob = await renderSvgToPngBlob(svg, 1080, 1600);
        nextFileName = getSafeFilenameForGame(tournament.title, protocolRes.game.game_number);
      } else {
        const standingsRes = await api.getTournamentStandings(tournament.id);
        const completedGames = standingsRes.completed_games_count ?? 0;
        const totalGames = tournament.total_games_count ?? 10;
        const svg = generateStandingsSvg(tournament, standingsRes.standings || [], completedGames, totalGames);
        blob = await renderSvgToPngBlob(svg, 1080, 1600);
        nextFileName = getSafeFilenameForStandings(tournament.title, completedGames);
      }

      if (!mountedRef.current || requestSeq !== requestSeqRef.current || !isOpen) return;
      const objectUrl = URL.createObjectURL(blob);
      if (!mountedRef.current || requestSeq !== requestSeqRef.current || !isOpen) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      objectUrlRef.current = objectUrl;
      setPngBlob(blob);
      setPngUrl(objectUrl);
      setFileName(nextFileName);
    } catch (err: any) {
      if (!mountedRef.current || requestSeq !== requestSeqRef.current || !isOpen) return;
      setGenerationError(err?.message || 'Ошибка генерации PNG-изображения');
    } finally {
      if (mountedRef.current && requestSeq === requestSeqRef.current && isOpen) setLoading(false);
    }
  }, [clearPreview, exportType, gameId, isOpen, tournament]);

  useEffect(() => {
    if (!isOpen) {
      requestSeqRef.current += 1;
      clearPreview();
      setGenerationError(null);
      setActionError(null);
      setLoading(true);
      shareBusyRef.current = false;
      downloadBusyRef.current = false;
      setSharing(false);
      setDownloading(false);
      return;
    }

    void prepareImage();
    return () => {
      requestSeqRef.current += 1;
    };
  }, [clearPreview, isOpen, prepareImage]);

  const shareFile = useMemo(() => {
    if (!pngBlob || typeof File === 'undefined') return null;
    return new File([pngBlob], fileName, { type: 'image/png' });
  }, [fileName, pngBlob]);

  const canShareFile = useMemo(() => {
    if (!shareFile || typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
      return false;
    }
    try {
      return navigator.canShare({ files: [shareFile] });
    } catch {
      return false;
    }
  }, [shareFile]);

  const handleDownload = () => {
    if (!pngUrl || downloadBusyRef.current) return;
    downloadBusyRef.current = true;
    setDownloading(true);
    setActionError(null);
    try {
      const anchor = document.createElement('a');
      anchor.href = pngUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (err: any) {
      setActionError(err?.message || 'Не удалось скачать PNG');
    } finally {
      window.setTimeout(() => {
        downloadBusyRef.current = false;
        if (mountedRef.current) setDownloading(false);
      }, 0);
    }
  };

  const handleShare = async () => {
    if (!shareFile || !canShareFile || shareBusyRef.current) return;
    shareBusyRef.current = true;
    setSharing(true);
    setActionError(null);
    try {
      await navigator.share({
        title: exportType === 'game'
          ? `Результаты игры №${gameNumber || '—'}`
          : exportType === 'official'
            ? `Официальные результаты: ${tournament.title}`
            : 'Турнирная таблица',
        files: [shareFile],
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') setActionError(err?.message || 'Не удалось поделиться PNG-файлом');
    } finally {
      shareBusyRef.current = false;
      if (mountedRef.current) setSharing(false);
    }
  };

  const title = exportType === 'game'
    ? `Результаты игры №${gameNumber || '—'}`
    : exportType === 'official'
      ? 'Официальные результаты'
      : 'Турнирная таблица';

  const subtitle = exportType === 'official'
    ? 'Каждое открытие формируется заново из актуальных данных турнира.'
    : exportType === 'game'
      ? 'Итоговый вертикальный протокол с баллами.'
      : 'Вертикальная турнирная таблица по правилам ФСМ.';

  const footer = generationError ? (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => void prepareImage()} className="min-h-[48px] rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white inline-flex items-center justify-center gap-2">
        <RefreshCw className="h-4 w-4" /> Повторить
      </button>
      <button type="button" onClick={onClose} className="min-h-[48px] rounded-[13px] border border-border-soft bg-surface-2 px-4 text-[13px] font-semibold text-text-secondary">
        Закрыть
      </button>
    </div>
  ) : !loading && pngUrl && pngBlob ? (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <button type="button" onClick={handleDownload} disabled={downloading} className="min-h-[48px] rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white inline-flex items-center justify-center gap-2 disabled:opacity-50">
        {downloading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Скачать PNG
      </button>
      {canShareFile ? (
        <button type="button" onClick={() => void handleShare()} disabled={sharing} className="min-h-[48px] rounded-[13px] border border-border-soft bg-surface-2 px-4 text-[13px] font-bold text-text-primary inline-flex items-center justify-center gap-2 disabled:opacity-50">
          {sharing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4 text-accent" />}
          Поделиться PNG
        </button>
      ) : null}
      <button type="button" onClick={onClose} className="min-h-[48px] rounded-[13px] border border-border-soft bg-surface-2 px-4 text-[13px] font-semibold text-text-secondary">
        Закрыть
      </button>
    </div>
  ) : undefined;

  return (
    <MobileSheet
      open={isOpen}
      onClose={onClose}
      title={
        <span className="inline-flex min-w-0 items-center gap-2">
          <ImageIcon className="h-4.5 w-4.5 shrink-0 text-accent" />
          <span className="truncate">{title}</span>
        </span>
      }
      subtitle={subtitle}
      widthClass="sm:max-w-2xl"
      bodyClassName="p-4 sm:p-5"
      footer={footer}
    >
      <div className="min-w-0">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3 text-center text-text-secondary">
            <RefreshCw className="h-8 w-8 animate-spin text-accent" />
            <p className="text-[13px] font-semibold">Формируем PNG из актуальных данных…</p>
          </div>
        ) : generationError ? (
          <div className="rounded-[18px] border border-danger/30 bg-danger-soft p-5 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-danger" />
            <h4 className="mt-3 text-[14px] font-bold text-text-primary">Не удалось сформировать изображение</h4>
            <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">{generationError}</p>
          </div>
        ) : pngUrl ? (
          <div className="min-w-0 space-y-3">
            <div className="w-full overflow-x-hidden rounded-[16px] border border-border-soft bg-black/30 p-2">
              <img data-testid="results-preview-image" src={pngUrl} alt={exportType === 'official' ? 'Официальные результаты турнира' : title} className="block h-auto w-full max-w-full rounded-[10px] object-contain" />
            </div>
            <p className="max-w-full break-all text-center font-mono text-[11px] text-text-muted">{fileName}</p>
            {actionError ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{actionError}</div> : null}
            {!canShareFile && exportType === 'official' ? (
              <p className="text-center text-[11px] leading-4 text-text-muted">
                На этом устройстве отправка PNG-файла через системное меню не поддерживается. Используйте «Скачать PNG» или сохраните изображение из Preview.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </MobileSheet>
  );
};

export default ResultsImageExportModal;
