# realtime-translate-app

英語講義のリアルタイム文字起こし・翻訳・辞書連携を行うローカルアプリです。

## フェーズ1の内容

- React + TypeScript + Vite の起動可能な土台
- モックストリームによる英語字幕の逐次更新
- モック翻訳による日本語訳の逐次更新
- 英単語クリックで辞書ポップアップを表示
- 単語帳への保存と一覧表示
- localStorage による軽量なローカル保存
- 将来の ASR / 翻訳 / 辞書DB / 永続化差し替えを想定した service interface

## 実行方法

```bash
npm install
npm run dev
```

ビルド確認:

```bash
npm run build
```

## フェーズ2前半: ローカルASR

Python 側は `backend/` に分離しています。クラウド API や有料 API は使わず、`faster-whisper` をプロジェクト内 venv に入れてローカル実行します。

venv 作成と Python 依存インストール:

```bash
bash backend/scripts/setup-python-venv.sh
```

ASR サービス起動:

```bash
cd backend
. .venv/bin/activate
python -m asr_service.server
```

フロントエンドを実 ASR に切り替えて起動:

```bash
cd /home/yukikago/projects/realtime-translate-app
VITE_SPEECH_SERVICE=local-asr npm run dev
```

デフォルトはモックです。既存 UI を壊さないため、React / Vite / TypeScript の依存は削除していません。

## 技術選定

- フロントエンド: React + TypeScript
- 開発サーバー/ビルド: Vite
- スタイリング: CSS
- 永続化: localStorage
- ローカル ASR: Python venv + faster-whisper

依存を増やしすぎず、将来的なデスクトップ化や Python 推論サービス接続を妨げない構成を優先しています。詳細は [docs/architecture.md](docs/architecture.md) を参照してください。

## ディレクトリ構成

```text
src/
  app/      サービス組み立てと画面統合
  domain/   型とサービス interface
  infra/    mock 実装と localStorage adapter
  state/    React hooks による状態管理
  ui/       UI コンポーネントと CSS
backend/
  asr_service/  faster-whisper 用ローカル ASR サービス
  scripts/      venv セットアップ用スクリプト
docs/
  architecture.md
```

## 今後の接続ポイント

- `SpeechRecognitionService`: faster-whisper または音声入力サービスへ差し替え
- `TranslationService`: ローカル翻訳モデルまたは Python API へ差し替え
- `DictionaryService`: 無料辞書データや SQLite 辞書DB へ差し替え
- `VocabularyNotebookService`: localStorage から SQLite へ差し替え

## モック / 実ASR の切り替え

- モック: `npm run dev`
- 実ASR: `VITE_SPEECH_SERVICE=local-asr npm run dev`

実ASRではブラウザのマイク入力を短い音声チャンクに分け、`http://127.0.0.1:8765/api/asr/transcribe` に送ります。エンドポイントは `VITE_ASR_ENDPOINT`、チャンク長は `VITE_ASR_CHUNK_MS` で変更できます。

## 次フェーズ候補

1. 実 ASR の長時間ストリーミングを安定化し、チャンク重複や無音区間の扱いを改善する。
2. 翻訳モデル接続用のローカル API 契約を決める。
3. 辞書データの候補を選定し、SQLite schema を作る。
4. デスクトップ化のため Tauri または Electron を比較して導入する。
