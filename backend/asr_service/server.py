from __future__ import annotations

import argparse
from dataclasses import dataclass, replace
import json
import shutil
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from .config import CONFIG as DEFAULT_CONFIG
from .config import AsrConfig

CONFIG = DEFAULT_CONFIG
asr_log_prefix = "[ASR server]"


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    segment_count: int


@dataclass(frozen=True)
class TranslationResult:
    text: str


@dataclass(frozen=True)
class NormalizeResult:
    command: list[str]
    stdout: str
    stderr: str
    output_exists: bool
    output_size: int | None


def debug_log(message: str, data: dict[str, Any] | None = None) -> None:
    if CONFIG.debug_loopback:
        print(asr_log_prefix, message, data or {})


class LocalAsrEngine:
    def __init__(self, config: AsrConfig) -> None:
        self.config = config
        self._model: Any | None = None

    def transcribe(self, audio_path: Path) -> TranscriptionResult:
        model = self._load_model()
        segments, _info = model.transcribe(
            str(audio_path),
            language=self.config.language,
            vad_filter=self.config.vad_filter,
            vad_parameters={"min_silence_duration_ms": self.config.vad_min_silence_ms}
            if self.config.vad_filter
            else None,
        )
        segment_texts = [segment.text.strip() for segment in segments]
        return TranscriptionResult(text=" ".join(segment_texts).strip(), segment_count=len(segment_texts))

    def normalize_audio(self, input_path: Path, output_path: Path) -> NormalizeResult:
        command = [
            self.config.ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(input_path),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-f",
            "wav",
            str(output_path),
        ]
        debug_log("ffmpeg normalize start", {"input_path": str(input_path), "output_path": str(output_path), "command": command})

        try:
            result = subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
                timeout=self.config.ffmpeg_timeout_sec,
            )
        except FileNotFoundError as exc:
            debug_log("ffmpeg not found", {"ffmpeg_path": self.config.ffmpeg_path})
            raise RuntimeError(
                f"ffmpeg was not found at `{self.config.ffmpeg_path}`. Install ffmpeg or set ASR_FFMPEG_PATH."
            ) from exc
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() or "no stderr"
            debug_log("ffmpeg normalize failed", {"stderr": stderr, "stdout": exc.stdout.strip() if exc.stdout else ""})
            raise RuntimeError(f"ffmpeg failed to decode audio: {stderr}") from exc
        except subprocess.TimeoutExpired as exc:
            debug_log("ffmpeg normalize timeout", {"timeout_sec": self.config.ffmpeg_timeout_sec})
            raise RuntimeError(f"ffmpeg timed out after {self.config.ffmpeg_timeout_sec} seconds") from exc

        normalize_result = NormalizeResult(
            command=command,
            stdout=result.stdout.strip(),
            stderr=result.stderr.strip(),
            output_exists=output_path.exists(),
            output_size=output_path.stat().st_size if output_path.exists() else None,
        )
        debug_log("ffmpeg normalize ok", normalize_result.__dict__)
        return normalize_result

    def probe_duration_ms(self, audio_path: Path) -> int | None:
        info = self.probe_stream_info(audio_path)
        duration = info.get("duration") if info else None
        if duration is None:
            return None
        try:
            return round(float(duration) * 1000)
        except (TypeError, ValueError):
            return None

    def probe_stream_info(self, audio_path: Path) -> dict[str, Any]:
        command = [
            self.config.ffprobe_path,
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            str(audio_path),
        ]
        try:
            result = subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
                timeout=self.config.ffmpeg_timeout_sec,
            )
            data = json.loads(result.stdout)
            streams = data.get("streams", [])
            audio_stream = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
            file_size = audio_path.stat().st_size if audio_path.exists() else None
            if not audio_stream:
                return {"path": str(audio_path), "size": file_size, "audio_stream": None, "format": data.get("format")}

            return {
                "path": str(audio_path),
                "codec": audio_stream.get("codec_name"),
                "sample_rate": audio_stream.get("sample_rate"),
                "channels": audio_stream.get("channels"),
                "channel_layout": audio_stream.get("channel_layout"),
                "sample_fmt": audio_stream.get("sample_fmt"),
                "duration": audio_stream.get("duration") or data.get("format", {}).get("duration"),
                "size": data.get("format", {}).get("size") or file_size,
            }
        except Exception as exc:
            return {"path": str(audio_path), "size": audio_path.stat().st_size if audio_path.exists() else None, "probe_error": str(exc)}

    def _load_model(self) -> Any:
        if self._model is None:
            try:
                from faster_whisper import WhisperModel
            except ImportError as exc:
                raise RuntimeError(
                    "faster-whisper is not installed. Create backend/.venv and run "
                    "`python -m pip install -r backend/requirements.txt`."
                ) from exc

            model_ref = self.config.model_path or self.config.model_name
            self._model = WhisperModel(
                model_ref,
                device=self.config.device,
                compute_type=self.config.compute_type,
            )

        return self._model


class LocalTranslationEngine:
    def __init__(self, config: AsrConfig) -> None:
        self.config = config
        self._translations: dict[tuple[str, str], Any] = {}

    def translate(self, text: str, source_language: str, target_language: str) -> TranslationResult:
        if not text.strip():
            return TranslationResult(text="")

        translation = self._load_translation(source_language, target_language)
        return TranslationResult(text=translation.translate(text).strip())

    def _load_translation(self, source_language: str, target_language: str) -> Any:
        cache_key = (source_language, target_language)
        if cache_key in self._translations:
            return self._translations[cache_key]

        try:
            from argostranslate import translate
        except ImportError as exc:
            raise RuntimeError(
                "argostranslate is not installed. Run "
                "`python -m pip install -r backend/requirements.txt` in backend/.venv."
            ) from exc

        installed_languages = translate.get_installed_languages()
        source = next((language for language in installed_languages if language.code == source_language), None)
        target = next((language for language in installed_languages if language.code == target_language), None)
        if source is None or target is None:
            raise RuntimeError(
                f"Argos Translate language pair {source_language}->{target_language} is not installed. "
                "Install a local model package before using /api/translate."
            )

        translation = source.get_translation(target)
        self._translations[cache_key] = translation
        return translation


class AsrRequestHandler(BaseHTTPRequestHandler):
    engine: LocalAsrEngine
    translation_engine: LocalTranslationEngine

    def do_OPTIONS(self) -> None:
        self._send_empty(204)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path != "/health":
            self._send_json({"error": "not found"}, status=404)
            return

        self._send_json(
            {
                "status": "ok",
                "model": CONFIG.model_name,
                "modelPath": CONFIG.model_path,
                "device": CONFIG.device,
                "computeType": CONFIG.compute_type,
                "language": CONFIG.language,
                "vadFilter": CONFIG.vad_filter,
                "vadMinSilenceMs": CONFIG.vad_min_silence_ms,
                "ffmpegPath": CONFIG.ffmpeg_path,
                "ffprobePath": CONFIG.ffprobe_path,
                "ffmpegTimeoutSec": CONFIG.ffmpeg_timeout_sec,
                "debugLoopback": CONFIG.debug_loopback,
                "debugKeepAudio": CONFIG.debug_keep_audio,
                "debugDir": CONFIG.debug_dir,
                "translationSourceLanguage": CONFIG.translation_source_language,
                "translationTargetLanguage": CONFIG.translation_target_language,
                "allowedOrigins": sorted(CONFIG.allowed_origins),
            }
        )

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/translate":
            self._handle_translate()
            return

        if path != "/api/asr/transcribe":
            self._send_json({"error": "not found"}, status=404)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            self._send_json({"error": "empty audio body"}, status=400)
            return

        suffix = self._suffix_from_content_type(self.headers.get("Content-Type", ""))
        content_type = self.headers.get("Content-Type", "")
        audio_bytes = self.rfile.read(content_length)

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            input_path = temp_path / f"input{suffix}"
            normalized_path = temp_path / "normalized.wav"
            input_path.write_bytes(audio_bytes)
            input_stream_info = self.engine.probe_stream_info(input_path)
            normalized_stream_info: dict[str, Any] | None = None
            normalize_result: NormalizeResult | None = None
            normalized_duration_ms: int | None = None
            normalized_file_size: int | None = None
            saved_debug_paths: dict[str, str] = {}
            transcribe_path = input_path

            debug_context: dict[str, Any] = {
                "input_bytes": len(audio_bytes),
                "content_type": content_type,
                "content_length_header": content_length,
                "input_path": str(input_path),
                "input_suffix": suffix,
                "input_stream_info": input_stream_info,
            }
            debug_log("request received", debug_context)

            try:
                if suffix != ".wav":
                    normalize_result = self.engine.normalize_audio(input_path, normalized_path)
                    transcribe_path = normalized_path
                normalized_stream_info = self.engine.probe_stream_info(transcribe_path)
                normalized_duration_ms = self.engine.probe_duration_ms(transcribe_path)
                normalized_file_size = transcribe_path.stat().st_size if transcribe_path.exists() else None
                debug_log(
                    "normalized audio info",
                    {
                        "normalized_path": str(transcribe_path),
                        "decoded_duration_ms": normalized_duration_ms,
                        "normalized_stream_info": normalized_stream_info,
                    },
                )
                result = self.engine.transcribe(transcribe_path)
                saved_debug_paths = self._keep_debug_audio(input_path, normalized_path if normalized_path.exists() else None)
            except Exception as exc:  # pragma: no cover - operational detail
                debug_context.update(
                    {
                        "normalized_path": str(transcribe_path),
                        "normalized_stream_info": normalized_stream_info,
                        "normalize_result": normalize_result.__dict__ if normalize_result else None,
                        "exception": str(exc),
                    }
                )
                debug_log("request failed", debug_context)
                self._send_json({"error": str(exc), "debug": debug_context}, status=500)
                return

        debug = {
            "input_bytes": len(audio_bytes),
            "content_type": content_type,
            "content_length_header": content_length,
            "input_path": str(input_path),
            "input_suffix": suffix,
            "input_stream_info": input_stream_info,
            "normalized_path": str(transcribe_path),
            "decoded_duration_ms": normalized_duration_ms,
            "normalized_stream_info": normalized_stream_info,
            "normalize_result": normalize_result.__dict__ if normalize_result else None,
            "normalized_file_size": normalized_file_size,
            "vad_filter_enabled": CONFIG.vad_filter,
            "vad_no_speech_detected": CONFIG.vad_filter and result.segment_count == 0 and normalized_duration_ms is not None,
            "segment_count": result.segment_count,
            "debug_audio_saved": bool(saved_debug_paths),
            "debug_audio_paths": saved_debug_paths,
        }
        debug_log("transcription result", debug)
        self._send_json({"text": result.text, "language": CONFIG.language, "status": "final", "debug": debug})

    def _handle_translate(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            self._send_json({"error": "empty translation body"}, status=400)
            return

        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except json.JSONDecodeError as exc:
            self._send_json({"error": f"invalid translation JSON: {exc}"}, status=400)
            return

        source_language = str(payload.get("sourceLanguage") or CONFIG.translation_source_language)
        target_language = str(payload.get("targetLanguage") or CONFIG.translation_target_language)
        segments = payload.get("segments")
        if not isinstance(segments, list):
            self._send_json({"error": "segments must be a list"}, status=400)
            return

        translations: list[dict[str, Any]] = []
        try:
            for segment in segments:
                if not isinstance(segment, dict):
                    raise RuntimeError("each segment must be an object")
                segment_id = str(segment.get("id") or uuid4().hex)
                text = str(segment.get("text") or "")
                result = self.translation_engine.translate(text, source_language, target_language)
                translations.append(
                    {
                        "id": f"translation-{segment_id}",
                        "sourceSegmentId": segment_id,
                        "text": result.text,
                        "status": segment.get("status") or "final",
                    }
                )
        except Exception as exc:  # pragma: no cover - operational detail
            debug_log(
                "translation failed",
                {
                    "source_language": source_language,
                    "target_language": target_language,
                    "segment_count": len(segments),
                    "exception": str(exc),
                },
            )
            self._send_json({"error": str(exc)}, status=500)
            return

        debug_log(
            "translation result",
            {
                "source_language": source_language,
                "target_language": target_language,
                "segment_count": len(translations),
            },
        )
        self._send_json({"translations": translations})

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _suffix_from_content_type(self, content_type: str) -> str:
        if "webm" in content_type:
            return ".webm"
        if "ogg" in content_type:
            return ".ogg"
        if "wav" in content_type:
            return ".wav"
        return ".audio"

    def _keep_debug_audio(self, input_path: Path, normalized_path: Path | None) -> dict[str, str]:
        if not CONFIG.debug_keep_audio:
            return {}

        debug_dir = Path(CONFIG.debug_dir)
        if not debug_dir.is_absolute():
            debug_dir = Path.cwd() / debug_dir
        debug_dir.mkdir(parents=True, exist_ok=True)

        request_id = uuid4().hex
        saved_input = debug_dir / f"{request_id}{input_path.suffix}"
        shutil.copyfile(input_path, saved_input)
        paths = {"input": str(saved_input)}

        if normalized_path and normalized_path.exists():
            saved_normalized = debug_dir / f"{request_id}.wav"
            shutil.copyfile(normalized_path, saved_normalized)
            paths["normalized_wav"] = str(saved_normalized)

        return paths

    def _send_empty(self, status: int) -> None:
        self.send_response(status)
        self._send_cors_headers()
        self.end_headers()

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin in CONFIG.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local ASR service.")
    parser.add_argument("--debug-loopback", "--debug-local-asr", "--debug-asr", action="store_true", dest="debug_loopback")
    parser.add_argument("--no-debug-loopback", action="store_true", dest="no_debug_loopback")
    parser.add_argument("--debug-keep-audio", action="store_true", dest="debug_keep_audio")
    parser.add_argument("--no-debug-keep-audio", action="store_true", dest="no_debug_keep_audio")
    return parser.parse_args()


def build_config(args: argparse.Namespace) -> AsrConfig:
    config = DEFAULT_CONFIG
    if args.debug_loopback:
        config = replace(config, debug_loopback=True, debug_keep_audio=True)
    if args.no_debug_loopback:
        config = replace(config, debug_loopback=False)
    if args.debug_keep_audio:
        config = replace(config, debug_keep_audio=True)
    if args.no_debug_keep_audio:
        config = replace(config, debug_keep_audio=False)
    return config


def main() -> None:
    global CONFIG
    CONFIG = build_config(parse_args())
    AsrRequestHandler.engine = LocalAsrEngine(CONFIG)
    AsrRequestHandler.translation_engine = LocalTranslationEngine(CONFIG)
    server = ThreadingHTTPServer((CONFIG.host, CONFIG.port), AsrRequestHandler)
    print(
        f"Local ASR service listening on http://{CONFIG.host}:{CONFIG.port} "
        f"(model={CONFIG.model_path or CONFIG.model_name}, device={CONFIG.device}, "
        f"compute_type={CONFIG.compute_type}, debug_loopback={CONFIG.debug_loopback})"
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
