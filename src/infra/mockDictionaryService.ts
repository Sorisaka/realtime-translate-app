import type { DictionaryEntry } from "../domain/dictionary";
import type { DictionaryService } from "../domain/services";

const dictionary: Record<string, DictionaryEntry> = {
  attention: {
    headword: "attention",
    partOfSpeech: "noun",
    meaningJa: "注意、注目。機械学習では入力の重要な部分へ重みを置く仕組み。",
    exampleEn: "Attention helps the model focus on important tokens.",
    exampleJa: "Attention はモデルが重要なトークンに注目する助けになります。",
  },
  mechanism: {
    headword: "mechanism",
    partOfSpeech: "noun",
    meaningJa: "仕組み、機構。",
    exampleEn: "The mechanism explains how the system behaves.",
    exampleJa: "その仕組みはシステムの振る舞いを説明します。",
  },
  context: {
    headword: "context",
    partOfSpeech: "noun",
    meaningJa: "文脈、背景。",
    exampleEn: "The meaning depends on the surrounding context.",
    exampleJa: "意味は周囲の文脈に依存します。",
  },
  token: {
    headword: "token",
    partOfSpeech: "noun",
    meaningJa: "トークン。文を分割した単語や記号などの単位。",
    exampleEn: "Each token receives a contextual representation.",
    exampleJa: "各トークンは文脈に応じた表現を受け取ります。",
  },
  dependencies: {
    headword: "dependency",
    partOfSpeech: "noun",
    meaningJa: "依存関係。",
    exampleEn: "Long range dependencies are difficult for simple models.",
    exampleJa: "長距離の依存関係は単純なモデルには難しいです。",
  },
  representation: {
    headword: "representation",
    partOfSpeech: "noun",
    meaningJa: "表現、データを扱いやすい形にしたもの。",
    exampleEn: "The representation captures useful semantic information.",
    exampleJa: "その表現は有用な意味情報を捉えます。",
  },
  metrics: {
    headword: "metric",
    partOfSpeech: "noun",
    meaningJa: "評価指標、測定基準。",
    exampleEn: "Metrics help compare model performance.",
    exampleJa: "評価指標はモデル性能の比較に役立ちます。",
  },
};

export class MockDictionaryService implements DictionaryService {
  async lookup(rawWord: string): Promise<DictionaryEntry> {
    const normalized = rawWord.toLowerCase().replace(/[^a-z'-]/g, "");
    const entry = dictionary[normalized] ?? dictionary[normalized.replace(/s$/, "")];

    return (
      entry ?? {
        headword: normalized || rawWord,
        partOfSpeech: "unknown",
        meaningJa: "フェーズ1のダミー辞書項目です。将来の辞書DB接続で詳細な語義に置き換えます。",
        exampleEn: `The lecturer used the word "${rawWord}" in context.`,
        exampleJa: `講義中で "${rawWord}" という単語が文脈内で使われました。`,
      }
    );
  }
}
