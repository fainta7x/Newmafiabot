import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Award,
  Shield,
  Crown,
  UserCheck,
  MapPin,
  Calendar,
  AlertCircle,
  RefreshCw,
  Star,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '../../lib/api.ts';

interface PublicTournamentResultsProps {
  token: string;
}

export const PublicTournamentResults: React.FC<PublicTournamentResultsProps> = ({ token }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPublicTournamentResults(token);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Турнир не найден или результаты ещё не опубликованы');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const toggleExpandRow = (id: string) => {
    setExpandedRowId(expandedRowId === id ? null : id);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'mvp':
        return <Crown className="w-5 h-5 text-amber-400" />;
      case 'best_citizen':
        return <UserCheck className="w-5 h-5 text-emerald-400" />;
      case 'best_sheriff':
        return <Shield className="w-5 h-5 text-amber-400" />;
      case 'best_mafia':
        return <Shield className="w-5 h-5 text-rose-500" />;
      case 'best_don':
        return <Crown className="w-5 h-5 text-purple-400" />;
      default:
        return <Award className="w-5 h-5 text-cyan-400" />;
    }
  };

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'mvp':
        return 'MVP (Лучший игрок)';
      case 'best_citizen':
        return 'Лучший красный игрок';
      case 'best_sheriff':
        return 'Лучший шериф';
      case 'best_mafia':
        return 'Лучший черный игрок';
      case 'best_don':
        return 'Лучший дон';
      default:
        return category;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111113] text-[#F5F1EA] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <RefreshCw className="w-10 h-10 animate-spin mx-auto text-[#C94F67]" />
          <p className="text-sm font-mono text-text-muted">Загрузка официальных итогов...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#111113] text-[#F5F1EA] flex items-center justify-center p-4">
        <div className="bg-surface-1 border border-border-soft rounded-3xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
          <AlertCircle className="w-12 h-12 text-[#C94F67] mx-auto animate-pulse" />
          <h2 className="text-lg font-black text-text-primary uppercase tracking-tight">Ошибка доступа</h2>
          <p className="text-xs text-text-muted leading-relaxed">
            {error || 'Не удалось загрузить результаты турнира.'}
          </p>
        </div>
      </div>
    );
  }

  const { tournament, standings, nominations } = data;
  const top3 = standings.slice(0, 3);

  // Format date helper
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-[#111113] text-[#F5F1EA] selection:bg-[#C94F67]/30 selection:text-white">
      {/* Container */}
      <div className="w-full max-w-7xl mx-auto px-4 py-8 sm:py-12 space-y-8">
        
        {/* ========================================== */}
        {/* HEADER SECTION                             */}
        {/* ========================================== */}
        <div className="bg-surface-1 border border-border-soft rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#C94F67]/10 to-transparent rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3 max-w-3xl">
              <div className="flex flex-wrap gap-2">
                {tournament.stage && (
                  <span className="bg-[#C94F67]/15 text-[#C94F67] border border-[#C94F67]/30 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    {tournament.stage}
                  </span>
                )}
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <Star className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                  <span>Официальные результаты</span>
                </span>
              </div>

              <h1 className="text-2xl sm:text-3.5xl font-black text-text-primary tracking-tight leading-tight uppercase">
                {tournament.title}
              </h1>

              {/* Meta details */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-muted pt-1">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#C94F67]" />
                  <span>{formatDate(tournament.date)}</span>
                </div>
                {tournament.venue && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#C94F67]" />
                    <span>{tournament.venue}</span>
                  </div>
                )}
                {tournament.chief_judge_name && (
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-[#C94F67]" />
                    <span>Гл. судья: <strong className="text-text-secondary">{tournament.chief_judge_name}</strong></span>
                  </div>
                )}
              </div>
            </div>

            {/* Published date block */}
            <div className="shrink-0 bg-surface-2 border border-border-soft rounded-2xl p-4 flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400 shrink-0">
                <Trophy className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-black text-text-muted tracking-wider block">Опубликовано</span>
                <span className="text-xs font-mono font-bold text-text-primary">
                  {formatDate(tournament.results_published_at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================== */}
        {/* PODIUM / LEADERS SECTION                   */}
        {/* ========================================== */}
        {top3.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {top3.map((player: any) => {
              const isFirst = player.place === 1;
              const isSecond = player.place === 2;
              const isThird = player.place === 3;

              return (
                <div
                  key={player.participant_id}
                  className={`bg-surface-1 border rounded-3xl p-6 flex flex-col justify-between relative overflow-hidden transition-all shadow-lg ${
                    isFirst
                      ? 'border-amber-500 bg-gradient-to-br from-amber-500/10 to-transparent'
                      : isSecond
                      ? 'border-slate-400 bg-gradient-to-br from-slate-400/5 to-transparent'
                      : 'border-amber-700 bg-gradient-to-br from-amber-700/5 to-transparent'
                  }`}
                >
                  {/* Decorative big number */}
                  <div className="absolute -right-4 -bottom-4 text-8xl font-black opacity-5 font-mono select-none">
                    {player.place}
                  </div>

                  <div className="space-y-4 relative z-10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isFirst && <Crown className="w-6 h-6 text-amber-400 animate-bounce" />}
                        {isSecond && <Trophy className="w-5 h-5 text-slate-300" />}
                        {isThird && <Trophy className="w-5 h-5 text-amber-700" />}
                        <span
                          className={`text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                            isFirst
                              ? 'bg-amber-500/20 text-amber-400'
                              : isSecond
                              ? 'bg-slate-400/20 text-slate-300'
                              : 'bg-amber-700/20 text-amber-600'
                          }`}
                        >
                          {player.place} место
                        </span>
                      </div>
                      <span className="text-text-muted font-mono text-xs">#{player.participant_number}</span>
                    </div>

                    <div>
                      <h3 className="text-xl font-black text-text-primary truncate">
                        {player.display_name}
                      </h3>
                      <p className="text-xs text-text-muted mt-1 font-mono">
                        Сыграно игр: <strong className="text-text-secondary">{player.games_played}</strong>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border-soft/60">
                      <div>
                        <span className="text-[10px] text-text-muted uppercase font-black block tracking-wider">Всего очков</span>
                        <span className="text-2xl font-black text-[#C94F67] font-mono leading-none">
                          {player.total_points}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-text-muted uppercase font-black block tracking-wider">Доп. баллы</span>
                        <span className="text-lg font-black text-text-primary font-mono leading-none">
                          {player.additional_total > 0 ? `+${player.additional_total}` : player.additional_total}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ========================================== */}
        {/* STANDINGS TABLE SECTION                    */}
        {/* ========================================== */}
        <div className="bg-surface-1 border border-border-soft rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-border-soft bg-surface-2 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-text-primary flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Турнирная таблица</span>
            </h2>
            <span className="text-xs text-text-muted font-mono">Всего участников: {standings.length}</span>
          </div>

          {/* Standings Desktop Table (> 640px) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-2 text-text-muted font-bold border-b border-border-soft/80 select-none">
                  <th className="py-4 px-4 text-center font-black w-14">М.</th>
                  <th className="py-4 px-2 w-12 text-center">№</th>
                  <th className="py-4 px-3 min-w-[150px]">Участник</th>
                  <th className="py-4 px-3 text-center font-black text-accent font-mono w-20">Σ Очки</th>
                  <th className="py-4 px-3 text-center font-mono w-20">Σдб</th>
                  <th className="py-4 px-2 text-center w-14">Игр</th>
                  <th className="py-4 px-2 text-center font-mono w-14">Поб.</th>
                  <th className="py-4 px-2 text-center font-mono w-14">Д+Ш</th>
                  <th className="py-4 px-2 text-center font-mono w-14">Уб1</th>
                  <th className="py-4 px-2 text-center font-mono w-14">ЛХ</th>
                  <th className="py-4 px-2 text-center font-mono w-14">Ci</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft/50">
                {standings.map((item: any) => {
                  const isTop3 = item.place <= 3;
                  return (
                    <tr
                      key={item.participant_id}
                      className={`hover:bg-[#C94F67]/5 transition-colors group ${
                        isTop3 ? 'bg-[#C94F67]/2' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-black ${
                            item.place === 1
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              : item.place === 2
                              ? 'bg-slate-300/20 text-slate-300 border border-slate-300/40'
                              : item.place === 3
                              ? 'bg-amber-700/20 text-amber-600 border border-amber-700/40'
                              : 'bg-surface-3 text-text-secondary border border-border-soft'
                          }`}
                        >
                          {item.place}
                        </span>
                      </td>
                      <td className="py-3.5 px-2 text-center font-mono text-text-muted">
                        #{item.participant_number}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-extrabold text-text-primary text-[13px] group-hover:text-white transition-colors">
                          {item.display_name}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-black text-sm text-[#C94F67]">
                        {item.total_points}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-bold text-text-secondary">
                        {item.additional_total > 0 ? `+${item.additional_total}` : item.additional_total}
                      </td>
                      <td className="py-3.5 px-2 text-center text-text-secondary font-semibold">
                        {item.games_played}
                      </td>
                      <td className="py-3.5 px-2 text-center font-mono font-bold text-emerald-400">
                        {item.wins}
                      </td>
                      <td className="py-3.5 px-2 text-center font-mono font-semibold text-purple-400">
                        {item.don_wins + item.sheriff_wins}
                      </td>
                      <td className="py-3.5 px-2 text-center font-mono text-text-muted">
                        {item.first_killed_count}
                      </td>
                      <td className="py-3.5 px-2 text-center font-mono text-amber-400">
                        {item.best_move_points > 0 ? `+${item.best_move_points}` : item.best_move_points}
                      </td>
                      <td className="py-3.5 px-2 text-center font-mono text-cyan-400">
                        {item.ci_points > 0 ? `+${item.ci_points}` : item.ci_points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Standings Mobile Cards (< 640px) */}
          <div className="block sm:hidden divide-y divide-border-soft/60">
            {standings.map((item: any) => {
              const isExpanded = expandedRowId === item.participant_id;
              const isTop3 = item.place <= 3;

              return (
                <div
                  key={item.participant_id}
                  onClick={() => toggleExpandRow(item.participant_id)}
                  className={`p-4 space-y-2 cursor-pointer transition-colors active:bg-[#C94F67]/5 ${
                    isTop3 ? 'bg-[#C94F67]/2' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black shrink-0 ${
                          item.place === 1
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : item.place === 2
                            ? 'bg-slate-300/20 text-slate-300 border border-slate-300/40'
                            : item.place === 3
                            ? 'bg-amber-700/20 text-amber-600 border border-amber-700/40'
                            : 'bg-surface-3 text-text-secondary border border-border-soft'
                        }`}
                      >
                        {item.place}
                      </span>

                      <div className="min-w-0 truncate">
                        <span className="text-text-muted text-[10px] font-mono mr-1">#{item.participant_number}</span>
                        <span className="font-extrabold text-text-primary text-sm">
                          {item.display_name}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
                      <div className="text-right">
                        <span className="text-[9px] text-text-muted block leading-none">Очки</span>
                        <span className="font-black text-sm text-[#C94F67]">{item.total_points}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-text-muted block leading-none">Σдб</span>
                        <span className="font-bold text-text-secondary">
                          {item.additional_total > 0 ? `+${item.additional_total}` : item.additional_total}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-text-muted shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
                      )}
                    </div>
                  </div>

                  {/* Expanded mobile details */}
                  {isExpanded && (
                    <div className="pt-2.5 border-t border-border-soft/50 grid grid-cols-4 gap-2 text-center text-[11px] font-mono bg-surface-2/60 p-2.5 rounded-xl text-text-muted">
                      <div>
                        <span className="text-[9px] block">Игры</span>
                        <strong className="text-text-primary font-bold">{item.games_played}</strong>
                      </div>
                      <div>
                        <span className="text-[9px] block">Победы</span>
                        <strong className="text-emerald-400 font-bold">{item.wins}</strong>
                      </div>
                      <div>
                        <span className="text-[9px] block">Д+Ш</span>
                        <strong className="text-purple-400 font-bold">{item.don_wins + item.sheriff_wins}</strong>
                      </div>
                      <div>
                        <span className="text-[9px] block">Уб1</span>
                        <strong className="text-text-secondary font-bold">{item.first_killed_count}</strong>
                      </div>
                      <div>
                        <span className="text-[9px] block">Плюс</span>
                        <strong className="text-emerald-400 font-bold">{item.positive_points > 0 ? `+${item.positive_points}` : item.positive_points}</strong>
                      </div>
                      <div>
                        <span className="text-[9px] block">Штрафы</span>
                        <strong className="text-[#C94F67] font-bold">{item.penalty_points > 0 ? `-${item.penalty_points}` : item.penalty_points}</strong>
                      </div>
                      <div>
                        <span className="text-[9px] block">ЛХ</span>
                        <strong className="text-amber-400 font-bold">+{item.best_move_points}</strong>
                      </div>
                      <div>
                        <span className="text-[9px] block">Ci</span>
                        <strong className="text-cyan-400 font-bold">+{item.ci_points}</strong>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ========================================== */}
        {/* NOMINATIONS SECTION                        */}
        {/* ========================================== */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-black uppercase tracking-tight text-text-primary">Победители номинаций</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {nominations.map((nom: any) => {
              const winner = nom.candidates?.find((c: any) => c.participant_id === nom.winner_participant_id);
              if (!winner) return null;

              return (
                <div
                  key={nom.category}
                  className="bg-surface-1 border border-border-soft rounded-3xl p-5 flex items-start gap-4 shadow-lg hover:border-[#C94F67]/30 transition-all relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#C94F67]/5 to-transparent rounded-full blur-xl pointer-events-none" />
                  
                  {/* Category icon */}
                  <div className="p-3 bg-surface-2 rounded-2xl border border-border-soft shrink-0 group-hover:scale-105 transition-transform duration-350">
                    {getCategoryIcon(nom.category)}
                  </div>

                  <div className="space-y-1.5 min-w-0 flex-1">
                    <span className="text-[10px] uppercase font-black text-text-muted tracking-wider block">
                      {getCategoryTitle(nom.category)}
                    </span>
                    <h3 className="text-base font-black text-text-primary truncate leading-snug group-hover:text-[#C94F67] transition-colors">
                      {winner.display_name}
                    </h3>

                    {/* Score / stats */}
                    <div className="flex items-baseline gap-1.5 pt-0.5">
                      <span className="text-xs font-bold text-text-secondary font-mono">
                        {winner.nomination_points} б.
                      </span>
                      <span className="text-[10px] text-text-muted font-mono">
                        (игр: {winner.games_in_role})
                      </span>
                    </div>

                    {/* Resolution Method if tie was resolved */}
                    {nom.has_tie && (
                      <div className="text-[10px] text-text-muted italic pt-1 border-t border-border-soft/40 mt-1">
                        Разрешено: {nom.resolution_method === 'draw' ? 'жребий' : 'решение ГС'}
                        {nom.comment && <span className="block mt-0.5">«{nom.comment}»</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};
