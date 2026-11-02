import { useLayoutEffect, useRef } from 'react';
import { NIGHT_STAGES, type NightStageView } from './nightStageModel.ts';
import type { StageView } from './dayStageModel.ts';

/** The ribbon of the night's stages and the hint of the current one, coloured by stage (owner, 2026-11-02). */
export function NightStageStrip({ view }: { view: NightStageView | StageView }) {
  const labels = 'stages' in view ? view.stages : NIGHT_STAGES.map((stage) => stage.short);
  const ref = useRef<HTMLDivElement | null>(null);
  // The nicknames and avatars of the board are a layer placed over it by absolute offsets; the banner above the board pushes
  // the board down, so the layer is told by how much (`--night-banner-h`, used by liveGameNightStage.css).
  useLayoutEffect(() => {
    const node = ref.current;
    const shell = node?.closest('.evening-live-engine-shell') as HTMLElement | null;
    if (!node || !shell) return undefined;
    const sync = () => {
      const style = getComputedStyle(node);
      // A banner hidden on a short screen (the stage lives in the central panel there) pushes nothing down.
      const shown = style.display !== 'none';
      shell.style.setProperty('--night-banner-h', `${shown ? Math.round(node.getBoundingClientRect().height + parseFloat(style.marginBottom || '0')) : 0}px`);
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return () => shell.style.removeProperty('--night-banner-h');
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => { observer.disconnect(); shell.style.removeProperty('--night-banner-h'); };
  }, []);
  return (
    <div ref={ref} className="live-night-stage" data-testid="live-night-stage" data-tone={view.tone} data-stage={"key" in view ? view.key : view.index}>
      <div className="live-night-stage__ribbon" role="list" aria-label={`Стадия ${view.index + 1} из ${view.total}`}>
        {labels.map((label, index) => (
          <i key={label} role="listitem" aria-current={index === view.index ? 'step' : undefined} className={index < view.index ? 'is-done' : index === view.index ? 'is-current' : ''} title={label} />
        ))}
      </div>
      <div className="live-night-stage__head"><strong>{view.stage}</strong><span>{view.index + 1}/{view.total}</span></div>
      <div className="live-night-stage__hint" data-testid="live-night-hint"><span className="live-night-stage__long">{view.hint}</span><span className="live-night-stage__short">{view.shortHint}</span></div>
      {view.chosen ? <div className="live-night-stage__chosen" data-testid="live-night-chosen">{view.chosen}</div> : null}
    </div>
  );
}
