import type { TranslationSegment } from "../../domain/transcript";

type Props = {
  segments: TranslationSegment[];
};

export function TranslationPanel({ segments }: Props) {
  return (
    <section className="panel translation-panel" aria-label="Japanese translation">
      <div className="panel-header">
        <span className="eyebrow">Japanese translation</span>
        <span className="live-pill muted">逐次更新</span>
      </div>
      <div className="segment-list">
        {segments.filter((segment) => segment.text.trim()).map((segment) => (
          <p key={segment.id} className={`segment ja segment-${segment.status}`}>
            {segment.text}
          </p>
        ))}
      </div>
    </section>
  );
}
