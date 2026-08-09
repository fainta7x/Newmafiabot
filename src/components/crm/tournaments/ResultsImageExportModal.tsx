import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  Image as ImageIcon,
  Minus,
  Plus,
  RefreshCw,
  Share2,
} from 'lucide-react';
import { api, type Tournament, type TournamentStandingItem } from '../../../lib/api.ts';
import {
  buildGameExportRows,
  buildOfficialTournamentResultsPresentation,
  generateGameResultsPages,
  generateGameResultsSvg,
  generateOfficialTournamentResultsPages,
  generateOfficialTournamentResultsSvg,
  generateStandingsPages,
  generateStandingsSvg,
  getSafeFilenameForGame,
  getSafeFilenameForOfficial,
  getSafeFilenameForStandings,
  getSvgDimensions,
  renderSvgToPngBlob,
  type ExportSvgPage,
} from '../../../lib/tournamentResultsExport.ts';
import { MobileSheet } from '../../ui/MobileSheet.tsx';

const EXPORT_AVATAR_SIZE = 320;
const exportAvatarPromiseCache = new Map<string, Promise<string | null>>();

type PreviewPage = {
  blob: Blob;
  url: string;
  fileName: string;
};

type ArchiveImage = {
  blob: Blob;
  url: string;
  fileName: string;
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('avatar-timeout')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
};

const compactAvatarForOfficialSvg = async (dataUrl: string): Promise<string | null> => {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
  try {
    const image = await withTimeout(new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('avatar-decode-failed'));
      img.src = dataUrl;
    }), 2500);

    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_AVATAR_SIZE;
    canvas.height = EXPORT_AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return null;
    const crop = Math.min(sourceWidth, sourceHeight);
    const sx = Math.max(0, (sourceWidth - crop) / 2);
    const sy = Math.max(0, (sourceHeight - crop) * 0.28);
    ctx.drawImage(image, sx, sy, crop, crop, 0, 0, EXPORT_AVATAR_SIZE, EXPORT_AVATAR_SIZE);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
};

const loadOfficialAvatar = (standing: TournamentStandingItem): Promise<string | null> => {
  if (!standing.player_id) return Promise.resolve(null);
  const cacheKey = `${standing.player_id}:${standing.avatar_updated_at || 'repository'}`;
  const cached = exportAvatarPromiseCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const avatar = await withTimeout(api.getPlayerAvatar(standing.player_id!), 2500);
      return await compactAvatarForOfficialSvg(avatar.data_url);
    } catch {
      return null;
    }
  })();
  exportAvatarPromiseCache.set(cacheKey, promise);
  return promise;
};

const loadOfficialAvatarMap = async (standings: TournamentStandingItem[]): Promise<Record<string, string>> => {
  const entries = await Promise.all(standings.map(async (standing) => {
    const dataUrl = await loadOfficialAvatar(standing);
    return dataUrl ? [standing.participant_id, dataUrl] as const : null;
  }));
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)));
};

const pageFileName = (baseFileName: string, index: number): string => {
  const base = baseFileName.replace(/\.png$/i, '');
  return `${base}-${String(index + 1).padStart(2, '0')}.png`;
};

export const canShareExportFiles = (
  navigatorLike: Pick<Navigator, 'share' | 'canShare'> | undefined,
  files: File[],
): boolean => {
  if (!navigatorLike || typeof navigatorLike.share !== 'function' || typeof navigatorLike.canShare !== 'function' || files.length === 0) {
    return false;
  }
  try {
    return navigatorLike.canShare({ files });
  } catch {
    return false;
  }
};

const triggerDownload = (url: string, fileName: string) => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

const renderPages = async (pages: ExportSvgPage[], baseFileName: string): Promise<PreviewPage[]> => {
  const rendered: PreviewPage[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const blob = await renderSvgToPngBlob(page.svg, page.width, page.height);
    const url = URL.createObjectURL(blob);
    rendered.push({ blob, url, fileName: pageFileName(baseFileName, index) });
  }
  return rendered;
};

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
  const [pages, setPages] = useState<PreviewPage[]>([]);
  const [archive, setArchive] = useState<ArchiveImage | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const shareBusyRef = useRef(false);
  const downloadBusyRef = useRef(false);
  const objectUrlsRef = useRef<string[]>([]);

  const clearPreview = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
    setPages([]);
    setArchive(null);
    setActivePage(0);
    setZoom(1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSeqRef.current += 1;
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
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
      let pageSvgs: ExportSvgPage[] = [];
      let archiveSvg = '';
      let archiveWidth = 1080;
      let archiveHeight = 1350;
      let baseFileName = 'export.png';

      if (exportType === 'official') {
        const [freshTournament, readiness, standingsRes, awardsRes, nominationsRes] = await Promise.all([
          api.getTournament(tournament.id),
          api.getTournamentFinalReadiness(tournament.id),
          api.getTournamentStandings(tournament.id),
          api.getTournamentAwards(tournament.id),
          api.getTournamentNominations(tournament.id),
        ]);

        if (freshTournament.status !== 'completed') {
          throw new Error(
            freshTournament.status === 'correction'
              ? 'Завершите корректировку турнира и повторно зафиксируйте итоги — после этого можно будет сформировать новое изображение.'
              : 'Официальные результаты доступны только после завершения турнира.'
          );
        }
        if (!readiness?.ready) throw new Error('Сначала разрешите все равенства мест и номинаций.');

        const freshStandings = standingsRes.standings || [];
        const avatarDataByParticipant = await loadOfficialAvatarMap(freshStandings);
        const presentation = buildOfficialTournamentResultsPresentation(
          freshTournament,
          freshStandings,
          awardsRes.slots || [],
          new Date(),
          avatarDataByParticipant,
          nominationsRes.nominations || [],
        );
        pageSvgs = generateOfficialTournamentResultsPages(presentation);
        const longResult = generateOfficialTournamentResultsSvg(presentation);
        archiveSvg = longResult.svg;
        archiveWidth = longResult.width;
        archiveHeight = longResult.height;
        baseFileName = getSafeFilenameForOfficial(freshTournament.title, freshTournament.date);
      } else if (exportType === 'game') {
        if (!gameId) throw new Error('Не указан идентификатор игры для экспорта');
        const [protocolRes, standingsRes] = await Promise.all([
          api.getGameProtocol(tournament.id, gameId),
          api.getTournamentStandings(tournament.id),
        ]);
        const gameStandings = standingsRes.standings || [];
        const avatarDataByParticipant = await loadOfficialAvatarMap(gameStandings);
        const exportRows = buildGameExportRows(
          protocolRes.player_results || [],
          gameStandings,
          protocolRes.game.game_number,
          avatarDataByParticipant,
        );
        pageSvgs = generateGameResultsPages(tournament, protocolRes.game, exportRows);
        archiveSvg = generateGameResultsSvg(tournament, protocolRes.game, exportRows);
        const dimensions = getSvgDimensions(archiveSvg);
        archiveWidth = dimensions.width;
        archiveHeight = dimensions.height;
        baseFileName = getSafeFilenameForGame(tournament.title, protocolRes.game.game_number);
      } else {
        const standingsRes = await api.getTournamentStandings(tournament.id);
        const currentStandings = standingsRes.standings || [];
        const avatarDataByParticipant = await loadOfficialAvatarMap(currentStandings);
        const completedGames = standingsRes.completed_games_count ?? 0;
        const totalGames = tournament.total_games_count ?? 10;
        pageSvgs = generateStandingsPages(
          tournament,
          currentStandings,
          completedGames,
          totalGames,
          avatarDataByParticipant,
        );
        archiveSvg = generateStandingsSvg(
          tournament,
          currentStandings,
          completedGames,
          totalGames,
          avatarDataByParticipant,
        );
        const dimensions = getSvgDimensions(archiveSvg);
        archiveWidth = dimensions.width;
        archiveHeight = dimensions.height;
        baseFileName = getSafeFilenameForStandings(tournament.title, completedGames);
      }

      if (!pageSvgs.length) throw new Error('Экспорт не сформировал ни одной страницы');
      const nextPages = await renderPages(pageSvgs, baseFileName);
      const archiveBlob = await renderSvgToPngBlob(archiveSvg, archiveWidth, archiveHeight);
      const archiveUrl = URL.createObjectURL(archiveBlob);
      const urls = [...nextPages.map((page) => page.url), archiveUrl];

      if (!mountedRef.current || requestSeq !== requestSeqRef.current || !isOpen) {
        urls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      objectUrlsRef.current = urls;
      setPages(nextPages);
      setArchive({ blob: archiveBlob, url: archiveUrl, fileName: baseFileName });
    } catch (err: any) {
      if (!mountedRef.current || requestSeq !== requestSeqRef.current || !isOpen) return;
      setGenerationError(err?.message || 'Ошибка генерации изображения');
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
    return () => { requestSeqRef.current += 1; };
  }, [clearPreview, isOpen, prepareImage]);

  const pageFiles = useMemo(() => {
    if (typeof File === 'undefined') return [];
    return pages.map((page) => new File([page.blob], page.fileName, { type: 'image/png' }));
  }, [pages]);

  const canShareAll = useMemo(() => (
    typeof navigator !== 'undefined' && canShareExportFiles(navigator, pageFiles)
  ), [pageFiles]);

  const currentPageFile = pageFiles[activePage] || null;
  const canShareCurrent = useMemo(() => (
    typeof navigator !== 'undefined' && currentPageFile
      ? canShareExportFiles(navigator, [currentPageFile])
      : false
  ), [currentPageFile]);

  const handleShareFiles = async (files: File[]) => {
    if (!files.length || shareBusyRef.current || typeof navigator === 'undefined' || typeof navigator.share !== 'function') return;
    shareBusyRef.current = true;
    setSharing(true);
    setActionError(null);
    try {
      await navigator.share({
        title: exportType === 'game'
          ? `Результаты игры №${gameNumber || '—'}`
          : exportType === 'official'
            ? `Итоги турнира: ${tournament.title}`
            : `Промежуточные итоги: ${tournament.title}`,
        files,
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') setActionError(err?.message || 'Не удалось открыть системное меню отправки');
    } finally {
      shareBusyRef.current = false;
      if (mountedRef.current) setSharing(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!pages.length || downloadBusyRef.current) return;
    downloadBusyRef.current = true;
    setDownloading(true);
    setActionError(null);
    try {
      pages.forEach((page, index) => {
        window.setTimeout(() => triggerDownload(page.url, page.fileName), index * 120);
      });
    } catch (err: any) {
      setActionError(err?.message || 'Не удалось скачать страницы');
    } finally {
      window.setTimeout(() => {
        downloadBusyRef.current = false;
        if (mountedRef.current) setDownloading(false);
      }, Math.max(0, pages.length - 1) * 120 + 50);
    }
  };

  const scrollToPage = (index: number) => {
    const next = Math.max(0, Math.min(pages.length - 1, index));
    setActivePage(next);
    const node = carouselRef.current;
    if (node) node.scrollTo({ left: node.clientWidth * next, behavior: 'smooth' });
  };

  const handleCarouselScroll = () => {
    const node = carouselRef.current;
    if (!node || !node.clientWidth) return;
    const next = Math.round(node.scrollLeft / node.clientWidth);
    if (next !== activePage && next >= 0 && next < pages.length) setActivePage(next);
  };

  const title = exportType === 'game'
    ? `Результаты игры №${gameNumber || '—'}`
    : exportType === 'official'
      ? 'Итоги турнира'
      : 'Промежуточные итоги';

  const subtitle = loading
    ? 'Формируем читаемые страницы 1080×1350 из актуальных данных…'
    : pages.length
      ? `${pages.length} ${pages.length === 1 ? 'страница' : pages.length < 5 ? 'страницы' : 'страниц'} · свайпните для просмотра`
      : 'Предпросмотр результата';

  const footer = generationError ? (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => void prepareImage()} className="min-h-[48px] rounded-[13px] bg-accent px-4 text-[13px] font-bold text-white inline-flex items-center justify-center gap-2">
        <RefreshCw className="h-4 w-4" /> Повторить
      </button>
      <button type="button" onClick={onClose} className="min-h-[48px] rounded-[13px] border border-border-soft bg-surface-2 px-4 text-[13px] font-semibold text-text-secondary">
        Закрыть
      </button>
    </div>
  ) : !loading && pages.length ? (
    <div className="grid grid-cols-3 gap-2">
      <button
        type="button"
        onClick={() => void handleShareFiles(pageFiles)}
        disabled={!canShareAll || sharing}
        className="min-h-[48px] rounded-[13px] bg-accent px-3 text-[12px] font-black text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-45"
      >
        {sharing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        Поделиться
      </button>
      <button
        type="button"
        onClick={() => void handleDownloadAll()}
        disabled={downloading}
        className="min-h-[48px] rounded-[13px] border border-border-soft bg-surface-2 px-3 text-[12px] font-bold text-text-primary inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {downloading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-accent" />}
        Скачать
      </button>
      <button type="button" onClick={onClose} className="min-h-[48px] rounded-[13px] border border-border-soft bg-surface-2 px-3 text-[12px] font-semibold text-text-secondary">
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
      widthClass="sm:max-w-5xl"
      bodyClassName="p-0 sm:p-4"
      footer={footer}
    >
      <div className="min-w-0 h-full">
        {loading ? (
          <div className="min-h-[55dvh] flex flex-col items-center justify-center gap-3 text-center text-text-secondary px-4">
            <RefreshCw className="h-8 w-8 animate-spin text-accent" />
            <p className="text-[13px] font-semibold">Формируем страницы из актуальных данных…</p>
          </div>
        ) : generationError ? (
          <div className="m-4 rounded-[18px] border border-danger/30 bg-danger-soft p-5 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-danger" />
            <h4 className="mt-3 text-[14px] font-bold text-text-primary">Не удалось сформировать результат</h4>
            <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">{generationError}</p>
          </div>
        ) : pages.length ? (
          <div className="min-w-0 space-y-3 pb-3">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border-soft bg-surface-1/95 px-3 py-2 backdrop-blur-xl sm:rounded-t-[14px]">
              <div className="inline-flex items-center gap-1">
                <button type="button" aria-label="Предыдущая страница" onClick={() => scrollToPage(activePage - 1)} disabled={activePage === 0} className="h-10 w-10 rounded-xl border border-border-soft bg-surface-2 inline-flex items-center justify-center text-text-secondary disabled:opacity-30">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Следующая страница" onClick={() => scrollToPage(activePage + 1)} disabled={activePage >= pages.length - 1} className="h-10 w-10 rounded-xl border border-border-soft bg-surface-2 inline-flex items-center justify-center text-text-secondary disabled:opacity-30">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <strong className="text-[12px] font-black tabular-nums text-text-primary">{activePage + 1} из {pages.length}</strong>
              <div className="inline-flex items-center gap-1">
                <button type="button" aria-label="Уменьшить" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))} disabled={zoom <= 1} className="h-10 w-10 rounded-xl border border-border-soft bg-surface-2 inline-flex items-center justify-center text-text-secondary disabled:opacity-30">
                  <Minus className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Увеличить" onClick={() => setZoom((value) => Math.min(2, Number((value + 0.25).toFixed(2))))} disabled={zoom >= 2} className="h-10 w-10 rounded-xl border border-border-soft bg-surface-2 inline-flex items-center justify-center text-text-secondary disabled:opacity-30">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div
              ref={carouselRef}
              onScroll={handleCarouselScroll}
              className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {pages.map((page, index) => (
                <div key={page.fileName} className="min-w-full snap-center px-2 sm:px-6">
                  <div className="mx-auto flex min-h-[50dvh] items-start justify-center overflow-auto rounded-[14px] border border-border-soft bg-black/35 p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ touchAction: 'pan-x pan-y pinch-zoom' }}>
                    <img
                      data-testid={`results-preview-page-${index + 1}`}
                      src={page.url}
                      alt={`${title}, страница ${index + 1} из ${pages.length}`}
                      className="block h-auto rounded-[8px] object-contain transition-[width] duration-150"
                      style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? '100%' : 'none' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="px-3 sm:px-6 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => triggerDownload(pages[activePage].url, pages[activePage].fileName)} className="min-h-[42px] rounded-xl border border-border-soft bg-surface-2 px-3 text-[11px] font-bold text-text-secondary inline-flex items-center justify-center gap-1.5">
                  <FileDown className="h-4 w-4" /> Скачать эту страницу
                </button>
                {canShareCurrent && !canShareAll ? (
                  <button type="button" onClick={() => currentPageFile && void handleShareFiles([currentPageFile])} className="min-h-[42px] rounded-xl border border-border-soft bg-surface-2 px-3 text-[11px] font-bold text-text-secondary inline-flex items-center justify-center gap-1.5">
                    <Share2 className="h-4 w-4 text-accent" /> Поделиться страницей
                  </button>
                ) : archive ? (
                  <button type="button" onClick={() => triggerDownload(archive.url, archive.fileName)} className="min-h-[42px] rounded-xl border border-border-soft bg-surface-2 px-3 text-[11px] font-bold text-text-secondary inline-flex items-center justify-center gap-1.5">
                    <Download className="h-4 w-4" /> Скачать одним файлом
                  </button>
                ) : <span />}
              </div>

              {!canShareAll ? (
                <p className="rounded-xl border border-border-soft bg-surface-2/70 px-3 py-2 text-[11px] leading-4 text-text-muted">
                  Это устройство не умеет отправлять набор PNG одним системным действием. Скачайте все пронумерованные страницы или отправьте текущую страницу отдельно, если системное меню это поддерживает.
                </p>
              ) : null}
              {archive && canShareCurrent && !canShareAll ? (
                <button type="button" onClick={() => triggerDownload(archive.url, archive.fileName)} className="text-[11px] font-semibold text-text-muted underline underline-offset-2">
                  Скачать архивный длинный PNG одним файлом
                </button>
              ) : null}
              {actionError ? <div className="rounded-[13px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{actionError}</div> : null}
              <p className="break-all text-center font-mono text-[10px] text-text-muted">{pages[activePage]?.fileName}</p>
            </div>
          </div>
        ) : null}
      </div>
    </MobileSheet>
  );
};

export default ResultsImageExportModal;
