import React, { useEffect, useState } from 'react';
import { clubGamesApi, type ClubGameEloBlank } from '../../../lib/clubGamesApi';
import { GameRoleBadge } from '../../ui/GameRole.tsx';
import { EloBreakdownLines, EloChange, EloTableLine } from '../../game/EloBreakdown.tsx';
import { Btn, Card, Eyebrow, SeatBadge } from './ui';

/**
 * «Эло за игру» in the protocol window of a confirmed club game (owner, 2026-10-27): the result blank of the club chat in
 * the window — team strength, each seat's change and every line of its breakdown. It is read again after each confirm.
 */
export const EloBlankSection: React.FC<{ gameId: number | string; version: string }> = ({ gameId, version }) => {
  const [blank, setBlank] = useState<ClubGameEloBlank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setError(null);
    clubGamesApi.eloBlank(gameId)
      .then((value) => { if (current) setBlank(value); })
      .catch((reason: any) => { if (current) { setBlank(null); setError(reason?.message || 'Не удалось загрузить Эло за игру'); } });
    return () => { current = false; };
  }, [gameId, version, attempt]);

  const rated = Boolean(blank?.seats.some((seat) => seat.eloDelta != null));
  return (
    <Card className="mt-4" testId="protocol-elo-blank">
      <Eyebrow>Эло за игру</Eyebrow>
      {error ? (
        <div role="alert" className="mt-2 text-[13px] leading-5 text-rose-200">{error}<Btn className="mt-2" block onClick={() => setAttempt((value) => value + 1)}>Повторить</Btn></div>
      ) : !blank ? (
        <p className="mt-2 text-[13px] text-white/45">Загружаем…</p>
      ) : !rated ? (
        <p className="mt-2 text-[13px] leading-5 text-white/55">Эта игра рейтинг Эло не меняет.</p>
      ) : (
        <>
          {blank.table ? <div className="mt-2"><EloTableLine table={blank.table} testId="protocol-elo-table" /></div> : null}
          <ol className="mt-3 grid gap-2 lg:grid-cols-2">
            {blank.seats.map((seat) => (
              <li key={seat.seat} data-testid={`protocol-elo-seat-${seat.seat}`} className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                <div className="flex min-w-0 items-start gap-2">
                  <SeatBadge seat={seat.seat} team={seat.role === 'mafia' || seat.role === 'don' ? 'black' : seat.role ? 'red' : null} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[14px] font-semibold leading-5 text-white">{seat.nickname}</p>
                    <div className="mt-0.5 flex min-h-4 items-center"><GameRoleBadge role={seat.role as any} /></div>
                  </div>
                  <div className="shrink-0 text-right">
                    {seat.won ? <div className="text-[11px] font-semibold tracking-[0.12em] text-emerald-300">ПОБЕДА</div> : null}
                    {seat.eloDelta != null ? <EloChange delta={seat.eloDelta} after={seat.eloAfter} /> : <span className="text-[11px] text-white/40">без Эло</span>}
                  </div>
                </div>
                <EloBreakdownLines lines={seat.lines} contribution={seat.eloContribution} />
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] leading-4 text-white/40">Как на картинке итогов в чате клуба: изменение за игру, рейтинг после неё и из чего оно сложилось.</p>
        </>
      )}
    </Card>
  );
};
