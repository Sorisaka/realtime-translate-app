import type { DictionaryEntry } from "./dictionary";
import type { LectureUpdate, TranscriptSegment, TranslationSegment } from "./transcript";
import type { VocabularyItem } from "./vocabulary";

export type SpeechRecognitionSubscriber = (segment: TranscriptSegment) => void;

export interface SpeechRecognitionService {
  start(onSegment: SpeechRecognitionSubscriber): () => void;
}

export interface TranslationService {
  translate(segment: TranscriptSegment): Promise<TranslationSegment>;
}

export interface LectureStreamService {
  start(onUpdate: (update: LectureUpdate) => void): () => void;
}

export interface DictionaryService {
  lookup(word: string): Promise<DictionaryEntry>;
}

export interface VocabularyNotebookService {
  list(): Promise<VocabularyItem[]>;
  add(entry: DictionaryEntry, sourceText?: string): Promise<VocabularyItem>;
  remove(id: string): Promise<void>;
}
