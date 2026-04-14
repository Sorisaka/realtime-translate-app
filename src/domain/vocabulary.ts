import type { DictionaryEntry } from "./dictionary";

export type VocabularyItem = {
  id: string;
  entry: DictionaryEntry;
  savedAtIso: string;
  sourceText?: string;
};
