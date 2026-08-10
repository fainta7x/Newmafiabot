import React, { useEffect, useMemo, useState } from 'react';
import { api, type Player } from '../../../lib/api.ts';
import { JudgeAssignmentFields, type JudgeIdentityMode } from '../JudgeAssignmentFields.tsx';
import { TournamentDetailView as TournamentDetailViewBase } from './TournamentDetailViewBase.tsx';

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

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getTournament(tournamentId), api.getPlayers()])
      .then(([nextTournament, nextPlayers]) => {
        if (cancelled) return;
        setTournament(nextTournament);
        setPlayers(nextPlayers.slice().sort((a, b) => a.nickname.localeCompare(b.nickname, 'ru')));
        setSelectedGameId((current) => current || nextTournament.games?.[0]?.id || '');
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
      setMessage(body.judge_player_id ? `Связан с CRM: ${body.judge_name}` : `Сохранён как внешний судья: ${body.judge_name || 'не указан'}`);
      setRevision((value) => value + 1);
    } catch (err: any) {
      setError(err.message || 'Не удалось сохранить судью');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-stable-judge-view className="min-w-0 overflow-x-hidden">
      <style>{`[data-stable-judge-view] button:has(svg.lucide-edit-2),[data-stable-judge-view] button:has(svg.lucide-square-pen){display:none!important;}`}</style>
      {tournament && games.length ? (
        <section className="mb-4 min-w-0 space-y-3 rounded-[18px] border border-accent/20 bg-surface-1 p-3.5" data-testid="tournament-judge-assignment">
          <div className="min-w-0">
            <h3 className="text-[12px] font-black uppercase tracking-wider text-text-primary">Судья игры · стабильная привязка</h3>
            <p className="mt-1 text-[11px] leading-4 text-text-muted">Выбери игрока CRM для учёта судейских ачивок или явно оставь внешнего судью текстом.</p>
          </div>
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
        </section>
      ) : null}
      <TournamentDetailViewBase key={revision} tournamentId={tournamentId} onBack={onBack} />
    </div>
  );
};

export default TournamentDetailView;
