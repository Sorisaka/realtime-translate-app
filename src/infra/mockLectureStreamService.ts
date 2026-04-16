import type { LectureStreamService, SpeechRecognitionService, TranslationService } from "../domain/services";
import type { LectureUpdate } from "../domain/transcript";

export class MockLectureStreamService implements LectureStreamService {
  constructor(
    private readonly speechRecognition: SpeechRecognitionService,
    private readonly translation: TranslationService,
  ) {}

  start(onUpdate: (update: LectureUpdate) => void): () => void {
    return this.speechRecognition.start((transcript) => {
      if (!transcript.text.trim() || transcript.status === "partial") {
        onUpdate({
          transcript,
          translation: {
            id: `translation-${transcript.id}`,
            sourceSegmentId: transcript.id,
            text: "",
            status: transcript.status,
          },
        });
        return;
      }

      void this.translation
        .translate(transcript)
        .then((translation) => {
          onUpdate({ transcript, translation });
        })
        .catch((error) => {
          console.error("Translation request failed", error);
          onUpdate({
            transcript,
            translation: {
              id: `translation-${transcript.id}`,
              sourceSegmentId: transcript.id,
              text: "翻訳に失敗しました。原文の文字起こしは継続します。",
              status: transcript.status,
            },
          });
        });
    });
  }
}
