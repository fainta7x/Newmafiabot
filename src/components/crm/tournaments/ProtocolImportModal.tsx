import React, { useState, useRef } from 'react';
import {
  X,
  Camera,
  Image as ImageIcon,
  RotateCw,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Eye,
  FileSpreadsheet,
  Check,
} from 'lucide-react';
import { api, TournamentGame } from '../../../lib/api.ts';
import { DetectedGame, RecognizedRole, WinnerTeam } from '../../../server/services/recognition/types.ts';

interface ProtocolImportModalProps {
  tournamentId: string;
  games: TournamentGame[];
  onClose: () => void;
  onSuccess: () => void;
  preselectedGameId?: string;
}

type Step = 'instructions' | 'preview' | 'processing' | 'review' | 'compare';

export const ProtocolImportModal: React.FC<ProtocolImportModalProps> = ({
  tournamentId,
  games,
  onClose,
  onSuccess,
  preselectedGameId,
}) => {
  const [step, setStep] = useState<Step>('instructions');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importId, setImportId] = useState<string | null>(null);

  // Recognition data
  const [detectedGames, setDetectedGames] = useState<DetectedGame[]>([]);
  const [selectedGameIdx, setSelectedGameIdx] = useState<number>(0);
  const [gameMappings, setGameMappings] = useState<Record<number, string>>({});

  // Full photo view toggle
  const [showFullPhoto, setShowFullPhoto] = useState<boolean>(false);

  // Compare step state
  const [compareGameId, setCompareGameId] = useState<string | null>(null);
  const [existingDraft, setExistingDraft] = useState<any>(null);
  const [newDraft, setNewDraft] = useState<DetectedGame | null>(null);

  // Progress animation state
  const [processingStage, setProcessingStage] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Handle file selection
  const handleFileChange = (file: File | null) => {
    setErrorMsg(null);
    if (!file) return;

    // Validate size (max 15 MB)
    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('Размер файла превышает 15 МБ. Выберите меньший файл.');
      return;
    }

    // Validate type
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowed.includes(file.type.toLowerCase())) {
      setErrorMsg('Поддерживаются только форматы JPG, PNG и WEBP');
      return;
    }

    setSelectedFile(file);
    setRotation(0);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setStep('preview');
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Start recognition process
  const handleRecognize = async () => {
    if (!selectedFile) return;

    setErrorMsg(null);
    setStep('processing');
    setProcessingStage(1);

    const stageTimer1 = setTimeout(() => setProcessingStage(2), 1200);
    const stageTimer2 = setTimeout(() => setProcessingStage(3), 2800);
    const stageTimer3 = setTimeout(() => setProcessingStage(4), 4500);

    try {
      const res = await api.uploadProtocolBlank(tournamentId, selectedFile);
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);
      setProcessingStage(5);

      if (res.import_id) {
        setImportId(res.import_id);
      }

      const gamesList: DetectedGame[] = res.detected_games || res.recognition_json?.detected_games || [];
      if (gamesList.length === 0) {
        setErrorMsg('Не удалось найти заполненные бланки игр на фотографии');
        setStep('preview');
        return;
      }

      setDetectedGames(gamesList);
      setSelectedGameIdx(0);

      // Pre-assign game mappings
      const mappings: Record<number, string> = {};
      gamesList.forEach((g, idx) => {
        if (preselectedGameId && idx === 0) {
          mappings[idx] = preselectedGameId;
        } else if (g.game_number) {
          const matched = games.find((tg) => tg.game_number === g.game_number);
          if (matched) {
            mappings[idx] = matched.id;
          }
        }
      });
      setGameMappings(mappings);

      setStep('review');
    } catch (err: any) {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);

      const msg = err.message || 'Ошибка распознавания';
      setErrorMsg(msg);
      setStep('instructions');
    }
  };

  // Update field value in detected game draft
  const handleUpdateDetectedGame = (gameIdx: number, updater: (prev: DetectedGame) => DetectedGame) => {
    setDetectedGames((prev) => {
      const copy = [...prev];
      copy[gameIdx] = updater(copy[gameIdx]);
      return copy;
    });
  };

  // Helper to calculate low confidence count for current game
  const getLowConfidenceCount = (g: DetectedGame) => {
    let count = 0;
    if (g.game_number_confidence < 0.85) count++;
    if (g.winner_team.confidence < 0.85) count++;
    g.players.forEach((p) => {
      if (p.role.confidence < 0.85) count++;
      if (p.regular_fouls.confidence < 0.85) count++;
      if (p.technical_fouls.confidence < 0.85) count++;
      if (p.judge_bonus.confidence < 0.85) count++;
      if (p.protocol_bonus.confidence < 0.85) count++;
      if (p.penalty_points.confidence < 0.85) count++;
    });
    if (g.best_move && g.best_move.confidence < 0.85) count++;
    return count;
  };

  // Apply draft to target game
  const handleApplyClick = async () => {
    if (!importId) return;

    const currentGame = detectedGames[selectedGameIdx];
    const targetGameId = gameMappings[selectedGameIdx];

    if (!targetGameId) {
      setErrorMsg('Выберите игра турнира, к которой привязать этот бланк');
      return;
    }

    // Check if target game already has draft
    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const draftRes = await api.getGameProtocolDraft(tournamentId, targetGameId);
      if (draftRes.draft_protocol && Object.keys(draftRes.draft_protocol).length > 0) {
        // Exists! Prompt compare screen
        setCompareGameId(targetGameId);
        setExistingDraft(draftRes.draft_protocol);
        setNewDraft(currentGame);
        setStep('compare');
        setIsSubmitting(false);
        return;
      }

      // No existing draft, apply directly!
      await executeApply([{
        detected_game_index: selectedGameIdx,
        target_game_id: targetGameId,
        action: 'apply',
        draft_data: currentGame,
      }]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Ошибка проверки существующего черновика');
      setIsSubmitting(false);
    }
  };

  const executeApply = async (mappings: any[]) => {
    if (!importId) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await api.applyProtocolImport(tournamentId, importId, mappings);

      if (res.errors && res.errors.length > 0) {
        setErrorMsg(res.errors.join('; '));
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Ошибка применения протокола');
      setIsSubmitting(false);
    }
  };

  const currentDetectedGame = detectedGames[selectedGameIdx];
  const targetGame = games.find((g) => g.id === gameMappings[selectedGameIdx]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-auto overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
            <span className="font-semibold text-base">Загрузка бланка игры</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-start gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMsg}</div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">

          {/* Hidden Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
          />

          {/* STEP 1: INSTRUCTIONS */}
          {step === 'instructions' && (
            <div className="space-y-4 text-slate-800">
              <div className="text-center py-2">
                <h3 className="text-base font-bold text-slate-900">Загрузите фотографию бланка</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Искусственный интеллект автоматически распознает задействованные места, фолы, голосования и стрельбу
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-2">
                <p className="font-semibold text-slate-900">Инструкция по съемке:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
                  <li>Положите бланк на ровную поверхность.</li>
                  <li>Весь бланк должен попадать в кадр.</li>
                  <li>Избегайте бликов, ярких теней и размытия.</li>
                  <li>Снимайте строго сверху.</li>
                  <li>На одном фото можно разместить несколько заполненных бланков.</li>
                  <li>После распознавания обязательно проверьте все отмеченные поля.</li>
                </ol>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs text-sm"
                >
                  <Camera className="w-4 h-4" />
                  Сфотографировать
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-medium rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  <ImageIcon className="w-4 h-4 text-slate-500" />
                  Выбрать из галереи
                </button>
              </div>

              <p className="text-[11px] text-center text-slate-400">
                Поддерживаются JPG, PNG и WEBP размером до 15 МБ
              </p>
            </div>
          )}

          {/* STEP 2: PREVIEW */}
          {step === 'preview' && previewUrl && (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center min-h-[260px] max-h-[380px] p-2">
                <img
                  src={previewUrl}
                  alt="Превью бланка"
                  className="max-h-[360px] w-auto object-contain transition-transform duration-200"
                  style={{ transform: `rotate(${rotation}deg)` }}
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleRotate}
                  className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Повернуть
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg"
                  >
                    Заменить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                      setStep('instructions');
                    }}
                    className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-medium rounded-lg flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Удалить
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRecognize}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-xs text-sm"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Распознать бланк
              </button>
            </div>
          )}

          {/* STEP 3: PROCESSING */}
          {step === 'processing' && (
            <div className="py-8 text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>

              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-base">Идет обработка бланка...</h4>
                <p className="text-xs text-slate-500">Нейросеть сканирует рукописный текст и символы</p>
              </div>

              {/* Steps Progress Checklist */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-2 text-xs">
                <div className={`flex items-center gap-2 ${processingStage >= 1 ? 'text-indigo-600 font-medium' : 'text-slate-400'}`}>
                  {processingStage > 1 ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
                  <span>1. Загрузка фотографии</span>
                </div>
                <div className={`flex items-center gap-2 ${processingStage >= 2 ? 'text-indigo-600 font-medium' : 'text-slate-400'}`}>
                  {processingStage > 2 ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : processingStage === 2 ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <span className="w-4 h-4 rounded-full border border-slate-300 inline-block" />}
                  <span>2. Анализ структуры бланка</span>
                </div>
                <div className={`flex items-center gap-2 ${processingStage >= 3 ? 'text-indigo-600 font-medium' : 'text-slate-400'}`}>
                  {processingStage > 3 ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : processingStage === 3 ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <span className="w-4 h-4 rounded-full border border-slate-300 inline-block" />}
                  <span>3. Разделение и выравнивание игр</span>
                </div>
                <div className={`flex items-center gap-2 ${processingStage >= 4 ? 'text-indigo-600 font-medium' : 'text-slate-400'}`}>
                  {processingStage >= 5 ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : processingStage === 4 ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <span className="w-4 h-4 rounded-full border border-slate-300 inline-block" />}
                  <span>4. Формирование черновика</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="text-xs text-slate-500 underline hover:text-slate-700"
              >
                Скрыть (распознавание продолжится в фоне)
              </button>
            </div>
          )}

          {/* STEP 4: REVIEW */}
          {step === 'review' && currentDetectedGame && (
            <div className="space-y-4 text-xs">
              {/* Top Banner */}
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  {previewUrl && (
                    <button
                      type="button"
                      onClick={() => setShowFullPhoto(true)}
                      className="relative rounded-lg overflow-hidden border border-slate-300 w-10 h-10 shrink-0 group"
                    >
                      <img src={previewUrl} alt="Миниатюра" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye className="w-3.5 h-3.5 text-white" />
                      </div>
                    </button>
                  )}
                  <div>
                    <div className="font-bold text-slate-900">Найдено игр: {detectedGames.length}</div>
                    <div className="text-[11px] text-amber-600 font-medium">
                      Требуют проверки: {getLowConfidenceCount(currentDetectedGame)} полей
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowFullPhoto(true)}
                  className="px-2.5 py-1.5 bg-indigo-50 text-indigo-700 font-medium rounded-lg text-[11px] hover:bg-indigo-100 transition-colors"
                >
                  Посмотреть фото
                </button>
              </div>

              {/* Game Tabs */}
              {detectedGames.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {detectedGames.map((g, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedGameIdx(idx)}
                      className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap text-xs transition-colors ${
                        selectedGameIdx === idx
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Игра {idx + 1} {g.game_number ? `(№${g.game_number})` : ''}
                    </button>
                  ))}
                </div>
              )}

              {/* Target Game Select */}
              <div className="bg-indigo-50/60 border border-indigo-100 p-3 rounded-xl space-y-1">
                <label className="font-semibold text-slate-800 block text-[11px]">
                  Привязать к игре турнира:
                </label>
                <select
                  value={gameMappings[selectedGameIdx] || ''}
                  onChange={(e) =>
                    setGameMappings((prev) => ({ ...prev, [selectedGameIdx]: e.target.value }))
                  }
                  className="w-full bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Выберите игру --</option>
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>
                      Игра №{g.game_number} ({g.status === 'planned' ? 'запланирована' : g.status === 'active' ? 'идет' : 'завершена'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Section 1: Players & Roles */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 font-bold text-slate-900 border-b border-slate-200 flex items-center justify-between">
                  <span>1. Игроки и роли (10 мест)</span>
                  <span className="text-[10px] text-slate-500 font-normal">Место / Роль</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {currentDetectedGame.players.map((p, pIdx) => {
                    const participantSeat = targetGame?.seats?.find((s) => s.seat_number === p.seat_number);
                    const isRoleLowConf = p.role.confidence < 0.85;

                    return (
                      <div key={p.seat_number} className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-slate-200 font-bold text-slate-700 text-[11px] flex items-center justify-center shrink-0">
                            {p.seat_number}
                          </span>
                          <div className="truncate">
                            <div className="font-semibold text-slate-800 truncate">
                              {participantSeat?.display_name || p.written_name || `Игрок ${p.seat_number}`}
                            </div>
                            {p.written_name && participantSeat?.display_name && p.written_name !== participantSeat.display_name && (
                              <div className="text-[10px] text-slate-400 truncate">
                                На фото: {p.written_name}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Role Dropdown */}
                        <div className="shrink-0 flex items-center gap-1">
                          <select
                            value={p.role.value || ''}
                            onChange={(e) => {
                              const val = (e.target.value || null) as RecognizedRole;
                              handleUpdateDetectedGame(selectedGameIdx, (prev) => {
                                const players = [...prev.players];
                                players[pIdx] = { ...players[pIdx], role: { value: val, confidence: 1.0 } };
                                return { ...prev, players };
                              });
                            }}
                            className={`py-1 px-2 border rounded-lg text-xs font-semibold focus:outline-hidden ${
                              isRoleLowConf
                                ? 'border-amber-400 bg-amber-50 text-amber-900'
                                : 'border-slate-300 bg-white text-slate-800'
                            }`}
                          >
                            <option value="">- Не указана -</option>
                            <option value="citizen">Мирный</option>
                            <option value="sheriff">Шериф</option>
                            <option value="mafia">Мафия</option>
                            <option value="don">Дон</option>
                          </select>
                          {isRoleLowConf && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded-sm font-semibold" title="Проверьте роль">
                              ?
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Fouls & Bonuses */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 font-bold text-slate-900 border-b border-slate-200">
                  2. Фолы и бонусы игроков
                </div>
                <div className="p-2.5 space-y-2">
                  <div className="grid grid-cols-5 text-[10px] font-bold text-slate-500 pb-1 border-b border-slate-100 text-center">
                    <div>Место</div>
                    <div>Фолы</div>
                    <div>Тех.</div>
                    <div>Бон.</div>
                    <div>Штр.</div>
                  </div>
                  {currentDetectedGame.players.map((p, pIdx) => (
                    <div key={p.seat_number} className="grid grid-cols-5 gap-1 items-center text-center">
                      <span className="font-semibold text-slate-700 text-xs">#{p.seat_number}</span>
                      <input
                        type="number"
                        min="0"
                        max="4"
                        value={p.regular_fouls.value}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          handleUpdateDetectedGame(selectedGameIdx, (prev) => {
                            const players = [...prev.players];
                            players[pIdx] = { ...players[pIdx], regular_fouls: { value: val, confidence: 1.0 } };
                            return { ...prev, players };
                          });
                        }}
                        className="w-full text-center border border-slate-200 rounded-md py-0.5 font-medium text-xs"
                      />
                      <input
                        type="number"
                        min="0"
                        value={p.technical_fouls.value}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          handleUpdateDetectedGame(selectedGameIdx, (prev) => {
                            const players = [...prev.players];
                            players[pIdx] = { ...players[pIdx], technical_fouls: { value: val, confidence: 1.0 } };
                            return { ...prev, players };
                          });
                        }}
                        className="w-full text-center border border-slate-200 rounded-md py-0.5 font-medium text-xs"
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={p.judge_bonus.value}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          handleUpdateDetectedGame(selectedGameIdx, (prev) => {
                            const players = [...prev.players];
                            players[pIdx] = { ...players[pIdx], judge_bonus: { value: val, confidence: 1.0 } };
                            return { ...prev, players };
                          });
                        }}
                        className="w-full text-center border border-slate-200 rounded-md py-0.5 font-medium text-xs"
                      />
                      <input
                        type="number"
                        step="0.1"
                        value={p.penalty_points.value}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          handleUpdateDetectedGame(selectedGameIdx, (prev) => {
                            const players = [...prev.players];
                            players[pIdx] = { ...players[pIdx], penalty_points: { value: val, confidence: 1.0 } };
                            return { ...prev, players };
                          });
                        }}
                        className="w-full text-center border border-slate-200 rounded-md py-0.5 font-medium text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 3: Result & Best Move */}
              <div className="border border-slate-200 rounded-xl overflow-hidden p-3 space-y-3 bg-slate-50/50">
                <div className="font-bold text-slate-900">3. Итог игры и лучший ход</div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 block text-[11px]">
                    Победившая команда:
                  </label>
                  <select
                    value={currentDetectedGame.winner_team.value || ''}
                    onChange={(e) => {
                      const val = (e.target.value || null) as WinnerTeam;
                      handleUpdateDetectedGame(selectedGameIdx, (prev) => ({
                        ...prev,
                        winner_team: { value: val, confidence: 1.0 },
                      }));
                    }}
                    className="w-full bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="">- Не определена -</option>
                    <option value="red">Красные (Мирные)</option>
                    <option value="black">Чёрные (Мафия)</option>
                  </select>
                </div>

                {/* Best move */}
                <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-2">
                  <div className="font-semibold text-slate-800 text-[11px]">Лучший ход (ЛХ):</div>
                  <div className="grid grid-cols-4 gap-2 items-center">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Кому (место)</span>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={currentDetectedGame.best_move?.recipient_seat || ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || null;
                          handleUpdateDetectedGame(selectedGameIdx, (prev) => ({
                            ...prev,
                            best_move: {
                              recipient_seat: val,
                              seat_numbers: prev.best_move?.seat_numbers || [],
                              confidence: 1.0,
                            },
                          }));
                        }}
                        className="w-full border border-slate-200 rounded-md py-1 text-center font-bold text-xs"
                      />
                    </div>

                    {[0, 1, 2].map((idx) => (
                      <div key={idx}>
                        <span className="text-[10px] text-slate-400 block">Угад #{idx + 1}</span>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={currentDetectedGame.best_move?.seat_numbers?.[idx] || ''}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            handleUpdateDetectedGame(selectedGameIdx, (prev) => {
                              const seats = [...(prev.best_move?.seat_numbers || [])];
                              if (val > 0) {
                                seats[idx] = val;
                              } else {
                                seats.splice(idx, 1);
                              }
                              return {
                                ...prev,
                                best_move: {
                                  recipient_seat: prev.best_move?.recipient_seat || null,
                                  seat_numbers: seats.filter((s) => s >= 1 && s <= 10),
                                  confidence: 1.0,
                                },
                              };
                            });
                          }}
                          className="w-full border border-slate-200 rounded-md py-1 text-center font-bold text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
                >
                  Отмена
                </button>

                <button
                  type="button"
                  onClick={handleApplyClick}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-xs"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Применить в черновик
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: COMPARE DRAFT */}
          {step === 'compare' && newDraft && (
            <div className="space-y-4 text-xs">
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  У этой игры уже есть черновик!
                </div>
                <p className="text-[11px] text-amber-800">
                  Пожалуйста, проверьте различия между текущими сохранёнными данными и распознанным бланком.
                </p>
              </div>

              {/* Comparison Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                <div className="grid grid-cols-3 bg-slate-100 p-2 font-bold text-slate-700 text-[11px]">
                  <div>Поле</div>
                  <div>Текущее значение</div>
                  <div>Распознано из бланка</div>
                </div>

                <div className="grid grid-cols-3 p-2 items-center">
                  <div className="font-semibold text-slate-800">Победители</div>
                  <div className="text-slate-600">{existingDraft.winner_team || 'Не указана'}</div>
                  <div className="font-bold text-indigo-700">{newDraft.winner_team.value || 'Не указана'}</div>
                </div>

                <div className="grid grid-cols-3 p-2 items-center">
                  <div className="font-semibold text-slate-800">Судья</div>
                  <div className="text-slate-600">{existingDraft.judge_name || 'Не указан'}</div>
                  <div className="font-bold text-indigo-700">{newDraft.judge_name.value || 'Не указан'}</div>
                </div>

                <div className="p-2 bg-slate-50 font-bold text-slate-900 text-[11px]">
                  Роли игроков (10 мест):
                </div>

                {newDraft.players.map((np) => {
                  const epRole = existingDraft.players?.find((p: any) => p.seat_number === np.seat_number)?.role?.value;
                  const isDiff = epRole !== np.role.value;

                  return (
                    <div key={np.seat_number} className={`grid grid-cols-3 p-2 items-center ${isDiff ? 'bg-amber-50/60' : ''}`}>
                      <div className="font-medium text-slate-700">Место #{np.seat_number}</div>
                      <div className="text-slate-600">{epRole || '-'}</div>
                      <div className={`font-semibold ${isDiff ? 'text-amber-800 font-bold' : 'text-slate-800'}`}>
                        {np.role.value || '-'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStep('review')}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
                >
                  Вернуться
                </button>

                <button
                  type="button"
                  onClick={() =>
                    executeApply([
                      {
                        detected_game_index: selectedGameIdx,
                        target_game_id: compareGameId,
                        action: 'apply',
                        draft_data: newDraft,
                      },
                    ])
                  }
                  disabled={isSubmitting}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Заменить черновик
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Full Photo Overlay Modal */}
      {showFullPhoto && previewUrl && (
        <div className="fixed inset-0 z-60 bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={() => setShowFullPhoto(false)}
              className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <img
            src={previewUrl}
            alt="Оригинал бланка"
            className="max-h-[85vh] max-w-[95vw] object-contain rounded-lg"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        </div>
      )}
    </div>
  );
};
