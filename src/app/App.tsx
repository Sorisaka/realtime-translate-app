import { useState } from "react";
import type { DictionaryEntry } from "../domain/dictionary";
import { useLectureStream } from "../state/useLectureStream";
import { useVocabularyNotebook } from "../state/useVocabularyNotebook";
import { DictionaryPopover } from "../ui/components/DictionaryPopover";
import { TranscriptPanel } from "../ui/components/TranscriptPanel";
import { TranslationPanel } from "../ui/components/TranslationPanel";
import { VocabularyPanel } from "../ui/components/VocabularyPanel";
import { services } from "./services";

type PopoverState = {
  entry: DictionaryEntry | null;
  sourceText?: string;
  position: { top: number; left: number } | null;
  isLoading: boolean;
};

export function App() {
  const { transcripts, translations, isRunning, setIsRunning } = useLectureStream(services.lectureStream);
  const vocabulary = useVocabularyNotebook(services.vocabularyNotebook);
  const [popover, setPopover] = useState<PopoverState>({ entry: null, position: null, isLoading: false });

  const handleWordClick = async (word: string, sourceText: string, anchor: DOMRect) => {
    const top = Math.min(anchor.bottom + 12, window.innerHeight - 360);
    const left = Math.min(anchor.left, window.innerWidth - 360);
    setPopover({ entry: null, sourceText, position: { top: Math.max(24, top), left: Math.max(16, left) }, isLoading: true });

    const entry = await services.dictionary.lookup(word);
    setPopover((current) => ({ ...current, entry, isLoading: false }));
  };

  const latestTranscript = transcripts.at(-1)?.text ?? "Waiting for lecture audio...";

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Local lecture assistant</p>
            <h1>Realtime Lecture Translate</h1>
            <p className="subtitle">{latestTranscript}</p>
          </div>
          <button className="primary-button" onClick={() => setIsRunning(!isRunning)} type="button">
            {isRunning ? "一時停止" : "再開"}
          </button>
        </header>

        <div className="content-grid">
          <div className="caption-stack">
            <TranscriptPanel segments={transcripts} onWordClick={handleWordClick} />
            <TranslationPanel segments={translations} />
          </div>
          <VocabularyPanel items={vocabulary.items} lastSavedWord={vocabulary.lastSavedWord} onRemove={vocabulary.remove} />
        </div>
      </section>

      <DictionaryPopover
        entry={popover.entry}
        sourceText={popover.sourceText}
        position={popover.position}
        isLoading={popover.isLoading}
        onClose={() => setPopover({ entry: null, position: null, isLoading: false })}
        onSave={(entry, sourceText) => void vocabulary.add(entry, sourceText)}
      />
    </main>
  );
}
