import React, { useState, useEffect, useRef } from 'react';
import { X, Download, Share2, AlertCircle, RefreshCw, Image as ImageIcon, Send, MessageCircle, CheckCircle2 } from 'lucide-react';
import { api, Tournament } from '../../../lib/api.ts';
import {
  buildSeatingMatrix,
  generateSeatingSvg,
  renderSvgToPngBlob,
  getSafeFilename,
  shouldUseNativeShareForDownload,
} from '../../../lib/seatingExport.ts';

interface SeatingExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournament: Tournament;
}

export const SeatingExportModal: React.FC<SeatingExportModalProps> = ({
  isOpen,
  onClose,
  tournament,
}) => {
  const [loading, setLoading] = useState(true);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sendingTo, setSendingTo] = useState<'group' | 'me' | null>(null);
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const clearImage = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setPngUrl(null);
    setPngBlob(null);
  };

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
      clearImage();
      setErrorMsg(null);
      setSentMsg(null);
      setLoading(true);
      return;
    }

    const prepareImage = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        // The roster may have been corrected in another panel. Always build the export
        // from the canonical server state instead of a stale modal prop.
        const freshTournament = await api.getTournament(tournament.id).catch(() => tournament);
        const matrix = buildSeatingMatrix(freshTournament);
        if (!matrix.valid) throw new Error(matrix.error || 'Ошибка построения матрицы рассадки');
        const svg = generateSeatingSvg(freshTournament, matrix.rows);
        const blob = await renderSvgToPngBlob(svg, 1080, 1350);
        clearImage();
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setPngBlob(blob);
        setPngUrl(url);
      } catch (err: any) {
        console.error('Failed to generate seating PNG:', err);
        setErrorMsg(err.message || 'Ошибка генерации PNG изображения');
      } finally {
        setLoading(false);
      }
    };

    void prepareImage();
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    };
  }, [isOpen, tournament]);

  if (!isOpen) return null;

  const fileName = getSafeFilename(tournament.title);
  const canWebShare = typeof navigator !== 'undefined' && Boolean(navigator.share);

  const file = pngBlob && typeof File !== 'undefined'
    ? new File([pngBlob], fileName, { type: 'image/png' })
    : null;
  let canShareFile = false;
  try {
    canShareFile = Boolean(file && navigator.canShare?.({ files: [file] }));
  } catch {
    canShareFile = false;
  }

  const handleDownload = async () => {
    if (!pngUrl || !file || downloading) return;
    setDownloading(true);
    setErrorMsg(null);
    try {
      // iOS and Telegram WebView ignore the download attribute. Their native share
      // sheet offers a reliable "Save image / Save to Files" action instead.
      if (shouldUseNativeShareForDownload(navigator.userAgent, canShareFile) && navigator.share) {
        await navigator.share({ title: `Рассадка: ${tournament.title}`, files: [file] });
        return;
      }
      const anchor = document.createElement('a');
      anchor.href = pngUrl;
      anchor.download = fileName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (err: any) {
      if (err?.name !== 'AbortError') setErrorMsg(err?.message || 'Не удалось сохранить PNG');
    } finally {
      setDownloading(false);
    }
  };

  // Inside the Telegram app the browser save/share menu is often missing, so the bot sends the picture:
  // to the rating group, or to the organizer's own Telegram to save or forward anywhere (VK chat included).
  const handleSend = async (target: 'group' | 'me') => {
    if (!pngBlob || sendingTo) return;
    if (target === 'group' && !window.confirm('Отправить рассадку в группу «Рейтинг» в Telegram?')) return;
    setSendingTo(target);
    setErrorMsg(null);
    setSentMsg(null);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Не удалось подготовить картинку'));
        reader.readAsDataURL(pngBlob);
      });
      await api.sendTournamentSeatingImage(tournament.id, target, dataUrl.replace(/^data:image\/png;base64,/, ''));
      setSentMsg(target === 'group' ? 'Рассадка отправлена в группу «Рейтинг».' : 'Рассадка отправлена вам в Telegram. Откройте чат с ботом: оттуда её можно сохранить или переслать, в том числе в VK.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Не удалось отправить рассадку');
    } finally {
      setSendingTo(null);
    }
  };

  const handleShare = async () => {
    if (!file || sharing) return;
    setSharing(true);
    try {
      if (canShareFile) {
        await navigator.share({
          title: `Рассадка: ${tournament.title}`,
          text: `Общая рассадка игроков для турнира "${tournament.title}"`,
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: `Рассадка: ${tournament.title}`,
          url: window.location.href,
        });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') setErrorMsg(err?.message || 'Не удалось открыть меню отправки');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md">
      <div className="bg-surface-1 border border-border-soft rounded-3xl max-w-2xl w-full flex flex-col max-h-[calc(100dvh-16px)] text-text-primary shadow-2xl relative overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border-soft shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shrink-0">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold">Рассадка для игроков (PNG)</h3>
              <p className="text-[11px] text-text-secondary">Общая рассадка: 10 игроков × 10 игр</p>
            </div>
          </div>
          <button
            onClick={onClose}
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
              <p className="text-xs font-semibold">Генерируем рассадку высокого разрешения…</p>
            </div>
          ) : errorMsg && !pngUrl ? (
            <div className="p-5 bg-danger/10 border border-danger/30 rounded-2xl text-center max-w-md space-y-2">
              <AlertCircle className="w-8 h-8 text-danger mx-auto" />
              <h4 className="text-sm font-bold text-danger">Не удалось выгрузить рассадку</h4>
              <p className="text-xs text-text-secondary">{errorMsg}</p>
            </div>
          ) : pngUrl ? (
            <div className="w-full max-w-lg bg-surface-2 p-3 rounded-2xl border border-border-soft flex flex-col items-center space-y-3">
              <div className="w-full rounded-xl border border-border-soft shadow-inner bg-black/40 p-2 flex justify-center">
                <img
                  src={pngUrl}
                  alt={`Рассадка ${tournament.title}`}
                  className="w-full h-auto max-w-full rounded-lg shadow-md object-contain"
                />
              </div>
              <p className="text-[11px] text-text-muted text-center font-mono">
                Имя файла: <span className="text-text-primary font-bold">{fileName}</span> (1080×1350 px)
              </p>
              <p className="text-[11px] text-text-muted text-center">
                Если «Скачать» не сработало: нажмите на картинку и удерживайте, затем «Сохранить», или отправьте её через Telegram кнопками ниже.
              </p>
              {sentMsg && (
                <div className="w-full rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{sentMsg}</span>
                </div>
              )}
              {errorMsg && (
                <div className="w-full rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 border-t border-border-soft bg-surface-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 sm:pb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] w-full rounded-2xl bg-surface-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-text-secondary hover:bg-surface-hover cursor-pointer sm:w-auto"
          >
            Закрыть
          </button>

          {!loading && pngUrl && (
            <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => void handleSend('group')}
                disabled={sendingTo !== null}
                className="min-h-[44px] w-full rounded-2xl border border-border-soft bg-surface-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-text-primary transition-all hover:bg-surface-hover cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 sm:w-auto"
              >
                <Send className="w-4 h-4 text-accent" />
                <span>{sendingTo === 'group' ? 'Отправляем…' : 'В группу Telegram'}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSend('me')}
                disabled={sendingTo !== null}
                className="min-h-[44px] w-full rounded-2xl border border-border-soft bg-surface-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-text-primary transition-all hover:bg-surface-hover cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 sm:w-auto"
              >
                <MessageCircle className="w-4 h-4 text-accent" />
                <span>{sendingTo === 'me' ? 'Отправляем…' : 'Мне в Telegram'}</span>
              </button>
              {canWebShare && (
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={sharing}
                  className="min-h-[44px] w-full rounded-2xl border border-border-soft bg-surface-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-text-primary transition-all hover:bg-surface-hover cursor-pointer flex items-center justify-center gap-2 sm:w-auto"
                >
                  <Share2 className="w-4 h-4 text-accent" />
                  <span>Поделиться</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleDownload()}
                disabled={downloading}
                className="min-h-[44px] w-full rounded-2xl bg-accent px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white transition-all hover:bg-accent-hover cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-accent/20 disabled:opacity-50 sm:w-auto"
              >
                <Download className="w-4 h-4" />
                <span>{downloading ? 'Открываем…' : 'Скачать PNG'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
