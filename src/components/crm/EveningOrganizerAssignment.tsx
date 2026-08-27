import { useEffect, useState } from 'react';
import { UserRoundCog } from 'lucide-react';

type StaffPlayer = {
  id: string;
  nickname: string;
  club_role?: string | null;
  judge_level?: string | null;
};

type StaffPayload = {
  organizer_player_id: string | null;
  organizer: StaffPlayer | null;
  organizers: StaffPlayer[];
};

export default function EveningOrganizerAssignment({ eveningId }: { eveningId: string }) {
  const [data, setData] = useState<StaffPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/staff`, { credentials: 'include' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось загрузить организатора');
      setData(body as StaffPayload);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить организатора');
    }
  };

  useEffect(() => { void load(); }, [eveningId]);

  const save = async (organizerPlayerId: string) => {
    if (saving) return;
    const previous = data;
    const nextId = organizerPlayerId || null;
    const nextOrganizer = data?.organizers.find((player) => player.id === nextId) || null;
    setData((current) => current ? { ...current, organizer_player_id: nextId, organizer: nextOrganizer } : current);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/evenings/${encodeURIComponent(eveningId)}/organizer`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizer_player_id: nextId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Не удалось назначить организатора');
    } catch (err: any) {
      setData(previous);
      setError(err?.message || 'Не удалось назначить организатора');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[14px] border border-border-soft bg-surface-1 p-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-surface-2 text-accent"><UserRoundCog className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-black text-text-primary">Организатор вечера</div>
          <div className="mt-0.5 text-[9px] text-text-muted">Кто собирает и отвечает за этот вечер</div>
        </div>
        <select
          aria-label="Организатор вечера"
          value={data?.organizer_player_id || ''}
          disabled={!data || saving}
          onChange={(event) => void save(event.target.value)}
          className="min-h-[42px] max-w-[48%] rounded-[11px] border border-border-soft bg-surface-2 px-2.5 text-[11px] font-semibold text-text-primary disabled:opacity-50"
        >
          <option value="">Не назначен</option>
          {(data?.organizers || []).map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}
        </select>
      </div>
      {error ? <div className="mt-2 text-[10px] text-danger">{error}</div> : null}
    </section>
  );
}
