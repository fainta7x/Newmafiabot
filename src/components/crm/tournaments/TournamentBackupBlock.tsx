import React, { useState, useEffect } from 'react';
import { Download, Upload, ShieldAlert, CheckCircle, Database, AlertTriangle, RefreshCw, HardDrive } from 'lucide-react';
import { getLocalTournamentBackup, LocalTournamentBackup } from '../../../lib/tournamentBackupStorage.ts';

interface TournamentBackupBlockProps {
  tournamentId: string;
  serverCompletedProtocolsCount: number;
  serverTotalGamesCount: number;
  onRestored: () => void;
}

export const TournamentBackupBlock: React.FC<TournamentBackupBlockProps> = ({
  tournamentId,
  serverCompletedProtocolsCount,
  serverTotalGamesCount,
  onRestored,
}) => {
  const [localBackup, setLocalBackup] = useState<LocalTournamentBackup | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Modal & Restore States
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [backupToRestore, setBackupToRestore] = useState<any | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
    comparison?: {
      server: { games_count: number; completed_protocols_count: number; player_results_count: number };
      backup: { created_at: string; games_count: number; completed_protocols_count: number; player_results_count: number; players_count: number };
    };
  } | null>(null);

  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadLocalBackup();
  }, [tournamentId, serverCompletedProtocolsCount]);

  const loadLocalBackup = async () => {
    try {
      const b = await getLocalTournamentBackup(tournamentId);
      setLocalBackup(b);
    } catch (err) {
      console.warn('Error reading local backup:', err);
    }
  };

  const isLocalNewer = Boolean(
    localBackup && localBackup.completed_protocols_count > serverCompletedProtocolsCount
  );

  const handleDownloadJSON = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/tournaments/${tournamentId}/backup`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error('Не удалось скачать резервную копию');
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tournament_${tournamentId}_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Ошибка скачивания копии');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const parsed = JSON.parse(text);
        startValidateAndModal(parsed);
      } catch (err) {
        alert('Некорректный JSON-файл: не удалось распарсить структуру');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const startValidateAndModal = async (backupData: any) => {
    setBackupToRestore(backupData);
    setShowRestoreModal(true);
    setValidating(true);
    setValidationResult(null);
    setRestoreError(null);
    setRestoreSuccessMsg(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/tournaments/${tournamentId}/backup/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(backupData),
      });

      const data = await res.json();
      if (!res.ok) {
        setValidationResult({ valid: false, error: data.error || 'Ошибка проверки копии' });
      } else {
        setValidationResult(data);
      }
    } catch (err: any) {
      setValidationResult({ valid: false, error: err.message || 'Ошибка подключения к серверу' });
    } finally {
      setValidating(false);
    }
  };

  const handleRestoreFromLocal = () => {
    if (localBackup?.backupData) {
      startValidateAndModal(localBackup.backupData);
    }
  };

  const handleExecuteRestore = async () => {
    if (!backupToRestore) return;

    setRestoring(true);
    setRestoreError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/tournaments/${tournamentId}/backup/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(backupToRestore),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка выполнения восстановления');
      }

      setRestoreSuccessMsg(`Восстановление успешно! Проверено: integrity=${data.integrity}. Протоколов: ${data.counts?.completed_protocols}/10`);
      await loadLocalBackup();
      setTimeout(() => {
        setShowRestoreModal(false);
        onRestored();
      }, 1500);
    } catch (err: any) {
      setRestoreError(err.message || 'Ошибка восстановления');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Banner if local IndexedDB backup has MORE completed protocols than server */}
      {isLocalNewer && !bannerDismissed && (
        <div className="bg-amber-500/15 border-2 border-amber-500/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200 shadow-lg animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400 shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-amber-300">
                На этом устройстве найдена более свежая локальная копия!
              </h4>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Локально: <strong>{localBackup?.completed_protocols_count}/{localBackup?.total_games_count}</strong> игр 
                ({localBackup?.saved_at ? new Date(localBackup.saved_at).toLocaleString('ru-RU') : ''}). 
                На сервере: <strong>{serverCompletedProtocolsCount}/{serverTotalGamesCount}</strong> игр.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={handleRestoreFromLocal}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow"
            >
              Проверить и восстановить
            </button>
            <button
              onClick={() => setBannerDismissed(true)}
              className="px-3 py-1.5 bg-surface-2 hover:bg-surface-hover text-text-muted hover:text-text-primary rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Игнорировать
            </button>
          </div>
        </div>
      )}

      {/* Compact Backup Control Block */}
      <div className="bg-surface-1 border border-border-soft rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-accent/10 rounded-xl text-accent shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-text-primary">Резервная копия турнира</span>
              {isLocalNewer ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Локальная копия новее
                </span>
              ) : localBackup ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  Копия актуальна
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-2 text-text-muted border border-border-soft">
                  Нет локальной копии
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              Сохранено: {localBackup ? `${localBackup.completed_protocols_count}/${localBackup.total_games_count} протоколов` : 'не сохранялось'} 
              {localBackup?.saved_at ? ` (${new Date(localBackup.saved_at).toLocaleString('ru-RU')})` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleDownloadJSON}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-surface-hover border border-border-soft rounded-xl text-xs font-semibold text-text-primary transition cursor-pointer"
            title="Скачать JSON backup турнира"
          >
            <Download className="w-3.5 h-3.5 text-accent" />
            <span>Скачать JSON</span>
          </button>

          <label className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 bg-surface-2 hover:bg-surface-hover border border-border-soft rounded-xl text-xs font-semibold text-text-primary transition cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Загрузить JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Verification & Restoration Modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl text-slate-100 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-lg text-slate-100">Восстановление из резервной копии</h3>
              </div>
              <button
                onClick={() => setShowRestoreModal(false)}
                disabled={restoring}
                className="text-slate-400 hover:text-slate-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {validating ? (
              <div className="py-8 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                <p className="text-sm font-medium text-slate-300">Проверка валидности и целостности копии...</p>
              </div>
            ) : validationResult && !validationResult.valid ? (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <ShieldAlert className="w-5 h-5" />
                  <span>Ошибка проверки копии</span>
                </div>
                <p className="text-xs text-rose-200">{validationResult.error}</p>
                <div className="pt-2">
                  <button
                    onClick={() => setShowRestoreModal(false)}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            ) : validationResult?.valid && validationResult.comparison ? (
              <div className="space-y-4">
                <div className="bg-slate-800/60 border border-slate-700/80 rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Сравнение данных: Сейчас → В копии</h4>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-slate-400 font-medium block">Текущие данные (сервер):</span>
                      <div className="text-slate-200 font-bold">Игр: {validationResult.comparison.server.games_count}</div>
                      <div className="text-slate-200 font-bold">Протоколов: {validationResult.comparison.server.completed_protocols_count}/10</div>
                      <div className="text-slate-200 font-bold">Результатов: {validationResult.comparison.server.player_results_count}</div>
                    </div>

                    <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/30 space-y-1">
                      <span className="text-amber-400 font-medium block">В резервной копии:</span>
                      <div className="text-amber-200 font-bold">Игр: {validationResult.comparison.backup.games_count}</div>
                      <div className="text-amber-200 font-bold">Протоколов: {validationResult.comparison.backup.completed_protocols_count}/10</div>
                      <div className="text-amber-200 font-bold">Результатов: {validationResult.comparison.backup.player_results_count}</div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Дата создания копии: {validationResult.comparison.backup.created_at ? new Date(validationResult.comparison.backup.created_at).toLocaleString('ru-RU') : 'неизвестно'}
                  </p>
                </div>

                {restoreError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl font-semibold">
                    {restoreError}
                  </div>
                )}

                {restoreSuccessMsg && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl font-semibold flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>{restoreSuccessMsg}</span>
                  </div>
                )}

                {!restoreSuccessMsg && (
                  <div className="space-y-3 pt-2">
                    <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl">
                      ⚠️ Перед восстановлением текущая база автоматически сохранится во временное хранилище (`os.tmpdir()`). 
                      Операция выполняется одной транзакцией.
                    </p>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowRestoreModal(false)}
                        disabled={restoring}
                        className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={handleExecuteRestore}
                        disabled={restoring}
                        className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow"
                      >
                        {restoring ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                        <span>{restoring ? 'Восстановление...' : 'Восстановить'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
