import React, { useEffect, useMemo, useState } from 'react';
import { validateProtocolVoting } from '../../../lib/protocolVotingValidation';
import { isSupportedTableSize, roleCountsMatchTable, tableRolesLabel } from '../../../lib/tableComposition';
import { ProtocolWindow, type ProtocolTab } from './ProtocolWindow';
import { OverviewView } from './OverviewView';
import { GameFlowView } from './GameFlowView';
import { PlayerSheet, PlayersList } from './PlayersView';
import { ResultView } from './ResultView';
import { Card, type Tone } from './ui';
import { buildCircles, computeChanges, computeIssues, type Change, type ProtocolState } from './protocolReview';
import type { ProtocolApi } from './types';

type Props = {
  api: ProtocolApi;
  title: string;
  subtitle: string;
  save: { label: string; tone: Tone };
  /** Shown above every place: a failed save, or what the judge must still fill in. */
  saveError?: string | null;
  /** The protocol as it was when the window opened: «Вы изменили» is the difference from it. */
  baseline: ProtocolState | null;
  repairNotes?: string[];
  busy?: boolean;
  /** Changes whose reason is derived (who left the game) are re-derived by the editor when taken back. */
  onRevert: (change: Change) => void;
  onConfirm: () => Promise<unknown> | void;
  onReopen: () => Promise<unknown> | void;
  onClose: () => void;
  /** A new game (or a re-opened one) starts again from the overview. */
  resetKey: string | number;
  /** Extra places and their content (the tournament's judge points). */
  extra?: Partial<Record<'points', React.ReactNode>>;
};

/**
 * The protocol window with everything it shows, the same for a club game and a tournament game: the four places, the
 * review of what to check, what the judge changed, and the checks before a game may be confirmed. The editor around it
 * only loads, saves, confirms and reopens.
 */
export const ProtocolWorkspace: React.FC<Props> = ({ api, title, subtitle, save, saveError, baseline, repairNotes = [], busy, onRevert, onConfirm, onReopen, onClose, resetKey, extra }) => {
  const { protocol, results: playerResults, locked, zeroRoundRule } = api;
  const [activeTab, setActiveTab] = useState<ProtocolTab>('overview');
  const [circle, setCircle] = useState(0);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [reviewed, setReviewed] = useState<Record<number, boolean>>({});
  const [completeHint, setCompleteHint] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab('overview'); setCircle(0); setSelectedSeat(null); setReviewed({}); setCompleteHint(null);
  }, [resetKey]);

  const issues = useMemo(() => computeIssues({ protocol, results: playerResults }, zeroRoundRule), [protocol, playerResults, zeroRoundRule]);
  const changes = useMemo(() => (baseline ? computeChanges(baseline, { protocol, results: playerResults }) : []), [baseline, protocol, playerResults]);
  const circles = useMemo(() => buildCircles(protocol), [protocol]);
  const roleCounts = useMemo(() => playerResults.reduce<Record<string, number>>((acc, player) => {
    if (player.role) acc[player.role] = (acc[player.role] || 0) + 1;
    return acc;
  }, {}), [playerResults]);

  const confirmGame = async () => {
    // Say exactly what is missing, on screen (an alert() can be swallowed by a Telegram WebView).
    if (!roleCountsMatchTable(roleCounts, playerResults.length)) {
      setCompleteHint(`Перед подтверждением установите роли: ${isSupportedTableSize(playerResults.length) ? tableRolesLabel(playerResults.length) : '6 мирных, Шериф, 2 мафии и Дон'}.`);
      setActiveTab('players');
      return;
    }
    if (!protocol.winner_team) {
      setCompleteHint('Укажите победившую команду в разделе «Итог».');
      setActiveTab('result');
      return;
    }
    if (protocol.votes?.length) {
      const voting = validateProtocolVoting(protocol.votes, playerResults, protocol.zero_round_voted_participant_id, true, { tableSize: playerResults.length, zeroRoundRule });
      if (voting.errorMsg) {
        setCompleteHint(voting.errorMsg);
        const failed = voting.roundIndexWithError == null ? null : (protocol.votes || [])[voting.roundIndexWithError];
        setCircle(failed ? Number((failed as any).day_number ?? 0) : 0);
        setActiveTab('game');
        return;
      }
    }
    setCompleteHint(null);
    await onConfirm();
  };

  const goto = (tab: ProtocolTab, target?: { circle?: number; seat?: number }) => {
    if (target?.circle != null) setCircle(target.circle);
    if (tab === 'players' && target?.seat != null) setSelectedSeat(target.seat);
    setActiveTab(tab);
  };
  const hint = completeHint || saveError || null;
  const toggleReviewed = (index: number) => setReviewed((prev) => ({ ...prev, [index]: !prev[index] }));

  return (
    <ProtocolWindow
      tab={activeTab}
      onTab={(tab) => { setCompleteHint(null); setActiveTab(tab); }}
      title={title}
      subtitle={subtitle}
      confirmed={locked}
      save={save}
      attention={issues.length}
      onClose={onClose}
      extraTabs={extra?.points ? ['points'] : []}
      rail={(
        <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3 text-[12px] leading-5 text-white/50">
          {issues.length ? `Замечаний: ${issues.length}` : 'Замечаний нет'}<br />
          Изменений: {changes.length}
        </div>
      )}
    >
      {hint ? <p role="alert" className="mb-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] px-4 py-3 text-[13px] font-medium leading-5 text-amber-100">{hint}</p> : null}
      {repairNotes.length ? (
        <Card tone="info" className="mb-4 text-[13px] leading-5" testId="legacy-repair-note">
          <span className="font-semibold">Исправлено автоматически по записи игры:</span> {repairNotes.join('; ')}. Сохранится вместе с исправлением протокола.
        </Card>
      ) : null}
      {activeTab === 'overview' && (
        <OverviewView api={api} circles={circles} issues={issues} changes={changes} reviewed={reviewed} onToggleReviewed={toggleReviewed} onGoto={goto} onRevert={onRevert} onConfirm={() => void confirmGame()} onReopen={() => void onReopen()} busy={!!busy} />
      )}
      {activeTab === 'game' && (
        <GameFlowView api={api} circles={circles} circleIndex={circle} onCircle={setCircle} reviewed={reviewed} onToggleReviewed={toggleReviewed} issues={issues} />
      )}
      {activeTab === 'players' && (
        <>
          <PlayersList api={api} issues={issues} onOpen={setSelectedSeat} />
          <PlayerSheet api={api} seat={selectedSeat} onClose={() => setSelectedSeat(null)} />
        </>
      )}
      {activeTab === 'result' && <ResultView api={api} />}
      {activeTab === 'points' && extra?.points}
    </ProtocolWindow>
  );
};
