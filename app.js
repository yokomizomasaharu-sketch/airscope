/* AirScope — SDR monitor demo
 * すべてブラウザ内で生成するシミュレーションです（実受信ではありません）。
 */
'use strict';
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pad2 = (n) => String(Math.floor(n)).padStart(2, '0');
  const fmtHz = (f) => f.toFixed(4);
  const fmtMHz = (f) => f.toFixed(3);

  const SPAN = 2.048;                     // 表示帯域 (MHz)
  const STEP_MAP = { '6.25': 0.00625, '12.5': 0.0125, '25': 0.025, auto: 0.0125 };
  const STATUS_TEXT = { talking: '通話中', sync: '同期', judging: '判定中', ended: '監視終了', idle: '待機' };
  const BADGE_CLASS = { talking: 'talking', sync: 'sync', judging: 'judging', ended: 'ended', idle: 'idle' };
  const CODECS = { 'STD-T79': 'AMBE+ 4000', 'DMR': 'AMBE+2', 'NXDN': 'AMBE+2 3200', 'アナログFM': 'アナログ' };
  const PREF_KEY = 'airscope.prefs.v2';

  /* ── 局データ ─────────────────────────────────────────── */
  const SEED = [
    { freq: 272.6375, org: 'B', status: 'sync',    sync: 99.2, tg: 22,   dir: '上り', cc: 7 },
    { freq: 272.8625, org: 'C', status: 'judging', sync: 41.0, tg: null, dir: '下り', cc: '—' },
    { freq: 273.0125, org: 'D', status: 'sync',    sync: 99.8, tg: null, dir: '下り', cc: 5 },
    { freq: 273.1125, org: 'A', status: 'talking', sync: 99.9, tg: 21,   dir: '下り', cc: 3, callId: 1234, callSlot: 2, callTimer: 24 },
    { freq: 273.3125, org: 'E', status: 'sync',    sync: 100,  tg: null, dir: '下り', cc: 11 },
    { freq: 273.4125, org: 'F', status: 'talking', sync: 99.6, tg: 21,   dir: '下り', cc: 9, callId: 4471, callSlot: 2, callTimer: 15 },
    { freq: 273.4625, org: 'G', status: 'sync',    sync: 97.5, tg: 21,   dir: '上り', cc: 3 },
    { freq: 273.5625, org: 'H', status: 'sync',    sync: 99.9, tg: 22,   dir: '下り', cc: 9 },
    { freq: 273.6375, org: 'I', status: 'sync',    sync: 99.4, tg: null, dir: '下り', cc: 4 },
    { freq: 273.8875, org: 'J', status: 'ended',   sync: null, tg: null, dir: '下り', cc: 12 },
    { freq: 274.1375, org: 'K', status: 'judging', sync: 12.5, tg: null, dir: '下り', cc: '—' }
  ];

  /* ── プリセット（バンド／局リスト） ───────────────────
   * 南海・JR・空港の周波数は公開情報（AIP Japan、LiveATC.net、公開周波数リスト）
   * で確認した「掲載値」です。このアプリは実電波を受信せず、受信・復調・通話は
   * すべてブラウザ内のシミュレーションです。
   */
  const LAT = (icao) => `https://www.liveatc.net/search/?icao=${icao}`;

  const PRESETS = [
    {
      id: 'std', group: '国内デモ', label: '標準デモ（273MHz STD-T79）',
      range: [250, 292], center: 273.45, span: 2.048, fs: '2.048 MS/s',
      mod: 'TDMA', stdMode: 'auto', stepMode: 'auto', main: 273.1125,
      note: '架空の組織名 A〜K によるシミュレーション。実在の無線局・組織ではありません。',
      src: 'デモ用の架空データ',
      stations: SEED
    },
    {
      id: 'nankai', group: '国内デモ', label: '南海電鉄（149.85 MHz 周辺）',
      range: [145, 155], center: 149.85, span: 2.048, fs: '2.048 MS/s',
      mod: 'FM', stdMode: 'アナログFM', stepMode: '12.5', main: 149.85,
      note: '南海電鉄 本線 149.8500 MHz（指令）を中心に、関西の私鉄150MHz帯を公開リストから並べたデモです。周波数は参考値、実電波は受信していません。',
      src: '参照: 公開周波数リスト（私鉄150MHz帯）',
      stations: [
        { freq: 149.0700, name: '阪急電鉄 神戸本線（移動）', tag: '150M', role: '移動局側・参考値', status: 'sync', sync: 92.4 },
        { freq: 149.1900, name: '京阪電鉄', tag: '150M', role: '150MHz帯・参考値', status: 'judging', sync: 38.1 },
        { freq: 149.4700, name: '京阪電鉄', tag: '150M', role: '150MHz帯・参考値', status: 'sync', sync: 97.8 },
        { freq: 149.5100, name: '近畿日本鉄道', tag: '150M', role: '150MHz帯・参考値', status: 'sync', sync: 99.1 },
        { freq: 149.5800, name: '近畿日本鉄道', tag: '150M', role: '150MHz帯・参考値', status: 'judging', sync: 21.6 },
        { freq: 149.8300, name: '南海電鉄 高野線（指令）', tag: '150M', role: '指令側・参考値', status: 'sync', sync: 99.6 },
        { freq: 149.8500, name: '南海電鉄 本線（指令）', tag: '150M', role: '指令側・メイン局', status: 'talking', sync: 99.9, callTimer: 26 },
        { freq: 150.3700, name: '京阪電鉄', tag: '150M', role: '150MHz帯・参考値', status: 'sync', sync: 95.2 },
        { freq: 150.3900, name: '阪神電鉄（指令）', tag: '150M', role: '指令側・参考値', status: 'sync', sync: 98.4 },
        { freq: 150.9700, name: '新幹線 入換波', tag: '150M', role: '入換用・参考値', status: 'ended', sync: null }
      ]
    },
    {
      id: 'jr', group: '国内デモ', label: 'JR 鉄道無線（352MHz 帯）',
      range: [330, 370], center: 352.58, span: 0.4, fs: '0.400 MS/s',
      mod: 'FM', stdMode: 'アナログFM', stepMode: '12.5', main: 352.5375,
      note: 'JR在来線 A/Bタイプ列車無線の基地局波（352.5MHz帯・8ch）を公開リストから並べたデモです。線区の割当は会社・線区ごとに異なります（車上側は336MHz帯、Cタイプは414〜415MHz帯）。実電波は受信していません。',
      src: '参照: 公開周波数リスト（JR A/Bタイプ 352MHz帯）',
      stations: [
        { freq: 352.5000, name: 'A/Bタイプ 基地局（線区割当は会社ごと）', tag: 'JR', role: '基地局→列車・参考値', status: 'sync', sync: 94.8 },
        { freq: 352.5375, name: 'A/Bタイプ 1ch 基地局', tag: 'JR', role: '基地局→列車・参考値', status: 'talking', sync: 99.9, callTimer: 22 },
        { freq: 352.5500, name: 'A/Bタイプ 2ch 基地局', tag: 'JR', role: '基地局→列車・参考値', status: 'sync', sync: 98.2 },
        { freq: 352.5625, name: 'A/Bタイプ 3ch 基地局', tag: 'JR', role: '基地局→列車・参考値', status: 'sync', sync: 96.5 },
        { freq: 352.5750, name: 'A/Bタイプ 4ch 基地局', tag: 'JR', role: '基地局→列車・参考値', status: 'sync', sync: 99.3 },
        { freq: 352.5875, name: 'A/Bタイプ 5ch 基地局', tag: 'JR', role: '基地局→列車・参考値', status: 'judging', sync: 27.4 },
        { freq: 352.6000, name: 'A/Bタイプ 6ch 基地局', tag: 'JR', role: '基地局→列車・参考値', status: 'sync', sync: 91.7 },
        { freq: 352.6125, name: 'A/Bタイプ 7ch 基地局', tag: 'JR', role: '基地局→列車・参考値', status: 'judging', sync: 12.9 },
        { freq: 352.6250, name: 'A/Bタイプ 8ch 基地局', tag: 'JR', role: '基地局→列車・参考値', status: 'ended', sync: null }
      ]
    },
    {
      id: 'kix', group: '空港', label: '関西国際 KIX（RJBB）',
      range: [117, 137], center: 123.0, span: 12.0, fs: '12.0 MS/s',
      mod: 'AM', stdMode: 'AM (エアバンド)', stepMode: '25', main: 118.2,
      note: 'KIX（関西国際）の公開周波数（AIP Japan 掲載値）を並べたデモです。受信・復調・通話はデモ表示で、実際の電波は受信していません。KIX は現在 LiveATC の公開フィードがありません。',
      src: '参照: AIP Japan RJBB / airbinder.jp / LiveATC feed index',
      stations: [
        { freq: 118.2000, name: 'KIX Tower（RWY 06R/24L）', tag: 'TWR', role: 'Tower・メイン', status: 'talking', sync: 99.9, callTimer: 24 },
        { freq: 118.0500, name: 'KIX Tower（RWY 06L/24R）', tag: 'TWR', role: 'Tower', status: 'sync', sync: 96.1 },
        { freq: 121.6000, name: 'KIX Ground', tag: 'GND', role: 'Ground', status: 'sync', sync: 98.7 },
        { freq: 121.9000, name: 'KIX Delivery', tag: 'DEL', role: 'Clearance Delivery', status: 'sync', sync: 93.4 },
        { freq: 120.2500, name: 'Kansai Approach', tag: 'APP', role: 'Approach', status: 'sync', sync: 97.2 },
        { freq: 119.2000, name: 'Kansai Departure', tag: 'DEP', role: 'Departure', status: 'judging', sync: 31.8 },
        { freq: 127.8500, name: 'KIX ATIS（連続放送）', tag: 'ATIS', role: 'ATIS', status: 'sync', sync: 99.5, sticky: true },
        { freq: 121.1000, name: 'Kansai TCA', tag: 'TCA', role: 'Terminal Control Area', status: 'judging', sync: 18.2 }
      ]
    },
    {
      id: 'itm', group: '空港', label: '大阪伊丹 ITM（RJOO）',
      range: [117, 137], center: 123.0, span: 12.0, fs: '12.0 MS/s',
      mod: 'AM', stdMode: 'AM (エアバンド)', stepMode: '25', main: 118.1,
      note: 'ITM（大阪国際・伊丹）の公開周波数（AIP Japan 掲載値）を並べたデモです。実際の電波は受信していません。',
      src: '参照: AIP Japan RJOO / airbinder.jp / LiveATC feed index',
      liveatc: [{ icao: 'RJOO', label: 'RJOO Tower（Osaka Tower 118.100）ほか' }],
      stations: [
        { freq: 118.1000, name: 'Osaka Tower', tag: 'TWR', role: 'Tower・メイン', status: 'talking', sync: 99.9, callTimer: 25 },
        { freq: 121.7000, name: 'Osaka Ground', tag: 'GND', role: 'Ground', status: 'sync', sync: 98.3 },
        { freq: 118.8000, name: 'Osaka Delivery', tag: 'DEL', role: 'Clearance Delivery', status: 'sync', sync: 92.6 },
        { freq: 120.4500, name: 'Kansai Approach（伊丹）', tag: 'APP', role: 'Approach（関西APP）', status: 'sync', sync: 96.8 },
        { freq: 119.5000, name: 'Kansai Departure（伊丹）', tag: 'DEP', role: 'Departure（関西DEP）', status: 'judging', sync: 33.5 },
        { freq: 128.6000, name: 'Osaka ATIS（連続放送）', tag: 'ATIS', role: 'ATIS', status: 'sync', sync: 99.4, sticky: true },
        { freq: 127.5000, name: 'Osaka GCA', tag: 'GCA', role: 'GCA（着陸誘導）', status: 'judging', sync: 22.1 },
        { freq: 121.1000, name: 'Kansai TCA', tag: 'TCA', role: 'Terminal Control Area', status: 'ended', sync: null }
      ]
    },
    {
      id: 'hnd', group: '空港', label: '東京羽田 HND（RJTT）',
      range: [117, 137], center: 123.2, span: 12.0, fs: '12.0 MS/s',
      mod: 'AM', stdMode: 'AM (エアバンド)', stepMode: '25', main: 118.1,
      note: 'HND（東京国際・羽田）の公開周波数（AIP Japan 掲載値）を並べたデモです。実際の電波は受信していません。',
      src: '参照: AIP Japan RJTT / airbinder.jp / LiveATC feed index',
      liveatc: [{ icao: 'RJTT', label: 'RJTT Tower / Twr+TCA / App+Dep / ATIS' }],
      stations: [
        { freq: 118.1000, name: 'Tokyo Tower（A滑走路）', tag: 'TWR', role: 'Tower・主', status: 'talking', sync: 99.9, callTimer: 27 },
        { freq: 124.3500, name: 'Tokyo Tower（C滑走路）', tag: 'TWR', role: 'Tower', status: 'sync', sync: 97.4 },
        { freq: 121.7000, name: 'Tokyo Ground（第1ターミナル）', tag: 'GND', role: 'Ground', status: 'sync', sync: 95.8 },
        { freq: 118.2250, name: 'Tokyo Ground（第2ターミナル）', tag: 'GND', role: 'Ground', status: 'judging', sync: 29.7 },
        { freq: 119.1000, name: 'Tokyo Approach（主）', tag: 'APP', role: 'Approach・主', status: 'sync', sync: 98.9 },
        { freq: 126.0000, name: 'Tokyo Departure（西方面・主）', tag: 'DEP', role: 'Departure・主', status: 'sync', sync: 96.3 },
        { freq: 121.8250, name: 'Tokyo Delivery', tag: 'DEL', role: 'Clearance Delivery', status: 'sync', sync: 91.2 },
        { freq: 124.7500, name: 'Tokyo TCA', tag: 'TCA', role: 'Terminal Control Area', status: 'judging', sync: 15.8 },
        { freq: 128.8000, name: 'Tokyo ATIS（連続放送）', tag: 'ATIS', role: 'ATIS', status: 'sync', sync: 99.6, sticky: true }
      ]
    },
    {
      id: 'nrt', group: '空港', label: '成田 NRT（RJAA）',
      range: [117, 137], center: 123.2, span: 12.0, fs: '12.0 MS/s',
      mod: 'AM', stdMode: 'AM (エアバンド)', stepMode: '25', main: 118.2,
      note: 'NRT（成田国際）の公開周波数（AIP Japan 掲載値）を並べたデモです。実際の電波は受信していません。',
      src: '参照: AIP Japan RJAA / airbinder.jp / LiveATC feed index',
      liveatc: [{ icao: 'RJAA', label: 'RJAA Tower (Both) / Approach / Ground / ATIS' }],
      stations: [
        { freq: 118.2000, name: 'Narita Tower（RWY 16R/34L）', tag: 'TWR', role: 'Tower・主', status: 'talking', sync: 99.9, callTimer: 23 },
        { freq: 118.3500, name: 'Narita Tower（RWY 16L/34R）', tag: 'TWR', role: 'Tower', status: 'sync', sync: 97.9 },
        { freq: 121.9500, name: 'Narita Ground（RWY-A）', tag: 'GND', role: 'Ground・主', status: 'sync', sync: 96.6 },
        { freq: 121.8500, name: 'Narita Ground（RWY-B）', tag: 'GND', role: 'Ground', status: 'judging', sync: 34.2 },
        { freq: 124.4000, name: 'Tokyo Approach（成田）', tag: 'APP', role: 'Approach・主', status: 'sync', sync: 98.1 },
        { freq: 124.2000, name: 'Tokyo Departure（成田）', tag: 'DEP', role: 'Departure・主', status: 'sync', sync: 95.4 },
        { freq: 121.9000, name: 'Narita Delivery', tag: 'DEL', role: 'Clearance Delivery', status: 'sync', sync: 90.8 },
        { freq: 121.6000, name: 'Narita Ramp', tag: 'RAMP', role: 'Ramp Control', status: 'ended', sync: null },
        { freq: 128.2500, name: 'Narita ATIS（連続放送）', tag: 'ATIS', role: 'ATIS', status: 'sync', sync: 99.3, sticky: true }
      ]
    },
    {
      id: 'fuk', group: '空港', label: '福岡 FUK（RJFF）',
      range: [117, 137], center: 123.0, span: 12.0, fs: '12.0 MS/s',
      mod: 'AM', stdMode: 'AM (エアバンド)', stepMode: '25', main: 118.4,
      note: 'FUK（福岡）の公開周波数（AIP Japan 掲載値）を並べたデモです。実際の電波は受信していません。',
      src: '参照: AIP Japan RJFF / airbinder.jp / LiveATC feed index',
      liveatc: [{ icao: 'RJFF', label: 'RJFF Tower / Del+Gnd+TCA / Departure' }],
      stations: [
        { freq: 118.4000, name: 'Fukuoka Tower', tag: 'TWR', role: 'Tower・主', status: 'talking', sync: 99.9, callTimer: 21 },
        { freq: 118.2500, name: 'Fukuoka Tower（副）', tag: 'TWR', role: 'Tower', status: 'sync', sync: 95.9 },
        { freq: 121.7000, name: 'Fukuoka Ground', tag: 'GND', role: 'Ground', status: 'sync', sync: 97.7 },
        { freq: 121.8000, name: 'Fukuoka Ground（副）', tag: 'GND', role: 'Ground', status: 'judging', sync: 26.5 },
        { freq: 119.6500, name: 'Fukuoka Approach', tag: 'APP', role: 'Approach', status: 'sync', sync: 98.4 },
        { freq: 127.9000, name: 'Fukuoka Departure', tag: 'DEP', role: 'Departure', status: 'sync', sync: 94.1 },
        { freq: 121.9250, name: 'Fukuoka Delivery', tag: 'DEL', role: 'Clearance Delivery', status: 'sync', sync: 92.3 },
        { freq: 127.2000, name: 'Fukuoka ATIS（連続放送）', tag: 'ATIS', role: 'ATIS', status: 'sync', sync: 99.2, sticky: true },
        { freq: 121.2750, name: 'Fukuoka TCA', tag: 'TCA', role: 'Terminal Control Area', status: 'ended', sync: null }
      ]
    },
    {
      id: 'rcss', group: '海外', label: '台北松山 RCSS（LiveATC）',
      range: [117, 137], center: 122.0, span: 12.0, fs: '12.0 MS/s',
      mod: 'AM', stdMode: 'AM (エアバンド)', stepMode: '25', main: 118.1,
      note: '台北松山（RCSS）の周波数と、LiveATC.net の公開フィードで確認した周波数を並べています。音声は外部のLiveATCが配信する実音声です（アプリ内では受信しません）。台北桃園（RCTP）とソウル仁川（RKSI）は現在 LiveATC の公開フィードがありません。RCTP の進入管制 125.100 は RCSS のフィードで聴取できます。',
      src: '参照: LiveATC.net RCSS / 台北FIR公開周波数',
      liveatc: [{ icao: 'RCSS', label: 'RCSS Tower/App/Dep（Songshan Tower 118.100 ほか）' }],
      stations: [
        { freq: 118.1000, name: 'Songshan Tower', tag: 'TWR', role: 'Tower', status: 'talking', sync: 99.9, callTimer: 19 },
        { freq: 121.9000, name: 'Songshan Ground', tag: 'GND', role: 'Ground', status: 'sync', sync: 96.4 },
        { freq: 119.6000, name: 'Taipei Arrival/Departure', tag: 'APP', role: 'Taipei APP/DEP', status: 'sync', sync: 98.6 },
        { freq: 119.7000, name: 'Taipei Arrival/Departure', tag: 'DEP', role: 'Taipei APP/DEP', status: 'judging', sync: 32.3 },
        { freq: 125.1000, name: 'Taipei APP（RCTP 進入）', tag: 'APP', role: '桃園の進入管制', status: 'sync', sync: 94.7 },
        { freq: 125.5000, name: 'FIR Service（North Taiwan）', tag: 'CTR', role: 'FIR', status: 'judging', sync: 11.4 },
        { freq: 121.5000, name: 'Emergency / Guard', tag: 'EMG', role: '緊急・Guard', status: 'ended', sync: null }
      ]
    },
    {
      id: 'vhhh', group: '海外', label: '香港 VHHH（LiveATC）',
      range: [117, 137], center: 121.5, span: 12.0, fs: '12.0 MS/s',
      mod: 'AM', stdMode: 'AM (エアバンド)', stepMode: '25', main: 118.2,
      note: '香港国際（VHHH）の周波数を LiveATC.net の公開フィードから並べています。音声は外部のLiveATCが配信する実音声です（アプリ内では受信しません）。',
      src: '参照: LiveATC.net VHHH',
      liveatc: [{ icao: 'VHHH', label: 'VHHH Del/Gnd/Twr/Dir と App/Dep/Dir/Zone' }],
      stations: [
        { freq: 118.2000, name: 'Hong Kong Tower（North）', tag: 'TWR', role: 'Tower', status: 'talking', sync: 99.9, callTimer: 24 },
        { freq: 118.4000, name: 'Hong Kong Tower（South）', tag: 'TWR', role: 'Tower', status: 'sync', sync: 97.6 },
        { freq: 121.6000, name: 'Hong Kong Ground（North）', tag: 'GND', role: 'Ground', status: 'sync', sync: 95.2 },
        { freq: 122.1500, name: 'Hong Kong Delivery', tag: 'DEL', role: 'Clearance Delivery', status: 'sync', sync: 91.9 },
        { freq: 119.1000, name: 'Hong Kong Approach', tag: 'APP', role: 'Approach', status: 'sync', sync: 98.8 },
        { freq: 123.8000, name: 'Hong Kong Departure', tag: 'DEP', role: 'Departure', status: 'judging', sync: 28.4 },
        { freq: 119.5000, name: 'Hong Kong Director', tag: 'DIR', role: 'Director', status: 'sync', sync: 96.2 },
        { freq: 121.5000, name: 'Emergency / Guard', tag: 'EMG', role: '緊急・Guard', status: 'ended', sync: null }
      ]
    },
    {
      id: 'rpll', group: '海外', label: 'マニラ RPLL（LiveATC）',
      range: [117, 137], center: 121.0, span: 12.0, fs: '12.0 MS/s',
      mod: 'AM', stdMode: 'AM (エアバンド)', stepMode: '25', main: 118.1,
      note: 'マニラ（RPLL）の周波数を LiveATC.net の公開フィードから並べています。音声は外部のLiveATCが配信する実音声です（アプリ内では受信しません）。',
      src: '参照: LiveATC.net RPLL',
      liveatc: [{ icao: 'RPLL', label: 'RPLL Tower / Approach+Departure / Ground' }],
      stations: [
        { freq: 118.1000, name: 'Manila Tower', tag: 'TWR', role: 'Tower', status: 'talking', sync: 99.9, callTimer: 22 },
        { freq: 121.8000, name: 'Manila Ground', tag: 'GND', role: 'Ground', status: 'sync', sync: 96.9 },
        { freq: 119.9000, name: 'Manila Approach/Departure', tag: 'APP', role: 'Approach/Departure', status: 'sync', sync: 98.2 },
        { freq: 124.4000, name: 'Manila Approach/Departure', tag: 'DEP', role: 'Approach/Departure', status: 'judging', sync: 30.6 },
        { freq: 120.5000, name: 'Manila Center', tag: 'CTR', role: 'Control', status: 'sync', sync: 93.8 }
      ]
    }
  ];

  /* ── LiveATC 実在フィード（2026-11-21 実地確認・すべて Feed Status: UP） ──
   * マウント名は LiveATC.net の各空港ページ（myHTML5Popup('mount','icao')）から取得。
   * 公式プレーヤーは https://www.liveatc.net/hlisten.php?mount=<mount>&icao=<icao>。
   * 直接の <audio> 再生は、配信元がCloudflareの403/HTMLを返すため不可（実測）。
   */
  const LIVEATC = {
    kix: {
      icao: 'RJBB', name: '関西国際 KIX', feeds: [],
      note: 'KIX（関西国際）は LiveATC の公開フィードがありません。伊丹（RJOO Tower）や各地のフィードで関西圏の一部が聴けます。'
    },
    itm: {
      icao: 'RJOO', name: '大阪伊丹 ITM', feeds: [
        { mount: 'rjoo1', label: 'RJOO Tower', freqs: 'Osaka Tower 118.100' }
      ]
    },
    hnd: {
      icao: 'RJTT', name: '東京羽田 HND', feeds: [
        { mount: 'rjtt_twr', label: 'RJTT Twr/TCA', freqs: 'Tower 118.100・118.575・118.725・124.350 / TCA 124.750' },
        { mount: 'rjtt_app_dep', label: 'RJTT App/Dep', freqs: 'Approach 119.100・119.400 / Departure 120.800・126.000' },
        { mount: 'rjtt_gnd', label: 'RJTT Del/Ground', freqs: 'Delivery 121.825 / Ground 118.225・121.625・121.700・121.975' },
        { mount: 'rjtt_twr_tca', label: 'RJTT Del/Twr/TCA/Gnd', freqs: 'Tower・Ground・TCA・Delivery をまとめて' },
        { mount: 'rjtt_app', label: 'RJTT Approach', freqs: 'Approach 119.100・119.400・119.650' },
        { mount: 'rjtt_dep', label: 'RJTT Departure', freqs: 'Departure 120.800・126.000' },
        { mount: 'rjtt_atis', label: 'RJTT ATIS', freqs: 'ATIS 128.800（連続放送）' },
        { mount: 'rjtt_control', label: 'RJTT Tokyo Control', freqs: 'Control 120.500・123.700・125.900・128.125・132.100' }
      ]
    },
    nrt: {
      icao: 'RJAA', name: '成田 NRT', feeds: [
        { mount: 'rjaa_twr', label: 'RJAA Tower (Both)', freqs: 'Tower 118.200（16R/34L）・118.350（16L/34R）' },
        { mount: 'rjaa_twr1', label: 'RJAA Tower #1', freqs: 'Tower 118.200（Rwy 16R/34L）' },
        { mount: 'rjaa_twr2', label: 'RJAA Tower #2', freqs: 'Tower 118.350（Rwy 16L/34R）' },
        { mount: 'rjaa_app_s', label: 'RJAA Approach', freqs: 'Approach 124.400・127.700' },
        { mount: 'rjaa_dep', label: 'RJAA Departure', freqs: 'Departure 119.600・124.200' },
        { mount: 'rjaa_gnd1', label: 'RJAA Ground #1', freqs: 'Ground 121.850' },
        { mount: 'rjaa_gnd2', label: 'RJAA Ground #2', freqs: 'Ground 121.950' },
        { mount: 'rjaa_del', label: 'RJAA Clearance Delivery', freqs: 'Delivery 121.650（Asia/Pacific）・121.900（US/Europe）' },
        { mount: 'rjaa_atis', label: 'RJAA ATIS', freqs: 'ATIS 128.250（連続放送）' },
        { mount: 'rjaa_tca', label: 'RJAA TCA', freqs: 'TCA 119.450' }
      ]
    },
    fuk: {
      icao: 'RJFF', name: '福岡 FUK', feeds: [
        { mount: 'rjff3_twr', label: 'RJFF Tower', freqs: 'Tower 118.400・126.200' },
        { mount: 'rjff3_app1', label: 'RJFF App/Radar', freqs: 'Approach 119.650 / Radar 121.125' },
        { mount: 'rjff3_app2', label: 'RJFF Del/Gnd/TCA', freqs: 'Ground 121.700 / Delivery 121.925 / TCA 121.275' },
        { mount: 'rjff3_dep', label: 'RJFF Departure', freqs: 'Departure 127.900・119.700・128.450' },
        { mount: 'rjff3_ctl', label: 'RJFF Control (Misc)', freqs: 'Control 133.150・133.600・135.300 / Kobe Control 135.650・118.900・133.850' }
      ]
    },
    rcss: {
      icao: 'RCSS', name: '台北松山 RCSS', feeds: [
        { mount: 'rcss2', label: 'RCSS Tower/App/Dep', freqs: 'Tower 118.100 / Ground 121.900 / APP 119.600・119.700 / RCTP進入 125.100 / FIR 125.500' }
      ]
    },
    vhhh: {
      icao: 'VHHH', name: '香港 VHHH', feeds: [
        { mount: 'vhhh5', label: 'VHHH App/Dep/Dir/Zone', freqs: 'Approach 119.100・119.350 / Departure 122.000・123.800・124.050 / Director 119.500 / Zone 120.600' },
        { mount: 'vhhh9', label: 'VHHH Del/Gnd/Twr/Dir/Misc', freqs: 'Tower 118.200・118.400・118.700 / Ground 121.600・121.875・122.550 / Delivery 122.150' }
      ]
    },
    rpll: {
      icao: 'RPLL', name: 'マニラ RPLL', feeds: [
        { mount: 'rpll', label: 'RPLL Tower', freqs: 'Manila Tower 118.100' },
        { mount: 'rpll_app_119900', label: 'RPLL App/Dep 119.9', freqs: 'Approach/Departure 119.900' },
        { mount: 'rpll_app_124400', label: 'RPLL App/Dep 124.4', freqs: 'Approach/Departure 124.400' },
        { mount: 'rpll_app_124800', label: 'RPLL App/Dep 124.8', freqs: 'Approach/Departure 124.800' },
        { mount: 'rpll_gnd', label: 'RPLL Ground', freqs: 'Ground 121.800' },
        { mount: 'rpll_control_120500', label: 'Manila Center 120.5', freqs: 'Control 120.500' },
        { mount: 'rpll_ramp1', label: 'RPLL Ramp T3', freqs: 'Ramp/Taxi 121.550' },
        { mount: 'rpll_ramp_t4', label: 'RPLL Ramp T4', freqs: 'Ramp 123.250' },
        { mount: 'rpll_ramp2', label: 'RPLL Ramp/Taxi 121.7', freqs: 'Ramp/Taxi 121.700' }
      ]
    }
  };

  const LAT_PLAYER = (mount, icao) => `https://www.liveatc.net/hlisten.php?mount=${encodeURIComponent(mount)}&icao=${encodeURIComponent((icao || '').toLowerCase())}`;

  /* ── CHIRP-next 用 CSV（UV-K5 など）────────────────────
   * 列は CHIRP-next の汎用CSVドライバ（chirp/drivers/generic_csv.py の ATTR_MAP）と
   * 公式ストック設定CSVの書き出し形式に合わせています。
   * Duplex=off で送信無効（UV-K5 は 118–137MHz を送信できないため必須）。
   */
  const CHIRP_HEADER = ['Location', 'Name', 'Frequency', 'Duplex', 'Offset', 'Tone', 'rToneFreq', 'cToneFreq', 'DtcsCode', 'DtcsPolarity', 'RxDtcsCode', 'CrossMode', 'Mode', 'TStep', 'Skip', 'Power', 'Comment', 'URCALL', 'RPT1CALL', 'RPT2CALL', 'DVCODE'];
  const CHIRP_INFO = {
    kix: { code: 'KIX', mode: 'AM', step: '25.00' },
    itm: { code: 'ITM', mode: 'AM', step: '25.00' },
    hnd: { code: 'HND', mode: 'AM', step: '25.00' },
    nrt: { code: 'NRT', mode: 'AM', step: '25.00' },
    fuk: { code: 'FUK', mode: 'AM', step: '25.00' },
    nankai: { code: 'NK', mode: 'NFM', step: '12.50' },
    jr: { code: 'JR', mode: 'NFM', step: '12.50' }
  };
  const CHIRP_SET_IDS = ['kix', 'itm', 'hnd', 'nrt', 'fuk', 'nankai', 'jr'];

  const state = {
    stations: [],
    preset: 'std',
    presetObj: PRESETS[0],
    range: [250, 292],
    span: SPAN,
    fs: '2.048 MS/s',
    mod: 'TDMA',
    selectedId: null,
    tuned: 273.1125,
    center: 273.45,
    centerAuto: true,
    stepMode: 'auto',
    step: STEP_MAP.auto,
    filter: 'all',
    autoScan: true,
    autoFollow: true,
    rx: true,
    muted: false,
    volume: 35,
    recManual: false,
    recSeconds: 14,
    stdMode: 'auto',
    speed: 1,
    squelch: -49,
    audio: true,
    history: [],
    selectMode: false,
    checked: new Set(),
    level: -50,
    favFreqs: new Set(),
    unread: 0,
    source: 'demo',          // demo | sdr | ext
    wsUrl: 'ws://127.0.0.1:8765',
    latMute: true,           // LiveATCを開いたらデモ音をミュート
    latMuted: false,
    extDevice: ''
  };

  const isLive = () => state.source !== 'demo';
  const SRC_NAME = { demo: 'デモ', sdr: 'RTL-SDR', ext: '外部入力' };
  const SRC_BADGE = {
    demo: 'デモ表示・実電波は受信していません',
    sdr: 'RTL-SDR',
    ext: '外部受信機 マイク／ライン入力'
  };

  /* ── 局の生成 ─────────────────────────────────────────── */
  function makeSlots(status, callId, callSlot) {
    const slots = [
      { t: 'ctrl', label: '制御', body: status === 'judging' ? 'CAC 待機' : 'CAC 受信 OK 98%' },
      { t: 'idle', label: '空き', body: '—' },
      { t: 'idle', label: '空き', body: '—' },
      { t: 'idle', label: '空き', body: '—' }
    ];
    if (status === 'talking') {
      const i = callSlot != null ? callSlot : 1 + Math.floor(Math.random() * 3);
      slots[i] = { t: 'call', label: '通話', body: `呼出 [ID ${callId}]・再生中`, level: 34 };
      slots[0] = { t: 'ctrl', label: '制御', body: 'CAC 受信 OK 98%' };
    }
    return slots;
  }

  function makeStation(seed, i) {
    const talking = seed.status === 'talking';
    return {
      id: 'st' + i,
      freq: seed.freq,
      org: seed.org || seed.name,
      name: seed.name || ('組織名 ' + seed.org),
      tag: seed.tag || (seed.std || 'T79'),
      role: seed.role || null,
      sticky: !!seed.sticky,
      std: seed.std || 'T79',
      dir: seed.dir,
      cc: seed.cc,
      tg: seed.tg,
      status: seed.status,
      sync: seed.sync,
      slots: makeSlots(seed.status, seed.callId || 0, seed.callSlot),
      callTimer: seed.callTimer || 0,
      startedAt: Date.now() - (talking ? 14000 : 0),
      callId: seed.callId || 0,
      rescan: 20,
      baseSig: talking ? -38.2 : seed.status === 'sync' ? -51.6 : seed.status === 'judging' ? -78.4 : -96.5,
      baseSnr: talking ? 21.4 : seed.status === 'sync' ? 13.2 : seed.status === 'judging' ? 3.1 : 0.2,
      fav: false,
      seen: true
    };
  }

  /* プリセットを適用して局リストを作り直す */
  function applyPreset(id, opts = {}) {
    const preset = PRESETS.find((p) => p.id === id) || PRESETS[0];
    state.preset = preset.id;
    state.presetObj = preset;
    state.range = preset.range.slice();
    state.span = preset.span;
    state.fs = preset.fs;
    state.mod = preset.mod;
    state.stdMode = preset.stdMode;
    state.stepMode = preset.stepMode;
    state.step = STEP_MAP[preset.stepMode] || STEP_MAP.auto;
    state.filter = 'all';
    state.checked.clear();
    state.selectMode = false;
    state.recManual = false;
    state.recSeconds = 0;
    state.center = preset.center;
    state.centerAuto = true;
    state.stations = preset.stations.map(makeStation);
    const main = state.stations.find((s) => Math.abs(s.freq - preset.main) < 0.0001) || state.stations[0];
    state.selectedId = main ? main.id : null;
    state.tuned = main ? main.freq : preset.center;
    // 実音声の録音（履歴の url 付き）はプリセットを変えても残す
    const kept = state.history.filter((h) => h.url);
    state.history = kept.concat(seedHistory(preset)).slice(0, 60);

    syncPresetUI();
    if (!opts.silent) {
      renderStations();
      renderBulk();
      renderMonitor();
      updateDynamic();
      renderHistory();
      if (opts.announce) toast(`プリセット「${preset.label}」に切替（デモ表示）`);
    }
  }

  /* プリセットに依存する UI（選択・注記・LiveATCリンク・規格・ステップ）を揃える */
  function presNoteHtml(p) {
    if (state.source === 'sdr') {
      return `周波数リスト（${p.label}）。局を選ぶと Mac 側の RTL-SDR がその周波数に同調します。スペクトラム・音声は実受信です。<span class="src">RTL-SDR · WebSocket</span>`;
    }
    if (state.source === 'ext') {
      return `周波数リスト（${p.label}）。UV-K5 本体のダイヤルで合わせた周波数を選ぶと、その局名で履歴に残せます。音声は外部受信機のライン入力です。<span class="src">外部受信機 · マイク／ライン入力</span>`;
    }
    return `${p.note}${p.src ? `<span class="src">${p.src}／受信はシミュレーション</span>` : ''}`;
  }

  function syncPresetUI() {
    const p = state.presetObj;
    if (el.presetSelect) el.presetSelect.value = p.id;
    if (el.presetNote) el.presetNote.innerHTML = presNoteHtml(p);
    if (el.liveAtcBox) renderLiveAtc();
    if (el.chirpBtn) el.chirpBtn.hidden = !CHIRP_INFO[p.id];
    if (el.std) el.std.value = p.stdMode;
    if (el.step) el.step.value = p.stepMode;
    if (el.groupChip) el.groupChip.hidden = p.mod !== 'TDMA';
    $$('.chip').forEach((b) => {
      const on = b.dataset.filter === 'all';
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    if (el.autoScan) el.autoScan.checked = state.autoScan;
  }

  function renderLiveAtc() {
    if (!el.liveAtcBox) return;
    const p = state.presetObj;
    const info = LIVEATC[p.id];
    if (!info) { el.liveAtcBox.hidden = true; el.liveAtcBox.innerHTML = ''; return; }
    el.liveAtcBox.hidden = false;
    const head = `<div class="lat-head"><span class="lat-title">LiveATC 実音声（外部サイト）</span>` +
      `<a class="lat-all" href="https://www.liveatc.net/search/?icao=${info.icao}" target="_blank" rel="noopener noreferrer">${info.icao} の全フィード</a></div>`;
    const buttons = info.feeds.map((f) =>
      `<button class="btn liveatc" type="button" data-lat-mount="${f.mount}" data-lat-icao="${info.icao}" aria-label="LiveATCで${f.label}を聞く">` +
      `<span class="lat-lbl">▶ ${f.label}</span><span class="lat-freq">${f.freqs}</span></button>`
    ).join('');
    const openAttr = (typeof window !== 'undefined' && window.innerWidth >= 861) ? ' open' : '';
    el.liveAtcBox.innerHTML = head +
      `<details class="lat-details"${openAttr}>` +
      `<summary class="lat-summary">フィードを選ぶ（${info.feeds.length}）</summary>` +
      `<div class="lat-list">${buttons || `<p class="lat-none">${info.note}</p>`}</div>` +
      `</details>` +
      `<span class="liveatc-meta">公式プレーヤー（LiveATC.net）を別ウィンドウで開きます。開くとデモ音を自動でミュートし、閉じると元に戻します。<br>ブラウザ内での直接再生は配信元の403/CORS制限でできないため、この方式にしています。</span>`;
  }

  function seedHistory(preset) {
    const t = Date.now();
    if (!preset || preset.id === 'std') {
      return [
        { at: t - 1000 * 60 * 21, freq: 273.4125, org: 'F', kind: '通話', dur: 41, id: 4471 },
        { at: t - 1000 * 60 * 54, freq: 273.1125, org: 'A', kind: '通話', dur: 22, id: 1234 },
        { at: t - 1000 * 60 * 96, freq: 273.3125, org: 'E', kind: '録音', dur: 8, id: 0 }
      ];
    }
    return preset.stations
      .filter((s) => s.status !== 'ended')
      .slice(0, 3)
      .map((s, i) => ({
        at: t - 1000 * 60 * (9 + i * 23),
        freq: s.freq,
        org: s.name,
        kind: i === 0 ? '通話' : '録音',
        dur: 14 + i * 13,
        id: 1200 + i * 37
      }));
  }

  const selected = () => state.stations.find((s) => s.id === state.selectedId) || null;
  const stLabel = (st) => (st && st.role ? st.name : `[組織名 ${st ? st.org : '—'}]`);
  const talkingCount = () => (isLive() ? 0 : state.stations.filter((s) => s.status === 'talking' && s.seen).length);
  const STATUS_TEXT_AM = { talking: '受信中', sync: '待受け', judging: '探索中', ended: '圏外', idle: '待機' };
  function statusText(st) {
    if (state.mod === 'AM' && STATUS_TEXT_AM[st.status]) return STATUS_TEXT_AM[st.status];
    return STATUS_TEXT[st.status];
  }

  /* ── DOM ─────────────────────────────────────────────── */
  const el = {
    list: $('#stationList'),
    presetSelect: $('#presetSelect'),
    presetNote: $('#presetNote'),
    presetBadge: $('#presetBadge'),
    liveAtcBox: $('#liveAtcBox'),
    groupChip: $('.chip[data-filter="group"]'),
    autoScan: $('#autoScan'),
    autoFollow: $('#autoFollow'),
    kSignal: $('#kSignal'),
    kSnr: $('#kSnr'),
    kSync: $('#kSync'),
    kCodec: $('#kCodec'),
    uSignal: $('#uSignal'),
    uSnr: $('#uSnr'),
    uSync: $('#uSync'),
    uCodec: $('#uCodec'),
    levelHead: $('#levelHeadText'),
    count: $('#stationCount'),
    talking: $('#talkingCount'),
    freqInput: $('#freqInput'),
    step: $('#stepSelect'),
    std: $('#stdSelect'),
    monStd: $('#monStd'),
    monState: $('#monState'),
    recBtn: $('#recBtn'),
    recText: $('#recText'),
    bigFreq: $('#bigFreq'),
    monSub: $('#monSub'),
    mSignal: $('#mSignal'),
    mSnr: $('#mSnr'),
    mSync: $('#mSync'),
    mCodec: $('#mCodec'),
    slotTitle: $('#slotTitle'),
    slots: $('#slots'),
    levelFill: $('#levelFill'),
    levelThresh: $('#levelThresh'),
    levelText: $('#levelText'),
    spanInfo: $('#spanInfo'),
    favBtn: $('#favBtn'),
    rxToggle: $('#rxToggle'),
    muteBtn: $('#muteBtn'),
    muteIcon: $('#muteIcon'),
    vol: $('#volSlider'),
    toast: $('#toast'),
    bulkBar: $('#bulkBar'),
    bulkCount: $('#bulkCount'),
    selectMode: $('#selectModeBtn'),
    histBody: $('#histBody'),
    histEmpty: $('#histEmpty'),
    speedRange: $('#speedRange'),
    speedVal: $('#speedVal'),
    sqRange: $('#sqRange'),
    sqVal: $('#sqVal'),
    audioToggle: $('#audioToggle'),
    /* 受信ソース */
    sourceBtn: $('#sourceBtn'),
    srcDot: $('#srcDot'),
    srcName: $('#srcName'),
    sourceBadge: $('#sourceBadge'),
    chirpBtn: $('#chirpBtn'),
    wsUrl: $('#wsUrl'),
    wsConnectBtn: $('#wsConnectBtn'),
    wsDisconnectBtn: $('#wsDisconnectBtn'),
    wsGuideBtn: $('#wsGuideBtn'),
    wsStateVal: $('#wsStateVal'),
    wsDeviceVal: $('#wsDeviceVal'),
    wsTuneVal: $('#wsTuneVal'),
    wsFftVal: $('#wsFftVal'),
    wsPcmVal: $('#wsPcmVal'),
    wsLastVal: $('#wsLastVal'),
    sdrPanel: $('#sdrPanel'),
    extPanel: $('#extPanel'),
    extDevice: $('#extDevice'),
    extRefreshBtn: $('#extRefreshBtn'),
    extStartBtn: $('#extStartBtn'),
    extStopBtn: $('#extStopBtn'),
    extStateVal: $('#extStateVal'),
    extLevelVal: $('#extLevelVal'),
    extRateVal: $('#extRateVal'),
    extRecVal: $('#extRecVal'),
    extMonToggle: $('#extMonToggle'),
    extHowl: $('#extHowl'),
    setSourceVal: $('#setSourceVal'),
    setSourceBtn: $('#setSourceBtn'),
    chirpCurBtn: $('#chirpCurBtn'),
    chirpAllBtn: $('#chirpAllBtn'),
    latMuteToggle: $('#latMuteToggle'),
    specHint: $('.spec-hint')
  };

  /* ── トースト ─────────────────────────────────────────── */
  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2600);
  }

  /* ── 局一覧の描画 ─────────────────────────────────────── */
  function rowHtml(st) {
    const live = isLive();
    const selLive = st.id === state.selectedId;
    const badgeCls = live ? (selLive ? 'talking' : 'idle') : BADGE_CLASS[st.status];
    const badgeTxt = live
      ? (selLive ? (state.source === 'sdr' ? '同調' : '受信') : '—')
      : statusText(st);
    const st_cls = live ? (selLive ? 'orange' : 'gray') : st.status === 'talking' ? 'orange' : st.status === 'ended' ? 'gray' : '';
    const pct = live || st.status === 'ended' || st.sync == null ? '—' : st.sync.toFixed(1) + '%';
    const barW = live || st.status === 'ended' || st.sync == null ? 0 : clamp(st.sync, 0, 100);
    const slots = st.slots.map((s) => {
      const c = live ? 'dim' : s.t === 'call' ? 'call' : s.t === 'ctrl' ? 'on' : st.status === 'ended' ? 'dim' : '';
      return `<i class="${c}"></i>`;
    }).join('');
    const badge = `<span class="badge st-badge ${badgeCls}">${badgeTxt}</span>`;
    const sel = st.id === state.selectedId ? ' selected' : '';
    const kind = st.status === 'ended' ? ' ended' : '';
    const checked = state.checked.has(st.id) ? ' checked' : '';
    const selBox = state.selectMode ? `<span class="st-sel-box"></span>` : '';
    return `<div class="st${sel}${kind}${checked}" data-id="${st.id}" role="listitem" tabindex="0">
      <div class="st-row1">
        ${selBox}
        <span class="st-freq">${fmtHz(st.freq)}</span>
        ${badge}
        <span class="st-bar"><i class="${st_cls}" style="width:${barW}%"></i></span>
        <span class="st-pct">${pct}</span>
        <span class="st-slots">${slots}</span>
        <button class="st-star${st.fav ? ' on' : ''}" data-act="fav" type="button" aria-label="お気に入り" aria-pressed="${st.fav}">★</button>
      </div>
      <div class="st-row2"><span class="st-org">${st.name}</span><span class="st-std">・${st.tag}</span></div>
    </div>`;
  }

  function renderStations() {
    const total = state.stations.length;
    el.count.textContent = total;
    el.talking.textContent = talkingCount();

    let html = '';
    if (state.filter === 'talking') {
      const items = state.stations.filter((s) => s.status === 'talking');
      html = items.length ? items.map(rowHtml).join('') : `<p class="empty">通話中の局はありません。<br>受信を続けると自動で検出します。</p>`;
    } else if (state.filter === 'group') {
      const groups = [
        { id: 21, label: 'TG 21' },
        { id: 22, label: 'TG 22' },
        { id: 0, label: 'グループ未参加' }
      ];
      groups.forEach((g) => {
        const items = state.stations.filter((s) => (g.id ? s.tg === g.id : !s.tg));
        if (!items.length) return;
        html += `<div class="grp-head"><span class="grp-name">${g.label}</span><span class="grp-count">${items.length}局</span></div>`;
        html += items.map(rowHtml).join('');
      });
    } else {
      html = state.stations.map(rowHtml).join('');
    }
    el.list.innerHTML = html;
  }

  function paintSelection() {
    $$('.st', el.list).forEach((row) => {
      row.classList.toggle('selected', row.dataset.id === state.selectedId);
    });
  }

  function updateRow(st) {
    if (isLive()) { renderStations(); return; }
    if (state.filter !== 'all') { renderStations(); return; }
    const row = el.list.querySelector(`.st[data-id="${st.id}"]`);
    if (!row) { renderStations(); return; }
    row.classList.toggle('ended', st.status === 'ended');
    const badge = row.querySelector('.st-badge');
    if (badge) {
      badge.className = 'badge st-badge ' + BADGE_CLASS[st.status];
      badge.textContent = statusText(st);
    }
    const bar = row.querySelector('.st-bar i');
    if (bar) {
      bar.className = st.status === 'talking' ? 'orange' : st.status === 'ended' ? 'gray' : '';
      bar.style.width = (st.status === 'ended' || st.sync == null) ? '0%' : clamp(st.sync, 0, 100) + '%';
    }
    const pct = row.querySelector('.st-pct');
    if (pct) pct.textContent = (st.status === 'ended' || st.sync == null) ? '—' : st.sync.toFixed(1) + '%';
    const slots = row.querySelector('.st-slots');
    if (slots) {
      slots.innerHTML = st.slots.map((s) => {
        const c = s.t === 'call' ? 'call' : s.t === 'ctrl' ? 'on' : st.status === 'ended' ? 'dim' : '';
        return `<i class="${c}"></i>`;
      }).join('');
    }
    el.count.textContent = state.stations.length;
    el.talking.textContent = talkingCount();
  }

  function renderBulk() {
    el.bulkBar.hidden = !state.selectMode;
    el.bulkCount.textContent = state.checked.size;
    el.selectMode.setAttribute('aria-pressed', String(state.selectMode));
    el.selectMode.textContent = state.selectMode ? '完了' : '選択';
  }

  /* ── モニター描画 ─────────────────────────────────────── */
  function stdLabel(st) {
    if (state.source === 'sdr') return `RTL-SDR（${sdr.mode === 'am' ? 'AM' : 'FM'}·Mac側で復調）`;
    if (state.source === 'ext') return '外部受信機（復調は受信機側）';
    if (state.stdMode === 'AM (エアバンド)') return 'AM（エアバンド）';
    if (state.stdMode === 'アナログFM') return 'アナログFM（12.5k）';
    if (state.stdMode !== 'auto') return `${state.stdMode}（強制）`;
    return `STD-${st ? st.std : 'T79'}（自動判定）`;
  }
  function codecLabel(st) {
    if (state.stdMode === 'AM (エアバンド)') return 'AM';
    if (state.stdMode === 'アナログFM') return '12.5';
    const mode = state.stdMode !== 'auto' ? state.stdMode : `STD-${st ? st.std : 'T79'}`;
    return CODECS[mode] || 'AMBE+ 4000';
  }

  /* AM（エアバンド）用の受信状態パネル（TDMAスロットの代わり） */
  function amSlots(st) {
    const on = !!(st && st.status === 'talking' && state.rx);
    const weak = !!(st && st.status === 'sync' && state.rx);
    const cells = [
      { k: '搬送波', s: on ? '検出' : weak ? '微弱' : 'なし', b: on ? '安定 / AGC 動作中' : weak ? 'ノイズ内' : 'ノイズのみ', cls: on ? 'open' : weak ? 'ctrl' : 'empty' },
      { k: 'スケルチ', s: on ? 'OPEN' : 'CLOSE', b: on ? '音声を出力' : '閾値以下で閉', cls: on ? 'open' : 'empty' },
      { k: '変調', s: 'AM', b: on ? '変調度 30%' : '無変調', cls: on ? 'open' : 'ctrl' },
      { k: '音声', s: on ? '復調中' : '無音', b: on ? 'AM 復調 → 出力' : '待受け', cls: on ? 'open' : 'empty' }
    ];
    return cells.map((c) =>
      `<div class="slot am ${c.cls}"><div class="slot-top"><span class="slot-id">${c.k}</span><span class="badge ${c.cls === 'open' ? 'talking' : 'judging'}">${c.s}</span></div><div class="slot-body">${c.b}</div></div>`
    ).join('');
  }

  function liveSlots() {
    const sdrSrc = state.source === 'sdr';
    const ready = sdrSrc ? sdr.status === 'open' : !!ext.stream;
    const open = ready && (sdrSrc ? sdr.squelchOpen && state.rx : ext.level > state.squelch && state.rx);
    const cells = [
      { k: '入力', s: ready ? 'あり' : 'なし', b: sdrSrc ? (ready ? `${(sdr.signalDbfs == null ? -120 : sdr.signalDbfs).toFixed(1)} dBFS` : 'bridge.py 未接続') : (ready ? `${ext.level.toFixed(1)} dBFS` : 'マイク停止中'), cls: ready ? 'ctrl' : 'empty' },
      { k: 'スケルチ', s: open ? 'OPEN' : 'CLOSE', b: open ? '音声を出力' : `閾値 ${state.squelch.toFixed(1)} dBFS`, cls: open ? 'open' : 'empty' },
      { k: '変調', s: sdrSrc ? (sdr.mode === 'am' ? 'AM' : 'FM') : '音声', b: sdrSrc ? 'AM/FMはMac側で復調' : '外部受信機の復調音声', cls: ready ? 'ctrl' : 'empty' },
      { k: '音声', s: open ? '出力中' : '無音', b: state.muted ? 'ミュート中' : `音量 ${state.volume}%`, cls: open ? 'open' : 'empty' }
    ];
    return cells.map((c) =>
      `<div class="slot am ${c.cls}"><div class="slot-top"><span class="slot-id">${c.k}</span><span class="badge ${c.cls === 'open' ? 'talking' : 'judging'}">${c.s}</span></div><div class="slot-body">${c.b}</div></div>`
    ).join('');
  }

  /* 規格に応じた計測ラベル（AM / FM / TDMA） */
  function applyMetricLabels() {
    if (!el.kSync) return;
    if (state.source === 'sdr') {
      el.kSignal.textContent = '信号';
      el.kSnr.textContent = 'SNR';
      el.kSync.textContent = 'FFT更新';
      el.kCodec.textContent = '復調';
      el.uSignal.textContent = 'dBFS';
      el.uSnr.textContent = 'dB';
      el.uSync.textContent = 'Hz';
      el.uCodec.textContent = '';
      if (el.levelHead) el.levelHead.textContent = '入力レベル（スケルチ判定）';
      return;
    }
    if (state.source === 'ext') {
      el.kSignal.textContent = '入力';
      el.kSnr.textContent = 'ピーク';
      el.kSync.textContent = '帯域';
      el.kCodec.textContent = 'サンプル';
      el.uSignal.textContent = 'dBFS';
      el.uSnr.textContent = 'dBFS';
      el.uSync.textContent = 'kHz';
      el.uCodec.textContent = 'kHz';
      if (el.levelHead) el.levelHead.textContent = '入力レベル（スケルチ判定）';
      return;
    }
    const am = state.stdMode === 'AM (エアバンド)';
    const fm = state.stdMode === 'アナログFM';
    el.kSignal.textContent = '信号';
    el.kSnr.textContent = 'SNR';
    el.kSync.textContent = am ? '変調度' : fm ? '復調' : '同期率';
    el.uSignal.textContent = 'dB';
    el.uSnr.textContent = 'dB';
    el.uSync.textContent = am ? '%' : '';
    el.kCodec.textContent = am ? '復調' : fm ? '帯域' : '符号器';
    el.uCodec.textContent = fm ? 'kHz' : '';
    if (el.levelHead) el.levelHead.textContent = am ? '搬送波レベル（スケルチ判定）' : '音声レベル（区切り判定）';
  }

  function slotHtml(s, i) {
    if (s.t === 'call') {
      return `<div class="slot call"><div class="slot-top"><span class="slot-id">TS${i}</span><span class="badge talking">通話</span></div><div class="slot-body">${s.body}</div><div class="slot-meter"><i style="width:${s.level || 30}%"></i></div></div>`;
    }
    if (s.t === 'ctrl') {
      return `<div class="slot ctrl"><div class="slot-top"><span class="slot-id">TS${i}</span><span class="badge sync">制御</span></div><div class="slot-body">${s.body}</div></div>`;
    }
    return `<div class="slot empty"><div class="slot-top"><span class="slot-id">TS${i}</span><span class="badge judging">空き</span></div><div class="slot-body">—</div></div>`;
  }

  function renderMonitor() {
    const st = selected();
    if (!isLive()) state.tuned = st ? st.freq : state.tuned;

    el.monStd.textContent = stdLabel(st);
    updateSourceBadge();

    let badgeState, badgeText;
    if (!state.rx) { badgeState = 'off'; badgeText = '停止中'; }
    else if (state.source === 'sdr') {
      badgeState = sdr.status === 'open' ? (sdr.squelchOpen ? 'talking' : 'sync') : 'off';
      badgeText = sdr.status === 'open' ? (sdr.squelchOpen ? '受信中' : '待受け') : '未接続';
    } else if (state.source === 'ext') {
      badgeState = ext.stream ? (ext.level > state.squelch ? 'talking' : 'sync') : 'off';
      badgeText = ext.stream ? (ext.level > state.squelch ? '受信中' : '待受け') : '入力停止';
    } else {
      badgeState = st ? st.status : 'idle';
      badgeText = st ? statusText(st) : STATUS_TEXT[badgeState];
    }
    el.monState.className = 'badge ' + (badgeState === 'off' ? 'off' : BADGE_CLASS[badgeState]);
    el.monState.textContent = badgeText;

    el.bigFreq.textContent = fmtHz(shownFreq());
    el.monSub.textContent = monSubText(st);

    applyMetricLabels();
    el.mCodec.textContent = state.source === 'sdr' ? (sdr.mode === 'am' ? 'AM' : 'FM')
      : state.source === 'ext' ? (ext.rate ? (ext.rate / 1000).toFixed(1) : '—')
      : st ? codecLabel(st) : '—';

    // slots（AM（エアバンド）は受信状態表示に切替）
    const am = (state.stdMode === 'AM (エアバンド)');
    const analog = (state.stdMode === 'アナログFM');
    if (isLive()) {
      el.slotTitle.textContent = state.source === 'sdr'
        ? `実機受信状態（${sdr.mode === 'am' ? 'AM' : 'FM'}・Mac側で復調）`
        : '入力状態（外部受信機の復調音声）';
      el.slots.innerHTML = liveSlots();
    } else if (am) {
      el.slotTitle.textContent = 'AM 受信状態（エアバンド）';
      el.slots.innerHTML = amSlots(st);
    } else if (analog) {
      el.slotTitle.textContent = 'スロット（アナログ）';
      const lvl = st && st.status === 'talking' ? 42 : 6;
      el.slots.innerHTML = `<div class="slot analog"><div class="slot-top"><span class="slot-id">FM</span><span class="badge sync">アナログ</span></div><div class="slot-body">音声復調中・スロット分割なし</div><div class="slot-meter"><i style="width:${lvl}%"></i></div></div>`;
    } else {
      el.slotTitle.textContent = 'スロット（TDMA 4スロット）';
      if (st) {
        el.slots.innerHTML = st.slots.map(slotHtml).join('');
      } else {
        el.slots.innerHTML = [0, 1, 2, 3].map((i) => `<div class="slot empty"><div class="slot-top"><span class="slot-id">TS${i}</span><span class="badge judging">空き</span></div><div class="slot-body">—</div></div>`).join('');
      }
    }

    el.favBtn.classList.toggle('on', isFav(st));
    el.favBtn.setAttribute('aria-pressed', String(isFav(st)));

    if (document.activeElement !== el.freqInput) el.freqInput.value = fmtHz(state.tuned);
    renderSpanInfo();
  }

  function renderSpanInfo() {
    if (state.source === 'sdr') {
      const c = sdr.centerHz ? sdr.centerHz / 1e6 : state.center;
      const sp = sdr.spanHz ? sdr.spanHz / 1e6 : state.span;
      el.spanInfo.textContent = `${(c - sp / 2).toFixed(3)} - ${(c + sp / 2).toFixed(3)} MHz・中心 ${c.toFixed(4)}（${sdr.status === 'open' ? '実機' : '未接続'}）・${sdr.displayRate ? (sdr.displayRate / 1e6).toFixed(2) + ' MS/s' : '—'}`;
      return;
    }
    if (state.source === 'ext') {
      el.spanInfo.textContent = `オーディオ入力 0 - ${ext.rate ? (ext.rate / 2000).toFixed(1) : '—'} kHz・${ext.rate ? (ext.rate / 1000).toFixed(1) + ' kS/s' : '—'}`;
      return;
    }
    const lo = state.center - state.span / 2;
    const hi = state.center + state.span / 2;
    el.spanInfo.textContent = `${lo.toFixed(3)} - ${hi.toFixed(3)} MHz・中心 ${state.center.toFixed(4)}（${state.centerAuto ? '自動' : '手動'}）・${state.fs}`;
  }

  function isFav(st) {
    if (st) return st.fav;
    return state.favFreqs.has(fmtHz(state.tuned));
  }

  /* ── 動的更新 ─────────────────────────────────────────── */
  function metricsFor(st) {
    if (!st || !state.rx) {
      if (!state.rx) return { sig: -112.4, snr: 0, sync: 0 };
      return { sig: -96.4 + rand(-1, 1), snr: 0.2 + rand(-.1, .1), sync: 0 };
    }
    const j = () => rand(-.9, .9);
    switch (st.status) {
      case 'talking': return { sig: st.baseSig + j(), snr: st.baseSnr + j(), sync: st.sync + rand(-.05, .05) };
      case 'sync':    return { sig: st.baseSig + rand(-2.4, 2.4), snr: st.baseSnr + rand(-1.4, 1.4), sync: st.sync + rand(-.06, .06) };
      case 'judging': return { sig: st.baseSig + rand(-4, 4), snr: st.baseSnr + rand(-1, 1), sync: st.sync };
      default:        return { sig: st.baseSig + rand(-1.5, 1.5), snr: 0.2, sync: 0 };
    }
  }

  let levelPhase = 0;
  function updateDynamic() {
    if (isLive()) { updateLiveDynamic(); return; }
    const st = selected();
    const m = metricsFor(st);
    el.mSignal.textContent = m.sig.toFixed(1);
    el.mSnr.textContent = m.snr.toFixed(1);
    if (state.stdMode === 'アナログFM') {
      el.mSync.textContent = 'FM';
    } else if (state.stdMode === 'AM (エアバンド)') {
      const depth = st && st.status === 'talking' && state.rx ? 26 + Math.abs(Math.sin(levelPhase * 0.6)) * 9 : 0;
      el.mSync.textContent = depth.toFixed(0);
    } else {
      el.mSync.textContent = st && st.sync != null ? m.sync.toFixed(1) : '—';
    }

    // 音声レベル（区切り判定）
    let target;
    if (!state.rx) target = -78;
    else if (!st) target = -76;
    else if (st.status === 'talking') target = -44 + Math.sin(levelPhase) * 6 + rand(-3.5, 3.5);
    else if (st.status === 'sync') target = -68 + rand(-2, 2);
    else target = -75 + rand(-2, 2);
    levelPhase += 0.55;
    state.level = state.level * 0.55 + target * 0.45;
    const pct = clamp((state.level + 80) / 60 * 100, 0, 100);
    el.levelFill.style.width = pct.toFixed(1) + '%';
    el.levelThresh.style.left = clamp((state.squelch + 80) / 60 * 100, 0, 100) + '%';
    el.levelText.textContent = `床 -58.0 / 閾値 ${state.squelch.toFixed(1)} dBFS`;

    // 通話スロットのメーター
    $$('.slot.call .slot-meter i', el.slots).forEach((bar) => {
      const w = 22 + Math.abs(Math.sin(levelPhase * 0.9)) * 62 + rand(-6, 6);
      bar.style.width = clamp(w, 8, 96).toFixed(0) + '%';
    });
    $$('.slot.analog .slot-meter i', el.slots).forEach((bar) => {
      bar.style.width = clamp(pct * 0.9, 4, 96).toFixed(0) + '%';
    });

    // 一覧の同期率
    state.stations.forEach((s) => {
      const row = el.list.querySelector(`.st[data-id="${s.id}"]`);
      if (!row) return;
      const p = row.querySelector('.st-pct');
      const bar = row.querySelector('.st-bar i');
      if (s.status === 'ended' || s.sync == null) { p.textContent = '—'; bar.style.width = '0%'; return; }
      p.textContent = s.sync.toFixed(1) + '%';
      bar.style.width = clamp(s.sync, 0, 100) + '%';
      bar.className = s.status === 'talking' ? 'orange' : s.status === 'ended' ? 'gray' : '';
    });

    // 録音カウンター
    updateRecUI();
    audio.tick();
  }

  let liveKey = '';
  function updateLiveDynamic() {
    const sdrSrc = state.source === 'sdr';

    // 外部受信機: アナライザーから入力レベル（RMS / ピーク）を求める
    if (!sdrSrc && ext.analyser) {
      const td = ext.time || (ext.time = new Float32Array(ext.analyser.fftSize));
      ext.analyser.getFloatTimeDomainData(td);
      let sum = 0, pk = 0;
      for (let i = 0; i < td.length; i++) {
        const v = td[i];
        sum += v * v;
        const a = Math.abs(v);
        if (a > pk) pk = a;
      }
      const rms = Math.sqrt(sum / td.length);
      ext.level = rms > 1e-6 ? Math.max(-120, 20 * Math.log10(rms)) : -120;
      ext.peak = pk > 1e-6 ? Math.max(-120, 20 * Math.log10(pk)) : -120;
    }

    const ready = sdrSrc ? sdr.status === 'open' : !!ext.stream;
    const open = ready && state.rx && (sdrSrc ? sdr.squelchOpen : ext.level > state.squelch);

    if (sdrSrc) {
      el.mSignal.textContent = sdr.signalDbfs == null ? '—' : sdr.signalDbfs.toFixed(1);
      el.mSnr.textContent = sdr.snrDb == null ? '—' : sdr.snrDb.toFixed(1);
      el.mSync.textContent = sdr.fftHz ? sdr.fftHz.toFixed(0) : '—';
    } else {
      el.mSignal.textContent = ext.level > -120 ? ext.level.toFixed(1) : '—';
      el.mSnr.textContent = ext.peak > -120 ? ext.peak.toFixed(1) : '—';
      el.mSync.textContent = ext.rate ? (ext.rate / 2000).toFixed(1) : '—';
    }

    if (el.extLevelVal) {
      el.extLevelVal.textContent = ext.level > -100 ? `${ext.level.toFixed(1)} dBFS` : '—';
    }
    if (el.extRateVal && ext.rate) el.extRateVal.textContent = `${(ext.rate / 1000).toFixed(1)} kHz`;

    const raw = sdrSrc ? (sdr.signalDbfs == null ? -100 : sdr.signalDbfs) : ext.level;
    const target = state.rx && ready ? raw : -100;
    state.level = state.level * 0.6 + target * 0.4;
    const pct = clamp((state.level + 80) / 60 * 100, 0, 100);
    el.levelFill.style.width = (ready ? pct : 0).toFixed(1) + '%';
    el.levelThresh.style.left = clamp((state.squelch + 80) / 60 * 100, 0, 100) + '%';
    el.levelText.textContent = ready
      ? `${sdrSrc ? '入力' : '床'} ${state.level.toFixed(1)} / 閾値 ${state.squelch.toFixed(1)} dBFS`
      : `未接続 / 閾値 ${state.squelch.toFixed(1)} dBFS`;

    const key = [ready, open, state.muted, state.volume, state.squelch, sdrSrc ? sdr.mode : '', ext.monitor, state.rx].join('|');
    if (key !== liveKey) { liveKey = key; renderMonitor(); }

    updateRecUI();
    audio.tick();
  }

  function updateRecUI() {
    if (isLive()) {
      const rec = !!ext.rec;
      const secs = rec ? Math.round((Date.now() - ext.recStart) / 1000) : 0;
      el.recBtn.classList.toggle('live', rec);
      el.recBtn.classList.remove('manual');
      el.recText.textContent = rec ? `録音中 ${pad2(secs / 60)}:${pad2(secs % 60)}` : '録音';
      if (el.extRecVal) el.extRecVal.textContent = rec ? `録音中 ${pad2(secs / 60)}:${pad2(secs % 60)}` : '—';
      return;
    }
    const st = selected();
    const live = state.rx && ((st && st.status === 'talking') || state.recManual);
    el.recBtn.classList.toggle('live', !!live);
    el.recBtn.classList.toggle('manual', state.recManual);
    el.recText.textContent = live
      ? `録音中 ${pad2(state.recSeconds / 60)}:${pad2(state.recSeconds % 60)}`
      : '待機 00:00';
  }

  /* ── シミュレーション ─────────────────────────────────── */
  function touchStation(st) {
    // 1局の状態変化を局一覧とモニターへ反映（行は差分更新）
    updateRow(st);
    if (st && st.id === state.selectedId) renderMonitor();
  }

  function startCall(st, opts = {}) {
    if (!state.rx) return;
    st.status = 'talking';
    st.sync = clamp(st.sync || rand(92, 99), 92, 100);
    st.baseSig = -rand(36, 41);
    st.baseSnr = rand(18, 24);
    st.callId = opts.id || Math.floor(rand(1000, 9999));
    if (!st.cc || st.cc === '—') st.cc = 1 + Math.floor(Math.random() * 15);
    st.callTimer = Math.round(rand(11, 27));
    st.startedAt = Date.now();
    st.slots = makeSlots('sync');
    st.slots[2] = { t: 'call', label: '通話', body: `${opts.mine ? '送信' : '呼出'} [ID ${st.callId}]・再生中`, level: 30 };   // TS2 に通話

    if (state.autoFollow) {
      const prev = state.selectedId;
      selectStation(st.id, { silent: true });
      if (prev !== st.id) toast(`通話開始 → ${fmtHz(st.freq)} ${stLabel(st)} へ自動切替`);
    } else {
      touchStation(st);
    }
    if (st.id === state.selectedId) {
      state.recSeconds = 0;
      audio.beep();
    }
    if (state.audio && st.id === state.selectedId) audio.init();
  }

  function endCall(st) {
    const dur = Math.max(1, Math.round((Date.now() - (st.startedAt || Date.now())) / 1000));
    state.history.unshift({
      at: Date.now(), freq: st.freq, org: st.org, kind: '通話', dur, id: st.callId
    });
    if (state.history.length > 60) state.history.pop();
    st.status = 'sync';
    st.sync = rand(96.5, 100);
    st.slots = makeSlots('sync');
    st.callTimer = 0;
    st.baseSig = -rand(48, 55);
    st.baseSnr = rand(11, 15);
    if (st.id === state.selectedId) { state.recSeconds = 0; }
    touchStation(st);
  }

  function simTick() {
    if (!state.rx || isLive()) return;
    state.stations.forEach((st) => {
      if (st.sticky) return;   // ATIS など連続放送は状態を保つ
      if (st.status === 'talking') {
        st.callTimer -= 1;
        if (st.callTimer <= 0) { endCall(st); return; }
        if (Math.random() < 0.3) {
          st.slots = st.slots.map((s) => s.t === 'call' ? { ...s, body: `呼出 [ID ${st.callId}]・${Math.random() < 0.82 ? '再生中' : '受信中'}` } : s);
        }
      } else if (st.status === 'sync') {
        if (Math.random() < 0.018) startCall(st);
      } else if (st.status === 'judging') {
        st.sync = Math.min(99.6, st.sync + rand(1.2, 6.5));
        if (st.sync > 60) {
          st.status = 'sync';
          st.sync = rand(97, 100);
          st.baseSig = -rand(48, 55);
          st.baseSnr = rand(11, 15);
          st.slots = makeSlots('sync');
          toast(`同期確立: ${fmtHz(st.freq)} ${stLabel(st)}`);
          touchStation(st);
        }
      } else if (st.status === 'ended' && state.autoScan) {
        st.rescan -= 1;
        if (st.rescan <= 0) {
          st.status = 'judging';
          st.sync = rand(5, 14);
          st.rescan = Math.round(rand(26, 46));
          toast(`自動探索: ${fmtHz(st.freq)} を再スキャン中`);
          touchStation(st);
        }
      }
    });
  }

  /* ── 選択・チューニング ───────────────────────────────── */
  function selectStation(id, opts = {}) {
    const st = state.stations.find((s) => s.id === id);
    if (!st) return;
    if (state.selectMode && !opts.silent) {
      toggleChecked(id);
      return;
    }
    state.selectedId = id;
    state.tuned = st.freq;
    // 帯域外なら追従
    const lo = state.center - state.span / 2, hi = state.center + state.span / 2;
    if (st.freq < lo + 0.08 || st.freq > hi - 0.08) { state.center = st.freq; state.centerAuto = true; }
    if (st.status !== 'talking') state.recSeconds = 0;
    paintSelection();
    renderMonitor();
    if (!opts.silent) audio.init();
    if (state.source === 'sdr') sdrTune('select');
    if (state.source === 'ext' && !opts.silent) toast(`外部受信機モード：UV-K5本体を ${fmtHz(st.freq)} MHz に合わせてください`);
  }

  function tuneTo(freq, opts = {}) {
    if (state.source === 'ext') {
      if (opts.announce) toast('外部受信機モードでは、UV-K5本体のダイヤルで周波数を合わせてください');
      return;
    }
    freq = clamp(Math.round(freq * 10000) / 10000, state.range[0], state.range[1]);
    const near = state.stations.reduce((best, s) => {
      const d = Math.abs(s.freq - freq);
      return (!best || d < best.d) && d <= Math.max(state.step, 0.00625) / 2 + 0.0001 ? { s, d } : best;
    }, null);
    if (near && near.s.seen) {
      selectStation(near.s.id);
      return;
    }
    // 未登録周波数
    state.selectedId = null;
    state.tuned = freq;
    if (freq < state.center - state.span / 2 || freq > state.center + state.span / 2) { state.center = freq; state.centerAuto = true; }
    paintSelection();
    renderMonitor();
    if (state.source === 'sdr') sdrTune('freq');
    if (opts.announce) toast(`${fmtHz(freq)} MHz：未登録周波数（ノイズのみ）`);
  }

  function toggleChecked(id) {
    if (state.checked.has(id)) state.checked.delete(id); else state.checked.add(id);
    renderStations();
    renderBulk();
  }

  /* ── 録音・お気に入り ─────────────────────────────────── */
  function toggleFav() {
    const st = selected();
    if (st) {
      st.fav = !st.fav;
      updateRow(st);
      const star = el.list.querySelector(`.st[data-id="${st.id}"] [data-act="fav"]`);
      if (star) { star.classList.toggle('on', st.fav); star.setAttribute('aria-pressed', String(st.fav)); }
      renderMonitor();
      toast(st.fav ? `★ ${fmtHz(st.freq)} を登録しました` : `★ ${fmtHz(st.freq)} の登録を解除`);
    } else {
      const k = fmtHz(state.tuned);
      if (state.favFreqs.has(k)) state.favFreqs.delete(k); else state.favFreqs.add(k);
      renderMonitor();
      toast(state.favFreqs.has(k) ? `★ ${k} を登録しました` : `★ ${k} の登録を解除`);
    }
  }

  function toggleRec() {
    if (isLive()) {
      if (ext.rec) { try { ext.rec.stop(); } catch (e) { /* noop */ } }
      else startRealRec();
      return;
    }
    const st = selected();
    if (!state.recManual) {
      state.recManual = true;
      state.recSeconds = 0;
      toast(`手動録音を開始（${st ? fmtHz(st.freq) : fmtHz(state.tuned)} MHz）`);
    } else {
      const dur = state.recSeconds;
      state.recManual = false;
      if (dur > 0) {
        state.history.unshift({ at: Date.now(), freq: state.tuned, org: st ? st.org : '—', kind: '録音', dur, id: st ? st.callId : 0 });
        toast(`録音を保存（${pad2(dur / 60)}:${pad2(dur % 60)}・デモ）`);
      }
    }
    updateRecUI();
  }

  /* ── 受信停止 ─────────────────────────────────────────── */
  function setRx(on) {
    state.rx = on;
    el.rxToggle.textContent = on ? '停止' : '受信開始';
    el.rxToggle.classList.toggle('is-off', !on);
    el.rxToggle.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('rx-off', !on);
    if (state.source === 'sdr') sdrPause(!on);
    if (ext.gain && ext.ctx) ext.gain.gain.setTargetAtTime(extMonitorGain(), ext.ctx.currentTime, 0.08);
    liveKey = '';
    renderMonitor();
    updateDynamic();
    toast(on ? '受信を再開しました' : '受信を停止しました（音声出力を止めます）');
  }

  /* ── スペクトラム ─────────────────────────────────────── */
  const canvas = $('#spectrum');
  const ctx = canvas.getContext('2d');
  let CW = 0, CH = 0, DPR = 1;
  let dragging = false, dragStartX = 0, dragStartCenter = 0, dragMoved = false;
  let hoverX = -1;
  const AXIS_H = 30;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    CW = rect.width; CH = rect.height;
    canvas.width = Math.round(CW * DPR);
    canvas.height = Math.round(CH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  const fToX = (f) => (f - (state.center - state.span / 2)) / state.span * CW;
  const xToF = (x) => state.center - state.span / 2 + (x / CW) * state.span;

  function noiseAt(i, t) {
    return 0.055
      + 0.022 * Math.sin(i * 0.043 + t * 0.9)
      + 0.016 * Math.sin(i * 0.121 - t * 1.7 + 1.2)
      + 0.012 * Math.sin(i * 0.011 + t * 0.45)
      + 0.008 * Math.sin(i * 0.41 + t * 3.1);
  }

  function drawSpectrum(t) {
    if (!CW) { resizeCanvas(); if (!CW) return; }
    const plotTop = 8;
    const plotBottom = CH - AXIS_H;
    const plotH = Math.max(40, plotBottom - plotTop);

    ctx.clearRect(0, 0, CW, CH);

    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, '#070d14');
    bg.addColorStop(1, '#050a10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);

    // グリッド
    ctx.strokeStyle = 'rgba(120,160,205,.055)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = plotTop + plotH * i / 4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
    }

    if (state.source === 'sdr') { drawSdrSpectrum(plotTop, plotBottom, plotH, t); return; }
    if (state.source === 'ext') { drawExtSpectrum(plotTop, plotBottom, plotH, t); return; }

    // 波形の生成
    const stepPx = 2;
    const pts = [];
    const visible = state.stations.filter((s) => s.freq > state.center - state.span / 2 - state.span * 0.01 && s.freq < state.center + state.span / 2 + state.span * 0.01);
    for (let x = 0; x <= CW; x += stepPx) {
      let v = noiseAt(x * 0.5, t);
      for (const s of visible) {
        const dx = x - fToX(s.freq);
        if (Math.abs(dx) > 70) continue;
        let amp = s.status === 'talking' ? 0.52 : s.status === 'sync' ? 0.27 : s.status === 'judging' ? 0.2 : 0.075;
        if (!state.rx) amp *= 0.18; else if (s.status === 'talking') amp += Math.sin(t * 2.4 + s.freq) * 0.05;
        if (s.id === state.selectedId) amp *= 1.12;
        const sigma = s.status === 'talking' ? 7.5 : 5.2;
        v += amp * Math.exp(-(dx * dx) / (2 * sigma * sigma));
        v += amp * 0.42 * Math.exp(-(dx * dx) / (2 * 1.2 * 1.2));
        // 側波
        v += amp * 0.1 * Math.exp(-((dx - 12) * (dx - 12)) / 18);
        v += amp * 0.1 * Math.exp(-((dx + 12) * (dx + 12)) / 18);
      }
      pts.push([x, v]);
    }
    // 平滑化
    for (let k = 1; k < pts.length - 1; k++) {
      pts[k][1] = (pts[k - 1][1] + pts[k][1] * 2 + pts[k + 1][1]) / 4;
    }

    const yFor = (v) => plotBottom - clamp(v, 0, 1.05) * plotH * 0.94;

    // 塗り
    const grad = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
    grad.addColorStop(0, 'rgba(86,158,235,.30)');
    grad.addColorStop(.55, 'rgba(70,135,210,.16)');
    grad.addColorStop(1, 'rgba(60,120,190,.02)');
    ctx.beginPath();
    ctx.moveTo(pts[0][0], plotBottom);
    for (const [x, v] of pts) ctx.lineTo(x, yFor(v));
    ctx.lineTo(CW, plotBottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 線
    ctx.beginPath();
    pts.forEach(([x, v], i) => { if (i === 0) ctx.moveTo(x, yFor(v)); else ctx.lineTo(x, yFor(v)); });
    ctx.strokeStyle = 'rgba(150,196,240,.92)';
    ctx.lineWidth = 1.1;
    ctx.shadowColor = 'rgba(90,160,240,.55)';
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 選択周波数のハイライト
    const selF = selected() ? selected().freq : state.tuned;
    const sx = fToX(selF);
    if (sx > -20 && sx < CW + 20) {
      const bandW = 26;
      const bgrad = ctx.createLinearGradient(sx - bandW, 0, sx + bandW, 0);
      bgrad.addColorStop(0, 'rgba(47,129,247,0)');
      bgrad.addColorStop(.5, 'rgba(60,140,250,.17)');
      bgrad.addColorStop(1, 'rgba(47,129,247,0)');
      ctx.fillStyle = bgrad;
      ctx.fillRect(sx - bandW, plotTop, bandW * 2, plotH);
      ctx.strokeStyle = 'rgba(120,190,255,.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + .5, plotTop);
      ctx.lineTo(sx + .5, plotBottom);
      ctx.stroke();
      // マーカー（下向きの三角）
      ctx.fillStyle = '#bfe0ff';
      ctx.beginPath();
      ctx.moveTo(sx, plotTop + 5);
      ctx.lineTo(sx - 3.6, plotTop - 1);
      ctx.lineTo(sx + 3.6, plotTop - 1);
      ctx.closePath();
      ctx.fill();
    }

    // 中心の破線
    const cx = fToX(state.center);
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(110,145,185,.28)';
    ctx.beginPath(); ctx.moveTo(cx, plotTop); ctx.lineTo(cx, plotBottom); ctx.stroke();
    ctx.restore();

    // ホバー
    if (hoverX >= 0 && hoverX <= CW) {
      ctx.strokeStyle = 'rgba(210,230,255,.18)';
      ctx.beginPath(); ctx.moveTo(hoverX, plotTop); ctx.lineTo(hoverX, plotBottom); ctx.stroke();
    }

    // 軸
    ctx.strokeStyle = 'rgba(120,150,185,.18)';
    ctx.beginPath(); ctx.moveTo(0, plotBottom + .5); ctx.lineTo(CW, plotBottom + .5); ctx.stroke();

    const lo = state.center - state.span / 2, hi = state.center + state.span / 2;
    ctx.font = '9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = '#5f7085';
    ctx.textAlign = 'center';
    const tickStep = state.span <= 0.5 ? 0.05 : state.span <= 1 ? 0.1 : state.span <= 2.5 ? 0.4 : state.span <= 6 ? 1 : 2;
    for (let f = Math.ceil(lo / tickStep) * tickStep; f < hi; f += tickStep) {
      const x = fToX(f);
      if (x < 16 || x > CW - 16) continue;
      if (Math.abs(x - cx) < 22) continue;   // 中心ラベルとの重なりを避ける
      ctx.fillRect(x - .5, plotBottom + 1, 1, 3);
      ctx.fillText(tickStep < 0.1 ? f.toFixed(2) : f.toFixed(1), x, plotBottom + 22);
    }
    // 中心ラベル
    if (cx > 26 && cx < CW - 26) {
      ctx.fillStyle = '#9db0c6';
      ctx.fillText(state.center.toFixed(2), cx, plotBottom + 22);
    }

    // 状態ドット
    for (const s of visible) {
      const x = fToX(s.freq);
      if (x < 4 || x > CW - 4) continue;
      const y = plotBottom + 9;
      const color = s.status === 'talking' ? '#f5a524' : s.status === 'sync' ? '#3b82f6' : s.status === 'judging' ? '#8a97a8' : '#46536a';
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      if (s.id === state.selectedId) {
        ctx.strokeStyle = 'rgba(245,165,36,.85)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, 5.4, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  function drawIdleMessage(title, sub) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7f93ab';
    ctx.font = '600 12px -apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif';
    ctx.fillText(title, CW / 2, CH / 2 - 6);
    ctx.fillStyle = '#4f6076';
    ctx.font = '10px -apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif';
    ctx.fillText(sub, CW / 2, CH / 2 + 12);
  }

  function strokeSpectrum(pts, plotTop, plotBottom, plotH) {
    const grad = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
    grad.addColorStop(0, 'rgba(86,158,235,.30)');
    grad.addColorStop(.55, 'rgba(70,135,210,.16)');
    grad.addColorStop(1, 'rgba(60,120,190,.02)');
    ctx.beginPath();
    ctx.moveTo(pts[0][0], plotBottom);
    for (const [x, v] of pts) ctx.lineTo(x, v);
    ctx.lineTo(CW, plotBottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.strokeStyle = 'rgba(150,196,240,.92)';
    ctx.lineWidth = 1.1;
    ctx.shadowColor = 'rgba(90,160,240,.55)';
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function markTuned(plotTop, plotBottom, plotH, freqMHz, centerMHz, spanMHz, label) {
    const sx = (freqMHz - (centerMHz - spanMHz / 2)) / spanMHz * CW;
    if (!(sx > -20 && sx < CW + 20)) return;
    const bandW = 26;
    const bgrad = ctx.createLinearGradient(sx - bandW, 0, sx + bandW, 0);
    bgrad.addColorStop(0, 'rgba(47,129,247,0)');
    bgrad.addColorStop(.5, 'rgba(60,140,250,.17)');
    bgrad.addColorStop(1, 'rgba(47,129,247,0)');
    ctx.fillStyle = bgrad;
    ctx.fillRect(sx - bandW, plotTop, bandW * 2, plotH);
    ctx.strokeStyle = 'rgba(120,190,255,.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + .5, plotTop);
    ctx.lineTo(sx + .5, plotBottom);
    ctx.stroke();
    ctx.fillStyle = '#bfe0ff';
    ctx.beginPath();
    ctx.moveTo(sx, plotTop + 5);
    ctx.lineTo(sx - 3.6, plotTop - 1);
    ctx.lineTo(sx + 3.6, plotTop - 1);
    ctx.closePath();
    ctx.fill();
    if (label) {
      ctx.font = '9px ui-monospace,SFMono-Regular,Menlo,monospace';
      ctx.fillStyle = '#9dc6ff';
      ctx.textAlign = sx > CW - 60 ? 'right' : 'left';
      ctx.fillText(label, Math.min(CW - 4, Math.max(4, sx + 7)), plotTop + 12);
    }
  }

  /* 実機FFT（Mac側 bridge.py から受信した dB 配列） */
  function drawSdrSpectrum(plotTop, plotBottom, plotH, t) {
    const bins = sdr.fft;
    if (!bins || !bins.length) {
      drawIdleMessage(
        sdr.status === 'open' ? 'FFTデータ待ち…' : 'RTL-SDR 未接続',
        sdr.status === 'open' ? 'Mac 側 bridge.py からのデータを待っています' : '受信ソース → 接続ガイド で bridge.py を起動'
      );
      return;
    }
    const floor = sdr.dbFloor == null ? -120 : sdr.dbFloor;
    const ceil = sdr.dbCeil == null ? -20 : sdr.dbCeil;
    const n = bins.length;
    const yFor = (db) => plotBottom - clamp((db - floor) / (ceil - floor), 0, 1) * plotH * 0.94;
    const pts = [];
    for (let x = 0; x <= CW; x += 2) {
      const i = clamp(Math.round(x / CW * (n - 1)), 0, n - 1);
      pts.push([x, yFor(bins[i])]);
    }
    strokeSpectrum(pts, plotTop, plotBottom, plotH);

    const centerMHz = (sdr.centerHz ? sdr.centerHz : state.center * 1e6) / 1e6;
    const spanMHz = (sdr.spanHz ? sdr.spanHz : state.span * 1e6) / 1e6;
    drawMHzAxis(plotBottom, centerMHz, spanMHz);

    // 中心の破線
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(110,145,185,.28)';
    ctx.beginPath(); ctx.moveTo(CW / 2, plotTop); ctx.lineTo(CW / 2, plotBottom); ctx.stroke();
    ctx.restore();

    // 選択周波数（実機の同調点）
    markTuned(plotTop, plotBottom, plotH, shownFreq(), centerMHz, spanMHz, 'TX/RX');

    // 左下の小さな表示
    ctx.font = '9px ui-monospace,SFMono-Regular,Menlo,monospace';
    ctx.fillStyle = '#6f8cab';
    ctx.textAlign = 'left';
    ctx.fillText(`RTL-SDR ${sdr.mode === 'am' ? 'AM' : 'FM'}  ${fmtMHz(shownFreq())} MHz`, 6, plotTop + 12);
  }

  function drawMHzAxis(plotBottom, centerMHz, spanMHz) {
    const lo = centerMHz - spanMHz / 2, hi = centerMHz + spanMHz / 2;
    ctx.font = '9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = '#5f7085';
    ctx.textAlign = 'center';
    const tickStep = spanMHz <= 0.5 ? 0.05 : spanMHz <= 1 ? 0.1 : spanMHz <= 2.5 ? 0.4 : spanMHz <= 6 ? 1 : 2;
    for (let f = Math.ceil(lo / tickStep) * tickStep; f < hi; f += tickStep) {
      const x = (f - lo) / spanMHz * CW;
      if (x < 16 || x > CW - 16) continue;
      if (Math.abs(x - CW / 2) < 22) continue;
      ctx.fillRect(x - .5, plotBottom + 1, 1, 3);
      ctx.fillText(tickStep < 0.1 ? f.toFixed(2) : f.toFixed(1), x, plotBottom + 22);
    }
    if (CW / 2 > 26 && CW / 2 < CW - 26) {
      ctx.fillStyle = '#9db0c6';
      ctx.fillText(centerMHz.toFixed(2), CW / 2, plotBottom + 22);
    }
  }

  /* 外部受信機（マイク／ライン入力）のリアルタイム表示 */
  function drawExtSpectrum(plotTop, plotBottom, plotH, t) {
    if (!ext.analyser) {
      drawIdleMessage(
        ext.stream ? '入力レベルの取得中…' : '外部受信機 入力停止',
        ext.stream ? 'まもなく表示します' : '受信ソース → 外部受信機 → 入力を開始'
      );
      return;
    }
    const n = ext.analyser.frequencyBinCount;
    const data = ext.freq || (ext.freq = new Uint8Array(n));
    ext.analyser.getByteFrequencyData(data);
    const nyq = ext.rate ? ext.rate / 2 : 24000;
    const maxHz = Math.min(8000, nyq);
    const used = Math.max(2, Math.round(maxHz / nyq * n));

    const pts = [];
    for (let i = 0; i < used; i++) {
      const x = i / (used - 1) * CW;
      const v = Math.pow(data[i] / 255, 1.2);
      pts.push([x, plotBottom - clamp(v, 0, 1) * plotH * 0.9]);
    }
    // 平滑化
    for (let k = 1; k < pts.length - 1; k++) pts[k][1] = (pts[k - 1][1] + pts[k][1] * 2 + pts[k + 1][1]) / 4;
    strokeSpectrum(pts, plotTop, plotBottom, plotH);

    // 波形（上段の細いストリップ）
    const td = ext.time || (ext.time = new Float32Array(ext.analyser.fftSize));
    ext.analyser.getFloatTimeDomainData(td);
    const mid = plotTop + 16;
    ctx.beginPath();
    for (let i = 0; i < td.length; i += 2) {
      const x = i / (td.length - 1) * CW;
      const y = mid - clamp(td[i], -1, 1) * 13;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(120,215,255,.7)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // kHz 軸
    ctx.font = '9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = '#5f7085';
    ctx.textAlign = 'center';
    for (let khz = 0; khz <= maxHz / 1000; khz += 1) {
      const x = khz * 1000 / maxHz * CW;
      if (x < 14 || x > CW - 14) continue;
      ctx.fillRect(x - .5, plotBottom + 1, 1, 3);
      ctx.fillText(String(khz), x, plotBottom + 22);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6f8cab';
    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`AUDIO IN  ${(ext.rate / 1000).toFixed(1)} kS/s  ${state.level.toFixed(1)} dBFS`, 6, plotBottom + 22);
    ctx.textAlign = 'right';
    ctx.fillText('kHz', CW - 6, plotBottom + 22);
  }

  let raf = 0;
  function loop(ts) {
    drawSpectrum(ts / 1000);
    raf = requestAnimationFrame(loop);
  }

  /* ── 音声デモ ─────────────────────────────────────────── */
  const audio = {
    ctx: null, master: null, voice: null, rumble: null, ready: false,
    live: { node: null, gain: null, dest: null, recStream: null, ring: null, wp: 0, rp: 0, rate: 24000 },
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const ac = new AC();
        const master = ac.createGain();
        master.gain.value = this.gainValue();
        master.connect(ac.destination);

        /* 通話音: サイン波を重ねた柔らかいトーン（ホワイトノイズは使わない） */
        const voice = ac.createGain(); voice.gain.value = 0;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 820; lp.Q.value = 0.5;
        [[196, 0.55], [294, 0.22], [392, 0.11]].forEach(([f, g]) => {
          const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = rand(-4, 4);
          const og = ac.createGain(); og.gain.value = g;
          o.connect(og); og.connect(lp); o.start();
        });
        /* ゆっくりした抑揚で話し声風に（正弦なので耳に刺さらない） */
        const amp = ac.createGain(); amp.gain.value = 0.7;
        const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 2.2;
        const lfoGain = ac.createGain(); lfoGain.gain.value = 0.28;
        lfo.connect(lfoGain); lfoGain.connect(amp.gain); lfo.start();
        lp.connect(amp); amp.connect(voice); voice.connect(master);

        /* ごく小さい低域（通話中の自然さのためだけ） */
        const rumble = ac.createOscillator(); rumble.type = 'sine'; rumble.frequency.value = 98;
        const rlp = ac.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 150;
        const rg = ac.createGain(); rg.gain.value = 0;
        rumble.connect(rlp); rlp.connect(rg); rg.connect(master); rumble.start();

        this.ctx = ac; this.master = master; this.voice = voice; this.rumble = rg; this.ready = true;
      } catch (e) { /* 音声が使えない環境では無音で動作 */ }
    },
    gainValue() {
      if (!state.audio || state.latMuted) return 0;
      return state.muted ? 0 : (state.volume / 100) * 0.38;
    },
    apply() {
      if (!this.ctx) return;
      const v = this.gainValue();
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    },
    liveGainValue() {
      if (state.muted) return 0;
      return (state.volume / 100) * 0.85;
    },
    applyLive() {
      if (!this.ctx || !this.live.gain) return;
      this.live.gain.gain.setTargetAtTime(this.liveGainValue(), this.ctx.currentTime, 0.05);
    },
    /* 実機PCM（Int16LE モノラル）をリングバッファに積み、ScriptProcessorで再生 */
    ensureLive(rate) {
      if (!this.ctx) this.init();
      if (!this.ctx) return false;
      if (this.live.node) return true;
      const ac = this.ctx;
      const r = rate && rate > 8000 ? rate : 24000;
      this.live.rate = r;
      const n = Math.max(8192, Math.round(r * 2));
      this.live.ring = new Float32Array(n);
      this.live.wp = 0; this.live.rp = 0;
      const node = ac.createScriptProcessor ? ac.createScriptProcessor(2048, 1, 1) : ac.createJavaScriptNode(2048, 1, 1);
      node.onaudioprocess = (e) => {
        const out = e.outputBuffer.getChannelData(0);
        const L = this.live;
        const N = L.ring.length;
        const ratio = L.rate / ac.sampleRate;
        let avail = (L.wp - L.rp + N) % N;
        for (let i = 0; i < out.length; i++) {
          if (avail <= 1) { out[i] = 0; continue; }
          const i0 = Math.floor(L.rp) % N;
          const i1 = (i0 + 1) % N;
          const f = L.rp - Math.floor(L.rp);
          out[i] = L.ring[i0] * (1 - f) + L.ring[i1] * f;
          L.rp = (L.rp + ratio) % N;
          avail -= ratio;
        }
      };
      const g = ac.createGain();
      g.gain.value = this.liveGainValue();
      let dest = null;
      try { dest = ac.createMediaStreamDestination ? ac.createMediaStreamDestination() : null; } catch (err) { dest = null; }
      node.connect(g);
      g.connect(ac.destination);
      if (dest) g.connect(dest);
      this.live.node = node; this.live.gain = g; this.live.dest = dest;
      this.live.recStream = dest ? dest.stream : null;
      return true;
    },
    pushPcm(int16, rate) {
      if (!this.ensureLive(rate)) return;
      const L = this.live;
      const N = L.ring.length;
      for (let i = 0; i < int16.length; i++) {
        L.ring[L.wp] = int16[i] / 32768;
        L.wp = (L.wp + 1) % N;
        if (L.wp === Math.floor(L.rp) % N) L.rp = (L.rp + 1) % N;
      }
    },
    tick() {
      if (!this.ready || !this.ctx) return;
      if (isLive()) {
        this.voice.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
        this.rumble.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        return;
      }
      const st = selected();
      const gate = state.rx && state.audio && !state.muted;
      const talking = st && st.status === 'talking';
      const above = state.level > state.squelch;
      const on = gate && talking && above;
      const target = on ? 0.055 + 0.018 * (0.5 + 0.5 * Math.sin(levelPhase * 0.9)) : 0;
      this.voice.gain.setTargetAtTime(target, this.ctx.currentTime, 0.09);
      this.rumble.gain.setTargetAtTime(on ? 0.006 : 0, this.ctx.currentTime, 0.14);
    },
    beep() {
      if (!this.ready || !this.ctx || !state.audio || state.muted) return;
      const ac = this.ctx, t0 = ac.currentTime;
      [0, .16].forEach((off) => {
        const o = ac.createOscillator(); const g = ac.createGain();
        o.type = 'sine'; o.frequency.value = 784;
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.linearRampToValueAtTime(0.04, t0 + off + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.14);
        o.connect(g); g.connect(this.master);
        o.start(t0 + off); o.stop(t0 + off + 0.16);
      });
    }
  };

  /* ── 実機音声（外部受信機・RTL-SDR）の共有状態 ─────────── */
  const sdr = {
    url: state.wsUrl, ws: null, status: 'idle',
    hello: null, fft: null, fftHz: 0, fftCount: 0, lastFftAt: 0, lastMsgAt: 0,
    freqHz: null, mode: 'am', spanHz: null, centerHz: null, displayRate: null,
    signalDbfs: null, snrDb: null, squelchOpen: false, sampleRate: 24000,
    dbFloor: -120, dbCeil: -20, pcmCount: 0, pcmRate: 0, pcmTotal: 0, lastTune: null
  };

  const ext = {
    stream: null, ctx: null, src: null, analyser: null, gain: null,
    monitor: false, level: -120, peak: -120, rate: 0, label: '',
    freq: null, time: null, rec: null, chunks: [], mime: '', recStart: 0
  };

  const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* 音声入力の技術的なラベルは表示しない（MediaStreamAudioDestinationNode 等） */
  function cleanLabel(s) {
    if (!s) return '';
    if (/MediaStream|WebAudio|AudioDestination|Fake|Default Audio Input|Unknown/i.test(s)) return '';
    return String(s).slice(0, 40);
  }

  function shownFreq() {
    if (state.source === 'sdr' && sdr.freqHz) return sdr.freqHz / 1e6;
    return state.tuned;
  }

  function monSubText(st) {
    if (state.source === 'sdr') {
      const dev = (sdr.hello && sdr.hello.device) || 'RTL-SDR';
      const md = sdr.mode === 'am' ? 'AM' : 'FM';
      const sp = sdr.spanHz ? `・${(sdr.spanHz / 1e6).toFixed(3)} MHz` : '';
      return `${dev}・${md}${sp}・${sdrHost()}`;
    }
    if (state.source === 'ext') {
      return `${ext.label || '音声入力'}・${ext.rate ? (ext.rate / 1000).toFixed(1) + ' kHz' : '—'}・${ext.monitor ? 'モニタリングON' : 'モニタリングOFF'}・周波数はUV-K5本体で同調`;
    }
    return st
      ? (st.role ? `${st.name}・${st.role}`
        : state.stdMode === 'アナログFM' ? `[組織名 ${st.org}]・${st.dir || ''}`
        : `[組織名 ${st.org}]・${st.dir}・CC ${st.cc}`)
      : '未登録周波数・ノイズのみ';
  }

  /* ── 受信ソース ───────────────────────────────────────── */
  function updateSourceBadge() {
    if (!el.sourceBadge) return;
    let text = SRC_BADGE.demo;
    let cls = 'badge demo';
    if (state.source === 'sdr') {
      cls = 'badge ' + (sdr.status === 'open' ? 'live' : 'off');
      text = sdr.status === 'open'
        ? `RTL-SDR 接続中・${sdrHost()}${sdr.hello && sdr.hello.device ? '・' + sdr.hello.device : ''}`
        : sdr.status === 'connecting' ? 'RTL-SDR 接続中…'
        : 'RTL-SDR 未接続（bridge.py を起動してください）';
    } else if (state.source === 'ext') {
      cls = 'badge ' + (ext.stream ? 'live' : 'off');
      text = ext.stream ? `外部受信機 入力中・${ext.label || '既定の入力'}` : '外部受信機 停止（「入力を開始」）';
    }
    el.sourceBadge.className = cls;
    el.sourceBadge.textContent = text;
  }

  function updateSourceUI() {
    if (el.srcName) el.srcName.textContent = SRC_NAME[state.source];
    if (el.presetBadge) {
      el.presetBadge.textContent = state.source === 'demo' ? 'デモ表示' : state.source === 'sdr' ? 'RTL-SDR' : '外部入力';
      el.presetBadge.className = 'badge ' + (state.source === 'demo' ? 'demo' : 'live');
    }
    if (el.presetNote && state.presetObj) el.presetNote.innerHTML = presNoteHtml(state.presetObj);
    if (el.srcDot) {
      const cls = state.source === 'demo' ? 'demo'
        : state.source === 'sdr' ? (sdr.status === 'open' ? 'sdr' : sdr.status === 'connecting' ? 'sdr warn' : 'sdr err')
        : (ext.stream ? 'ext' : 'ext off');
      el.srcDot.className = 'src-dot ' + cls;
    }
    if (el.setSourceVal) el.setSourceVal.textContent = SRC_NAME[state.source];
    document.body.dataset.source = state.source;
    updateSourcePanels();
    updateSourceBadge();
    if (el.specHint) {
      el.specHint.textContent = state.source === 'sdr'
        ? 'クリックで実機を同調・ドラッグで表示帯域移動'
        : state.source === 'ext' ? 'UV-K5本体のダイヤルで周波数を合わせてください'
        : 'ドラッグで帯域を移動・クリックで聴く・ホイールで1ステップ';
    }
  }

  function updateSourcePanels() {
    if (el.sdrPanel) el.sdrPanel.hidden = state.source !== 'sdr';
    if (el.extPanel) el.extPanel.hidden = state.source !== 'ext';
    $$('.src-opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.source === state.source)));
    const setState = (src, txt, cls) => {
      const s = document.querySelector(`.src-state[data-state="${src}"]`);
      if (s) { s.textContent = txt; s.className = 'src-state' + (cls ? ' ' + cls : ''); }
    };
    setState('demo', state.source === 'demo' ? '使用中' : '—', state.source === 'demo' ? 'on' : '');
    setState('sdr',
      sdr.status === 'open' ? '接続中' : sdr.status === 'connecting' ? '接続中…' : sdr.status === 'error' ? 'エラー' : '未接続',
      sdr.status === 'open' ? 'on' : sdr.status === 'error' ? 'err' : '');
    setState('ext', ext.stream ? '入力中' : '停止', ext.stream ? 'on' : '');
  }

  function setSource(src, opts = {}) {
    if (!['demo', 'sdr', 'ext'].includes(src)) return;
    if (src === state.source && !opts.force) { openModal('sourceModal'); return; }
    if (state.source === 'ext' && src !== 'ext') extStop(true);
    if (state.source === 'sdr' && src !== 'sdr') sdrDisconnect(true);
    state.source = src;
    liveKey = '';
    if (src === 'demo') applyPreset(state.preset, { silent: true });
    else {
      // 実機モードではデモの架空履歴を出さない（録音は残す）
      const kept = state.history.filter((h) => h.url);
      if (kept.length !== state.history.length) { state.history = kept; renderHistory(); }
    }
    updateSourceUI();
    renderStations();
    renderMonitor();
    updateDynamic();
    if (src === 'sdr') {
      if (el.wsUrl) el.wsUrl.value = sdr.url;
      sdrConnect();
      if (!opts.silent) toast('Mac RTL-SDR 接続モードに切り替えました');
    } else if (src === 'ext') {
      extListDevices();
      extStart();
      if (!opts.silent) toast('外部受信機モードに切り替えました（マイク入力を許可してください）');
    } else if (!opts.silent) {
      toast('デモ表示に戻りました');
      closeModals();
    }
    savePrefs();
  }

  /* ── Mac RTL-SDR（WebSocket）─────────────────────────── */
  function sdrHost() {
    try { return new URL(sdr.url).host; } catch (e) { return sdr.url; }
  }

  function sdrSetStatus(st) {
    sdr.status = st;
    const map = { idle: '未接続', connecting: '接続中…', open: '接続済み', closed: '切断', error: '接続エラー' };
    if (el.wsStateVal) {
      el.wsStateVal.textContent = map[st] || st;
      el.wsStateVal.style.color = st === 'open' ? '#8ff0c4' : st === 'error' ? '#f6a3a3' : '';
    }
    if (st !== 'open') {
      sdr.fft = null; sdr.signalDbfs = null; sdr.squelchOpen = false;
    }
    updateSourceUI();
    liveKey = '';
    renderMonitor();
  }

  function sdrSetUrl(v) {
    const url = String(v || '').trim();
    if (!/^wss?:\/\/[\w.:\-\[\]\/]+$/i.test(url)) { toast('ws:// または wss:// で始まるURLを入力してください'); return false; }
    sdr.url = url; state.wsUrl = url; savePrefs();
    return true;
  }

  function sdrConnect() {
    if (el.wsUrl && !sdrSetUrl(el.wsUrl.value)) return;
    if (sdr.ws && (sdr.ws.readyState === 0 || sdr.ws.readyState === 1)) {
      if (sdr.ws.readyState === 1) sdrTune('reconnect');
      return;
    }
    sdrSetStatus('connecting');
    let ws;
    try { ws = new WebSocket(sdr.url); } catch (e) { sdrSetStatus('error'); toast('WebSocket URL が不正です'); return; }
    sdr.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      sdrSetStatus('open');
      sdrTune('open');
      audio.init();
      toast(`RTL-SDR に接続しました（${sdrHost()}）`);
    };
    ws.onerror = () => {
      if (sdr.status !== 'open') {
        sdrSetStatus('error');
        toast('接続できません。Mac で start_airscope_sdr.sh が動いているか確認してください');
      }
    };
    ws.onclose = () => {
      const wasOpen = sdr.status === 'open';
      sdr.ws = null;
      if (sdr.status !== 'idle') sdrSetStatus(wasOpen ? 'closed' : 'error');
    };
    ws.onmessage = (ev) => sdrOnMessage(ev.data);
  }

  function sdrDisconnect(silent) {
    if (sdr.ws) { try { sdr.ws.close(); } catch (e) { /* noop */ } sdr.ws = null; }
    sdr.hello = null; sdr.fft = null; sdr.signalDbfs = null; sdr.squelchOpen = false; sdr.freqHz = null;
    sdrSetStatus('idle');
    if (!silent) toast('RTL-SDR から切断しました');
  }

  function sdrOnMessage(data) {
    sdr.lastMsgAt = Date.now();
    if (typeof data === 'string') {
      let msg;
      try { msg = JSON.parse(data); } catch (e) { return; }
      sdrHandleJson(msg);
      return;
    }
    if (data instanceof ArrayBuffer && data.byteLength >= 2) {
      const even = data.byteLength - (data.byteLength % 2);
      audio.pushPcm(new Int16Array(data, 0, even / 2), sdr.sampleRate);
      sdr.pcmCount += even;
      sdr.pcmTotal += even;
    }
  }

  function sdrHandleJson(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'hello':
        sdr.hello = msg;
        if (msg.sample_rate) sdr.sampleRate = msg.sample_rate;
        if (msg.span_hz) { sdr.spanHz = msg.span_hz; state.span = msg.span_hz / 1e6; }
        if (msg.display_rate) sdr.displayRate = msg.display_rate;
        if (el.wsDeviceVal) el.wsDeviceVal.textContent = msg.device || msg.name || 'RTL-SDR';
        break;
      case 'fft': {
        const db = msg.db || msg.bins || msg.data;
        if (!db || !db.length) return;
        sdr.fft = db;
        sdr.fftCount += 1;
        sdr.lastFftAt = Date.now();
        if (msg.span_hz) { sdr.spanHz = msg.span_hz; state.span = msg.span_hz / 1e6; }
        if (msg.center_hz) { sdr.centerHz = msg.center_hz; state.center = msg.center_hz / 1e6; state.centerAuto = true; }
        if (typeof msg.db_floor === 'number') sdr.dbFloor = msg.db_floor;
        if (typeof msg.db_ceil === 'number') sdr.dbCeil = msg.db_ceil;
        renderSpanInfo();
        break;
      }
      case 'status':
        if (msg.freq_hz) sdr.freqHz = msg.freq_hz;
        if (msg.mode) sdr.mode = msg.mode === 'am' ? 'am' : 'fm';
        if (typeof msg.signal_dbfs === 'number') sdr.signalDbfs = msg.signal_dbfs;
        if (typeof msg.snr_db === 'number') sdr.snrDb = msg.snr_db;
        if (typeof msg.squelch_open === 'boolean') sdr.squelchOpen = msg.squelch_open;
        if (msg.sample_rate) sdr.sampleRate = msg.sample_rate;
        if (msg.span_hz) { sdr.spanHz = msg.span_hz; state.span = msg.span_hz / 1e6; }
        if (msg.center_hz) { sdr.centerHz = msg.center_hz; state.center = msg.center_hz / 1e6; }
        liveKey = '';
        break;
      case 'error':
        toast(`SDR bridge: ${msg.message || 'エラー'}`);
        break;
      default:
        break;
    }
  }

  function currentDemod() {
    if (state.stdMode === 'AM (エアバンド)') return 'am';
    if (state.stdMode === 'アナログFM') return 'fm';
    if (state.stdMode === 'auto') return state.mod === 'AM' ? 'am' : 'fm';
    return 'fm';   // TDMA / DMR / NXDN はアナログ復調では聞こえないが、FM として扱う
  }

  function sdrTune() {
    if (!sdr.ws || sdr.ws.readyState !== 1) return false;
    const mode = currentDemod();
    const msg = {
      cmd: 'tune',
      freq_hz: Math.round(state.tuned * 1e6),
      mode,
      bandwidth_hz: mode === 'am' ? 8000 : 12500,
      squelch_dbfs: state.squelch
    };
    try { sdr.ws.send(JSON.stringify(msg)); } catch (e) { return false; }
    sdr.lastTune = msg;
    if (el.wsTuneVal) el.wsTuneVal.textContent = `${fmtMHz(msg.freq_hz / 1e6)} MHz ${mode.toUpperCase()}`;
    return true;
  }

  function sdrSquelch() {
    if (!sdr.ws || sdr.ws.readyState !== 1) return;
    try { sdr.ws.send(JSON.stringify({ cmd: 'squelch', squelch_dbfs: state.squelch })); } catch (e) { /* noop */ }
  }

  function sdrPause(paused) {
    if (!sdr.ws || sdr.ws.readyState !== 1) return;
    try { sdr.ws.send(JSON.stringify({ cmd: 'pause', pause: !!paused })); } catch (e) { /* noop */ }
  }

  /* 1秒ごとの実機レート表示 */
  setInterval(() => {
    if (state.source !== 'sdr') return;
    sdr.fftHz = sdr.fftCount; sdr.fftCount = 0;
    sdr.pcmRate = sdr.pcmCount; sdr.pcmCount = 0;
    if (el.wsFftVal) el.wsFftVal.textContent = sdr.status === 'open' ? `${sdr.fftHz} Hz` : '—';
    if (el.wsPcmVal) el.wsPcmVal.textContent = sdr.status === 'open' ? `${(sdr.pcmRate / 1024).toFixed(1)} KB/s` : '—';
    if (el.wsLastVal) el.wsLastVal.textContent = sdr.lastMsgAt ? new Date(sdr.lastMsgAt).toLocaleTimeString('ja-JP', { hour12: false }) : '—';
  }, 1000);

  /* ── 外部受信機（マイク／ライン入力）────────────────── */
  function extListDevices() {
    if (!el.extDevice || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((devs) => {
      const inputs = devs.filter((d) => d.kind === 'audioinput');
      const current = el.extDevice.value || state.extDevice;
      el.extDevice.innerHTML = '<option value="">既定の入力</option>' + inputs.map((d, i) =>
        `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || '音声入力 ' + (i + 1))}</option>`).join('');
      if (current && inputs.some((d) => d.deviceId === current)) el.extDevice.value = current;
    }).catch(() => { /* noop */ });
  }

  function extMonitorGain() {
    if (!ext.monitor || state.muted || !state.rx) return 0;
    return (state.volume / 100) * 0.8;
  }

  function extSetMonitor(on) {
    ext.monitor = !!on;
    if (el.extMonToggle) el.extMonToggle.checked = ext.monitor;
    if (ext.gain && ext.ctx) ext.gain.gain.setTargetAtTime(extMonitorGain(), ext.ctx.currentTime, 0.06);
    if (el.extHowl) el.extHowl.hidden = !(ext.monitor && ext.stream);
    liveKey = '';
    savePrefs();
    if (ext.monitor) toast('モニタリングON（ハウリングに注意）');
  }

  async function extStart() {
    if (ext.stream) {
      if (audio.ctx && audio.ctx.state === 'suspended') { try { await audio.ctx.resume(); } catch (e) { /* noop */ } }
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('このブラウザはマイク入力をサポートしていません');
      return;
    }
    audio.init();
    const devId = (el.extDevice && el.extDevice.value) || state.extDevice || '';
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
        ...(devId ? { deviceId: { exact: devId } } : {})
      },
      video: false
    };
    if (el.extStateVal) el.extStateVal.textContent = '接続中…';
    try {
      ext.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      let msg = 'マイク入力を取得できませんでした';
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) msg = 'マイク入力を許可してください（ブラウザの設定）';
      else if (e && e.name === 'NotFoundError') msg = '利用できる音声入力が見つかりません（UV-K5 の接続を確認）';
      else if (e && e.name === 'NotReadableError') msg = '他のアプリが音声入力を使用しています';
      toast(msg);
      if (el.extStateVal) el.extStateVal.textContent = '未許可';
      updateSourceUI();
      return;
    }
    const ac = audio.ctx;
    if (!ac) { toast('Web Audio を初期化できませんでした'); extStop(true); return; }
    if (ac.state === 'suspended') { try { await ac.resume(); } catch (e) { /* noop */ } }
    ext.ctx = ac;
    ext.src = ac.createMediaStreamSource(ext.stream);
    ext.analyser = ac.createAnalyser();
    ext.analyser.fftSize = 2048;
    ext.analyser.smoothingTimeConstant = 0.72;
    ext.gain = ac.createGain();
    ext.gain.gain.value = extMonitorGain();
    ext.src.connect(ext.analyser);
    ext.src.connect(ext.gain);
    ext.gain.connect(ac.destination);
    // アナライザーを音声グラフに接続したままにする（無音のパススルー）
    const probe = ac.createGain();
    probe.gain.value = 0;
    ext.analyser.connect(probe);
    probe.connect(ac.destination);
    ext.probe = probe;
    const track = ext.stream.getAudioTracks()[0];
    const s = track && track.getSettings ? track.getSettings() : {};
    ext.rate = s.sampleRate || ac.sampleRate || 48000;
    ext.label = cleanLabel(track && track.label) || '外部受信機';
    if (el.extRateVal) el.extRateVal.textContent = `${(ext.rate / 1000).toFixed(1)} kHz`;
    if (el.extStateVal) el.extStateVal.textContent = '入力中';
    if (el.extHowl) el.extHowl.hidden = !ext.monitor;
    updateSourceUI();
    renderMonitor();
    extListDevices();
    toast(`音声入力を開始しました（${ext.label}）`);
  }

  function extStop(silent) {
    if (ext.rec) { try { ext.rec.stop(); } catch (e) { /* noop */ } }
    if (ext.stream) ext.stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* noop */ } });
    if (ext.src) { try { ext.src.disconnect(); } catch (e) { /* noop */ } }
    if (ext.gain) { try { ext.gain.disconnect(); } catch (e) { /* noop */ } }
    ext.stream = null; ext.src = null; ext.analyser = null; ext.gain = null;
    ext.level = -120; ext.peak = -120;
    if (el.extStateVal) el.extStateVal.textContent = '停止';
    if (el.extLevelVal) el.extLevelVal.textContent = '—';
    if (el.extHowl) el.extHowl.hidden = true;
    updateSourceUI();
    if (!silent) { toast('音声入力を停止しました'); renderMonitor(); updateDynamic(); }
  }

  /* ── 実音声の録音（MediaRecorder）────────────────────── */
  function startRealRec() {
    const stream = state.source === 'ext' ? ext.stream : (audio.live.recStream || null);
    if (!stream) {
      toast(state.source === 'ext' ? '先に「入力を開始」で音声を取り込んでください' : 'RTL-SDR の音声がまだ届いていません');
      return;
    }
    if (typeof MediaRecorder === 'undefined') { toast('このブラウザは録音に対応していません'); return; }
    let mime = '';
    ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].forEach((c) => {
      if (!mime && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) mime = c;
    });
    let rec;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) { toast('録音を開始できませんでした'); return; }
    ext.rec = rec;
    ext.chunks = [];
    ext.mime = rec.mimeType || mime || 'audio/webm';
    ext.recStart = Date.now();
    rec.ondataavailable = (e) => { if (e.data && e.data.size) ext.chunks.push(e.data); };
    rec.onstop = () => finishRealRec();
    try { rec.start(500); } catch (e) { toast('録音を開始できませんでした'); ext.rec = null; return; }
    updateRecUI();
    toast('録音を開始しました（履歴から再生・保存できます）');
  }

  function finishRealRec() {
    const dur = Math.max(1, Math.round((Date.now() - ext.recStart) / 1000));
    const type = ext.mime || 'audio/webm';
    const blob = new Blob(ext.chunks, { type });
    ext.chunks = [];
    ext.rec = null;
    if (!blob.size) { toast('録音データが空でした'); updateRecUI(); return; }
    const d = new Date();
    const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
    const extName = type.indexOf('mp4') >= 0 ? 'm4a' : type.indexOf('ogg') >= 0 ? 'ogg' : 'webm';
    const filename = `airscope_${stamp}_${Math.round(state.tuned * 1000)}kHz.${extName}`;
    const url = URL.createObjectURL(blob);
    state.history.unshift({
      at: Date.now(), freq: state.tuned,
      org: state.source === 'sdr' ? 'RTL-SDR' : (ext.label || '外部受信機'),
      kind: '録音', dur, id: 0, url, filename, mime: type
    });
    if (state.history.length > 60) {
      const rm = state.history.pop();
      if (rm.url) URL.revokeObjectURL(rm.url);
    }
    renderHistory();
    updateRecUI();
    toast(`録音を保存しました（${Math.floor(dur / 60)}:${pad2(dur % 60)}・${Math.round(blob.size / 1024)}KB）`);
  }

  let histAudio = null, histIdx = -1;
  function stopHistAudio() {
    if (histAudio) { try { histAudio.pause(); } catch (e) { /* noop */ } histAudio = null; }
    histIdx = -1;
    if (el.histBody) $$('.play[data-hist]', el.histBody).forEach((b) => { b.textContent = '▶'; });
  }
  function playHistory(i) {
    const h = state.history[i];
    if (!h) return;
    if (!h.url) { audio.init(); audio.beep(); toast('録音を再生（デモ音）'); return; }
    if (histIdx === i && histAudio) { stopHistAudio(); toast('再生を停止しました'); return; }
    stopHistAudio();
    histAudio = new Audio(h.url);
    histIdx = i;
    histAudio.onended = () => stopHistAudio();
    histAudio.play().then(() => {
      const btn = el.histBody && el.histBody.querySelector(`.play[data-hist="${i}"]`);
      if (btn) btn.textContent = '❚❚';
      toast('録音を再生中');
    }).catch(() => toast('この端末では再生できませんでした（保存して再生してください）'));
  }

  /* ── CHIRP-next 用 CSV ──────────────────────────────── */
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function chirpRows(ids) {
    const rows = [];
    let loc = 0;
    ids.forEach((id) => {
      const p = PRESETS.find((x) => x.id === id);
      const info = CHIRP_INFO[id];
      if (!p || !info) return;
      p.stations.forEach((st) => {
        loc += 1;
        rows.push([
          String(loc),
          (info.code + st.freq.toFixed(3)).slice(0, 10),
          st.freq.toFixed(6),
          'off',
          '0.000000',
          '',
          '88.5',
          '88.5',
          '023',
          'NN',
          '023',
          'Tone->Tone',
          info.mode,
          info.step,
          '',
          'Low',
          `AirScope ${info.code} ${st.tag || ''} RX ONLY`,
          '', '', '', ''
        ]);
      });
    });
    return rows;
  }

  function chirpCsv(ids) {
    const list = ids && ids.length ? ids : CHIRP_SET_IDS;
    return [CHIRP_HEADER.join(',')].concat(chirpRows(list).map((r) => r.map(csvCell).join(','))).join('\r\n') + '\r\n';
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function exportChirp(ids) {
    const list = (ids && ids.length ? ids : [state.preset]).filter((id) => CHIRP_INFO[id]);
    const rows = chirpRows(list);
    if (!rows.length) { toast('このプリセットには書き出せるチャンネルがありません（KIX/ITM/HND/NRT/FUK/南海/JR）'); return; }
    const d = new Date();
    const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
    const name = list.length > 1 ? `airscope_chirp_all_${stamp}.csv` : `airscope_chirp_${list[0]}_${stamp}.csv`;
    downloadText(name, chirpCsv(list), 'text/csv;charset=utf-8');
    toast(`CHIRP用CSVを保存しました（${rows.length}ch・受信専用 Duplex=off）`);
  }

  /* ── LiveATC ポップアップ ───────────────────────────── */
  let latPoll = null;
  function openLiveAtc(mount, icao) {
    const url = LAT_PLAYER(mount, icao);
    let w = null;
    try {
      w = window.open(url, 'liveatc_' + mount, 'width=820,height=640,menubar=no,toolbar=no,status=yes,location=yes');
    } catch (e) { w = null; }
    if (!w) {
      try { w = window.open(url, '_blank', 'noopener'); } catch (e) { /* noop */ }
      toast('ポップアップがブロックされたため、別タブで開きました');
    } else {
      toast('LiveATC の公式プレーヤーを開きました（デモ音をミュート）');
    }
    if (state.latMute && w) {
      state.latMuted = true;
      audio.init();
      audio.apply();
    }
    clearInterval(latPoll);
    if (w) {
      latPoll = setInterval(() => {
        if (w.closed) {
          clearInterval(latPoll);
          latPoll = null;
          if (state.latMuted) { state.latMuted = false; audio.apply(); toast('デモ音のミュートを解除しました'); }
        }
      }, 1200);
    }
  }

  /* ── クリップボード ─────────────────────────────────── */
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }

  /* ── 履歴 ─────────────────────────────────────────────── */
  function renderHistory() {
    const rows = state.history.map((h, i) => {
      const d = new Date(h.at);
      const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
      const dur = `${Math.floor(h.dur / 60)}:${pad2(h.dur % 60)}`;
      const cell = h.url
        ? `<div class="play-cell"><button class="play" type="button" data-hist="${i}" aria-label="録音を再生">▶</button><a class="dl" href="${h.url}" download="${escapeHtml(h.filename || 'airscope_recording.webm')}" aria-label="録音を保存">⭳</a></div>`
        : `<button class="play" type="button" data-hist="${i}" aria-label="再生（デモ音）">▶</button>`;
      return `<tr>
        <td class="mono">${time}</td>
        <td class="mono">${fmtHz(h.freq)}</td>
        <td>[${escapeHtml(h.org)}]</td>
        <td class="${h.kind === '通話' ? 't-talking' : ''}">${h.kind}</td>
        <td class="mono">${dur}</td>
        <td class="mono">${h.id ? 'ID ' + h.id : '—'}</td>
        <td>${cell}</td>
      </tr>`;
    }).join('');
    el.histBody.innerHTML = rows;
    el.histEmpty.hidden = state.history.length > 0;
  }

  /* ── モーダル ─────────────────────────────────────────── */
  function openModal(id) {
    $('#' + id).hidden = false;
    if (id === 'historyModal') renderHistory();
  }
  function closeModals() {
    $$('.modal').forEach((m) => { m.hidden = true; });
  }

  /* ── 設定 ─────────────────────────────────────────────── */
  function applySpeed() {
    el.speedVal.textContent = state.speed.toFixed(1) + '×';
    if (simTimer) clearInterval(simTimer);
    simTimer = setInterval(simTick, Math.round(1000 / state.speed));
  }
  function applySquelch() {
    el.sqVal.textContent = state.squelch.toFixed(1) + ' dBFS';
    updateDynamic();
  }

  let simTimer = null;

  /* ── 設定の保存 ──────────────────────────────────────── */
  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        speed: state.speed, squelch: state.squelch, audio: state.audio,
        volume: state.volume, muted: state.muted, stdMode: state.stdMode,
        stepMode: state.stepMode, autoScan: state.autoScan, autoFollow: state.autoFollow,
        preset: state.preset, wsUrl: state.wsUrl, latMute: state.latMute, extDevice: state.extDevice
      }));
    } catch (e) { /* 保存できない環境では無視 */ }
  }
  function loadPrefs() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); } catch (e) { p = null; }
    if (!p) return;
    if (typeof p.speed === 'number') state.speed = clamp(p.speed, 0.5, 3);
    if (typeof p.squelch === 'number') state.squelch = clamp(p.squelch, -60, -35);
    if (typeof p.audio === 'boolean') state.audio = p.audio;
    if (typeof p.volume === 'number') state.volume = clamp(p.volume, 0, 100);
    if (typeof p.muted === 'boolean') state.muted = p.muted;
    if (typeof p.stdMode === 'string') state.stdMode = p.stdMode;
    if (typeof p.stepMode === 'string' && STEP_MAP[p.stepMode]) state.stepMode = p.stepMode;
    if (typeof p.autoScan === 'boolean') state.autoScan = p.autoScan;
    if (typeof p.autoFollow === 'boolean') state.autoFollow = p.autoFollow;
    if (typeof p.preset === 'string' && PRESETS.some((x) => x.id === p.preset)) state.preset = p.preset;
    if (typeof p.wsUrl === 'string' && /^wss?:\/\//i.test(p.wsUrl)) { state.wsUrl = p.wsUrl; sdr.url = p.wsUrl; }
    if (typeof p.latMute === 'boolean') state.latMute = p.latMute;
    if (typeof p.extDevice === 'string') state.extDevice = p.extDevice;
  }

  /* ── UI バインド ──────────────────────────────────────── */
  function bindUI() {
    // 局一覧
    el.list.addEventListener('click', (e) => {
      const star = e.target.closest('[data-act="fav"]');
      const row = e.target.closest('.st');
      if (!row) return;
      const st = state.stations.find((s) => s.id === row.dataset.id);
      if (!st) return;
      if (star) {
        e.stopPropagation();
        st.fav = !st.fav;
        star.classList.toggle('on', st.fav);
        star.setAttribute('aria-pressed', String(st.fav));
        if (st.id === state.selectedId) renderMonitor();
        toast(st.fav ? `★ ${fmtHz(st.freq)} を登録しました` : `★ ${fmtHz(st.freq)} の登録を解除`);
        return;
      }
      selectStation(st.id);
    });
    el.list.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('.st');
      if (!row) return;
      e.preventDefault();
      selectStation(row.dataset.id);
    });

    // フィルタ
    $$('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filter = btn.dataset.filter;
        $$('.chip').forEach((b) => {
          const on = b === btn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', String(on));
        });
        renderStations();
      });
    });

    el.selectMode.addEventListener('click', () => {
      state.selectMode = !state.selectMode;
      if (!state.selectMode) state.checked.clear();
      renderStations();
      renderBulk();
    });

    el.bulkBar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bulk]');
      if (!b) return;
      const act = b.dataset.bulk;
      if (act === 'fav') {
        state.stations.forEach((s) => { if (state.checked.has(s.id)) s.fav = true; });
        toast(`${state.checked.size}局を★登録しました`);
      } else if (act === 'clear') {
        state.checked.clear();
      } else {
        state.selectMode = false;
        state.checked.clear();
      }
      renderStations();
      renderBulk();
    });

    // 周波数
    el.freqInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commitFreq(); }
      if (e.key === 'Escape') { el.freqInput.blur(); renderMonitor(); }
    });
    el.freqInput.addEventListener('blur', () => {
      // 未確定の入力は捨てて、実際のチューニング周波数に戻す
      el.freqInput.value = fmtHz(state.tuned);
    });

    function commitFreq() {
      const v = parseFloat(el.freqInput.value.replace(/[^0-9.]/g, ''));
      if (!isFinite(v) || v <= 0) { toast('周波数を数値で入力してください'); el.freqInput.value = fmtHz(state.tuned); return; }
      if (v < state.range[0] || v > state.range[1]) { toast(`このプリセットの帯域は ${state.range[0]}–${state.range[1]} MHz です`); el.freqInput.value = fmtHz(state.tuned); return; }
      tuneTo(v, { announce: true });
    }

    $('#listenBtn').addEventListener('click', () => { audio.init(); commitFreq(); });

    // 呼び出し
    $('#callBtn').addEventListener('click', () => {
      audio.init();
      if (isLive()) { toast('実機モードは受信専用です（送信・呼び出しはしません）'); return; }
      if (state.mod !== 'TDMA') { toast('このプリセットは受信専用です（送信・呼び出しはしません）'); return; }
      if (!state.rx) { toast('受信停止中です。先に受信を開始してください'); return; }
      const st = selected();
      if (!st) { toast('未登録周波数には呼び出しできません'); return; }
      if (st.status === 'talking') { toast('この局は既に通話中です'); return; }
      startCall(st, { mine: true, id: Math.floor(rand(2000, 2999)) });
      toast(`呼出を送信 → ${fmtHz(st.freq)} ${stLabel(st)}（デモ）`);
    });

    // プリセット
    el.presetSelect.addEventListener('change', () => {
      applyPreset(el.presetSelect.value, { announce: true });
      savePrefs();
      audio.init();
      audio.beep();
      if (state.source === 'sdr') sdrTune('preset');
    });

    // ステップ
    el.step.addEventListener('change', () => {
      state.stepMode = el.step.value;
      state.step = STEP_MAP[state.stepMode] || STEP_MAP.auto;
      savePrefs();
      toast(`ステップ ${state.stepMode === 'auto' ? '自動 12.5k' : state.stepMode + 'k'} に設定`);
    });

    // 規格
    el.std.addEventListener('change', () => {
      state.stdMode = el.std.value;
      renderMonitor();
      updateDynamic();
      savePrefs();
      if (state.source === 'sdr') sdrTune('std');
      toast(`規格 ${state.stdMode === 'auto' ? '自動判定' : state.stdMode} を適用`);
    });

    // 履歴
    $('#historyBtn').addEventListener('click', () => openModal('historyModal'));
    $('#histClear').addEventListener('click', () => {
      stopHistAudio();
      state.history.forEach((h) => { if (h.url) URL.revokeObjectURL(h.url); });
      state.history = [];
      renderHistory();
      toast('履歴をクリアしました');
    });
    el.histBody.addEventListener('click', (e) => {
      const b = e.target.closest('[data-hist]');
      if (!b) return;
      playHistory(Number(b.dataset.hist));
    });

    // 設定
    $('#settingsBtn').addEventListener('click', () => openModal('settingsModal'));
    $$('[data-close]').forEach((b) => b.addEventListener('click', closeModals));
    $$('.modal').forEach((m) => {
      m.addEventListener('click', (e) => { if (e.target === m) closeModals(); });
    });

    // 受信停止
    el.rxToggle.addEventListener('click', () => setRx(!state.rx));

    // ミュート・音量
    el.muteBtn.addEventListener('click', () => {
      state.muted = !state.muted;
      el.muteBtn.classList.toggle('muted', state.muted);
      el.muteBtn.setAttribute('aria-pressed', String(state.muted));
      el.muteIcon.setAttribute('href', state.muted ? '#i-mute' : '#i-speaker');
      audio.init(); audio.apply();
      audio.applyLive();
      savePrefs();
      toast(state.muted ? 'ミュートしました' : 'ミュートを解除');
    });
    el.vol.addEventListener('input', () => {
      state.volume = Number(el.vol.value);
      if (state.volume > 0 && state.muted) {
        state.muted = false;
        el.muteBtn.classList.remove('muted');
        el.muteIcon.setAttribute('href', '#i-speaker');
      }
      audio.init(); audio.apply();
      audio.applyLive();
      if (ext.gain && ext.ctx) ext.gain.gain.setTargetAtTime(extMonitorGain(), ext.ctx.currentTime, 0.06);
      savePrefs();
    });

    // 録音
    el.recBtn.addEventListener('click', toggleRec);

    // お気に入り
    el.favBtn.addEventListener('click', toggleFav);

    // チェックボックス
    $('#autoScan').addEventListener('change', (e) => { state.autoScan = e.target.checked; savePrefs(); toast(state.autoScan ? '受信範囲の自動探索をON' : '自動探索をOFF'); });
    $('#autoFollow').addEventListener('change', (e) => { state.autoFollow = e.target.checked; savePrefs(); toast(state.autoFollow ? '通話の始まった局へ自動切替をON' : '自動切替をOFF'); });

    // 設定モーダル
    el.speedRange.addEventListener('input', () => {
      state.speed = Number(el.speedRange.value);
      applySpeed(); savePrefs();
    });
    el.sqRange.addEventListener('input', () => {
      state.squelch = Number(el.sqRange.value);
      applySquelch(); savePrefs();
      if (state.source === 'sdr') sdrSquelch();
    });
    el.audioToggle.addEventListener('change', () => {
      state.audio = el.audioToggle.checked;
      audio.init(); audio.apply();
      savePrefs();
      toast(state.audio ? 'デモ音をON' : 'デモ音をOFF');
    });
    $('#resetDemo').addEventListener('click', () => {
      applyPreset(state.preset, { silent: true });
      state.recSeconds = 0;
      state.recManual = false;
      renderStations(); renderBulk(); renderMonitor(); updateDynamic(); renderHistory();
      toast('このプリセットを初期状態に戻しました');
      closeModals();
    });

    /* ── 受信ソース ── */
    const openSource = () => { openModal('sourceModal'); extListDevices(); updateSourcePanels(); };
    el.sourceBtn.addEventListener('click', openSource);
    el.setSourceBtn.addEventListener('click', openSource);
    $$('.src-opt').forEach((b) => b.addEventListener('click', () => setSource(b.dataset.source)));
    el.wsConnectBtn.addEventListener('click', () => sdrConnect());
    el.wsDisconnectBtn.addEventListener('click', () => sdrDisconnect());
    el.wsGuideBtn.addEventListener('click', () => openModal('sdrGuideModal'));
    el.wsUrl.addEventListener('change', () => sdrSetUrl(el.wsUrl.value));
    el.wsUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sdrConnect(); } });
    el.extStartBtn.addEventListener('click', () => extStart());
    el.extStopBtn.addEventListener('click', () => extStop());
    el.extRefreshBtn.addEventListener('click', () => extListDevices());
    el.extDevice.addEventListener('change', () => {
      state.extDevice = el.extDevice.value;
      savePrefs();
      if (ext.stream) { extStop(true); extStart(); }
    });
    el.extMonToggle.addEventListener('change', () => extSetMonitor(el.extMonToggle.checked));
    el.chirpBtn.addEventListener('click', () => exportChirp([state.preset]));
    el.chirpCurBtn.addEventListener('click', () => exportChirp([state.preset]));
    el.chirpAllBtn.addEventListener('click', () => exportChirp(CHIRP_SET_IDS));
    el.latMuteToggle.addEventListener('change', () => { state.latMute = el.latMuteToggle.checked; savePrefs(); });
    el.liveAtcBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lat-mount]');
      if (!b) return;
      openLiveAtc(b.dataset.latMount, b.dataset.latIcao);
    });
    $$('[data-copy]').forEach((b) => b.addEventListener('click', () => {
      const pre = document.getElementById(b.dataset.copy);
      if (!pre) return;
      copyText(pre.textContent).then((ok) => toast(ok ? 'コピーしました' : 'コピーできませんでした（手動で選択してください）'));
    }));

    // キーボード
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeModals(); return; }
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        tuneTo(state.tuned - state.step);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        tuneTo(state.tuned + state.step);
      }
    });

    // 最初の操作で音声を有効化
    const unlock = () => { audio.init(); audio.apply(); };
    document.addEventListener('pointerdown', unlock, { once: true });

    // キャンバス
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true; dragMoved = false;
      dragStartX = e.clientX;
      dragStartCenter = state.center;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      hoverX = e.clientX - rect.left;
      if (!dragging || state.source === 'ext') return;
      const dx = e.clientX - dragStartX;
      if (Math.abs(dx) > 3) dragMoved = true;
      if (dragMoved) {
        state.center = clamp(dragStartCenter - dx * state.span / CW, state.range[0], state.range[1]);
        state.centerAuto = false;
        renderSpanInfo();
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      if (!dragMoved) {
        if (state.source === 'ext') { toast('外部受信機モードでは、UV-K5本体のダイヤルで周波数を合わせてください'); return; }
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const f = xToF(x);
        const snapped = Math.round(f / state.step) * state.step;
        audio.init();
        tuneTo(snapped);
        toast(`${fmtHz(clamp(snapped, state.range[0], state.range[1]))} MHz へチューニング`);
      }
    });
    canvas.addEventListener('pointerleave', () => { hoverX = -1; });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (state.source === 'ext') return;
      const dir = e.deltaY > 0 ? 1 : -1;
      state.center = clamp(state.center + dir * state.step, state.range[0], state.range[1]);
      state.centerAuto = false;
      renderSpanInfo();
    }, { passive: false });

    window.addEventListener('resize', () => { resizeCanvas(); });
  }

  /* ── 起動 ─────────────────────────────────────────────── */
  function applyPrefsToUI() {
    el.speedRange.value = state.speed;
    el.sqRange.value = state.squelch;
    el.audioToggle.checked = state.audio;
    el.vol.value = state.volume;
    el.step.value = state.stepMode;
    el.std.value = state.stdMode;
    el.muteBtn.classList.toggle('muted', state.muted);
    el.muteIcon.setAttribute('href', state.muted ? '#i-mute' : '#i-speaker');
    $('#autoScan').checked = state.autoScan;
    $('#autoFollow').checked = state.autoFollow;
    if (el.wsUrl) el.wsUrl.value = state.wsUrl;
    if (el.latMuteToggle) el.latMuteToggle.checked = state.latMute;
    state.step = STEP_MAP[state.stepMode] || STEP_MAP.auto;
    applySpeed();
    applySquelch();
    updateSourceUI();
  }

  function boot() {
    loadPrefs();
    bindUI();
    applyPreset(state.preset, { silent: true });
    applyPrefsToUI();
    renderStations();
    renderBulk();
    renderMonitor();
    updateDynamic();
    renderHistory();
    resizeCanvas();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);

    // 録音カウンター（実時間）
    setInterval(() => {
      const st = selected();
      const live = state.rx && ((st && st.status === 'talking') || state.recManual);
      if (live) state.recSeconds = Math.min(state.recSeconds + 1, 5999);
      updateRecUI();
    }, 1000);

    // 動的表示
    setInterval(updateDynamic, 340);

    // 自動探索の初期カウントダウン
    state.stations.forEach((s) => { if (s.status === 'ended') s.rescan = 18; });

    // 外部入力デバイスの一覧（許可なしでもデバイスIDのみ取得可能）
    extListDevices();

    // テスト・デバッグ用の読み取りAPI
    window.AirScope = {
      version: 'v15',
      getState: () => ({
        source: state.source, preset: state.preset, tuned: state.tuned, rx: state.rx,
        latMuted: state.latMuted, latMute: state.latMute,
        sdrStatus: sdr.status, sdrUrl: sdr.url, fftBins: sdr.fft ? sdr.fft.length : 0,
        sdrFreqHz: sdr.freqHz, sdrSignal: sdr.signalDbfs, sdrSquelchOpen: sdr.squelchOpen,
        sdrPcmTotal: sdr.pcmTotal, sdrFftHz: sdr.fftHz, sdrPcmRate: sdr.pcmRate,
        lastTune: sdr.lastTune, extStream: !!ext.stream, extLevel: ext.level, extPeak: ext.peak,
        extRate: ext.rate, extMonitor: ext.monitor, recording: !!ext.rec, extPeak: ext.peak,
        audioCtx: audio.ctx ? audio.ctx.state : 'none',
        history: state.history.map((h) => ({ freq: h.freq, kind: h.kind, dur: h.dur, hasAudio: !!h.url, mime: h.mime || '' })),
        level: state.level
      }),
      chirpCsv: (ids) => chirpCsv(ids),
      extProbe: () => {
        if (!ext.analyser) return null;
        const td = new Float32Array(ext.analyser.fftSize);
        ext.analyser.getFloatTimeDomainData(td);
        let peak = 0;
        for (let i = 0; i < td.length; i++) peak = Math.max(peak, Math.abs(td[i]));
        const tr = ext.stream && ext.stream.getAudioTracks()[0];
        return {
          peak, ctx: audio.ctx ? audio.ctx.state : 'none',
          trackState: tr && tr.readyState, muted: tr && tr.muted, enabled: tr && tr.enabled,
          label: tr && tr.label, anRate: audio.ctx && audio.ctx.sampleRate
        };
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
