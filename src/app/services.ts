import { LocalStorageVocabularyNotebookService } from "../infra/localStorageVocabularyNotebookService";
import { MockDictionaryService } from "../infra/mockDictionaryService";
import { MockLectureStreamService } from "../infra/mockLectureStreamService";
import { MockSpeechRecognitionService } from "../infra/mockSpeechRecognitionService";
import { MockTranslationService } from "../infra/mockTranslationService";

const speechRecognition = new MockSpeechRecognitionService();
const translation = new MockTranslationService();

export const services = {
  lectureStream: new MockLectureStreamService(speechRecognition, translation),
  dictionary: new MockDictionaryService(),
  vocabularyNotebook: new LocalStorageVocabularyNotebookService(),
};
