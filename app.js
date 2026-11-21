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
  const PREF_KEY = 'airscope.prefs.v1';

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

  const state = {
    stations: [],
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
    volume: 62,
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
    unread: 0
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
      org: seed.org,
      std: 'T79',
      dir: seed.dir,
      cc: seed.cc,
      tg: seed.tg,
      status: seed.status,
      sync: seed.sync,
      slots: makeSlots(seed.status, seed.callId || 0, seed.callSlot),
      callTimer: seed.callTimer || 0,
      callId: seed.callId || 0,
      rescan: 20,
      baseSig: talking ? -38.2 : seed.status === 'sync' ? -51.6 : seed.status === 'judging' ? -78.4 : -96.5,
      baseSnr: talking ? 21.4 : seed.status === 'sync' ? 13.2 : seed.status === 'judging' ? 3.1 : 0.2,
      fav: false,
      seen: true
    };
  }

  function initStations() {
    state.stations = SEED.map(makeStation);
    state.selectedId = state.stations[3].id;
    state.tuned = state.stations[3].freq;
    state.center = 273.45;
    state.centerAuto = true;
    state.history = seedHistory();
  }

  function seedHistory() {
    const t = Date.now();
    return [
      { at: t - 1000 * 60 * 21, freq: 273.4125, org: 'F', kind: '通話', dur: 41, id: 4471 },
      { at: t - 1000 * 60 * 54, freq: 273.1125, org: 'A', kind: '通話', dur: 22, id: 1234 },
      { at: t - 1000 * 60 * 96, freq: 273.3125, org: 'E', kind: '録音', dur: 8, id: 0 }
    ];
  }

  const selected = () => state.stations.find((s) => s.id === state.selectedId) || null;
  const talkingCount = () => state.stations.filter((s) => s.status === 'talking' && s.seen).length;

  /* ── DOM ─────────────────────────────────────────────── */
  const el = {
    list: $('#stationList'),
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
    audioToggle: $('#audioToggle')
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
    const st_cls = st.status === 'talking' ? 'orange' : st.status === 'ended' ? 'gray' : '';
    const pct = st.status === 'ended' || st.sync == null ? '—' : st.sync.toFixed(1) + '%';
    const barW = st.status === 'ended' || st.sync == null ? 0 : clamp(st.sync, 0, 100);
    const slots = st.slots.map((s) => {
      const c = s.t === 'call' ? 'call' : s.t === 'ctrl' ? 'on' : st.status === 'ended' ? 'dim' : '';
      return `<i class="${c}"></i>`;
    }).join('');
    const badge = `<span class="badge st-badge ${BADGE_CLASS[st.status]}">${STATUS_TEXT[st.status]}</span>`;
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
      <div class="st-row2"><span class="st-org">[組織名 ${st.org}]</span><span class="st-std">・${st.std}</span></div>
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

  function renderBulk() {
    el.bulkBar.hidden = !state.selectMode;
    el.bulkCount.textContent = state.checked.size;
    el.selectMode.setAttribute('aria-pressed', String(state.selectMode));
    el.selectMode.textContent = state.selectMode ? '完了' : '選択';
  }

  /* ── モニター描画 ─────────────────────────────────────── */
  function stdLabel(st) {
    if (state.stdMode !== 'auto') return `${state.stdMode}（強制）`;
    return `${st ? st.std : 'STD-T79'}（自動判定）`;
  }
  function codecLabel(st) {
    const mode = state.stdMode !== 'auto' ? state.stdMode : (st ? st.std : 'STD-T79');
    return CODECS[mode] || 'AMBE+ 4000';
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
    state.tuned = st ? st.freq : state.tuned;

    el.monStd.textContent = stdLabel(st);

    const badgeState = !state.rx ? 'off' : st ? st.status : 'idle';
    el.monState.className = 'badge ' + (badgeState === 'off' ? 'off' : BADGE_CLASS[badgeState]);
    el.monState.textContent = !state.rx ? '停止中' : STATUS_TEXT[badgeState];

    el.bigFreq.textContent = fmtHz(state.tuned);
    el.monSub.textContent = st
      ? (state.stdMode === 'アナログFM' ? `[組織名 ${st.org}]・${st.dir}` : `[組織名 ${st.org}]・${st.dir}・CC ${st.cc}`)
      : '未登録周波数・ノイズのみ';

    el.mCodec.textContent = st ? codecLabel(st) : '—';

    // slots
    const analog = (state.stdMode === 'アナログFM');
    el.slotTitle.textContent = analog ? 'スロット（アナログ）' : 'スロット（TDMA 4スロット）';
    if (analog) {
      const lvl = st && st.status === 'talking' ? 42 : 6;
      el.slots.innerHTML = `<div class="slot analog"><div class="slot-top"><span class="slot-id">FM</span><span class="badge sync">アナログ</span></div><div class="slot-body">音声復調中・スロット分割なし</div><div class="slot-meter"><i style="width:${lvl}%"></i></div></div>`;
    } else if (st) {
      el.slots.innerHTML = st.slots.map(slotHtml).join('');
    } else {
      el.slots.innerHTML = [0, 1, 2, 3].map((i) => `<div class="slot empty"><div class="slot-top"><span class="slot-id">TS${i}</span><span class="badge judging">空き</span></div><div class="slot-body">—</div></div>`).join('');
    }

    el.favBtn.classList.toggle('on', isFav(st));
    el.favBtn.setAttribute('aria-pressed', String(isFav(st)));

    if (document.activeElement !== el.freqInput) el.freqInput.value = fmtHz(state.tuned);
    renderSpanInfo();
  }

  function renderSpanInfo() {
    const lo = state.center - SPAN / 2;
    const hi = state.center + SPAN / 2;
    el.spanInfo.textContent = `${lo.toFixed(3)} - ${hi.toFixed(3)} MHz・中心 ${state.center.toFixed(4)}（${state.centerAuto ? '自動' : '手動'}）・2.048 MS/s`;
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
    const st = selected();
    const m = metricsFor(st);
    el.mSignal.textContent = m.sig.toFixed(1);
    el.mSnr.textContent = m.snr.toFixed(1);
    el.mSync.textContent = st && st.sync != null ? m.sync.toFixed(1) : '—';

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

  function updateRecUI() {
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
    // 1局の状態変化を局一覧とモニターへ反映
    renderStations();
    if (st && st.id === state.selectedId) renderMonitor();
  }

  function startCall(st, opts = {}) {
    if (!state.rx) return;
    st.status = 'talking';
    st.sync = clamp(st.sync || rand(92, 99), 92, 100);
    st.baseSig = -rand(36, 41);
    st.baseSnr = rand(18, 24);
    st.callId = opts.id || Math.floor(rand(1000, 9999));
    st.callTimer = Math.round(rand(11, 27));
    st.slots = makeSlots('sync');
    st.slots[2] = { t: 'call', label: '通話', body: `${opts.mine ? '送信' : '呼出'} [ID ${st.callId}]・再生中`, level: 30 };   // TS2 に通話

    if (state.autoFollow) {
      const prev = state.selectedId;
      selectStation(st.id, { silent: true });
      if (prev !== st.id) toast(`通話開始 → ${fmtHz(st.freq)} [組織名 ${st.org}] へ自動切替`);
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
    const dur = Math.round(rand(8, 40));
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
    if (!state.rx) return;
    state.stations.forEach((st) => {
      if (st.status === 'talking') {
        st.callTimer -= 1;
        if (st.callTimer <= 0) { endCall(st); return; }
        if (Math.random() < 0.3) {
          st.slots = st.slots.map((s) => s.t === 'call' ? { ...s, body: `呼出 [ID ${st.callId}]・${Math.random() < 0.82 ? '再生中' : '受信中'}` } : s);
        }
      } else if (st.status === 'sync') {
        if (Math.random() < 0.038) startCall(st);
      } else if (st.status === 'judging') {
        st.sync = Math.min(99.6, st.sync + rand(1.2, 6.5));
        if (st.sync > 60) {
          st.status = 'sync';
          st.sync = rand(97, 100);
          st.baseSig = -rand(48, 55);
          st.baseSnr = rand(11, 15);
          st.slots = makeSlots('sync');
          toast(`同期確立: ${fmtHz(st.freq)} [組織名 ${st.org}]`);
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
    const lo = state.center - SPAN / 2, hi = state.center + SPAN / 2;
    if (st.freq < lo + 0.08 || st.freq > hi - 0.08) { state.center = st.freq; state.centerAuto = true; }
    if (st.status !== 'talking') state.recSeconds = 0;
    renderStations();
    renderMonitor();
    if (!opts.silent) audio.init();
  }

  function tuneTo(freq, opts = {}) {
    freq = clamp(Math.round(freq * 10000) / 10000, 250, 292);
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
    if (freq < state.center - SPAN / 2 || freq > state.center + SPAN / 2) { state.center = freq; state.centerAuto = true; }
    renderStations();
    renderMonitor();
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
      renderStations();
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
    renderMonitor();
    updateDynamic();
    toast(on ? '受信を再開しました' : '受信を停止しました（シミュレーション一時停止）');
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

  const fToX = (f) => (f - (state.center - SPAN / 2)) / SPAN * CW;
  const xToF = (x) => state.center - SPAN / 2 + (x / CW) * SPAN;

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

    // 波形の生成
    const stepPx = 2;
    const pts = [];
    const visible = state.stations.filter((s) => s.freq > state.center - SPAN / 2 - 0.02 && s.freq < state.center + SPAN / 2 + 0.02);
    for (let x = 0; x <= CW; x += stepPx) {
      let v = noiseAt(x * 0.5, t);
      for (const s of visible) {
        const dx = x - fToX(s.freq);
        if (Math.abs(dx) > 70) continue;
        let amp = s.status === 'talking' ? 0.72 : s.status === 'sync' ? 0.34 : s.status === 'judging' ? 0.26 : 0.10;
        if (s.status === 'talking') amp += Math.sin(t * 2.4 + s.freq) * 0.06;
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

    const lo = state.center - SPAN / 2, hi = state.center + SPAN / 2;
    ctx.font = '9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = '#5f7085';
    ctx.textAlign = 'center';
    const tickStep = 0.4;
    for (let f = Math.ceil(lo / tickStep) * tickStep; f < hi; f += tickStep) {
      const x = fToX(f);
      if (x < 16 || x > CW - 16) continue;
      ctx.fillRect(x - .5, plotBottom + 1, 1, 3);
      ctx.fillText(f.toFixed(1), x, plotBottom + 22);
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

  let raf = 0;
  function loop(ts) {
    drawSpectrum(ts / 1000);
    raf = requestAnimationFrame(loop);
  }

  /* ── 音声デモ ─────────────────────────────────────────── */
  const audio = {
    ctx: null, master: null, voice: null, rumble: null, ready: false,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const ac = new AC();
        const master = ac.createGain();
        master.gain.value = this.gainValue();
        master.connect(ac.destination);

        const len = Math.floor(ac.sampleRate * 2);
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = ac.createBufferSource();
        src.buffer = buf; src.loop = true;
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 0.85;
        const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 330;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2900;
        const g = ac.createGain(); g.gain.value = 0;
        src.connect(bp); bp.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master);
        src.start();

        const osc = ac.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 118;
        const olp = ac.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 240;
        const og = ac.createGain(); og.gain.value = 0;
        osc.connect(olp); olp.connect(og); og.connect(master); osc.start();

        this.ctx = ac; this.master = master; this.voice = g; this.rumble = og; this.ready = true;
      } catch (e) { /* 音声が使えない環境では無音で動作 */ }
    },
    gainValue() {
      if (!state.audio) return 0;
      return state.muted ? 0 : (state.volume / 100) * 0.42;
    },
    apply() {
      if (!this.ctx) return;
      const v = this.gainValue();
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    },
    tick() {
      if (!this.ready || !this.ctx) return;
      const st = selected();
      const gate = state.rx && state.audio && !state.muted;
      const talking = st && st.status === 'talking';
      const above = state.level > state.squelch;
      const on = gate && talking && above;
      const target = on ? 0.05 + Math.random() * 0.17 * (0.6 + Math.abs(Math.sin(levelPhase)) * 0.7) : 0;
      this.voice.gain.setTargetAtTime(target, this.ctx.currentTime, 0.028);
      this.rumble.gain.setTargetAtTime(on ? 0.018 + Math.random() * 0.008 : 0, this.ctx.currentTime, 0.05);
    },
    beep() {
      if (!this.ready || !this.ctx || !state.audio || state.muted) return;
      const ac = this.ctx, t0 = ac.currentTime;
      [0, .13].forEach((off) => {
        const o = ac.createOscillator(); const g = ac.createGain();
        o.type = 'square'; o.frequency.value = 1180;
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.linearRampToValueAtTime(0.09, t0 + off + 0.012);
        g.gain.linearRampToValueAtTime(0.0001, t0 + off + 0.075);
        o.connect(g); g.connect(this.master);
        o.start(t0 + off); o.stop(t0 + off + 0.1);
      });
    }
  };

  /* ── 履歴 ─────────────────────────────────────────────── */
  function renderHistory() {
    const rows = state.history.map((h, i) => {
      const d = new Date(h.at);
      const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
      const dur = `${Math.floor(h.dur / 60)}:${pad2(h.dur % 60)}`;
      return `<tr>
        <td class="mono">${time}</td>
        <td class="mono">${fmtHz(h.freq)}</td>
        <td>[${h.org}]</td>
        <td class="${h.kind === '通話' ? 't-talking' : ''}">${h.kind}</td>
        <td class="mono">${dur}</td>
        <td class="mono">${h.id ? 'ID ' + h.id : '—'}</td>
        <td><button class="play" type="button" data-hist="${i}" aria-label="再生（デモ）">▶</button></td>
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
        stepMode: state.stepMode, autoScan: state.autoScan, autoFollow: state.autoFollow
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
        renderStations();
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
    el.freqInput.addEventListener('blur', () => { el.freqInput.value = fmtHz(state.tuned); });

    function commitFreq() {
      const v = parseFloat(el.freqInput.value.replace(/[^0-9.]/g, ''));
      if (!isFinite(v) || v <= 0) { toast('周波数を数値で入力してください'); el.freqInput.value = fmtHz(state.tuned); return; }
      if (v < 250 || v > 292) { toast('このデモの帯域は 250–292 MHz です'); el.freqInput.value = fmtHz(state.tuned); return; }
      tuneTo(v, { announce: true });
    }

    $('#listenBtn').addEventListener('click', () => { audio.init(); commitFreq(); });

    // 呼び出し
    $('#callBtn').addEventListener('click', () => {
      audio.init();
      if (!state.rx) { toast('受信停止中です。先に受信を開始してください'); return; }
      const st = selected();
      if (!st) { toast('未登録周波数には呼び出しできません'); return; }
      if (st.status === 'talking') { toast('この局は既に通話中です'); return; }
      startCall(st, { mine: true, id: Math.floor(rand(2000, 2999)) });
      toast(`呼出を送信 → ${fmtHz(st.freq)} [組織名 ${st.org}]（デモ）`);
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
      toast(`規格 ${state.stdMode === 'auto' ? '自動判定' : state.stdMode} を適用`);
    });

    // 履歴
    $('#historyBtn').addEventListener('click', () => openModal('historyModal'));
    $('#histClear').addEventListener('click', () => { state.history = []; renderHistory(); toast('履歴をクリアしました'); });
    el.histBody.addEventListener('click', (e) => {
      const b = e.target.closest('[data-hist]');
      if (!b) return;
      audio.init(); audio.beep();
      toast('録音を再生（デモ音）');
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
    });
    el.audioToggle.addEventListener('change', () => {
      state.audio = el.audioToggle.checked;
      audio.init(); audio.apply();
      savePrefs();
      toast(state.audio ? 'デモ音をON' : 'デモ音をOFF');
    });
    $('#resetDemo').addEventListener('click', () => {
      initStations();
      state.recSeconds = 14;
      state.recManual = false;
      state.filter = 'all';
      state.checked.clear();
      state.selectMode = false;
      $$('.chip').forEach((b) => { const on = b.dataset.filter === 'all'; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
      renderStations(); renderBulk(); renderMonitor(); updateDynamic();
      toast('デモを初期状態に戻しました');
      closeModals();
    });

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
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      if (Math.abs(dx) > 3) dragMoved = true;
      if (dragMoved) {
        state.center = clamp(dragStartCenter - dx * SPAN / CW, 250, 292);
        state.centerAuto = false;
        renderSpanInfo();
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      if (!dragMoved) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const f = xToF(x);
        const snapped = Math.round(f / state.step) * state.step;
        audio.init();
        tuneTo(snapped);
        toast(`${fmtHz(clamp(snapped, 250, 292))} MHz へチューニング`);
      }
    });
    canvas.addEventListener('pointerleave', () => { hoverX = -1; });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      state.center = clamp(state.center + dir * state.step, 250, 292);
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
    state.step = STEP_MAP[state.stepMode] || STEP_MAP.auto;
    applySpeed();
    applySquelch();
  }

  function boot() {
    initStations();
    loadPrefs();
    bindUI();
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
