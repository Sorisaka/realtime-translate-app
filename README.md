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

安定化用の環境変数:

- `VITE_ASR_CHUNK_MS`: 既定値 `4000`
- `VITE_ASR_MIN_CHUNK_BYTES`: 既定値 `512`
- `VITE_ASR_MAX_IN_FLIGHT`: 既定値 `1`

backend の CORS 設定:

- `ASR_ALLOWED_ORIGINS`: CORS 許可 origin のカンマ区切り

既定では `http://127.0.0.1:5173`, `http://127.0.0.1:5174`, `http://localhost:5173`, `http://localhost:5174` を許可します。別ポートで frontend を起動する場合は backend 起動時に指定してください。

```bash
ASR_ALLOWED_ORIGINS=http://127.0.0.1:5174 python -m asr_service.server
```

ASR 入力の安定化:

frontend は `MediaRecorder.start(timeslice)` の断片チャンクを直接送らず、既定で 4 秒録音して `stop()` した完成 Blob を backend に送ります。backend は `MediaRecorder` 由来の WebM/OGG 音声を ffmpeg で 16kHz mono WAV に変換してから faster-whisper に渡します。`ffmpeg` コマンドが PATH に必要です。別パスを使う場合は `ASR_FFMPEG_PATH=/path/to/ffmpeg` を指定してください。

実 ASR モードでは、画面上に音声入力パネルが表示されます。

- 入力デバイス: ブラウザが取得できるマイクを選択できます。変更すると録音ストリームが再作成されます。
- 入力レベル: マイク入力が届いているかを簡易メーターで確認できます。
- 状態: `マイク確認中`, `録音中`, `認識中`, `要確認` を表示します。
- debug: backend が返す `input_bytes`, `decoded_duration_ms`, VAD 判定などを折りたたみ表示します。

空文字が返る時の確認:

```bash
cd /home/yukikago/projects/realtime-translate-app/backend
. .venv/bin/activate
ASR_DEBUG_KEEP_AUDIO=1 ASR_VAD_FILTER=false ASR_MODEL_PATH=/home/yukikago/projects/realtime-translate-app/backend/models/tiny.en python -m asr_service.server
```

この状態で実 ASR を動かすと、レスポンスの `debug` に `input_bytes`, `content_type`, `decoded_duration_ms`, `vad_no_speech_detected` が含まれます。受信音声と変換後 WAV は `backend/debug-audio/` に保存されるので、`ffplay backend/debug-audio/<file>.wav` などで声が入っているか確認できます。
`ASR_VAD_FILTER=false` は切り分け用です。無音でも Whisper が短い語を返す場合があるため、通常運用では既定値の `true` に戻してください。

## 実講義音声テスト手順

1. backend を起動する。

```bash
cd /home/yukikago/projects/realtime-translate-app/backend
. .venv/bin/activate
ASR_MODEL_PATH=/home/yukikago/projects/realtime-translate-app/backend/models/tiny.en python -m asr_service.server
```

2. frontend を実 ASR モードで起動する。

```bash
cd /home/yukikago/projects/realtime-translate-app
VITE_SPEECH_SERVICE=local-asr npm run dev
```

3. ブラウザでマイク権限を許可する。
4. 音声入力パネルで入力デバイスを選ぶ。
5. 入力レベルが動くことを確認する。
6. 英語音声を 30 秒から数分流し、`録音中` と `認識中` が交互に出ることを確認する。
7. 字幕が増えない場合は `debug` を開き、`input_bytes`, `decoded_duration_ms`, `vad_no_speech_detected`, `segment_count` を確認する。

典型的なトラブル:

- `ASR backend に接続できません`: backend の起動、ポート、`VITE_ASR_ENDPOINT` を確認してください。
- `マイク権限が拒否されています`: ブラウザのサイト設定でマイクを許可してください。
- `利用できるマイクが見つかりません`: OS の入力デバイス接続を確認してください。
- `backend で音声変換に失敗しました`: `ffmpeg` が PATH にあるか、`ASR_FFMPEG_PATH` を確認してください。
- 入力レベルが動かない: 入力デバイスの選択、OS のマイク設定、ブラウザ権限を確認してください。
- `vad_no_speech_detected: true`: 音量が小さいか無音扱いです。保存 WAV を確認し、必要なら一時的に `ASR_VAD_FILTER=false` で切り分けてください。

## 完全オフライン運用

`faster-whisper` のモデルは初回利用時に取得が必要になる場合があります。初回ネット接続なしで使う場合は、ネットワークが使える環境で事前にモデルを `backend/models/` へ配置してください。

```bash
cd /home/yukikago/projects/realtime-translate-app
. backend/.venv/bin/activate
python backend/scripts/download-faster-whisper-model.py --model tiny.en
```

オフライン環境ではローカルモデルパスを指定して ASR サービスを起動します。

```bash
cd /home/yukikago/projects/realtime-translate-app/backend
. .venv/bin/activate
ASR_MODEL_PATH=/home/yukikago/projects/realtime-translate-app/backend/models/tiny.en python -m asr_service.server
```

モデル配置先の `backend/models/` は大きなバイナリを含むため Git 管理から除外しています。

## 翻訳モデル接続

翻訳モデル本体はまだ実装していません。次フェーズでローカル翻訳サービスを追加するための API 契約は [docs/translation-api-contract.md](docs/translation-api-contract.md) に整理しています。

## 次フェーズ候補

1. 実 ASR の長時間ストリーミングを安定化し、チャンク重複や無音区間の扱いを改善する。
2. 翻訳モデル接続用のローカル API 契約を決める。
3. 辞書データの候補を選定し、SQLite schema を作る。
4. デスクトップ化のため Tauri または Electron を比較して導入する。
