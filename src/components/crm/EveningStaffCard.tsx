import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

interface StaffPlayer {
  id: string;
  nickname: string;
  club_role?: string | null;
  judge_level?: string | null;
  is_club_organizer?: number | boolean;
}

interface StaffResponse {
  organizer: { player_id: string | null; nickname: string | null } | null;
  judge?: { player_id: string | null; nickname: string | null } | null;
  organizers: StaffPlayer[];
  judges: StaffPlayer[];
  game_judges: Array<{ game_id: number; game_number: number; player_id: string | null; nickname: string | null; linked: boolean }>;
}

export function EveningStaffCard({ eveningId }: { eveningId: string }) {
  const [data, setData] = useState<StaffResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/staff`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить команду вечера');
      setData(body as StaffResponse);
    } catch (loadError: any) {
      setError(loadError?.message || 'Не удалось загрузить команду вечера');
    }
  };

  useEffect(() => { void load(); }, [eveningId]);

  const save = async (patch: { organizer_player_id?: string; judge_player_id?: string }, fallback: string) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/staff`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || fallback);
      setData(body as StaffResponse);
    } catch (saveError: any) {
      setError(saveError?.message || fallback);
    } finally {
      setSaving(false);
    }
  };
  const assignOrganizer = (playerId: string) => { if (playerId) void save({ organizer_player_id: playerId }, 'Не удалось назначить организатора'); };
  const assignJudge = (playerId: string) => { if (playerId) void save({ judge_player_id: playerId }, 'Не удалось назначить судью вечера'); };

  return (
    <section className="rounded-[16px] border border-border-soft bg-surface-1 p-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent"><ShieldCheck className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-bold text-text-primary">Команда вечера</div>
          <div className="mt-0.5 text-[10px] text-text-muted">Организатор и судья вечера — без них вечер не опубликовать</div>
        </div>
      </div>

      {error ? <div className="mt-2 rounded-[10px] bg-danger-soft px-3 py-2 text-[10px] text-danger">{error}</div> : null}

      <label className="mt-3 block">
        <span className="mb-1.5 block text-[10px] font-semibold text-text-secondary">Организатор вечера</span>
        <select
          value={data?.organizer?.player_id || ''}
          disabled={!data || saving}
          onChange={(event) => assignOrganizer(event.target.value)}
          className="mobile-field min-h-[44px]"
        >
          {!data?.organizer?.player_id ? <option value="">Не назначен</option> : null}
          {(data?.organizers || []).some((player) => player.is_club_organizer) ? (
            <optgroup label="Организаторы клуба">
              {(data?.organizers || []).filter((player) => player.is_club_organizer).map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}
            </optgroup>
          ) : null}
          {(data?.organizers || []).some((player) => !player.is_club_organizer) ? (
            <optgroup label="Игроки этого вечера">
              {(data?.organizers || []).filter((player) => !player.is_club_organizer).map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}
            </optgroup>
          ) : null}
        </select>
      </label>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-[10px] font-semibold text-text-secondary">Судья вечера</span>
        <select
          value={data?.judge?.player_id || ''}
          disabled={!data || saving}
          onChange={(event) => assignJudge(event.target.value)}
          className="mobile-field min-h-[44px]"
          data-testid="evening-judge-select"
        >
          {!data?.judge?.player_id ? <option value="">Не назначен</option> : null}
          {(data?.judges || []).map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}
        </select>
      </label>

      <div className="mt-2.5 rounded-[11px] bg-surface-2 px-3 py-2 text-[10px] leading-4 text-text-muted">
        Черновик можно сохранить без них, но для публикации нужны оба. Организатор — организатор клуба или игрок с отметкой «Может проводить» для такого вечера; на клубном вечере он не платит за игры. Судья вечера — игрок с отметкой «Может вести» для такого вечера. Каждая новая игра сначала предлагает судью вечера — перед игрой его можно поменять. Вечера для новичков и клубные сразу получают владельца клуба организатором и судьёй.
      </div>

      {data?.game_judges?.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {data.game_judges.map((game) => <span key={game.game_id} className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] text-text-secondary">Игра {game.game_number}: <strong className="text-text-primary">{game.nickname || 'не назначен'}</strong></span>)}
        </div>
      ) : null}
    </section>
  );
}

export default EveningStaffCard;
