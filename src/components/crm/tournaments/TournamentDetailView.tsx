import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { api, type Player } from '../../../lib/api.ts';
import { JudgeAssignmentFields, type JudgeIdentityMode } from '../JudgeAssignmentFields.tsx';
import { TournamentDetailView as TournamentDetailViewBase } from './TournamentDetailViewBase.tsx';
import { TournamentLifecycleOverview } from './TournamentLifecycleOverview.tsx';
import { TournamentEveningSettingsPanel } from './TournamentEveningSettingsPanel.tsx';
import { TournamentParticipantsPanel } from './TournamentParticipantsPanel.tsx';
import { TournamentSeatMessagesCard } from './TournamentSeatMessagesCard.tsx';

type TournamentStep = 'setup' | 'players' | 'games' | 'results';
const TOURNAMENT_STEPS: Array<{ id: TournamentStep; label: string }> = [
  { id: 'setup', label: 'Параметры' },
  { id: 'players', label: 'Участники' },
  { id: 'games', label: 'Игры' },
  { id: 'results', label: 'Итоги' },
];

interface TournamentDetailViewProps {
  tournamentId: string;
  onBack: () => void;
}

const organizerHeaders = () => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('organizer_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export const TournamentDetailView: React.FC<TournamentDetailViewProps> = ({ tournamentId, onBack }) => {
  const [tournament, setTournament] = useState<any>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedGameId, setSelectedGameId] = useState('');
  const [mode, setMode] = useState<JudgeIdentityMode>('external');
  const [judgePlayerId, setJudgePlayerId] = useState('');
  const [judgeName, setJudgeName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getTournament(tournamentId), api.getPlayers()])
      .then(([nextTournament, nextPlayers]) => {
        if (cancelled) return;
        setTournament(nextTournament);
        setPlayers(nextPlayers
          .filter((player) => (player as any).judge_level === 'judge')
          .slice()
          .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru')));
        setSelectedGameId((current) => {
          if (current) return current;
          const list: any[] = nextTournament.games || [];
          // The game being played, or the next one to play, not game 1.
          return (list.find((game) => game.status === 'active') || list.find((game) => game.status !== 'completed') || list[0])?.id || '';
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [tournamentId, revision]);

  const games = tournament?.games || [];
  const selectedGame = useMemo(() => games.find((game: any) => game.id === selectedGameId) || null, [games, selectedGameId]);

  useEffect(() => {
    if (!selectedGame) return;
    if (selectedGame.judge_player_id) {
      setMode('linked');
      setJudgePlayerId(selectedGame.judge_player_id);
      setJudgeName('');
    } else {
      setMode('external');
      setJudgePlayerId('');
      setJudgeName(selectedGame.judge_name || '');
    }
    setMessage(null);
    setError(null);
  }, [selectedGame?.id, selectedGame?.judge_player_id, selectedGame?.judge_name]);

  const canEdit = useMemo(() => {
    if (!tournament || !selectedGame || tournament.status === 'completed') return false;
    if (tournament.status === 'correction' && selectedGame.status === 'completed') return true;
    if (selectedGame.status === 'planned') return tournament.status === 'draft' || tournament.status === 'active';
    // A judge who cannot continue can be replaced in the running game until its protocol is completed (audit 2026-10-04).
    if (tournament.status === 'active' && selectedGame.status === 'active') return selectedGame.protocol_status !== 'completed';
    if (tournament.status === 'correction' && selectedGame.status === 'active') {
      const otherActive = games.some((game: any) => game.id !== selectedGame.id && game.status === 'active');
      return selectedGame.protocol_status === 'draft' && !otherActive;
    }
    return false;
  }, [games, selectedGame, tournament]);

  const save = async () => {
    if (!selectedGame || !canEdit || saving || (mode === 'linked' && !judgePlayerId)) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/games/${encodeURIComponent(selectedGame.id)}/judge`, {
        method: 'PATCH', credentials: 'include', headers: organizerHeaders(),
        body: JSON.stringify({
          judge_player_id: mode === 'linked' ? judgePlayerId : null,
          judge_name: mode === 'external' ? (judgeName.trim() || null) : null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || body.message || 'Не удалось сохранить судью');
      setMessage(body.judge_player_id ? `Судья из клуба: ${body.judge_name}` : `Сохранён как внешний судья: ${body.judge_name || 'не указан'}`);
      setRevision((value) => value + 1);
    } catch (err: any) {
      setError(err.message || 'Не удалось сохранить судью');
    } finally {
      setSaving(false);
    }
  };

  const publishTelegram = async () => {
    if (telegramBusy) return;
    setTelegramBusy(true); setTelegramMessage(null); setError(null);
    try {
      const response = await fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/sync-telegram`, {
        method: 'POST', credentials: 'include', headers: organizerHeaders(),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || body.message || 'Не удалось обновить Telegram');
      const actions = Array.isArray(body?.results) ? body.results : [];
      const skipped = actions.length && actions.every((item: any) => item.action === 'skipped');
      setTelegramMessage(skipped
        ? 'Закрытый канал пока не включён в «Ещё → Telegram». Сначала настрой его там.'
        : tournament?.status === 'completed'
          ? 'Пост турнира в Telegram закрыт и обновлён.'
          : 'Турнир опубликован или обновлён в закрытом канале.');
    } catch (err: any) {
      setError(err.message || 'Не удалось обновить Telegram');
    } finally {
      setTelegramBusy(false);
    }
  };

  const openWorkspace = () => {
    window.requestAnimationFrame(() => {
      document.getElementById('tournament-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const telegramSection = (
    <>
      {tournament ? (
        <section className="rounded-[18px] border border-border-soft bg-surface-1 p-3.5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Send className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[12px] font-black uppercase tracking-wider text-text-primary">Telegram · Рейтинг и турниры</h3>
              <p className="mt-1 text-[11px] leading-4 text-text-muted">Берёт актуальный состав из турнира. Повторное нажатие обновляет прежний пост в закрытом канале и не меняет игровой статус.</p>
            </div>
          </div>
          {telegramMessage ? <div className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-[11px] font-bold text-success">{telegramMessage}</div> : null}
          <button type="button" disabled={telegramBusy} onClick={() => void publishTelegram()} className="mt-3 min-h-[44px] w-full rounded-xl bg-accent px-4 text-[11px] font-black text-white disabled:opacity-40">
            {telegramBusy ? 'Обновляем Telegram…' : tournament.status === 'completed' ? 'Обновить закрытый анонс' : 'Обновить пост актуальным составом'}
          </button>
        </section>
      ) : null}
    </>
  );
  const judgeSection = (
    <>
      {tournament && games.length ? (
        <details className="min-w-0 rounded-[18px] border border-border-soft bg-surface-1" data-testid="tournament-judge-assignment">
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3">
            <div className="min-w-0">
              <h3 className="text-[12px] font-black uppercase tracking-wider text-text-primary">Судья игры · стабильная привязка</h3>
              <p className="mt-0.5 truncate text-[10px] text-text-muted">
                {selectedGame ? `Игра №${selectedGame.game_number} · ${selectedGame.judge_name || 'судья не указан'}` : 'Настройка судьи'}
              </p>
            </div>
            <span className="shrink-0 text-[10px] font-bold text-accent">Настроить</span>
          </summary>
          <div className="space-y-3 border-t border-border-soft p-3.5">
            <p className="text-[11px] leading-4 text-text-muted">Судьёй из клуба можно выбрать только игрока со званием «Судья». Судью со стороны можно просто вписать по имени.</p>
            <label className="block min-w-0 text-[10px] font-black uppercase tracking-wide text-text-muted">
              Игра
              <select value={selectedGameId} onChange={(event) => setSelectedGameId(event.target.value)} className="mt-1 min-h-[44px] w-full min-w-0 rounded-xl border border-border-soft bg-surface-2 px-3 text-sm text-text-primary">
                {games.map((game: any) => <option key={game.id} value={game.id}>Игра №{game.game_number} · {game.status === 'completed' ? 'завершена' : game.status === 'active' ? 'идёт' : 'запланирована'}</option>)}
              </select>
            </label>
            <JudgeAssignmentFields
              mode={mode}
              players={players}
              judgePlayerId={judgePlayerId}
              judgeName={judgeName}
              disabled={!canEdit || saving}
              onModeChange={(nextMode) => { setMode(nextMode); if (nextMode === 'external') setJudgePlayerId(''); }}
              onJudgePlayerIdChange={setJudgePlayerId}
              onJudgeNameChange={setJudgeName}
            />
            {!canEdit ? <p className="text-[11px] text-text-muted">Для этой игры изменение судьи сейчас недоступно. Завершённая игра редактируется только после перевода турнира в режим корректировки.</p> : null}
            {message ? <div className="rounded-xl border border-success/20 bg-success-soft px-3 py-2 text-[11px] font-bold text-success">{message}</div> : null}
            {error ? <div className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-[11px] font-bold text-danger">{error}</div> : null}
            <button type="button" disabled={!canEdit || saving || (mode === 'linked' && !judgePlayerId)} onClick={() => void save()} className="min-h-[46px] w-full rounded-xl bg-accent px-4 text-xs font-black text-white disabled:opacity-40">
              {saving ? 'Сохраняем…' : 'Сохранить судью'}
            </button>
          </div>
        </details>
      ) : null}
    </>
  );

  // Tournaments with registration: one screen in four steps instead of the old and new blocks stacked
  // on each other (owner, 2026-09-29). Tournaments made the old way keep their screen below.
  const registrationFlow = Number(tournament?.tournament_evening_flow || 0) === 1;
  const participantsCount = tournament?.participants?.length ?? 0;
  const stepDone: Record<TournamentStep, boolean> = {
    setup: Boolean(tournament?.organizer_player_id && tournament?.judge_player_id),
    players: participantsCount >= 10,
    games: tournament?.status === 'completed',
    results: tournament?.status === 'completed',
  };
  const defaultStep: TournamentStep = !tournament ? 'setup'
    : tournament.status === 'completed' ? 'results'
    : tournament.status === 'active' || tournament.status === 'correction' ? 'games'
    : !stepDone.setup ? 'setup'
    : !stepDone.players ? 'players' : 'games';
  const [step, setStep] = useState<TournamentStep | null>(null);
  const currentStep = step || defaultStep;

  if (tournament && registrationFlow) {
    return (
      <div data-stable-judge-view className="min-w-0 space-y-3 overflow-x-hidden" data-testid="tournament-steps">
        <style>{`[data-stable-judge-view] button:has(svg.lucide-edit-2),[data-stable-judge-view] button:has(svg.lucide-square-pen){display:none!important;}`}</style>
        <section className="rounded-[18px] border border-border-soft bg-surface-1 p-3.5">
          <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-xs font-semibold text-text-secondary"><ArrowLeft className="h-4 w-4" />Назад</button>
          <h2 className="mt-2 text-lg font-black leading-tight text-text-primary">{tournament.title}</h2>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            {new Date(tournament.date).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })}
            {tournament.venue ? ` · ${tournament.venue}` : ''}
          </p>
          <nav className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Шаги турнира">
            {TOURNAMENT_STEPS.map((item, index) => {
              const active = item.id === currentStep;
              return (
                <button key={item.id} type="button" onClick={() => setStep(item.id)} aria-current={active ? 'step' : undefined}
                  data-testid={`tournament-step-${item.id}`}
                  className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border px-1 text-center text-[11px] font-bold leading-tight ${active ? 'border-accent bg-accent text-white' : 'border-border-soft bg-surface-2 text-text-secondary'}`}>
                  <span className="text-[10px] opacity-80">{stepDone[item.id] ? '✓' : index + 1}</span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </section>

        {currentStep === 'setup' ? (
          <TournamentEveningSettingsPanel tournamentId={tournamentId} onChanged={() => setRevision((value) => value + 1)} />
        ) : null}
        {currentStep === 'players' ? (
          <>
            <TournamentParticipantsPanel tournamentId={tournamentId} onChanged={() => setRevision((value) => value + 1)} />
            <TournamentSeatMessagesCard tournamentId={tournamentId} status={String(tournament.status)} games={games} />
          </>
        ) : null}
        {currentStep === 'games' ? (
          <>
            <TournamentSeatMessagesCard tournamentId={tournamentId} status={String(tournament.status)} games={games} />
            <TournamentDetailViewBase key={`games-${revision}`} tournamentId={tournamentId} onBack={onBack} hideHeader tabs={['organization', 'games']} />
            {telegramSection}
            {judgeSection}
          </>
        ) : null}
        {currentStep === 'results' ? (
          <>
            <TournamentDetailViewBase key={`results-${revision}`} tournamentId={tournamentId} onBack={onBack} hideHeader tabs={['standings', 'nominations']} />
            {telegramSection}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div data-stable-judge-view className="min-w-0 space-y-4 overflow-x-hidden">
      <style>{`[data-stable-judge-view] button:has(svg.lucide-edit-2),[data-stable-judge-view] button:has(svg.lucide-square-pen){display:none!important;}`}</style>

      {tournament ? (
        <TournamentLifecycleOverview tournament={tournament} onOpenWorkspace={openWorkspace} />
      ) : null}

      <TournamentEveningSettingsPanel tournamentId={tournamentId} onChanged={() => setRevision((value) => value + 1)} />
      <TournamentParticipantsPanel tournamentId={tournamentId} onChanged={() => setRevision((value) => value + 1)} />

      {telegramSection}

      {judgeSection}

      {tournament ? <TournamentSeatMessagesCard tournamentId={tournamentId} status={String(tournament.status)} games={games} /> : null}

      <div id="tournament-workspace" className="scroll-mt-3">
        <TournamentDetailViewBase key={revision} tournamentId={tournamentId} onBack={onBack} />
      </div>
    </div>
  );
};

export default TournamentDetailView;
