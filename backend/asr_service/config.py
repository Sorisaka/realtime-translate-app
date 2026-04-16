from dataclasses import dataclass
import os

DEFAULT_ALLOWED_ORIGINS = (
    "http://127.0.0.1:5173,"
    "http://127.0.0.1:5174,"
    "http://localhost:5173,"
    "http://localhost:5174"
)


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class AsrConfig:
    host: str = os.getenv("ASR_HOST", "127.0.0.1")
    port: int = int(os.getenv("ASR_PORT", "8765"))
    model_name: str = os.getenv("ASR_MODEL_NAME", "tiny.en")
    model_path: str | None = os.getenv("ASR_MODEL_PATH")
    device: str = os.getenv("ASR_DEVICE", "cpu")
    compute_type: str = os.getenv("ASR_COMPUTE_TYPE", "int8")
    language: str = os.getenv("ASR_LANGUAGE", "en")
    vad_filter: bool = env_bool("ASR_VAD_FILTER", True)
    vad_min_silence_ms: int = int(os.getenv("ASR_VAD_MIN_SILENCE_MS", "700"))
    ffmpeg_path: str = os.getenv("ASR_FFMPEG_PATH", "ffmpeg")
    ffprobe_path: str = os.getenv("ASR_FFPROBE_PATH", "ffprobe")
    ffmpeg_timeout_sec: int = int(os.getenv("ASR_FFMPEG_TIMEOUT_SEC", "20"))
    debug_loopback: bool = env_bool("ASR_DEBUG_LOOPBACK", False)
    debug_keep_audio: bool = env_bool("ASR_DEBUG_KEEP_AUDIO", False)
    debug_dir: str = os.getenv("ASR_DEBUG_DIR", "debug-audio")
    translation_source_language: str = os.getenv("TRANSLATION_SOURCE_LANGUAGE", "en")
    translation_target_language: str = os.getenv("TRANSLATION_TARGET_LANGUAGE", "ja")
    allowed_origins: frozenset[str] = frozenset(
        origin.strip()
        for origin in os.getenv("ASR_ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS).split(",")
        if origin.strip()
    )


CONFIG = AsrConfig()
