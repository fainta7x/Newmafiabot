import React, { useState, useEffect } from 'react';
import { X, Download, Share2, AlertCircle, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { Tournament } from '../../../lib/api.ts';
import {
  buildSeatingMatrix,
  generateSeatingSvg,
  renderSvgToPngDataUrl,
  getSafeFilename,
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

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

      const matrix = buildSeatingMatrix(tournament);

      if (!matrix.valid) {
        setErrorMsg(matrix.error || 'Ошибка построения матрицы рассадки');
        setLoading(false);
        return;
      }

      try {
        const svg = generateSeatingSvg(tournament, matrix.rows);
        const url = await renderSvgToPngDataUrl(svg, 1080, 1600);
        setPngUrl(url);
      } catch (err: any) {
        console.error('Failed to generate seating PNG:', err);
        setErrorMsg(err.message || 'Ошибка генерации PNG изображения');
      } finally {
        setLoading(false);
      }
    };

    prepareImage();
  }, [isOpen, tournament]);

  if (!isOpen) return null;

  const fileName = getSafeFilename(tournament.title);
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
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
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
          ) : errorMsg ? (
            <div className="p-5 bg-danger/10 border border-danger/30 rounded-2xl text-center max-w-md space-y-2">
              <AlertCircle className="w-8 h-8 text-danger mx-auto" />
              <h4 className="text-sm font-bold text-danger">Не удалось выгрузить рассадку</h4>
              <p className="text-xs text-text-secondary">{errorMsg}</p>
            </div>
          ) : pngUrl ? (
            <div className="w-full max-w-lg bg-surface-2 p-3 rounded-2xl border border-border-soft flex flex-col items-center space-y-3">
              <div className="w-full max-h-[60vh] overflow-y-auto rounded-xl border border-border-soft shadow-inner bg-black/40 p-2 flex justify-center">
                <img
                  src={pngUrl}
                  alt={`Рассадка ${tournament.title}`}
                  className="w-full h-auto max-w-full rounded-lg shadow-md object-contain"
                />
              </div>
              <p className="text-[11px] text-text-muted text-center font-mono">
                Имя файла: <span className="text-text-primary font-bold">{fileName}</span> (1080×1600 px)
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-border-soft bg-surface-1 shrink-0 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-surface-2 hover:bg-surface-hover text-text-secondary font-bold px-4 py-2.5 rounded-2xl text-xs uppercase tracking-wider cursor-pointer min-h-[44px]"
          >
            Закрыть
          </button>

          {!loading && !errorMsg && pngUrl && (
            <div className="flex items-center gap-2">
              {canWebShare && (
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={sharing}
                  className="bg-surface-2 hover:bg-surface-hover border border-border-soft text-text-primary font-bold px-4 py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 min-h-[44px]"
                >
                  <Share2 className="w-4 h-4 text-accent" />
                  <span>Поделиться</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDownload}
                className="bg-accent hover:bg-accent-hover text-white font-extrabold px-5 py-2.5 rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-accent/20 min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                <span>Скачать PNG</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
