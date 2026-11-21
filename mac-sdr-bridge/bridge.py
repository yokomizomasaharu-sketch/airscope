#!/usr/bin/env python3
"""
AirScope SDR Bridge
===================
RTL-SDR ドングル（RTL-SDR Blog V4 など）で受信した AM/FM 音声とスペクトラムを、
ローカル WebSocket（ws://127.0.0.1:8765）で AirScope（ブラウザ）へ配信します。

- 受信のみ。送信は一切しません。
- 音声は AM（エアバンド）と FM（鉄道・私鉄などのアナログ）のみ。
  TDMA / DMR / NXDN などのデジタル変調や暗号化された通信は復調できません。

使い方（詳細は README_SDR.md）:
    ./start_airscope_sdr.sh                     # 118.100MHz AM で待ち受け
    ./start_airscope_sdr.sh --freq 352.5375 --mode fm
    python3 bridge.py --selftest                # ドングルなしで接続テスト

依存: python3 / numpy / websockets / pyrtlsdr（または librtlsdr の rtl_fm）
"""

from __future__ import annotations

import argparse
import json
import math
import os
import queue
import shutil
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field

import numpy as np

try:
    from websockets.sync.server import serve as ws_serve
except Exception:  # pragma: no cover - websockets が古い場合
    print("websockets (>=13) が必要です:  pip install 'websockets>=13'", file=sys.stderr)
    raise

VERSION = "1.0"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
DEFAULT_FREQ = 118_100_000   # 羽田 Tower 118.100 MHz
AUDIO_RATE = 24_000
FFT_BINS = 512
FFT_WINDOW = 4096
STATUS_HZ = 5.0
FFT_HZ = 8.0


# ──────────────────────────────────────────────────────────────
# 状態
# ──────────────────────────────────────────────────────────────
@dataclass
class RadioState:
    freq_hz: int = DEFAULT_FREQ
    mode: str = "am"                      # am | fm
    bandwidth_hz: int = 8000
    squelch_dbfs: float = -49.0
    paused: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)

    def apply(self, msg: dict) -> None:
        with self.lock:
            if "freq_hz" in msg:
                try:
                    f = float(msg["freq_hz"])
                    if 20e6 <= f <= 1800e6:
                        self.freq_hz = int(round(f))
                except (TypeError, ValueError):
                    pass
            if msg.get("mode") in ("am", "fm"):
                self.mode = msg["mode"]
            if "bandwidth_hz" in msg:
                try:
                    self.bandwidth_hz = max(3000, min(200000, int(msg["bandwidth_hz"])))
                except (TypeError, ValueError):
                    pass
            if "squelch_dbfs" in msg:
                try:
                    self.squelch_dbfs = max(-120.0, min(0.0, float(msg["squelch_dbfs"])))
                except (TypeError, ValueError):
                    pass
            if "pause" in msg:
                self.paused = bool(msg["pause"])

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "freq_hz": self.freq_hz,
                "mode": self.mode,
                "bandwidth_hz": self.bandwidth_hz,
                "squelch_dbfs": self.squelch_dbfs,
                "paused": self.paused,
            }


# ──────────────────────────────────────────────────────────────
# DSP（AM / FM 復調・FFT）
# ──────────────────────────────────────────────────────────────
def make_hann(n: int) -> np.ndarray:
    return np.hanning(n).astype(np.float32)


def fft_db(iq: np.ndarray, fs: float, bins: int = FFT_BINS, window: np.ndarray | None = None) -> np.ndarray:
    """IQ ブロック → dB 配列（中心が中央、bins 個に間引いたもの）"""
    x = iq[-FFT_WINDOW:] if iq.size >= FFT_WINDOW else iq
    n = x.size
    if n < 64:
        return np.full(bins, -110.0, dtype=np.float32)
    w = window if window is not None and window.size == n else np.hanning(n).astype(np.float32)
    spec = np.fft.fftshift(np.fft.fft(x * w))
    mag = np.abs(spec) / (n * 0.5)
    db = 20.0 * np.log10(mag + 1e-9)
    # bins 個に平均圧縮
    idx = np.linspace(0, n, bins + 1).astype(int)
    out = np.empty(bins, dtype=np.float32)
    for i in range(bins):
        a, b = idx[i], max(idx[i] + 1, idx[i + 1])
        out[i] = float(np.mean(db[a:b]))
    return out


def decimate(x: np.ndarray, fs: float, target: int) -> tuple[np.ndarray, float]:
    """単純な箱型ローパス＋間引き。戻り値: (信号, 実サンプルレート)"""
    d = max(1, int(round(fs / target)))
    if d > 1:
        k = np.ones(d, dtype=np.float32) / float(d)
        x = np.convolve(x, k, mode="same")
        x = x[::d]
    return x.astype(np.float32), fs / float(d)


def demod(iq: np.ndarray, mode: str, fs: float) -> tuple[np.ndarray, float]:
    """IQ → 音声波形（-1..1）とサンプルレート"""
    if mode == "am":
        x = np.abs(iq).astype(np.float32)
    else:
        if iq.size < 2:
            return np.zeros(0, dtype=np.float32), float(fs)
        x = np.angle(iq[1:] * np.conj(iq[:-1])).astype(np.float32)
    x = x - float(np.mean(x))
    x, sr = decimate(x, fs, AUDIO_RATE)
    # DC 除去（2回目）と緩い帯域制限
    if x.size:
        x = x - float(np.mean(x))
        if x.size > 3:
            x = np.convolve(x, np.array([0.25, 0.5, 0.25], dtype=np.float32), mode="same")
    # 固定ゲイン（AGC は使わない：無信号時のノイズを増幅しないため）
    gain = 6.0 if mode == "am" else 3.0
    x = np.clip(x * gain, -1.0, 1.0)
    return x.astype(np.float32), sr


def rms_dbfs(x: np.ndarray) -> float:
    if x.size == 0:
        return -120.0
    rms = float(np.sqrt(np.mean(np.square(x, dtype=np.float64))))
    if rms <= 1e-9:
        return -120.0
    return max(-120.0, min(0.0, 20.0 * math.log10(rms)))


def snr_from_fft(db: np.ndarray) -> float:
    if db.size < 8:
        return 0.0
    floor = float(np.median(db))
    peak = float(np.max(db))
    return max(0.0, min(60.0, peak - floor))


def to_int16(x: np.ndarray) -> bytes:
    return (np.clip(x, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()


# ──────────────────────────────────────────────────────────────
# 受信バックエンド
# ──────────────────────────────────────────────────────────────
class Backend:
    name = "base"
    device = "unknown"
    fs: float = 1_024_000.0

    def read(self) -> np.ndarray:              # IQ（complex64）
        raise NotImplementedError

    def retune(self, state: dict) -> None:
        pass

    def close(self) -> None:
        pass


class PyRtlSdrBackend(Backend):
    name = "pyrtlsdr"

    def __init__(self, state: RadioState, fs: float = 1_024_000.0, gain: str = "auto"):
        from rtlsdr import RtlSdr  # pyrtlsdr

        self.fs = fs
        self.sdr = RtlSdr()
        self.sdr.sample_rate = fs
        self.sdr.center_freq = state.freq_hz
        if gain and gain != "auto":
            try:
                self.sdr.gain = float(gain)
            except Exception:
                self.sdr.gain = "auto"
        else:
            self.sdr.gain = "auto"
        try:
            self.sdr.freq_correction = 0
        except Exception:
            pass
        self.device = self._describe()
        self.state = state

    def _describe(self) -> str:
        try:
            g = self.sdr.get_gain()
            return f"RTL-SDR {self.fs / 1e6:.3f} MS/s (gain {g})"
        except Exception:
            return "RTL-SDR"

    def read(self) -> np.ndarray:
        return np.asarray(self.sdr.read_samples(FFT_WINDOW), dtype=np.complex64)

    def retune(self, s: dict) -> None:
        try:
            if int(self.sdr.center_freq) != s["freq_hz"]:
                self.sdr.center_freq = s["freq_hz"]
        except Exception as exc:  # pragma: no cover
            print(f"[bridge] retune failed: {exc}", file=sys.stderr)

    def close(self) -> None:
        try:
            self.sdr.close()
        except Exception:
            pass


class RtlFmBackend(Backend):
    """librtlsdr の rtl_fm を使うフォールバック（音声のみ・FFTは音声帯域から推定）"""

    name = "rtl_fm"
    device = "rtl_fm"

    def __init__(self, state: RadioState, gain: str = "auto"):
        if not shutil.which("rtl_fm"):
            raise RuntimeError("rtl_fm が見つかりません（brew install librtlsdr）")
        self.state = state
        self.proc: subprocess.Popen | None = None
        self.q: queue.Queue[np.ndarray] = queue.Queue(maxsize=64)
        self.fs = float(AUDIO_RATE)
        self.current = state.snapshot()
        self._start(self.current, gain)

    def _start(self, s: dict, gain: str = "auto") -> None:
        self.stop()
        self.current = dict(s)
        freq = s["freq_hz"] / 1e6
        mod = "am" if s["mode"] == "am" else "wbfm" if s["bandwidth_hz"] > 50000 else "fm"
        cmd = [
            "rtl_fm", "-f", f"{freq:.4f}M", "-M", mod,
            "-s", str(AUDIO_RATE * 4), "-r", str(AUDIO_RATE),
            "-l", "0", "-A", "fast",
            "-g", "0" if gain == "auto" else str(gain),
        ]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)
        threading.Thread(target=self._pump, args=(self.proc,), daemon=True).start()

    def _pump(self, proc: subprocess.Popen) -> None:
        chunk = AUDIO_RATE // 10 * 2
        try:
            while proc.poll() is None:
                raw = proc.stdout.read(chunk) if proc.stdout else b""
                if not raw:
                    break
                x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
                try:
                    self.q.put_nowait(x)
                except queue.Full:
                    pass
        except Exception:
            pass

    def read(self) -> np.ndarray:
        # rtl_fm は音声PCMを返すので、IQ互換のため「AM相当」の複素信号に包む
        x = self.q.get(timeout=5.0)
        return (x + 0j).astype(np.complex64)

    def retune(self, s: dict) -> None:
        cur = self.current
        if (cur["freq_hz"], cur["mode"], cur["bandwidth_hz"]) != (s["freq_hz"], s["mode"], s["bandwidth_hz"]):
            self._start(s, "auto")

    def stop(self) -> None:
        if self.proc:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=2)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
            self.proc = None

    def close(self) -> None:
        self.stop()


class SynthBackend(Backend):
    """--selftest 用。合成AM/FM信号を生成し、DSPとWS配信を端から端まで検証する"""

    name = "selftest"
    device = "合成信号（ドングルなし）"
    fs = 1_024_000.0

    def __init__(self, state: RadioState):
        self.state = state
        self.phase = 0.0
        self.mod_phase = 0.0
        self.n = 0

    def read(self) -> np.ndarray:
        s = self.state.snapshot()
        fs = self.fs
        n = FFT_WINDOW
        t = (np.arange(n, dtype=np.float64) + self.n) / fs
        # 中心に変調波（AM: 振幅変調 / FM: 周波数偏移）
        tone_hz = 620.0
        if s["mode"] == "am":
            env = 0.55 + 0.45 * np.sin(2 * math.pi * tone_hz * t + self.phase)
            carrier = env * np.exp(1j * 2 * math.pi * 0.0 * t)
        else:
            dev = 2500.0
            phase = 2 * math.pi * dev / tone_hz * np.sin(2 * math.pi * tone_hz * t + self.phase)
            carrier = 0.8 * np.exp(1j * phase)
        # 周囲の局（CW）: スペクトラム表示用
        c1 = 0.20 * np.exp(1j * 2 * math.pi * 170_000 * t + 0.4j)
        c2 = 0.12 * np.exp(1j * 2 * math.pi * (-260_000) * t + 1.1j)
        c3 = 0.06 * np.exp(1j * 2 * math.pi * 390_000 * t + 2.0j)
        rng = np.random.default_rng(1234)
        noise = 0.012 * (rng.standard_normal(n) + 1j * rng.standard_normal(n))
        iq = (carrier + c1 + c2 + c3 + noise).astype(np.complex64) * 0.5
        self.n += n
        return iq


# ──────────────────────────────────────────────────────────────
# パイプライン
# ──────────────────────────────────────────────────────────────
class Pipeline:
    def __init__(self, backend: Backend, state: RadioState):
        self.backend = backend
        self.state = state
        self.window = make_hann(FFT_WINDOW)
        self.pcm_queue: queue.Queue[bytes] = queue.Queue(maxsize=32)
        self.pcm_buf: list[bytes] = []
        self.pcm_samples = 0
        self.last_fft = 0.0
        self.last_status = 0.0
        self.last_db: np.ndarray | None = None
        self.last_signal = -120.0
        self.last_snr = 0.0
        self.last_open = False
        self.last_sr = float(AUDIO_RATE)

    def step(self) -> None:
        s = self.state.snapshot()
        try:
            self.backend.retune(s)
        except Exception as exc:
            print(f"[bridge] retune error: {exc}", file=sys.stderr)

        iq = self.backend.read()
        fs = self.backend.fs
        if iq is None or iq.size < 8:
            time.sleep(0.05)
            return

        now = time.time()
        # FFT は表示レート（既定 8Hz）のときだけ計算し、前回の結果を再利用する
        did_fft = False
        if self.last_db is None or now - self.last_fft >= 1.0 / FFT_HZ:
            self.last_db = fft_db(iq, fs, FFT_BINS, self.window)
            self.last_fft = now
            did_fft = True
        snr = snr_from_fft(self.last_db) if self.last_db is not None else 0.0

        if self.backend.name == "rtl_fm":
            # rtl_fm はすでに復調済みの音声
            audio = np.real(iq).astype(np.float32)
            sr = fs
        else:
            audio, sr = demod(iq, s["mode"], fs)
        self.last_sr = sr

        lvl = rms_dbfs(audio)
        # RF レベル（dBFS相当）: IQ の平均電力
        rf = float(np.mean(np.abs(iq) ** 2))
        rf_db = max(-120.0, min(0.0, 10.0 * math.log10(rf + 1e-12) + 10.0))
        signal_dbfs = max(lvl, rf_db - 6.0)
        open_ = signal_dbfs > s["squelch_dbfs"] or (snr > 12 and lvl > s["squelch_dbfs"] - 6)

        self.last_signal = signal_dbfs
        self.last_snr = snr
        self.last_open = bool(open_) and not s["paused"]

        # PCM（スケルチが閉じているときは無音を送る）
        if s["paused"]:
            pass
        else:
            out = audio if open_ else np.zeros_like(audio)
            if out.size:
                self.pcm_buf.append(to_int16(out))
                self.pcm_samples += int(out.size)
                # 20ms 程度にまとめて送る
                if self.pcm_samples >= int(sr * 0.02):
                    try:
                        self.pcm_queue.put_nowait(b"".join(self.pcm_buf))
                    except queue.Full:
                        pass
                    self.pcm_buf = []
                    self.pcm_samples = 0

        if did_fft and self.last_db is not None:
            self.last_fft_payload = {
                "type": "fft",
                "db": [round(float(v), 1) for v in self.last_db],
                "center_hz": s["freq_hz"],
                "span_hz": int(fs),
                "db_floor": -110,
                "db_ceil": -10,
            }
        if now - self.last_status >= 1.0 / STATUS_HZ:
            self.last_status = now
            self.last_status_payload = {
                "type": "status",
                "freq_hz": s["freq_hz"],
                "mode": s["mode"],
                "signal_dbfs": round(signal_dbfs, 1),
                "snr_db": round(snr, 1),
                "squelch_open": self.last_open,
                "sample_rate": int(sr),
            }


# ──────────────────────────────────────────────────────────────
# WebSocket サーバ
# ──────────────────────────────────────────────────────────────
class BridgeServer:
    def __init__(self, pipeline: Pipeline, state: RadioState, host: str, port: int):
        self.pipeline = pipeline
        self.state = state
        self.host = host
        self.port = port
        self.clients: set = set()
        self.clients_lock = threading.Lock()
        self.running = True
        self.pipeline.last_fft_payload = None
        self.pipeline.last_status_payload = None

    # --- 送信（ポンプ専用スレッドから呼ぶ） ---
    def pump(self) -> None:
        hello = {
            "type": "hello",
            "name": "AirScope SDR Bridge",
            "version": VERSION,
            "device": self.pipeline.backend.device,
            "driver": self.pipeline.backend.name,
            "sample_rate": AUDIO_RATE,
            "display_rate": int(self.pipeline.backend.fs),
            "span_hz": int(self.pipeline.backend.fs),
            "freq_hz": self.state.snapshot()["freq_hz"],
            "mode": self.state.snapshot()["mode"],
        }
        last_hello = 0.0
        while self.running:
            try:
                self.pipeline.step()
            except Exception as exc:  # デバイス切断などで落とさない
                print(f"[bridge] error: {exc}", file=sys.stderr)
                time.sleep(0.2)
                continue

            with self.clients_lock:
                clients = list(self.clients)
            if not clients:
                self.pipeline.pcm_queue.queue.clear()
                continue

            now = time.time()
            if now - last_hello > 5:
                last_hello = now
                for ws in clients:
                    self._safe_send(ws, json.dumps(hello))

            payload = getattr(self.pipeline, "last_fft_payload", None)
            if payload:
                self.pipeline.last_fft_payload = None
                txt = json.dumps(payload, separators=(",", ":"))
                for ws in clients:
                    self._safe_send(ws, txt)

            st = getattr(self.pipeline, "last_status_payload", None)
            if st:
                self.pipeline.last_status_payload = None
                txt = json.dumps(st, separators=(",", ":"))
                for ws in clients:
                    self._safe_send(ws, txt)

            # 溜まった PCM をまとめて送る
            chunks = []
            while True:
                try:
                    chunks.append(self.pipeline.pcm_queue.get_nowait())
                except queue.Empty:
                    break
            if chunks:
                blob = b"".join(chunks)
                for ws in clients:
                    self._safe_send(ws, blob)

    def _safe_send(self, ws, data) -> None:
        try:
            ws.send(data)
        except Exception:
            self.drop(ws)

    def drop(self, ws) -> None:
        with self.clients_lock:
            self.clients.discard(ws)
        try:
            ws.close()
        except Exception:
            pass

    # --- 接続ハンドラ（受信専用スレッド） ---
    def handler(self, ws) -> None:
        with self.clients_lock:
            self.clients.add(ws)
        peer = getattr(ws, "remote_address", ("?", 0))
        print(f"[bridge] client connected {peer}", file=sys.stderr)
        try:
            hello = {
                "type": "hello",
                "name": "AirScope SDR Bridge",
                "version": VERSION,
                "device": self.pipeline.backend.device,
                "driver": self.pipeline.backend.name,
                "sample_rate": AUDIO_RATE,
                "display_rate": int(self.pipeline.backend.fs),
                "span_hz": int(self.pipeline.backend.fs),
                "freq_hz": self.state.snapshot()["freq_hz"],
                "mode": self.state.snapshot()["mode"],
            }
            ws.send(json.dumps(hello))
            for raw in ws:
                try:
                    msg = json.loads(raw if isinstance(raw, str) else raw.decode("utf-8", "ignore"))
                except Exception:
                    continue
                cmd = msg.get("cmd")
                if cmd == "tune":
                    self.state.apply(msg)
                    print(f"[bridge] tune -> {self.state.snapshot()}", file=sys.stderr)
                elif cmd == "squelch":
                    self.state.apply({"squelch_dbfs": msg.get("squelch_dbfs")})
                elif cmd == "pause":
                    self.state.apply({"pause": msg.get("pause")})
                elif cmd == "ping":
                    try:
                        ws.send(json.dumps({"type": "pong", "t": time.time()}))
                    except Exception:
                        pass
        except Exception as exc:
            print(f"[bridge] client error: {exc}", file=sys.stderr)
        finally:
            self.drop(ws)
            print("[bridge] client disconnected", file=sys.stderr)

    def run(self) -> None:
        threading.Thread(target=self.pump, daemon=True).start()
        print(f"[bridge] listening on ws://{self.host}:{self.port}  ({self.pipeline.backend.name})", file=sys.stderr)
        with ws_serve(self.handler, self.host, self.port, max_size=None) as server:
            server.serve_forever()

    def stop(self) -> None:
        self.running = False


# ──────────────────────────────────────────────────────────────
# 起動
# ──────────────────────────────────────────────────────────────
def build_backend(args, state: RadioState) -> Backend:
    if args.selftest:
        return SynthBackend(state)
    try:
        return PyRtlSdrBackend(state, fs=args.sample_rate, gain=args.gain)
    except Exception as exc:
        print(f"[bridge] pyrtlsdr を使えません ({exc})。rtl_fm に切り替えます", file=sys.stderr)
        return RtlFmBackend(state, gain=args.gain)


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description="AirScope SDR Bridge (receive only)")
    p.add_argument("--host", default=DEFAULT_HOST)
    p.add_argument("--port", type=int, default=DEFAULT_PORT)
    p.add_argument("--freq", type=float, default=DEFAULT_FREQ / 1e6, help="初期周波数 (MHz)")
    p.add_argument("--mode", choices=["am", "fm"], default="am")
    p.add_argument("--squelch", type=float, default=-49.0, help="スケルチ閾値 (dBFS)")
    p.add_argument("--sample-rate", type=float, default=1_024_000)
    p.add_argument("--gain", default="auto")
    p.add_argument("--selftest", action="store_true", help="ドングルなしで合成信号を配信（接続テスト）")
    p.add_argument("--list-devices", action="store_true", help="RTL-SDR デバイスを列挙して終了")
    p.add_argument("--version", action="version", version=f"AirScope SDR Bridge {VERSION}")
    args = p.parse_args(argv)

    if args.list_devices:
        try:
            from rtlsdr import RtlSdr
            print(json.dumps([str(d) for d in RtlSdr.get_device_serial_addresses()], ensure_ascii=False))
        except Exception as exc:
            print(f"デバイスを取得できません: {exc}", file=sys.stderr)
            return 1
        return 0

    freq_hz = int(round(args.freq * 1e6)) if args.freq < 1e6 else int(args.freq)
    state = RadioState(freq_hz=freq_hz, mode=args.mode, squelch_dbfs=args.squelch)

    try:
        backend = build_backend(args, state)
    except Exception as exc:
        print(f"[bridge] 受信機を開けません: {exc}", file=sys.stderr)
        return 1

    pipeline = Pipeline(backend, state)
    server = BridgeServer(pipeline, state, args.host, args.port)

    def shutdown(*_):
        server.stop()
        backend.close()
        print("\n[bridge] stopped", file=sys.stderr)
        os._exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(f"[bridge] device: {backend.device} / {freq_hz/1e6:.4f} MHz {args.mode.upper()}", file=sys.stderr)
    try:
        server.run()
    except KeyboardInterrupt:
        shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
