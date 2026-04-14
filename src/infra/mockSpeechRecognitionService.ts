import type { SpeechRecognitionService } from "../domain/services";
import type { TranscriptSegment } from "../domain/transcript";

type ScriptLine = {
  finalText: string;
  partials: string[];
};

const script: ScriptLine[] = [
  {
    finalText: "Today we will explore how attention mechanisms help neural networks focus on relevant context.",
    partials: [
      "Today we will explore",
      "Today we will explore how attention mechanisms help",
      "Today we will explore how attention mechanisms help neural networks focus on relevant context.",
    ],
  },
  {
    finalText: "The key idea is to compare each token with the surrounding tokens and estimate useful relationships.",
    partials: [
      "The key idea is to compare",
      "The key idea is to compare each token with the surrounding tokens",
      "The key idea is to compare each token with the surrounding tokens and estimate useful relationships.",
    ],
  },
  {
    finalText: "This structure allows a model to preserve long range dependencies without reading the sequence strictly in order.",
    partials: [
      "This structure allows a model",
      "This structure allows a model to preserve long range dependencies",
      "This structure allows a model to preserve long range dependencies without reading the sequence strictly in order.",
    ],
  },
  {
    finalText: "In practice, we combine this representation with training data, evaluation metrics, and careful error analysis.",
    partials: [
      "In practice, we combine this representation",
      "In practice, we combine this representation with training data and evaluation metrics",
      "In practice, we combine this representation with training data, evaluation metrics, and careful error analysis.",
    ],
  },
];

export class MockSpeechRecognitionService implements SpeechRecognitionService {
  start(onSegment: (segment: TranscriptSegment) => void): () => void {
    let cancelled = false;
    let timeoutId: number | undefined;
    let lineIndex = 0;
    const startedAt = Date.now();

    const emitLine = () => {
      if (cancelled) return;

      const line = script[lineIndex % script.length];
      const id = `segment-${lineIndex}`;
      const partialDelayMs = 760;

      line.partials.forEach((text, partialIndex) => {
        timeoutId = window.setTimeout(() => {
          if (cancelled) return;
          const isFinal = partialIndex === line.partials.length - 1;
          onSegment({
            id,
            text,
            status: isFinal ? "final" : "partial",
            startedAtMs: startedAt + lineIndex * partialDelayMs,
            completedAtMs: isFinal ? Date.now() : undefined,
          });

          if (isFinal) {
            lineIndex += 1;
            timeoutId = window.setTimeout(emitLine, 1120);
          }
        }, partialIndex * partialDelayMs);
      });
    };

    emitLine();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }
}
