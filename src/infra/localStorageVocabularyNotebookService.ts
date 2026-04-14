import type { DictionaryEntry } from "../domain/dictionary";
import type { VocabularyNotebookService } from "../domain/services";
import type { VocabularyItem } from "../domain/vocabulary";

const storageKey = "realtime-translate-app:vocabulary";

export class LocalStorageVocabularyNotebookService implements VocabularyNotebookService {
  async list(): Promise<VocabularyItem[]> {
    return this.read();
  }

  async add(entry: DictionaryEntry, sourceText?: string): Promise<VocabularyItem> {
    const items = this.read();
    const existing = items.find((item) => item.entry.headword === entry.headword);

    if (existing) {
      return existing;
    }

    const item: VocabularyItem = {
      id: crypto.randomUUID(),
      entry,
      savedAtIso: new Date().toISOString(),
      sourceText,
    };

    this.write([item, ...items]);
    return item;
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((item) => item.id !== id));
  }

  private read(): VocabularyItem[] {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return [];

    try {
      return JSON.parse(value) as VocabularyItem[];
    } catch {
      return [];
    }
  }

  private write(items: VocabularyItem[]): void {
    window.localStorage.setItem(storageKey, JSON.stringify(items));
  }
}
