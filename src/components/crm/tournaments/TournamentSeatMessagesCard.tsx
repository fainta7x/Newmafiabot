import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { api } from '../../../lib/api.ts';

/**
 * «Личные сообщения: где кто сидит» (owner, 2026-10-03). A visible block, so the organizer does not have to
 * look for the button inside a tab: it sends the seats of the next game to be played to the players in private
 * messages right now. Without a press the first game's message goes out by itself 30 minutes before the start
 * and the next ones right after the previous game's result is posted.
 */
export const TournamentSeatMessagesCard: React.FC<{ tournamentId: string; status: string; games: Array<{ status?: string }> }> = ({ tournamentId, status, games }) => {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // The parent's game list is a snapshot: when the server says nothing is left to play, the block hides itself.
  const [nothingLeft, setNothingLeft] = useState(false);
  const hasGameToPlay = games.some((game) => game.status !== 'completed');
  if (nothingLeft || !['draft', 'active', 'correction'].includes(status) || !games.length || !hasGameToPlay) return null;

  const send = async () => {
    if (busy) return;
    if (!window.confirm('Разослать игрокам личные сообщения, где они сидят в ближайшей игре?')) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await api.sendTournamentSeatMessages(tournamentId);
      const missing = result.unreachable > 0
        ? ` У ${result.unreachable} из ${result.players} нет привязанного Telegram/VK или личные сообщения выключены, им не дойдёт.`
        : '';
      if (result.reached === 0) {
        setNote({ type: 'error', text: `Места игры №${result.game_number} никому не дошли: ни у кого из игроков нет привязанного Telegram/VK или личные сообщения выключены.` });
      } else if (result.new_sent === 0) {
        setNote({ type: 'success', text: `Места игры №${result.game_number} уже были разосланы раньше (${result.reached} из ${result.players} игроков).${missing}` });
      } else {
        setNote({ type: 'success', text: `Места игры №${result.game_number} отправлены в личные сообщения: ${result.reached} из ${result.players} игроков.${missing}` });
      }
    } catch (err: any) {
      if (/Нет игры, которую ещё нужно играть/.test(String(err?.message || ''))) {
        setNothingLeft(true);
        return;
      }
      setNote({ type: 'error', text: err?.message || 'Не удалось разослать места' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[18px] border border-border-soft bg-surface-1 p-3.5" data-testid="tournament-seat-messages">
      <h3 className="text-[12px] font-black uppercase tracking-wider text-text-primary">Личные сообщения: где кто сидит</h3>
      <p className="mt-1 text-[11px] leading-4 text-text-muted">
        Каждый игрок получит в Telegram/VK, на каком месте он сидит в ближайшей игре. Сами они уходят за 30 минут до начала и после результата прошлой игры; кнопка отправляет сразу.
      </p>
      {note ? (
        <div className={`mt-3 rounded-xl px-3 py-2 text-[11px] font-bold ${note.type === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>{note.text}</div>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void send()}
        className="mt-3 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-[11px] font-black uppercase tracking-wider text-white disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        {busy ? 'Отправляем…' : 'Разослать места игрокам'}
      </button>
    </section>
  );
};
