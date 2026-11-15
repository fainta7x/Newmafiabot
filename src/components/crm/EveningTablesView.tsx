import React, { useEffect, useState } from 'react';
import { ArrowLeft, Edit, Plus, Trash2 } from 'lucide-react';
import { api, type EveningTable, type GameEvening } from '../../lib/api';
import ConfirmDialog from '../ui/ConfirmDialog.tsx';
import MobileSheet from '../ui/MobileSheet.tsx';
import { getJson } from '../../lib/requestJson.ts';

interface EveningTablesViewProps {
  eveningId: string;
  onBack: () => void;
}

type StaffJudge = { id: string; nickname: string };
type EveningStaff = { judge?: { player_id: string | null; nickname: string | null } | null; judges?: StaffJudge[] };

const inputClass = 'w-full min-h-11 rounded-[12px] border border-border-soft bg-surface-2 px-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent';

export const EveningTablesView: React.FC<EveningTablesViewProps> = ({ eveningId, onBack }) => {
  const [evening, setEvening] = useState<GameEvening | null>(null);
  const [tables, setTables] = useState<EveningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EveningTable | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EveningTable | null>(null);
  const [deleting, setDeleting] = useState(false);
  // A table is a name and its judge (owner, 2026-11-15). The first table is the evening's own: its judge is the evening judge.
  const [form, setForm] = useState({ name: '', host_player_id: '' });
  const [staff, setStaff] = useState<EveningStaff | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getEvening(eveningId);
      setEvening(data);
      setTables(data.tables || []);
      setStaff(await getJson<EveningStaff>(`/api/evenings/${encodeURIComponent(eveningId)}/staff`, 'Не удалось загрузить судей').catch(() => null));
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить столы');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [eveningId]);

  const primaryId = tables[0]?.id || '';
  const eveningJudge = staff?.judge?.nickname || '';
  const tableJudge = (table: EveningTable) => table.id === primaryId ? (eveningJudge || 'Не назначен') : (table.host_name || 'Не назначен');
  const isReadonly = evening?.status === 'completed' || Boolean(evening?.settled_at);

  const openCreate = () => {
    setError(null);
    setEditing(null);
    setForm({ name: `Стол ${tables.length + 1}`, host_player_id: '' });
    setShowEditor(true);
  };

  const openEdit = (table: EveningTable) => {
    setError(null);
    setEditing(table);
    setForm({ name: table.name, host_player_id: String((table as any).host_player_id || '') });
    setShowEditor(true);
  };

  const save = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.updateEveningTable(editing.id, {
          name: form.name.trim(),
          ...(editing.id === primaryId ? {} : { host_player_id: form.host_player_id || null }),
        });
      } else {
        await api.createEveningTable(eveningId, {
          name: form.name.trim(),
          format: evening?.format || 'STANDARD',
          capacity: 10,
          host_player_id: form.host_player_id || null,
        });
      }
      setShowEditor(false);
      setEditing(null);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить стол');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteEveningTable(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Не удалось удалить стол');
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !evening) {
    return <div className="py-16 text-center text-sm text-text-secondary">Загрузка столов…</div>;
  }

  if (!evening) {
    return (
      <div className="space-y-3 pb-4">
        <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-2 rounded-[12px] border border-border-soft bg-surface-1 px-3 text-[13px] font-semibold text-text-secondary">
          <ArrowLeft className="h-4 w-4" /> Назад к вечеру
        </button>
        <div className="rounded-[20px] border border-danger/20 bg-danger-soft p-4 text-[13px] text-text-primary">
          <div className="font-bold">Не удалось открыть столы</div>
          <div className="mt-1 text-text-secondary">{error || 'Повтори загрузку.'}</div>
          <button type="button" onClick={() => void load()} className="mt-4 min-h-11 rounded-[12px] bg-accent px-4 text-[13px] font-bold text-white">Повторить</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-4">
      <section className="rounded-[20px] border border-border-soft bg-surface-1 p-4">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onBack} aria-label="Назад к вечеру" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-border-soft bg-surface-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-black text-text-primary">Столы вечера</h2>
            <p className="mt-1 text-[11px] leading-4 text-text-secondary">Настройки площадки. Состав игроков выбирается отдельно при создании каждой игры.</p>
          </div>
          {!isReadonly && (
            <button type="button" onClick={openCreate} aria-label="Добавить стол" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-accent text-white transition-colors hover:bg-accent-hover">
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-[16px] border border-danger/20 bg-danger-soft px-3 py-3 text-[12px] text-text-primary">
          <span className="font-semibold">Не получилось выполнить действие.</span> <span className="text-text-secondary">{error}</span>
        </div>
      )}

      <div className="space-y-2">
        {tables.map((table) => (
          <section key={table.id} className="space-y-3 rounded-[20px] border border-border-soft bg-surface-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                  <strong className="truncate text-[14px] text-text-primary">{table.name}</strong>
                </div>
                <span className="mt-1 block text-[12px] text-text-secondary">Судья: <strong className="text-text-primary">{tableJudge(table)}</strong></span>
                {table.id === primaryId ? <span className="mt-0.5 block text-[11px] text-text-muted">Судья вечера · меняется в «Команда вечера»</span> : null}
              </div>
              {!isReadonly && (
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => openEdit(table)} aria-label={`Настроить стол ${table.name}`} className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-border-soft bg-surface-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary">
                    <Edit className="h-4 w-4" />
                  </button>
                  {table.id !== primaryId ? <button type="button" onClick={() => { setError(null); setPendingDelete(table); }} aria-label={`Удалить стол ${table.name}`} className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-border-soft bg-surface-2 text-danger transition-colors hover:bg-danger-soft">
                    <Trash2 className="h-4 w-4" />
                  </button> : null}
                </div>
              )}
            </div>

            {table.notes && <p className="text-[10px] leading-4 text-text-muted">{table.notes}</p>}
          </section>
        ))}

        {tables.length === 0 && (
          <div className="rounded-[20px] border border-dashed border-border-soft bg-surface-1/60 p-8 text-center">
            <div className="text-[13px] font-semibold text-text-secondary">Столов пока нет</div>
            <div className="mt-1 text-[11px] text-text-muted">Основной стол появится сам.</div>
            {!isReadonly && <button type="button" onClick={openCreate} className="mt-4 min-h-11 rounded-[12px] bg-accent px-4 text-[12px] font-bold text-white">Добавить стол</button>}
          </div>
        )}
      </div>

      <MobileSheet
        open={showEditor && !isReadonly}
        title={editing ? 'Настроить стол' : 'Новый стол'}
        subtitle={editing?.id === primaryId ? 'Судья основного стола — судья вечера.' : 'Новая игра за этим столом сразу предложит его судью.'}
        onClose={() => { if (!saving) { setShowEditor(false); setEditing(null); setError(null); } }}
        widthClass="sm:max-w-md"
        footer={(
          <button type="button" disabled={!form.name.trim() || saving} onClick={() => void save()} className="min-h-12 w-full rounded-[12px] bg-accent text-[13px] font-bold text-white transition-colors hover:bg-accent-hover disabled:opacity-40">
            {saving ? 'Сохраняем…' : editing ? 'Сохранить изменения' : 'Создать стол'}
          </button>
        )}
      >
        <div className="space-y-4">
          {error && <div className="rounded-[14px] border border-danger/20 bg-danger-soft px-3 py-3 text-[11px] leading-4 text-text-secondary">{error}</div>}

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">Название</span>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Основной стол" className={inputClass} />
          </label>

          {editing?.id !== primaryId || !editing ? (
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">Судья стола</span>
              <select data-testid="table-judge-select" value={form.host_player_id} onChange={(event) => setForm({ ...form, host_player_id: event.target.value })} className={inputClass}>
                <option value="">Не назначен</option>
                {(staff?.judges || []).map((judge) => <option key={judge.id} value={judge.id}>{judge.nickname}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      </MobileSheet>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `Удалить «${pendingDelete.name}»?` : 'Удалить стол?'}
        description="Состав вечера не изменится. Игры, уже сохранённые с этим столом, останутся в истории."
        confirmLabel="Удалить"
        tone="danger"
        busy={deleting}
        onCancel={() => { if (!deleting) { setPendingDelete(null); setError(null); } }}
        onConfirm={remove}
      />
    </div>
  );
};
