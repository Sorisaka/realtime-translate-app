# ASR Loopback Debug
**注意** Chrome 再生音を同じChrome系ページから loopback 取得すると無音になる場合があるため、再生元は Edge、アプリは Chrome のように再生ブラウザとアプリブラウザを分けてください。

## Purpose

This debug mode helps isolate cases where a physical microphone works, but an audio-interface loopback input produces empty blobs or empty ASR text.

Observed path:

- `getUserMedia`
- `MediaRecorder`
- chunk creation
- Blob creation
- `/api/asr/transcribe` request
- ASR server request handling
- ffprobe input inspection
- ffmpeg normalization
- ffprobe normalized WAV inspection
- faster-whisper response

## Normal Run

backend:

```bash
cd /home/yukikago/projects/realtime-translate-app/backend
. .venv/bin/activate
ASR_MODEL_PATH=/home/yukikago/projects/realtime-translate-app/backend/models/tiny.en python -m asr_service.server
```

frontend:

```bash
cd /home/yukikago/projects/realtime-translate-app
VITE_SPEECH_SERVICE=local-asr npm run dev
```

## Debug Run

backend:

```bash
cd /home/yukikago/projects/realtime-translate-app/backend
. .venv/bin/activate
ASR_MODEL_PATH=/home/yukikago/projects/realtime-translate-app/backend/models/tiny.en python -m asr_service.server --debug-loopback
```

frontend:

```bash
cd /home/yukikago/projects/realtime-translate-app
VITE_SPEECH_SERVICE=local-asr npm run dev -- --debug-loopback
```

Disable explicitly:

```bash
python -m asr_service.server --no-debug-loopback
npm run dev -- --no-debug-loopback
```

`--debug-loopback` on the backend also keeps received audio and normalized WAV files under `backend/debug-audio/`. To keep logs on but disable file saving:

```bash
python -m asr_service.server --debug-loopback --no-debug-keep-audio
```

## Expected Output

### Normal

client:

```text
[ASR client] getUserMedia stream acquired { audioTrackCount: 1, tracks: [...] }
[ASR client] MediaRecorder support { "audio/webm;codecs=opus": true, ... }
[ASR client] MediaRecorder created { selectedMimeType: "audio/webm;codecs=opus", recorderState: "inactive" }
[ASR client] recorder.onstart { recorderState: "recording" }
[ASR client] recorder.ondataavailable { size: 12345, type: "audio/webm;codecs=opus" }
[ASR client] recorder.onstop { chunkCount: 1, finalBlobSize: 12345 }
[ASR client] sending audio { blobSize: 12345, contentType: "audio/webm;codecs=opus" }
[ASR client] response received { status: 200, ok: true, payload: {...} }
```

server:

```text
[ASR server] request received { actual_input_bytes: 12345, content_type: "audio/webm;codecs=opus" }
[ASR server] ffmpeg normalize ok { output_exists: true, output_size: 128044 }
[ASR server] normalized audio info { decoded_duration_ms: 4000, normalized_stream_info: { sample_rate: "16000", channels: 1 } }
[ASR server] transcription result { segment_count: 1, vad_no_speech_detected: false }
```

Expected values:

- `ondataavailable.size > 0`
- `chunkCount >= 1`
- `finalBlobSize > 0`
- server `actual_input_bytes > 0`
- normalized `sample_rate = "16000"`
- normalized `channels = 1`
- `decoded_duration_ms` close to the recording interval
- `segment_count > 0`
- `text` contains English transcription

### Abnormal 1: `ondataavailable` does not appear

Check:

- `recorder.onstart`
- `recorder.onerror`
- track `muted`, `readyState`, `enabled`

Likely layer:

- Browser MediaRecorder
- loopback device browser compatibility
- microphone permission or OS input settings

### Abnormal 2: `ondataavailable` appears but `size=0` repeats

Check:

- `[ASR client] recorder.ondataavailable { size: 0 }`
- track `muted: true`
- input level meter

Likely layer:

- silent input
- loopback is not feeding audio to the browser
- OS routing

### Abnormal 3: Blob size = 0

Check:

- `[ASR client] recorder.onstop { chunkCount, finalBlobSize }`
- `blob skipped because too small`

Likely layer:

- MediaRecorder chunk aggregation
- `minChunkBytes`
- recording interval too short

### Abnormal 4: server receives bytes but normalized duration is near 0

Check:

- `actual_input_bytes`
- `input_stream_info`
- `ffmpeg normalize ok`
- `normalized_stream_info.duration`
- `decoded_duration_ms`

Likely layer:

- WebM/Opus contains effective silence
- ffmpeg decode succeeds, but there is no meaningful audio
- loopback level or routing

### Abnormal 5: audio is normalized but `segment_count = 0`

Check:

- `normalized_stream_info.sample_rate = "16000"`
- `normalized_stream_info.channels = 1`
- `decoded_duration_ms > 0`
- `vad_no_speech_detected`
- saved `backend/debug-audio/*.wav`

Likely layer:

- VAD classified the chunk as silence
- input level is too low
- speech is unclear or not English
- ASR model/VAD settings

Temporary VAD bypass:

```bash
ASR_VAD_FILTER=false python -m asr_service.server --debug-loopback
```

Whisper may hallucinate short words on silence when VAD is disabled. Re-enable VAD for normal use.

## How To Read The Logs

- client chunk is missing or zero: inspect `getUserMedia`, MediaRecorder, and OS input routing.
- client Blob is nonzero but server `actual_input_bytes` is zero: inspect fetch request, endpoint, proxy, or CORS.
- server `actual_input_bytes > 0` but `input_stream_info.probe_error` exists: inspect WebM/OGG validity and ffmpeg/ffprobe.
- no `normalized_stream_info` or no `decoded_duration_ms`: inspect ffmpeg normalization.
- normalized WAV is valid but `segment_count = 0`: inspect VAD, level, and ASR model behavior.
- normalized WAV has no audible speech: the issue is likely OS/device/loopback routing, not ASR.
- normalized WAV has audible speech: tune VAD, model size, language, or chunk duration.
