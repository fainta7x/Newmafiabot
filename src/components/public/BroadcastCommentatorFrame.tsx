import { useEffect } from 'react';
import './broadcastCommentatorFrame.css';

/**
 * OBS Browser Source: a transparent frame for the commentators' window (owner, 2026-10-03).
 * Put it above the VDO.Ninja source and give both the same size. Nothing is loaded from the server,
 * so it needs no secret link and keeps working while the app restarts.
 *   /broadcast/frame?label=Комментаторы&names=Вася%20и%20Петя&plate=top
 */
export default function BroadcastCommentatorFrame() {
  useEffect(() => {
    document.documentElement.classList.add('broadcast-frame-document');
    document.body.classList.add('broadcast-frame-document');
    return () => {
      document.documentElement.classList.remove('broadcast-frame-document');
      document.body.classList.remove('broadcast-frame-document');
    };
  }, []);

  const params = new URLSearchParams(window.location.search);
  const label = (params.get('label') ?? 'Комментаторы').trim().slice(0, 40);
  const names = (params.get('names') ?? '').trim().slice(0, 60);
  const plate = params.get('plate') === 'top' ? 'top' : 'bottom';
  const showPlate = Boolean(label || names);

  return (
    <div className="broadcast-frame" aria-hidden="true">
      <div className="broadcast-frame-edge" />
      <i className="broadcast-frame-corner is-tl" />
      <i className="broadcast-frame-corner is-tr" />
      <i className="broadcast-frame-corner is-bl" />
      <i className="broadcast-frame-corner is-br" />
      {showPlate ? (
        <div className={`broadcast-frame-plate is-${plate}`}>
          <span className="broadcast-frame-live" />
          {label ? <b>{label}</b> : null}
          {names ? <span className="broadcast-frame-names">{names}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
