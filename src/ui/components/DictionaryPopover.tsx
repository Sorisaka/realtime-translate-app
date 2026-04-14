import type { DictionaryEntry } from "../../domain/dictionary";

type Props = {
  entry: DictionaryEntry | null;
  sourceText?: string;
  position: { top: number; left: number } | null;
  isLoading: boolean;
  onClose: () => void;
  onSave: (entry: DictionaryEntry, sourceText?: string) => void;
};

export function DictionaryPopover({ entry, sourceText, position, isLoading, onClose, onSave }: Props) {
  if (!position) return null;

  return (
    <div className="popover-backdrop" onClick={onClose}>
      <aside
        className="dictionary-popover"
        style={{ top: position.top, left: position.left }}
        onClick={(event) => event.stopPropagation()}
        aria-live="polite"
      >
        {isLoading || !entry ? (
          <div className="popover-loading">辞書を検索中...</div>
        ) : (
          <>
            <div className="dictionary-title-row">
              <div>
                <p className="eyebrow">Dictionary</p>
                <h2>{entry.headword}</h2>
              </div>
              <button className="icon-button" onClick={onClose} type="button" aria-label="Close dictionary">
                x
              </button>
            </div>
            <span className="part-of-speech">{entry.partOfSpeech}</span>
            <p className="meaning">{entry.meaningJa}</p>
            <div className="example-box">
              <p>{entry.exampleEn}</p>
              <p>{entry.exampleJa}</p>
            </div>
            <button className="primary-button full-width" onClick={() => onSave(entry, sourceText)} type="button">
              単語帳に追加
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
