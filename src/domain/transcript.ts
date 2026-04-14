export type TranscriptStatus = "partial" | "final";

export type TranscriptSegment = {
  id: string;
  text: string;
  status: TranscriptStatus;
  startedAtMs: number;
  completedAtMs?: number;
};

export type TranslationSegment = {
  id: string;
  sourceSegmentId: string;
  text: string;
  status: TranscriptStatus;
};

export type LectureUpdate = {
  transcript: TranscriptSegment;
  translation: TranslationSegment;
};
