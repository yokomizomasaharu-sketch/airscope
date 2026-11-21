#!/usr/bin/env bash
# AirScope SDR Bridge — セットアップ＆起動
#   使い方:  ./start_airscope_sdr.sh [--freq 352.5375 --mode fm]
#   停止:    Ctrl+C
set -euo pipefail
cd "$(dirname "$0")"

echo "== AirScope SDR Bridge =="

if ! command -v python3 >/dev/null 2>&1; then
  echo "✗ python3 が見つかりません。Xcode Command Line Tools か python.org の Python を入れてください。"
  exit 1
fi

# librtlsdr（rtl_test / rtl_fm）がなければ Homebrew で導入
if ! command -v rtl_test >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "→ librtlsdr を導入します（brew install librtlsdr）…"
    brew install librtlsdr
  else
    echo "⚠ rtl_test が見つかりません。Homebrew（https://brew.sh）を入れてから"
    echo "   brew install librtlsdr"
    echo "  を実行してください。pyrtlsdr だけで動く場合もあります。"
  fi
fi

# Python 仮想環境
if [ ! -d .venv ]; then
  echo "→ Python 仮想環境を作成します（.venv）…"
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
. .venv/bin/activate

if ! python - <<'PY'
import importlib, sys
for m in ("websockets", "numpy", "pyrtlsdr"):
    try:
        importlib.import_module(m)
    except Exception:
        sys.exit(1)
PY
then
  echo "→ 依存パッケージを導入します（websockets / numpy / pyrtlsdr）…"
  pip install --upgrade pip >/dev/null
  pip install "websockets>=13" numpy pyrtlsdr
fi

echo "→ ws://127.0.0.1:8765 で待ち受けます。AirScope の「受信ソース」→「Mac RTL-SDR」→「接続」。"
echo "  停止は Ctrl+C。"
exec python bridge.py "$@"
