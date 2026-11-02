import { NIGHT_STAGES, type NightStageView } from './nightStageModel.ts';

/** The ribbon of the night's stages and the hint of the current one, coloured by stage (owner, 2026-11-02). */
export function NightStageStrip({ view }: { view: NightStageView }) {
  return (
    <div className="live-night-stage" data-testid="live-night-stage" data-tone={view.tone} data-stage={view.key}>
      <div className="live-night-stage__ribbon" role="list" aria-label={`Стадия ночи ${view.index + 1} из ${view.total}`}>
        {NIGHT_STAGES.map((stage, index) => (
          <i key={stage.key} role="listitem" aria-current={index === view.index ? 'step' : undefined} className={index < view.index ? 'is-done' : index === view.index ? 'is-current' : ''} title={stage.short} />
        ))}
      </div>
      <div className="live-night-stage__head"><strong>{view.stage}</strong><span>{view.index + 1}/{view.total}</span></div>
      <div className="live-night-stage__hint" data-testid="live-night-hint">{view.hint}</div>
      {view.chosen ? <div className="live-night-stage__chosen" data-testid="live-night-chosen">{view.chosen}</div> : null}
    </div>
  );
}
