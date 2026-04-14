import type { TranslationService } from "../domain/services";
import type { TranscriptSegment, TranslationSegment } from "../domain/transcript";

const translations: Record<string, string> = {
  "Today we will explore how attention mechanisms help neural networks focus on relevant context.":
    "今日は、注意機構がニューラルネットワークに関連する文脈へ注目させる仕組みを見ていきます。",
  "The key idea is to compare each token with the surrounding tokens and estimate useful relationships.":
    "重要な考え方は、各トークンを周囲のトークンと比較し、有用な関係を推定することです。",
  "This structure allows a model to preserve long range dependencies without reading the sequence strictly in order.":
    "この構造により、モデルは系列を厳密な順番で読むことなく長距離の依存関係を保てます。",
  "In practice, we combine this representation with training data, evaluation metrics, and careful error analysis.":
    "実際には、この表現を学習データ、評価指標、慎重なエラー分析と組み合わせます。",
};

export class MockTranslationService implements TranslationService {
  async translate(segment: TranscriptSegment): Promise<TranslationSegment> {
    const translated = translations[segment.text] ?? `翻訳中: ${segment.text}`;

    return {
      id: `translation-${segment.id}`,
      sourceSegmentId: segment.id,
      text: translated,
      status: segment.status,
    };
  }
}
