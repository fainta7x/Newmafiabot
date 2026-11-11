import React, { useEffect, useState } from 'react';
import { Database, History, RefreshCw } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';

type Change = { id: string; entity_type: string; entity_id: string | null; action: string; note: string | null; created_at: string };
type Summary = { changes: Change[] };
type Tab = 'database' | 'log';
type TableMeta = { table: string; label: string; columns: Array<{ name: string; type: string; pk: number; editable: boolean }> };
type TableData = TableMeta & { rows: Array<Record<string, any> & { __pk: string }>; total: number; limit: number; offset: number };

const apiFetch = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'Ошибка запроса');
  return body as T;
};

const fieldClass = 'mobile-field min-h-[44px]';

function ExpertRowEditor({ row, columns, table, onSaved }: { row: Record<string, any> & { __pk: string }; columns: TableMeta['columns']; table: string; onSaved: () => Promise<void> }) {
  const editable = columns.filter((column) => column.editable);
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(editable.map((column) => [column.name, row[column.name] == null ? '' : String(row[column.name])])));
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = editable.filter((column) => (row[column.name] == null ? '' : String(row[column.name])) !== draft[column.name]);
  const preview = changed.slice(0, 6).map((column) => `${column.name}: ${String(row[column.name] ?? 'NULL')} → ${draft[column.name] || 'NULL'}`).join('\n');
  const previewText = `${preview}${changed.length > 6 ? `\n…и ещё ${changed.length - 6}` : ''}`;

  const save = async () => {
    if (!changed.length || saving) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin-data/database/${encodeURIComponent(table)}/${encodeURIComponent(row.__pk)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          changes: Object.fromEntries(changed.map((column) => [column.name, draft[column.name]])),
          note: 'Ручная правка из экспертного режима',
        }),
      });
      setConfirmOpen(false);
      await onSaved();
    } catch (err: any) {
      setError(err?.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <details className="rounded-[14px] border border-border-soft bg-surface-1 p-3">
        <summary className="cursor-pointer text-[12px] font-bold text-text-primary">{row.__pk}</summary>
        <div className="mt-3 space-y-2">
          {editable.map((column) => (
            <label key={column.name} className="block">
              <span className="mb-1 block text-[10px] text-text-muted">{column.name} · {column.type || 'TEXT'}</span>
              <input className={fieldClass} value={draft[column.name] ?? ''} onChange={(e) => setDraft({ ...draft, [column.name]: e.target.value })} />
            </label>
          ))}
        </div>
        {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
        <button type="button" disabled={!changed.length || saving} onClick={() => setConfirmOpen(true)} className="mt-3 min-h-10 w-full rounded-[10px] bg-danger/90 text-[12px] font-bold text-white disabled:opacity-35">{saving ? 'Сохраняем…' : `Применить ${changed.length ? `(${changed.length})` : ''}`}</button>
      </details>

      <ConfirmDialog
        open={confirmOpen}
        title="Применить экспертное изменение?"
        description={`Запись ${row.__pk}\n\n${previewText}\n\nИзменение будет записано в журнал.`}
        confirmLabel="Применить"
        tone="danger"
        busy={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={save}
      />
    </>
  );
}

export const DataSettingsCRM: React.FC = () => {
  const [tab, setTab] = useState<Tab>('database');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [tableName, setTableName] = useState('');
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [tableLoading, setTableLoading] = useState(false);

  const loadSummary = async () => {
    setError(null);
    try {
      const body = await apiFetch<Summary>('/api/admin-data/summary');
      setSummary(body);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadSummary(); }, []);

  useEffect(() => {
    if (tab !== 'database' || tables.length) return;
    void apiFetch<{ tables: TableMeta[] }>('/api/admin-data/database/tables')
      .then((body) => {
        setTables(body.tables);
        if (body.tables[0]) setTableName(body.tables[0].table);
      })
      .catch((err) => setError(err?.message || 'Не удалось загрузить таблицы'));
  }, [tab, tables.length]);

  const loadTable = async (name = tableName) => {
    if (!name) return;
    setTableLoading(true);
    try {
      setTableData(await apiFetch<TableData>(`/api/admin-data/database/${encodeURIComponent(name)}`));
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить таблицу');
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => { if (tab === 'database' && tableName) void loadTable(tableName); }, [tab, tableName]);

  if (loading) return <div className="flex min-h-[40vh] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-accent" /></div>;

  const tabs = [
    { id: 'database', icon: Database, label: 'Правка' },
    { id: 'log', icon: History, label: 'Журнал' },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div>
        <h2 className="text-[24px] font-black tracking-tight">Данные и настройки</h2>
        <p className="mt-1 text-[13px] text-text-secondary">«Правка» — прямое исправление записей, только на крайний случай. Настройки конкретного игрока — в его карточке.</p>
      </div>

      {error ? <div className="rounded-[14px] border border-danger/30 bg-danger-soft p-3 text-[12px] text-danger">{error}</div> : null}

      <div className="grid grid-cols-2 gap-1 rounded-[14px] border border-border-soft bg-surface-1 p-1">
        {tabs.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center rounded-[10px] px-1 text-[10px] font-bold ${tab === item.id ? 'bg-accent text-white' : 'text-text-muted'}`}><Icon className="mb-1 h-4 w-4" />{item.label}</button>;
        })}
      </div>

      {tab === 'database' ? (
        <div className="space-y-3">
          <div className="rounded-[16px] border border-danger/25 bg-danger-soft p-3 text-[12px] leading-5 text-danger"><strong>Экспертный режим.</strong> Здесь можно исправлять записи напрямую. Служебные поля менять нельзя, а жетоны меняются только через начисления и списания. Каждая правка попадёт в журнал.</div>
          <select className={fieldClass} value={tableName} onChange={(e) => setTableName(e.target.value)}>{tables.map((table) => <option key={table.table} value={table.table}>{table.label} · {table.table}</option>)}</select>
          {tableLoading ? <div className="py-8 text-center"><RefreshCw className="mx-auto h-5 w-5 animate-spin" /></div> : tableData ? <div className="space-y-2"><div className="text-[11px] text-text-muted">Записей: {tableData.total}. Показаны первые {tableData.rows.length}.</div>{tableData.rows.map((row) => <ExpertRowEditor key={row.__pk} row={row} columns={tableData.columns} table={tableData.table} onSaved={() => loadTable(tableData.table)} />)}</div> : null}
        </div>
      ) : null}

      {tab === 'log' ? (
        <div className="space-y-2">
          {summary?.changes.length ? summary.changes.map((change) => <div key={change.id} className="rounded-[14px] border border-border-soft bg-surface-1 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[12px] font-bold">{change.entity_type} · {change.action}</div><div className="mt-1 truncate text-[10px] text-text-muted">{change.entity_id || '—'}</div></div><div className="shrink-0 text-[10px] text-text-muted">{new Date(change.created_at).toLocaleString('ru-RU')}</div></div>{change.note ? <div className="mt-2 text-[11px] text-text-secondary">{change.note}</div> : null}</div>) : <div className="rounded-[14px] bg-surface-1 p-4 text-[12px] text-text-muted">Изменений пока нет.</div>}
        </div>
      ) : null}
    </div>
  );
};

export default DataSettingsCRM;
