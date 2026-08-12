import React, { useEffect, useState } from 'react';
import { Calendar, ExternalLink, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import { api, type EveningTable } from '../../lib/api.ts';

interface PublicJoinViewProps {
  eveningId: string;
}

export const PublicJoinView: React.FC<PublicJoinViewProps> = ({ eveningId }) => {
  const [evening, setEvening] = useState<{
    id: string;
    title: string;
    starts_at: string;
    ends_at?: string;
    venue?: string;
    format: string;
    status: string;
    capacity: number;
    default_price: number;
    notes?: string;
    tables: EveningTable[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void api.getPublicEvening(eveningId)
      .then((data) => { if (!cancelled) setEvening(data); })
      .catch((err: any) => { if (!cancelled) setError(err?.message || 'Игровой вечер не найден или ссылка устарела'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eveningId]);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#090a0d] p-4 text-white"><div className="text-center"><div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-white/70" /><p className="mt-3 text-sm text-white/40">Загружаем игровой вечер…</p></div></main>;
  }

  if (error || !evening) {
    return <main className="flex min-h-screen items-center justify-center bg-[#090a0d] p-4 text-white"><div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.045] p-6 text-center"><h1 className="text-xl font-semibold">Ссылка недействительна</h1><p className="mt-2 text-sm leading-6 text-white/45">{error || 'Вечер не найден'}</p></div></main>;
  }

  const eveningDate = new Date(evening.starts_at);
  const formattedDate = eveningDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const formattedTime = eveningDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const price = Number(evening.default_price || 0);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090a0d] px-4 py-8 text-white">
      <div className="w-full max-w-md space-y-4">
        <header className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55"><Sparkles className="h-3.5 w-3.5" />2LA Noire · Тула</div>
          <h1 className="mt-4 text-2xl font-semibold leading-tight">{evening.title}</h1>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-2xl bg-black/20 p-3"><Calendar className="h-5 w-5 shrink-0 text-white/55" /><div><div className="text-[10px] uppercase tracking-wide text-white/30">Дата и время</div><div className="mt-0.5 text-sm font-medium capitalize">{formattedDate}, {formattedTime}</div></div></div>
            <div className="flex items-center gap-3 rounded-2xl bg-black/20 p-3"><MapPin className="h-5 w-5 shrink-0 text-white/55" /><div><div className="text-[10px] uppercase tracking-wide text-white/30">Место</div><div className="mt-0.5 text-sm font-medium">{evening.venue || 'Суп с Котом'}</div></div></div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-black/20 px-3 py-3 text-sm"><span className="text-white/40">Стоимость</span><strong>{price ? `${price.toLocaleString('ru-RU')} ₽` : 'Без оплаты'}</strong></div>
          {evening.notes ? <div className="mt-3 rounded-2xl border border-white/5 bg-black/15 px-3 py-3 text-sm leading-5 text-white/50">{evening.notes}</div> : null}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/[0.07]"><ShieldCheck className="h-5 w-5 text-white/65" /></span><div><h2 className="font-semibold">Запись через профиль игрока</h2><p className="mt-1 text-sm leading-6 text-white/45">Мы больше не создаём профиль по нику и телефону из публичной формы. Так история игр, рейтинг и записи всегда остаются у одного игрока.</p></div></div>
          <a href="/player" className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-black">Открыть кабинет игрока <ExternalLink className="h-4 w-4" /></a>
          <p className="mt-3 text-center text-xs leading-5 text-white/35">Если страница открыта не внутри Telegram, откройте MafiaBot и выберите «Записаться на игру».</p>
        </section>
      </div>
    </main>
  );
};
