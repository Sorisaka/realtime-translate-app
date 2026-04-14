import { useEffect, useState } from "react";
import type { AsrRuntimeStatus } from "../../domain/asrRuntime";

type Props = {
  isEnabled: boolean;
  status: AsrRuntimeStatus;
  selectedDeviceId?: string;
  onDeviceChange: (deviceId: string) => void;
};

export function AsrStatusPanel({ isEnabled, status, selectedDeviceId, onDeviceChange }: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isDebugOpen, setIsDebugOpen] = useState(false);

  useEffect(() => {
    if (!isEnabled || !navigator.mediaDevices?.enumerateDevices) return;

    const loadDevices = async () => {
      const availableDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(availableDevices.filter((device) => device.kind === "audioinput"));
    };

    void loadDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", loadDevices);

    return () => {
      navigator.mediaDevices.removeEventListener?.("devicechange", loadDevices);
    };
  }, [isEnabled]);

  if (!isEnabled) return null;

  const phaseLabel = {
    idle: "待機中",
    "requesting-microphone": "マイク確認中",
    recording: "録音中",
    recognizing: "認識中",
    error: "要確認",
  }[status.phase];

  return (
    <section className="panel asr-panel" aria-label="Local ASR status">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Local ASR</span>
          <h2>音声入力</h2>
        </div>
        <span className={`status-pill status-${status.phase}`}>{phaseLabel}</span>
      </div>

      <label className="field-label" htmlFor="audio-device">
        入力デバイス
      </label>
      <select
        className="select-input"
        id="audio-device"
        value={selectedDeviceId ?? ""}
        onChange={(event) => onDeviceChange(event.target.value)}
      >
        <option value="">システム既定のマイク</option>
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `マイク ${index + 1}`}
          </option>
        ))}
      </select>

      <div className="level-row">
        <span>入力レベル</span>
        <div className="level-meter" aria-label="Input level">
          <div className="level-meter-fill" style={{ width: `${Math.round(status.inputLevel * 100)}%` }} />
        </div>
      </div>

      <div className="asr-meta-grid">
        <span>送信中: {status.inFlightRequests}</span>
        <span>形式: {status.recorderMimeType ?? "未確定"}</span>
      </div>

      {status.errorMessage && <div className="error-callout">{status.errorMessage}</div>}

      {status.debug !== undefined && (
        <div className="debug-block">
          <button className="text-button" type="button" onClick={() => setIsDebugOpen((value) => !value)}>
            {isDebugOpen ? "debug を隠す" : "debug を表示"}
          </button>
          {isDebugOpen && <pre>{JSON.stringify(status.debug, null, 2)}</pre>}
        </div>
      )}
    </section>
  );
}
