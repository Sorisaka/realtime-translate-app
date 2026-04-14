import type { LectureStreamService, SpeechRecognitionService, TranslationService } from "../domain/services";
import type { LectureUpdate } from "../domain/transcript";

export class MockLectureStreamService implements LectureStreamService {
  constructor(
    private readonly speechRecognition: SpeechRecognitionService,
    private readonly translation: TranslationService,
  ) {}

  start(onUpdate: (update: LectureUpdate) => void): () => void {
    return this.speechRecognition.start((transcript) => {
      void this.translation.translate(transcript).then((translation) => {
        onUpdate({ transcript, translation });
      });
    });
  }
}
