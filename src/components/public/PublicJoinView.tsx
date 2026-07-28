import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { api, EveningTable } from '../../lib/api.ts';

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

  // Form State
  const [nickname, setNickname] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [tableId, setTableId] = useState<string>('');
  const [source, setSource] = useState('telegram');
  const [submitting, setSubmitting] = useState(false);

  // Result state
  const [successResult, setSuccessResult] = useState<{
    registration_status: string;
    tableName: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    loadPublicEvening();
  }, [eveningId]);

  const loadPublicEvening = async () => {
    setLoading(true);
    try {
      const data = await api.getPublicEvening(eveningId);
      setEvening(data);
      if (data.tables && data.tables.length > 0) {
        setTableId(data.tables[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Игровой вечер не найден или ссылка устарела');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname) {
      alert('Укажите ваш игровой никнейм');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.joinPublicEvening(eveningId, {
        nickname: nickname.trim(),
        telegram_username: telegramUsername.trim().replace('@', ''),
        phone: phone.trim(),
        table_id: tableId || undefined,
        source,
      });

      setSuccessResult({
        registration_status: res.registration_status,
        tableName: res.tableName,
        message: res.message,
      });
    } catch (err: any) {
      alert(err.message || 'Ошибка записи на вечер');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-mono">Загрузка информации о вечере...</p>
        </div>
      </div>
    );
  }

  if (error || !evening) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-black uppercase text-white">Ссылка недействительна</h2>
          <p className="text-xs text-slate-400">{error || 'Вечер не найден'}</p>
        </div>
      </div>
    );
  }

  const eveningDate = new Date(evening.starts_at);
  const formattedDate = eveningDate.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const formattedTime = eveningDate.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 sm:p-6 flex flex-col justify-center items-center">
      <div className="max-w-lg w-full space-y-6">
        {/* Club Branding Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 px-3 py-1 rounded-full text-rose-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Клуб Мафии 2LA Noire • Тула</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
            {evening.title}
          </h1>
        </div>

        {/* Evening Info Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <Calendar className="w-5 h-5 text-rose-500 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Дата и время</span>
                <span className="font-bold text-white capitalize">{formattedDate}, {formattedTime}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
              <MapPin className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Локация</span>
                <span className="font-bold text-white">{evening.venue || 'кафе «Суп с Котом»'}</span>
              </div>
            </div>
          </div>

          {evening.notes && (
            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl text-xs text-slate-300">
              💡 {evening.notes}
            </div>
          )}
        </div>

        {/* Registration Form / Confirmation */}
        {successResult ? (
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-3xl flex items-center justify-center mx-auto border border-emerald-500/30">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-white uppercase">Запись успешно оформлена!</h3>
              <p className="text-xs text-emerald-400 font-bold">{successResult.message}</p>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-slate-400">Игрок:</span>
                <span className="font-bold text-white">{nickname}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Стол:</span>
                <span className="font-bold text-rose-400">{successResult.tableName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Статус:</span>
                <span className="font-bold text-emerald-400 uppercase">{successResult.registration_status}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Организатор клуба свяжется с вами для подтверждения или ждём вас в назначенный день!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-slate-800 pb-2">
              Записаться на игровой вечер
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase block mb-1">
                  Ваш Никнейм / Имя <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Например: Кот, Мафия007..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-rose-500 font-medium"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase block mb-1">
                  Ник в Telegram (@username)
                </label>
                <input
                  type="text"
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value)}
                  placeholder="@username"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-rose-500 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase block mb-1">
                  Номер телефона
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 (999) 000-00-00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-rose-500 font-mono"
                />
              </div>

              {evening.tables && evening.tables.length > 0 && (
                <div>
                  <label className="text-[11px] font-bold text-slate-300 uppercase block mb-1">
                    Выберите игровой стол
                  </label>
                  <select
                    value={tableId}
                    onChange={(e) => setTableId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-rose-500 font-medium"
                  >
                    {evening.tables.map((tbl) => (
                      <option key={tbl.id} value={tbl.id}>
                        {tbl.name} ({tbl.format === 'NOVICE' ? 'Для новичков' : tbl.format === 'TOURNAMENT' ? 'Турнирный' : 'Классика'}) - Свободно: {tbl.free_spots ?? tbl.capacity} мест
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase block mb-1">
                  Откуда вы о нас узнали?
                </label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-300 focus:outline-none focus:border-rose-500 font-medium"
                >
                  <option value="telegram">Telegram канал / чат</option>
                  <option value="vk">ВКонтакте</option>
                  <option value="friends">По рекомендации друзей</option>
                  <option value="cafe">Увидели в кафе «Суп с Котом»</option>
                  <option value="other">Другое</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 mt-2"
            >
              {submitting ? 'Оформление...' : 'Подтвердить Запись на Мафию'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
