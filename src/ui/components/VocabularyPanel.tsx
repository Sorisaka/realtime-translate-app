import type { VocabularyItem } from "../../domain/vocabulary";

type Props = {
  items: VocabularyItem[];
  lastSavedWord: string | null;
  onRemove: (id: string) => void;
};

export function VocabularyPanel({ items, lastSavedWord, onRemove }: Props) {
  return (
    <aside className="notebook" aria-label="Vocabulary notebook">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Vocabulary notebook</span>
          <h2>保存した単語</h2>
        </div>
        <span className="count-badge">{items.length}</span>
      </div>

      {lastSavedWord && <div className="save-toast">「{lastSavedWord}」を保存しました</div>}

      <div className="notebook-list">
        {items.length === 0 ? (
          <p className="empty-state">英文の単語をクリックして、講義中に気になった語彙を保存できます。</p>
        ) : (
          items.map((item) => (
            <article className="notebook-item" key={item.id}>
              <div>
                <h3>{item.entry.headword}</h3>
                <p>{item.entry.meaningJa}</p>
              </div>
              <button className="text-button" onClick={() => onRemove(item.id)} type="button">
                削除
              </button>
            </article>
          ))
        )}
      </div>
    </aside>
  );
}
