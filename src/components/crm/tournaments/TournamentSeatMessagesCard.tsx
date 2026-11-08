import React, { useState } from 'react';
import { Image as ImageIcon, RefreshCw, Send } from 'lucide-react';
import type { Tournament } from '../../../lib/api.ts';
import { appConfirm } from '../../../lib/appConfirm.ts';
import { SeatingExportModal } from './SeatingExportModal.tsx';
import { api } from '../../../lib/api.ts';

/**
 * «Личные сообщения: где кто сидит» (owner, 2026-10-03). A visible block, so the organizer does not have to
 * look for the button inside a tab: it sends the seats of the next game to be played to the players in private
 * messages right now. Without a press the first game's message goes out by itself 30 minutes before the start
 * and the next ones right after the previous game's result is posted.
 */
export const TournamentSeatMessagesCard: React.FC<{ tournamentId: string; status: string; games: Array<{ status?: string }>; tournament?: Tournament; onChanged?: () => void }> = ({ tournamentId, status, games, tournament, onChanged }) => {
  const [showPng, setShowPng] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // The parent's game list is a snapshot: when the server says nothing is left to play, the block hides itself.
  const [nothingLeft, setNothingLeft] = useState(false);
  const hasGameToPlay = games.some((game) => game.status !== 'completed');
  const canSend = !nothingLeft && ['draft', 'active', 'correction'].includes(status) && games.length > 0 && hasGameToPlay;
  if (!games.length) return null;

  const regenerate = async () => {
    if (regenBusy) return;
    if (!(await appConfirm(`Текущая рассадка всех ${games.length || 10} игр будет заменена случайной.`, { title: 'Перегенерировать рассадку?', confirmLabel: 'Перегенерировать', danger: true }))) return;
    setRegenBusy(true);
    setNote(null);
    try {
      await api.generateTournamentSeating(tournamentId);
      setNote({ type: 'success', text: 'Случайная рассадка перегенерирована.' });
      onChanged?.();
    } catch (err: any) {
      setNote({ type: 'error', text: err?.message || 'Ошибка генерации рассадки' });
    } finally {
      setRegenBusy(false);
    }
  };

  const send = async () => {
    if (busy) return;
    if (!(await appConfirm('Каждый игрок получит в личные сообщения, где он сидит в ближайшей игре.', { title: 'Разослать места игрокам?', confirmLabel: 'Разослать' }))) return;
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
      <h3 className="text-[12px] font-black uppercase tracking-wider text-text-primary">Рассадка</h3>
      {canSend ? (
        <p className="mt-1 text-[11px] leading-4 text-text-muted">
          Личное сообщение «где кто сидит» уходит само за 30 минут до начала и после результата каждой игры; кнопка отправляет его сейчас.
        </p>
      ) : null}
      {note ? (
        <div className={`mt-3 rounded-xl px-3 py-2 text-[11px] font-bold ${note.type === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>{note.text}</div>
      ) : null}
      <div className="mt-3 grid gap-2">
        {canSend ? (
          <button type="button" disabled={busy} onClick={() => void send()}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-[11px] font-black uppercase tracking-wider text-white disabled:opacity-50">
            <Send className="h-4 w-4" />
            {busy ? 'Отправляем…' : 'Разослать места игрокам'}
          </button>
        ) : null}
        {tournament ? (
          <button type="button" onClick={() => setShowPng(true)}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface-2 px-4 text-[11px] font-bold text-text-primary">
            <ImageIcon className="h-4 w-4 text-accent" />
            Рассадка для игроков (PNG)
          </button>
        ) : null}
        {status === 'draft' ? (
          <button type="button" disabled={regenBusy} onClick={() => void regenerate()}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface-2 px-4 text-[11px] font-bold text-text-primary disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 text-accent ${regenBusy ? 'animate-spin' : ''}`} />
            Перегенерировать рассадку
          </button>
        ) : null}
      </div>
      {tournament ? <SeatingExportModal isOpen={showPng} onClose={() => setShowPng(false)} tournament={tournament} /> : null}
    </section>
  );
};
