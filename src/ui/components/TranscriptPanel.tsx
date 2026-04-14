import type { TranscriptSegment } from "../../domain/transcript";

type Props = {
  segments: TranscriptSegment[];
  onWordClick: (word: string, sourceText: string, anchor: DOMRect) => void;
};

const splitWords = (text: string) => text.split(/(\s+)/);

export function TranscriptPanel({ segments, onWordClick }: Props) {
  return (
    <section className="panel transcript-panel" aria-label="English transcript">
      <div className="panel-header">
        <span className="eyebrow">English transcript</span>
        <span className="live-pill">Mock stream</span>
      </div>
      <div className="segment-list">
        {segments.filter((segment) => segment.text.trim()).map((segment) => (
          <p key={segment.id} className={`segment segment-${segment.status}`}>
            {splitWords(segment.text).map((part, index) => {
              if (/^\s+$/.test(part)) return part;
              return (
                <button
                  className="word-button"
                  key={`${segment.id}-${part}-${index}`}
                  onClick={(event) => onWordClick(part, segment.text, event.currentTarget.getBoundingClientRect())}
                  type="button"
                >
                  {part}
                </button>
              );
            })}
          </p>
        ))}
      </div>
    </section>
  );
}
