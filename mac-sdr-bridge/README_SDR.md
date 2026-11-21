# AirScope SDR Bridge（Mac + RTL-SDR）

AirScope のブラウザ画面に、**RTL-SDR ドングルで実際に受信した音声とスペクトラム**を流し込むためのローカルブリッジです。
Mac（MacBook Neo / Apple Silicon）で動かし、ブラウザの AirScope とは `ws://127.0.0.1:8765` でつながります。

- **受信のみ**。送信は一切しません。
- 音声は **AM（エアバンド 118–137MHz）** と **FM（鉄道・私鉄などのアナログ）** のみ。
- TDMA（STD-T79）・DMR・NXDN などの**デジタル変調や暗号化された業務無線は復調できません**（ノイズにしかなりません）。

---

## 1. 必要なもの

| 項目 | 内容 |
| --- | --- |
| Mac | Apple Silicon（M1〜）／Intel どちらでも可。macOS 12 以降 |
| ドングル | **RTL-SDR Blog V4**（推奨）、RTL-SDR Blog V3、Nooelec NESDR SMArt など RTL2832U + R820T/R828D 系 |
| アンテナ | 付属の伸縮アンテナで可。エアバンドは V字に広げ、窓際・屋外が有利 |
| ソフト | Homebrew、Python 3.10 以降 |

> V4 は HF も受信できますが、このブリッジは VHF/UHF（24MHz〜1.7GHz）を想定しています。
> ドングルは USB ハブを介さず、Mac 本体の USB ポートに直接挿すと安定します。

---

## 2. セットアップ（初回だけ）

```bash
# Homebrew がなければ: https://brew.sh
brew install librtlsdr

cd mac-sdr-bridge
python3 -m venv .venv
. .venv/bin/activate
pip install "websockets>=13" numpy pyrtlsdr
```

`start_airscope_sdr.sh` はこのセットアップを自動で行うので、スクリプトを実行するだけで構いません。

```bash
chmod +x start_airscope_sdr.sh
./start_airscope_sdr.sh
```

起動すると次のように表示されます。

```
== AirScope SDR Bridge ==
[bridge] device: RTL-SDR 1.024 MS/s (gain auto) / 118.1000 MHz AM
[bridge] listening on ws://127.0.0.1:8765  (pyrtlsdr)
```

---

## 3. AirScope 側の操作

1. 公開ページ <https://yokomizomasaharu-sketch.github.io/airscope/> を開く
2. ヘッダー左の **「デモ ▾」**（受信ソース）を押す
3. **「Mac RTL-SDR」** を選ぶ → 自動で `ws://127.0.0.1:8765` に接続
4. つながると、スペクトラムが実受信データに変わり、音声が鳴ります

- 画面の周波数をクリック／入力すると、**Mac 側のドングルがその周波数に同調**します（`{"cmd":"tune",...}` を送信）。
- スケルチ閾値（設定モーダル）は `{"cmd":"squelch",...}` として送られ、Mac 側で音声を開閉します。
- 受信停止ボタンは `{"cmd":"pause",...}` を送り、音声を止めます。
- 録音ボタンで、流れてきた実音声を **履歴 → 再生／保存** できます（ブラウザ内で録音）。

> ブラウザとページの配信元は https、WebSocket は `ws://127.0.0.1` です。
> Chrome / Edge / Safari は、https のページから `ws://127.0.0.1`（ループバック）への接続をローカル接続として許可します（混在コンテンツ扱いになりません）。
> このモードは **Mac のブラウザで AirScope を開いて**使ってください。`127.0.0.1` は Mac 自身を指すため、iPhone からは接続できません（LAN の IP を入れた場合も、https ページから名前なしの ws:// はブロックされます）。

---

## 4. 起動オプション

```bash
./start_airscope_sdr.sh                                  # 118.100MHz AM（羽田 Tower）
./start_airscope_sdr.sh --freq 352.5375 --mode fm        # JR 352MHz帯 FM
./start_airscope_sdr.sh --freq 149.85 --mode fm          # 南海 149.85MHz FM
./start_airscope_sdr.sh --gain 28.0 --squelch -55        # ゲイン／スケルチ指定
./start_airscope_sdr.sh --port 8765 --host 127.0.0.1
python3 bridge.py --list-devices                         # 接続されているドングルを表示
python3 bridge.py --selftest                             # ドングルなしで動作確認（合成信号）
```

`--selftest` は合成した AM/FM 信号を同じ DSP に通して配信します。ドングルが届く前の接続確認や、AirScope 側の表示確認に使えます。

---

## 5. 周波数の例（受信のみ）

| 用途 | 周波数 | モード |
| --- | --- | --- |
| 羽田 Tower | 118.100 MHz | AM |
| 成田 Tower（16R/34L） | 118.200 MHz | AM |
| 伊丹 Tower | 118.100 MHz | AM |
| 福岡 Tower | 118.400 MHz | AM |
| 関空 Tower（06R/24L） | 118.200 MHz | AM |
| 東京 Approach | 119.100 MHz | AM |
| ATIS（羽田） | 128.800 MHz | AM |
| JR 在来線 A/B タイプ 基地局 | 352.500–352.625 MHz | FM（12.5kHz） |
| 南海 本線（指令） | 149.850 MHz | FM（12.5kHz） |

AirScope のプリセット（KIX / ITM / HND / NRT / FUK / 南海 / JR）と同じ周波数です。
プリセットを選んでから周波数をクリックすると、その周波数に同調します。

---

## 6. 仕組み（プロトコル）

Mac → ブラウザ（テキストは JSON、音声はバイナリ）

| 種別 | 内容 |
| --- | --- |
| `hello` | `{"type":"hello","device":"...","sample_rate":24000,"span_hz":1024000,...}` |
| `fft` | `{"type":"fft","db":[…512個…],"center_hz":118100000,"span_hz":1024000,"db_floor":-110,"db_ceil":-10}` |
| `status` | `{"type":"status","freq_hz":118100000,"mode":"am","signal_dbfs":-42.1,"snr_db":12.3,"squelch_open":true,"sample_rate":23814}` |
| バイナリ | 16bit リトルエンディアン／モノラル PCM（`sample_rate`） |

ブラウザ → Mac

| コマンド | 内容 |
| --- | --- |
| `{"cmd":"tune","freq_hz":118100000,"mode":"am","bandwidth_hz":8000,"squelch_dbfs":-49}` | 周波数・復調・スケルチをまとめて変更 |
| `{"cmd":"squelch","squelch_dbfs":-55}` | スケルチのみ変更 |
| `{"cmd":"pause","pause":true}` | 音声の送出を停止／再開 |
| `{"cmd":"ping"}` | `{"type":"pong"}` を返す |

DSP は numpy で行います。

1. 1.024 MS/s で IQ を読み、4096 点 FFT（Hann 窓）→ 512 ビンに平均圧縮 → dB
2. AM は包絡線検波、FM は位相差検波
3. 箱型ローパス＋間引きで 24kS/s に変換、DC 除去・固定ゲイン
4. スケルチが閉じている区間は無音を送る（ノイズを鳴らさない）
5. 信号強度＝IQ 電力（dBFS 相当）、SNR＝FFT のピーク−中央値

---

## 7. うまくいかないとき

| 症状 | 確認すること |
| --- | --- |
| `pyrtlsdr を使えません` | `rtl_test -t` でドングルが見えるか。USB を挿し直す／ハブを避ける |
| `rtl_fm が見つかりません` | `brew install librtlsdr` |
| 接続できない（AirScope 側が「未接続」） | ターミナルに `listening on ws://127.0.0.1:8765` が出ているか。`--port` を変えたら AirScope 側の URL も変える |
| 音が小さい／割れる | `--gain 20`〜`40` を試す（ゲイン過大は混変調）。音量スライダーも確認 |
| 音がノイズだけ | モード（AM/FM）と周波数を確認。デジタル変調・暗号化は復調できません |
| `Address already in use` | 別の bridge.py が動いています。`pkill -f bridge.py` で止める |
| 周波数がずれる | RTL-SDR Blog V4 は TCXO 搭載でほぼずれません。V3 は `--ppm` 相当の補正が必要な場合があります |

---

## 8. 電波法と注意

- **受信のみ**です。送信機能はありません。UV-K5 などで同じ周波数に送信すると電波法違反になります。
- 電波法第59条により、**傍受した通信の内容を他人に知らせたり、自分のために使用したりすることはできません**。個人の趣味の範囲（受信して聞く）にとどめてください。
- 航空・鉄道の運用に支障をきたす行為（内容の公開、業務利用）はしないでください。
- LiveATC の音声は LiveATC.net の利用条件に従ってください（本ブリッジとは別サービスです）。

---

## 9. UV-K5 と使い分ける

| | Mac + RTL-SDR（このブリッジ） | 外部受信機（UV-K5 等） |
| --- | --- | --- |
| 同調 | AirScope から遠隔で変更できる | UV-K5 本体のダイヤルで手動 |
| スペクトラム | 実機 FFT を表示 | 入力音声のスペクトラムを表示 |
| 音声 | Mac 側で AM/FM 復調 | UV-K5 の復調音声をライン入力 |
| 周波数範囲 | 24MHz〜1.7GHz（ドングル次第） | UV-K5 の受信範囲 |
| 手軽さ | ドングルとセットアップが必要 | ケーブル1本で済む |

UV-K5 は AirScope の「外部受信機（UV-K5 等）」モードで使います。イヤホン端子と Mac をオーディオケーブルでつなぎ、ブラウザでマイク入力を許可してください。
