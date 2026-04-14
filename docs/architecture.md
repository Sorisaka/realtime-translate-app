# Architecture Notes

## 技術スタック

- React + TypeScript + Vite を採用する。
- フェーズ1はブラウザ上のローカル開発を優先し、デスクトップ化は後続で Tauri または Electron を追加できる構成にする。
- UI ライブラリは導入せず、依存を抑えるため CSS で実装する。
- 推論・辞書・永続化は interface と mock adapter に分け、将来の Python サービスや SQLite に差し替えやすくする。

## レイヤ構成

- `src/domain`: アプリの型とサービス interface。
- `src/infra`: mock ASR、mock 翻訳、mock 辞書、localStorage 単語帳。
- `src/state`: React hooks による状態管理。
- `src/ui`: 表示コンポーネントとスタイル。
- `src/app`: サービスの組み立てと画面統合。

## 接続ポイント

- `SpeechRecognitionService`: `MockSpeechRecognitionService` を faster-whisper 連携 adapter に置き換える。
- `TranslationService`: `MockTranslationService` をローカル翻訳モデルまたは Python API adapter に置き換える。
- `DictionaryService`: `MockDictionaryService` を辞書DB adapter に置き換える。
- `VocabularyNotebookService`: `LocalStorageVocabularyNotebookService` を SQLite adapter に置き換える。

## フェーズ1の仮定

- 実音声入力、ASR、翻訳モデル、辞書DB の接続は行わない。
- 単語帳はブラウザの localStorage に保存する。
- 開発しやすさを優先し、デスクトップ shell はまだ追加しない。
