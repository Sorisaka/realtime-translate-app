import { useEffect, useState } from "react";
import type { LectureStreamService } from "../domain/services";
import type { TranscriptSegment, TranslationSegment } from "../domain/transcript";

const upsertById = <T extends { id: string }>(items: T[], next: T): T[] => {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) return [...items, next];

  const copy = [...items];
  copy[index] = next;
  return copy;
};

export function useLectureStream(service: LectureStreamService) {
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [translations, setTranslations] = useState<TranslationSegment[]>([]);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    if (!isRunning) return;

    const stop = service.start(({ transcript, translation }) => {
      setTranscripts((items) => upsertById(items, transcript));
      setTranslations((items) => upsertById(items, translation));
    });

    return stop;
  }, [isRunning, service]);

  return {
    transcripts,
    translations,
    isRunning,
    setIsRunning,
  };
}
