export default function PlayerSettingsLoadState({ title, loading, error, onRetry }: {
  title: string;
  loading: string;
  error: string;
  onRetry: () => void;
}) {
  return <section className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
    <h2 className="font-semibold">{title}</h2>
    {error ? <div role="alert" className="mt-2 space-y-3">
      <p className="text-sm text-rose-300">{error}</p>
      <button type="button" onClick={onRetry} className="ds-focus-ring min-h-11 w-full rounded-xl border border-white/15 bg-white/[.06] px-3 text-sm font-semibold">Повторить загрузку</button>
    </div> : <p role="status" className="mt-2 text-sm text-white/50">{loading}</p>}
  </section>;
}
