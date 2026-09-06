import { Search, X } from 'lucide-react';

export default function EveningListControls<T extends string>({
  search, onSearch, filter, onFilter, filters, searchLabel,
}: {
  search: string;
  onSearch: (value: string) => void;
  filter: T;
  onFilter: (value: T) => void;
  filters: Array<{ id: T; label: string; count: number }>;
  searchLabel: string;
}) {
  const searching = Boolean(search.trim());
  return <div className="space-y-2">
    <div className="grid grid-cols-3 gap-1.5">
      {filters.map((item) => <button key={item.id} type="button"
        aria-label={String(item.count) + ' ' + item.label}
        aria-pressed={!searching && filter === item.id}
        onClick={() => { onSearch(''); onFilter(item.id); }}
        className={`min-h-[48px] min-w-0 rounded-[11px] border px-1 py-1 text-center ${!searching && filter === item.id ? 'border-white/16 bg-white/[0.09] text-text-primary' : 'border-border-soft bg-surface-2 text-text-secondary'}`}>
        <strong className="block text-[14px]">{item.count}</strong>
        <span className="text-[10px]">{item.label}</span>
      </button>)}
    </div>
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <input aria-label={searchLabel} placeholder={searchLabel} value={search} onChange={(event) => onSearch(event.target.value)} className="mobile-field min-h-[44px] pl-10 pr-11" />
      {search ? <button type="button" aria-label="Очистить поиск" onClick={() => onSearch('')} className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-text-secondary"><X className="h-4 w-4" /></button> : null}
    </div>
    {searching ? <p role="status" className="text-[10px] text-text-secondary">Поиск по всему списку</p> : null}
  </div>;
}
