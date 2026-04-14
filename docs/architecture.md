# Architecture Notes

## 技術スタック

- React + TypeScript + Vite を採用する。
- フェーズ1はブラウザ上のローカル開発を優先し、デスクトップ化は後続で Tauri または Electron を追加できる構成にする。
- UI ライブラリは導入せず、依存を抑えるため CSS で実装する。
- 推論・辞書・永続化は interface と mock adapter に分け、将来の Python サービスや SQLite に差し替えやすくする。
- フェーズ2前半では Python 側を `backend/` に分離し、`backend/.venv` に依存を閉じ込める。
- ASR は無料・ローカル実行可能な `faster-whisper` を採用する。クラウド API、有料 API、外部 SaaS は使わない。

## レイヤ構成

- `src/domain`: アプリの型とサービス interface。
- `src/infra`: mock ASR、mock 翻訳、mock 辞書、localStorage 単語帳。
- `src/state`: React hooks による状態管理。
- `src/ui`: 表示コンポーネントとスタイル。
- `src/app`: サービスの組み立てと画面統合。
- `backend/asr_service`: ローカル ASR HTTP サービス。
- `backend/scripts`: venv セットアップ用の安全なスクリプト。

## 接続ポイント

- `SpeechRecognitionService`: `MockSpeechRecognitionService` と `LocalAsrSpeechRecognitionService` を環境変数で切り替える。
- `TranslationService`: `MockTranslationService` をローカル翻訳モデルまたは Python API adapter に置き換える。
- `DictionaryService`: `MockDictionaryService` を辞書DB adapter に置き換える。
- `VocabularyNotebookService`: `LocalStorageVocabularyNotebookService` を SQLite adapter に置き換える。

## ローカルASRのデータ契約

Frontend は `MediaRecorder` で作成した音声チャンクを raw body として送る。

```http
POST /api/asr/transcribe
Content-Type: audio/webm
```

成功時:

```json
{
  "text": "transcribed English text",
  "language": "en",
  "status": "final"
}
```

エラー時:

```json
{
  "error": "message"
}
```

## 依存整理の判断

- React / Vite / TypeScript は既存フロントエンドの起動に必要なため削除していない。
- `node_modules` や lockfile の削除は既存 UI の起動確認を壊す可能性があるため行っていない。
- Python 依存は `backend/requirements.txt` に分け、`backend/.venv` 内にのみインストールする前提にした。

## フェーズ別の仮定

- フェーズ1では、実音声入力、ASR、翻訳モデル、辞書DB の接続は行わない。
- フェーズ1から当面、単語帳はブラウザの localStorage に保存する。
- フェーズ1から当面、開発しやすさを優先し、デスクトップ shell はまだ追加しない。
- フェーズ2前半では英語 ASR のローカル接続のみを対象とし、日本語翻訳モデル接続、SQLite 化、デスクトップ化は行わない。
