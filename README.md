# AirScope

SDR 受信機のモニター画面を再現した **操作シミュレーター + 実機モニター** です。

- 公開ページ: https://yokomizomasaharu-sketch.github.io/airscope/
- **デモ表示**では実際の電波を受信せず、周波数・局・通話・スペクトラム・音声はすべてブラウザ内で生成した架空のデータです。
- **Mac RTL-SDR** / **外部受信機（UV-K5 等）** に切り替えると、手元の機器の実音声を端末内で処理します（外部への送信はしません）。

## 主な機能

### 受信ソース（ヘッダー左の「デモ ▾」）

| モード | 内容 |
| --- | --- |
| デモ表示 | 架空のデータで UI・周波数リスト・履歴を確認。SDR 機器には接続しません |
| Mac RTL-SDR | Mac の RTL-SDR ドングルと `ws://127.0.0.1:8765` で接続。実 FFT・実音声を受信し、AirScope から周波数／AM・FM／スケルチを同調 |
| 外部受信機（UV-K5 等） | Mac のマイク／ライン入力から外部受信機の音声を取り込み、レベル・波形・スペクトラム表示、モニタリング、録音 |

### プリセット（バンド／局リスト）切替 — 左ペイン上部のドロップダウン

- 標準デモ（273MHz STD-T79）／南海電鉄（149.85 MHz 周辺）／JR 鉄道無線（352MHz 帯）
- 日本主要空港のエアバンド（KIX・ITM・HND・NRT・FUK、AM モード）
- 海外空港（台北松山 RCSS・香港 VHHH・マニラ RPLL）

### LiveATC の実音声（機材なしで本物を聴く）

- 羽田（RJTT）・成田（RJAA）・伊丹（RJOO）・福岡（RJFF）・台北松山（RCSS）・香港（VHHH）・マニラ（RPLL）の**実在フィード**を、Tower / Approach / Ground / ATIS などの**フィード別ボタン**で案内
- 押すと LiveATC 公式プレーヤー（`hlisten.php?mount=…`）が別ウィンドウで開きます
- 開いた瞬間に AirScope のデモ音を自動ミュートし、閉じると元に戻します

> LiveATC のストリームは配信元が Cloudflare の 403 を返し、公式プレーヤーも自サイト専用のため、ブラウザ内の `<audio>` では直接再生できません（実測）。「鳴らないプレーヤー」を置かず、公式プレーヤーへの導線にしています。

### そのほか

- 周波数入力（Enter / 聴く）・ステップ切替（自動 12.5k / 6.25k / 12.5k / 25k）
- 局一覧（フィルタ：すべて / 通話中 / グループ、お気に入り、複数選択）
- モニターパネル（信号 / SNR / FFT 更新 / 復調、受信状態、音声レベルとスケルチ閾値、録音）
- 帯域スペクトラム（Canvas。クリックで同調、ドラッグで帯域移動、ホイールで1ステップ）
- 通話・録音履歴（実音声の録音は再生・ダウンロード可）
- 設定（デモ速度 / スケルチ閾値 / デモ音 / 受信ソース / LiveATC 自動ミュート）
- **CHIRP 用 CSV 書き出し**（UV-K5 などへの取り込み用、受信専用）
- PWA（iPhone / iPad の「ホーム画面に追加」に対応、noindex）

### CHIRP 用 CSV（受信専用）

設定モーダル、またはプリセット欄のボタンから、KIX / ITM / HND / NRT / FUK（AM）・南海（FM）・JR 352MHz 帯（FM）の周波数を
**CHIRP-next** の汎用 CSV 形式で書き出します。

- 列: `Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,RxDtcsCode,CrossMode,Mode,TStep,Skip,Power,Comment,URCALL,RPT1CALL,RPT2CALL,DVCODE`
- **`Duplex=off`（送信無効＝受信専用）**。UV-K5 は 118–137MHz を送信できないため、この設定が必須です
- 名前は 10 文字以内（例 `HND118.100`）、モードは `AM` / `NFM`、ステップは `25.00` / `12.50`

## Mac RTL-SDR / 外部受信機の使い方

`mac-sdr-bridge/` に一式があります。

- `bridge.py` — RTL-SDR の IQ を受信し、FFT・AM/FM 復調・PCM を WebSocket で配信（受信のみ）
- `start_airscope_sdr.sh` — 依存関係の導入と起動
- `README_SDR.md` — MacBook での導入手順、対応ドングル、周波数例、プロトコル、トラブルシュート

```bash
cd mac-sdr-bridge
./start_airscope_sdr.sh                 # 118.100MHz AM で待ち受け
python3 bridge.py --selftest            # ドングルなしで接続テスト（合成信号）
```

UV-K5 は「外部受信機」モードで、イヤホン端子と Mac をオーディオケーブルでつないで使います（AirScope からは同調できません）。

## 周波数データについて

南海・JR・空港の周波数は、AIP Japan（国土交通省航空局）・LiveATC.net の公開ページ・公開周波数リストで確認した**掲載値**です。デモモードでは実際の電波は受信せず、受信・復調・通話・スペクトラムはすべてブラウザ内のシミュレーションです。画面内の「デモ表示」バッジと各プリセットの注記にその旨を明記しています。

- 空港の周波数は AIP の掲載値（例：KIX Tower 118.200 / Ground 121.600 / ATIS 127.850）
- LiveATC のフィードは、公開フィードが実在する空港のみ（RJTT / RJAA / RJOO / RJFF / RCSS / VHHH / RPLL。2026-11-21 時点で全て UP を確認）
- 台北桃園（RCTP）・ソウル仁川（RKSI）・関西国際（RJBB）には LiveATC の公開フィードがないため、ボタンは置いていません

## 構成

```
index.html   styles.css   app.js   manifest.json   icon.svg   icons/
mac-sdr-bridge/
  bridge.py   start_airscope_sdr.sh   README_SDR.md
```

静的ファイルのみです（Mac 側の bridge.py を除く）。ビルドは不要で、GitHub Pages（main ブランチのルート）から配信しています。

## 注意

- 受信のみです。送信機能はありません。
- 電波法第59条により、傍受した通信の内容を他人に知らせたり、自分のために使用したりすることはできません。
- TDMA・DMR・NXDN などのデジタル変調や暗号化された業務無線は復調できません。
