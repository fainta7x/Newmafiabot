import React, { useEffect, useState } from 'react';
import { ArrowLeft, Edit, Plus, Trash2, X } from 'lucide-react';
import { api, type EveningTable, type GameEvening } from '../../lib/api';

interface EveningTablesViewProps {
  eveningId: string;
  onBack: () => void;
}

const formatLabel = (format: string) => {
  if (format === 'NOVICE') return 'Новичковый';
  if (format === 'TOURNAMENT') return 'Турнирный';
  return 'Обычный';
};

export const EveningTablesView: React.FC<EveningTablesViewProps> = ({ eveningId, onBack }) => {
  const [evening, setEvening] = useState<GameEvening | null>(null);
  const [tables, setTables] = useState<EveningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EveningTable | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EveningTable | null>(null);
  const [form, setForm] = useState({ name: '', format: 'STANDARD', capacity: 10, host_name: '', default_price: 500, notes: '' });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getEvening(eveningId);
      setEvening(data);
      setTables(data.tables || []);
    } catch (err: any) {
      alert(err.message || 'Не удалось загрузить столы');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [eveningId]);

  const isReadonly = evening?.status === 'completed' || Boolean(evening?.settled_at);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: 'Основной стол', format: 'STANDARD', capacity: 10, host_name: '', default_price: evening?.default_price ?? 500, notes: '' });
    setShowEditor(true);
  };

  const openEdit = (table: EveningTable) => {
    setEditing(table);
    setForm({
      name: table.name,
      format: table.format,
      capacity: table.capacity,
      host_name: table.host_name || '',
      default_price: table.default_price ?? evening?.default_price ?? 500,
      notes: table.notes || '',
    });
    setShowEditor(true);
  };

  const save = async () => {
    try {
      if (editing) {
        await api.updateEveningTable(editing.id, {
          name: form.name,
          format: form.format,
          capacity: form.capacity,
          host_name: form.host_name || null,
          default_price: form.default_price,
          notes: form.notes || null,
        });
      } else {
        await api.createEveningTable(eveningId, {
          name: form.name,
          format: form.format,
          capacity: form.capacity,
          host_name: form.host_name || null,
          default_price: form.default_price,
          notes: form.notes || null,
        });
      }
      setShowEditor(false);
      await load();
    } catch (err: any) {
      alert(err.message || 'Не удалось сохранить стол');
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    try {
      await api.deleteEveningTable(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (err: any) {
      alert(err.message || 'Не удалось удалить стол');
    }
  };

  if (loading || !evening) return <div className="py-16 text-center text-sm text-slate-400">Загрузка столов…</div>;

  return (
    <div className="space-y-3 pb-4">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5 space-y-3">
        <div className="flex items-start gap-3">
          <button type="button" onClick={onBack} className="w-10 h-10 rounded-xl border border-slate-800 bg-slate-950 text-slate-300 flex items-center justify-center shrink-0"><ArrowLeft className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1"><h2 className="text-lg font-black text-white">Столы вечера</h2><p className="text-[11px] text-slate-400 mt-0.5">Стол — настройка площадки. Игроки выбираются отдельно при создании каждой игры.</p></div>
          {!isReadonly && <button type="button" onClick={openCreate} className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0"><Plus className="w-5 h-5" /></button>}
        </div>
      </section>

      <div className="space-y-2">
        {tables.map((table) => (
          <section key={table.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" /><strong className="text-sm text-white truncate">{table.name}</strong></div><span className="inline-block mt-1 text-[9px] uppercase font-black text-slate-500">{formatLabel(table.format)}</span></div>
              {!isReadonly && <div className="flex gap-1.5"><button type="button" onClick={() => openEdit(table)} className="w-9 h-9 rounded-xl border border-slate-800 bg-slate-950 text-slate-400 flex items-center justify-center"><Edit className="w-4 h-4" /></button><button type="button" onClick={() => setPendingDelete(table)} className="w-9 h-9 rounded-xl border border-slate-800 bg-slate-950 text-rose-400 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button></div>}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-2"><span className="text-[8px] uppercase text-slate-500 block">Ведущий</span><strong className="text-[11px] text-white block truncate">{table.host_name || 'Не назначен'}</strong></div>
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-2"><span className="text-[8px] uppercase text-slate-500 block">Тариф</span><strong className="text-[11px] text-emerald-400">{table.default_price ?? evening.default_price}₽</strong></div>
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-2"><span className="text-[8px] uppercase text-slate-500 block">Мест</span><strong className="text-[11px] text-white">{table.capacity}</strong></div>
            </div>
            {table.notes && <p className="text-[10px] text-slate-500">{table.notes}</p>}
          </section>
        ))}
        {tables.length === 0 && <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center text-xs text-slate-500">Столов пока нет. Создай площадку для игр.</div>}
      </div>

      {showEditor && !isReadonly && (
        <div className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-base font-black text-white">{editing ? 'Настроить стол' : 'Новый стол'}</h3><button type="button" onClick={() => setShowEditor(false)} className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center"><X className="w-4 h-4" /></button></div>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Название" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-sm text-white" />
            <div className="grid grid-cols-2 gap-2"><select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-xs text-white"><option value="STANDARD">Обычный</option><option value="NOVICE">Новичковый</option><option value="TOURNAMENT">Турнирный</option></select><input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) || 10 })} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-xs text-white" /></div>
            <div className="grid grid-cols-2 gap-2"><input value={form.host_name} onChange={(e) => setForm({ ...form, host_name: e.target.value })} placeholder="Ведущий по умолчанию" className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-xs text-white" /><input type="number" value={form.default_price} onChange={(e) => setForm({ ...form, default_price: Number(e.target.value) || 0 })} placeholder="Тариф" className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-xs text-white" /></div>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Заметка — необязательно" className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-xs text-white" />
            <button type="button" disabled={!form.name.trim()} onClick={save} className="w-full min-h-12 rounded-xl bg-emerald-600 disabled:opacity-40 text-white text-sm font-black">Сохранить</button>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"><div className="w-full max-w-sm rounded-2xl border border-rose-800 bg-slate-900 p-4 space-y-4"><div><h3 className="text-base font-black text-white">Удалить «{pendingDelete.name}»?</h3><p className="text-xs text-slate-400 mt-1">Состав вечера не изменится. Игры, уже сохранённые с этим столом, останутся в истории.</p></div><div className="grid grid-cols-2 gap-2"><button onClick={() => setPendingDelete(null)} className="min-h-11 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 text-xs font-black">Отмена</button><button onClick={remove} className="min-h-11 rounded-xl bg-rose-600 text-white text-xs font-black">Удалить</button></div></div></div>
      )}
    </div>
  );
};
