import { useEffect, useState } from "react";
import type { DictionaryEntry } from "../domain/dictionary";
import type { VocabularyNotebookService } from "../domain/services";
import type { VocabularyItem } from "../domain/vocabulary";

export function useVocabularyNotebook(service: VocabularyNotebookService) {
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [lastSavedWord, setLastSavedWord] = useState<string | null>(null);

  useEffect(() => {
    void service.list().then(setItems);
  }, [service]);

  const add = async (entry: DictionaryEntry, sourceText?: string) => {
    const item = await service.add(entry, sourceText);
    setItems(await service.list());
    setLastSavedWord(item.entry.headword);
    window.setTimeout(() => setLastSavedWord(null), 1800);
    return item;
  };

  const remove = async (id: string) => {
    await service.remove(id);
    setItems(await service.list());
  };

  return {
    items,
    add,
    remove,
    lastSavedWord,
  };
}
