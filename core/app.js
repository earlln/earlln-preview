'use strict';

/* ───────────────── 운동 그림 ───────────────── */
const FIG = {
  mckenzie: `<svg viewBox="0 0 200 100" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <line class="floor" x1="8" y1="88" x2="192" y2="88" stroke-width="3"/>
    <path class="body" d="M22 84 L98 82" stroke-width="9"/>
    <path class="hi" d="M98 82 Q122 76 138 50" stroke-width="11"/>
    <path class="body" d="M138 54 L134 84 L168 84" stroke-width="7"/>
    <circle class="body" cx="148" cy="36" r="10" stroke-width="6"/>
  </svg>`,
  plank: `<svg viewBox="0 0 200 100" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <line class="floor" x1="8" y1="88" x2="192" y2="88" stroke-width="3"/>
    <path class="hi" d="M26 82 L146 52" stroke-width="11"/>
    <path class="body" d="M146 54 L146 84 L174 84" stroke-width="7"/>
    <circle class="body" cx="162" cy="44" r="10" stroke-width="6"/>
  </svg>`,
  birddog: `<svg viewBox="0 0 200 100" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <line class="floor" x1="8" y1="88" x2="192" y2="88" stroke-width="3"/>
    <path class="body" d="M74 52 L138 52" stroke-width="11"/>
    <path class="body" d="M74 54 L74 84 L50 84" stroke-width="7"/>
    <path class="body" d="M136 54 L136 84" stroke-width="7"/>
    <path class="hi" d="M140 54 L192 58" stroke-width="7"/>
    <path class="hi" d="M72 50 L18 46" stroke-width="7"/>
    <circle class="body" cx="152" cy="36" r="10" stroke-width="6"/>
  </svg>`,
};

/* 운동 순서와 동작 특성 (문구는 i18n.js) */
const EXERCISES = [
  { id: 'mckenzie' },
  { id: 'plank' },
  { id: 'birddog', alternate: true },
];
const FEATURE_KEYS = ['timer', 'sound', 'log', 'guide', 'music', 'video'];

const DEFAULTS = {
  lang: (navigator.language || 'ko').toLowerCase().startsWith('ko') ? 'ko' : 'en',
  features: { timer: true, sound: true, log: true, guide: true, music: true, video: true },
  musicStyle: 'pad',
  musicVol: 40,
  prep: 10,
  voice: true,
  count: true,
  beep: true,
  rate: 1,
  reminder: { on: false, time: '07:00' },
  ex: {
    mckenzie: { on: true, hold: 7, reps: 10, sets: 1, rest: 3, setRest: 30, video: '' },
    plank:    { on: true, hold: 20, reps: 4, sets: 1, rest: 30, setRest: 30, video: '' },
    birddog:  { on: true, hold: 5, reps: 10, sets: 1, rest: 3, setRest: 30, video: '' },
  },
};

const LIMITS = {
  hold:    { min: 3, max: 180, step: 1, unit: 'unit_s' },
  reps:    { min: 1, max: 30, step: 1, unit: 'unit_reps' },
  sets:    { min: 1, max: 5, step: 1, unit: 'unit_sets' },
  rest:    { min: 2, max: 120, step: 1, unit: 'unit_s' },
  setRest: { min: 5, max: 180, step: 5, unit: 'unit_s' },
  prep:    { min: 3, max: 30, step: 1, unit: 'unit_s' },
};

/* ───────────────── 저장소 ───────────────── */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* 저장 불가 환경 */ }
  },
};

const clone = o => JSON.parse(JSON.stringify(o));
function loadSettings() {
  const saved = store.get('cf.settings', {});
  const s = { ...clone(DEFAULTS), ...saved, ex: clone(DEFAULTS.ex) };
  s.features = { ...DEFAULTS.features, ...(saved.features || {}) };
  s.reminder = { ...DEFAULTS.reminder, ...(saved.reminder || {}) };
  if (!I18N[s.lang]) s.lang = DEFAULTS.lang;
  for (const id of Object.keys(DEFAULTS.ex)) s.ex[id] = { ...DEFAULTS.ex[id], ...(saved.ex?.[id] || {}) };
  return s;
}
let settings = loadSettings();
let log = store.get('cf.log', {});
const saveSettings = () => store.set('cf.settings', settings);
const saveLog = () => store.set('cf.log', log);
const on = key => settings.features[key];

/* ───────────────── 언어 ───────────────── */
function t(key, params) {
  let s = I18N[settings.lang][key] ?? I18N.ko[key] ?? key;
  if (params && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
  return s;
}
const tx = id => EX_TEXT[settings.lang][id];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (d, opts) => d.toLocaleDateString(t('locale'), opts);

function applyStaticText() {
  document.documentElement.lang = settings.lang;
  document.title = t('app_title');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  $('#cal-week').innerHTML = t('week').map(w => `<span>${w}</span>`).join('');
  renderVersion();
}

/* 버전 표시: 웹은 version.js, 안드로이드 앱은 설치된 앱 정보(버전 + 빌드 번호) */
let appInfo = { version: window.APP_VERSION || '', build: '' };
function renderVersion() {
  if (!appInfo.version) return;
  const text = `${t('app_title')} · ${t('version_label', { v: appInfo.version })}`
    + (appInfo.build ? ` (${t('build_n', { n: appInfo.build })})` : '');
  document.querySelectorAll('[data-version]').forEach(el => { el.textContent = text; });
}

/* ───────────────── 안드로이드 앱(Capacitor) 연결 ───────────────── */
const native = (() => {
  const C = window.Capacitor;
  const reg = window.capacitorExports?.registerPlugin || C?.registerPlugin;
  if (!C?.isNativePlatform?.() || !reg) return { isNative: false };
  return {
    isNative: true,
    TTS: reg('TextToSpeech'),
    KeepAwake: reg('KeepAwake'),
    Notif: reg('LocalNotifications'),
    Files: reg('Filesystem'),
    Share: reg('Share'),
  };
})();
if (native.isNative) document.documentElement.classList.add('native');

/* ───────────────── 날짜 도우미 ───────────────── */
const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => dateKey(new Date());

function streak() {
  const d = new Date();
  if (log[dateKey(d)]?.status !== 'done') d.setDate(d.getDate() - 1);
  let n = 0;
  while (log[dateKey(d)]?.status === 'done') { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ───────────────── 소리 ───────────────── */
let audioCtx;
function getCtx() {
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function beep(freq = 880, ms = 120, vol = 0.25) {
  if (!on('sound') || !settings.beep) return;
  try {
    getCtx();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; o.type = 'sine';
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ms / 1000);
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + ms / 1000);
  } catch { /* 오디오 미지원 */ }
}

/* ───────────────── 배경음악 (코드로 만드는 음악, 음원 파일 없음) ───────────────── */
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const PAD_CHORDS = [[48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 64], [43, 50, 55, 59, 62]];
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88];

const music = {
  playing: false, timer: null, nodes: null, next: 0, step: 0, waveNext: 0, style: null,

  start() {
    if (this.playing) return;
    let ctx;
    try { ctx = getCtx(); } catch { return; }
    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); // 음량을 올려도 소리가 깨지지 않게
    comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    // 간단한 울림(딜레이 피드백)
    const bus = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const delay = ctx.createDelay(2); delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    bus.connect(lp).connect(master);
    lp.connect(delay); delay.connect(fb).connect(delay); delay.connect(wet).connect(master);
    this.nodes = { ctx, master, bus };
    this.style = settings.musicStyle;
    this.next = this.waveNext = ctx.currentTime + 0.1;
    this.step = 0;
    if (this.style === 'waves') this.startNoise();
    this.playing = true;
    this.tick();
    this.timer = setInterval(() => this.tick(), 250);
  },

  stop(fade = 1.2) {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    const { ctx, master } = this.nodes;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0, ctx.currentTime, fade / 4);
    const nodes = this.nodes;
    setTimeout(() => { try { nodes.noise?.stop(); nodes.master.disconnect(); } catch { /* 이미 정리됨 */ } }, fade * 1000 + 300);
    this.nodes = null;
  },

  restart() { if (this.playing) { this.stop(0.4); setTimeout(() => this.start(), 450); } },

  level() {
    const base = (settings.musicVol / 100) * 0.9;
    return isSpeaking() ? base * 0.3 : base; // 음성 안내 중에는 작게
  },

  tick() {
    if (!this.playing) return;
    const { ctx, master } = this.nodes;
    master.gain.setTargetAtTime(this.level(), ctx.currentTime, 0.35);
    const ahead = ctx.currentTime + 1.5;
    while (this.next < ahead) this[this.style === 'musicbox' ? 'boxNote' : this.style === 'waves' ? 'drone' : 'chord']();
    if (this.style === 'waves') while (this.waveNext < ahead) this.wave();
  },

  tone(freq, t, dur, { type = 'sine', vol = 0.1, attack = 2, release = 3 } = {}) {
    const { ctx, bus } = this.nodes;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus);
    o.start(t); o.stop(t + dur + 0.1);
  },

  chord() { // 잔잔한 화음: 8초마다 천천히 바뀌는 패드
    const t = this.next, notes = PAD_CHORDS[this.step++ % PAD_CHORDS.length];
    notes.forEach((m, i) => {
      this.tone(mtof(m), t, 10, { type: i ? 'sine' : 'triangle', vol: 0.05, attack: 3, release: 4 });
      this.tone(mtof(m) * 1.003, t, 10, { vol: 0.03, attack: 3.5, release: 4 });
    });
    this.next += 8;
  },

  boxNote() { // 오르골: 5음계 음을 여유 있게 하나씩
    const t = this.next;
    if (this.step % 16 === 0) {
      const root = PAD_CHORDS[(this.step / 16) % PAD_CHORDS.length][0];
      this.tone(mtof(root), t, 14, { vol: 0.05, attack: 3, release: 5 });
      this.tone(mtof(root + 7), t, 14, { vol: 0.03, attack: 3, release: 5 });
    }
    const m = PENTA[Math.floor(Math.random() * PENTA.length)];
    this.tone(mtof(m), t, 2.6, { vol: 0.09, attack: 0.01, release: 2.55 });
    this.tone(mtof(m) * 2, t, 1.2, { vol: 0.02, attack: 0.01, release: 1.15 });
    this.step++;
    this.next += [0.75, 0.75, 1.5, 1.5, 2.25][Math.floor(Math.random() * 5)];
  },

  drone() { // 파도 소리 아래에 깔리는 낮은 음
    const t = this.next, root = PAD_CHORDS[this.step++ % PAD_CHORDS.length][0];
    this.tone(mtof(root), t, 18, { vol: 0.045, attack: 5, release: 6 });
    this.tone(mtof(root + 12), t, 18, { vol: 0.02, attack: 6, release: 6 });
    this.next += 16;
  },

  startNoise() {
    const { ctx, bus } = this.nodes;
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0.05;
    src.connect(lp).connect(g).connect(bus);
    src.start();
    Object.assign(this.nodes, { noise: src, waveGain: g });
  },

  wave() { // 6~10초 주기로 밀려왔다 빠지는 파도
    const g = this.nodes.waveGain.gain, t = this.waveNext, d = 6 + Math.random() * 4;
    g.setValueAtTime(0.05, t);
    g.linearRampToValueAtTime(0.4 + Math.random() * 0.25, t + d * 0.4);
    g.linearRampToValueAtTime(0.05, t + d);
    this.waveNext += d;
  },
};

/* ───────────────── 음성 안내 ───────────────── */
let webVoice = null;
let nativeSpeaking = false;
function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  const loc = t('locale'), base = loc.slice(0, 2);
  webVoice = voices.find(v => v.lang === loc) || voices.find(v => v.lang?.replace('_', '-') === loc)
    || voices.find(v => v.lang?.startsWith(base)) || null;
}
if (!native.isNative && 'speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
const canSpeak = () => native.isNative || 'speechSynthesis' in window;
function isSpeaking() {
  return native.isNative ? nativeSpeaking : ('speechSynthesis' in window && speechSynthesis.speaking);
}
function stopSpeech() {
  if (native.isNative) { nativeSpeaking = false; native.TTS.stop().catch(() => {}); }
  else if ('speechSynthesis' in window) speechSynthesis.cancel();
}
function say(text, { force = false } = {}) {
  if (!text || !canSpeak()) return;
  if (!force && (!on('sound') || !settings.voice)) return;
  const rate = Number(settings.rate) || 1;
  if (native.isNative) {
    nativeSpeaking = true;
    // 새 문장이 오면 이전 문장을 끊고 바로 말합니다 (기본 Flush 방식)
    native.TTS.speak({ text, lang: t('locale'), rate, pitch: 1, volume: 1 })
      .catch(() => {}).finally(() => { nativeSpeaking = false; });
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = t('locale');
  if (webVoice) u.voice = webVoice;
  u.rate = rate;
  speechSynthesis.speak(u);
}

/* ───────────────── 화면 꺼짐 방지 ───────────────── */
let wakeLock = null;
async function keepAwake(onState) {
  try {
    if (native.isNative) {
      await (onState ? native.KeepAwake.keepAwake() : native.KeepAwake.allowSleep());
    } else if (onState && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    } else if (!onState && wakeLock) {
      await wakeLock.release(); wakeLock = null;
    }
  } catch { /* 미지원 */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && runner.active) keepAwake(true);
});

/* ───────────────── 아침 알림 (안드로이드 앱 전용) ───────────────── */
const REMINDER_ID = 7001;
async function scheduleReminder({ announce = false } = {}) {
  if (!native.isNative) return;
  const N = native.Notif;
  try {
    await N.cancel({ notifications: [{ id: REMINDER_ID }] });
    if (!settings.reminder.on) return;
    let perm = await N.checkPermissions();
    if (perm.display !== 'granted') perm = await N.requestPermissions();
    if (perm.display !== 'granted') {
      settings.reminder.on = false; saveSettings(); renderSettings();
      alert(t('reminder_denied'));
      return;
    }
    const [hour, minute] = settings.reminder.time.split(':').map(Number);
    await N.schedule({
      notifications: [{
        id: REMINDER_ID,
        title: t('notif_title'),
        body: t('notif_body'),
        smallIcon: 'ic_stat_notify',
        schedule: { on: { hour, minute }, allowWhileIdle: true },
      }],
    });
    if (announce) alert(t('reminder_saved', { time: settings.reminder.time }));
  } catch (err) {
    console.warn('reminder', err);
  }
}

/* ───────────────── 공통 ───────────────── */
const $ = sel => document.querySelector(sel);
/* 운동 그림: 영상 기능이 켜져 있으면 반복 재생 영상, 꺼져 있으면 간단한 그림 */
const mediaSrc = name => `media/${name}.mp4`;
const fig = id => on('video')
  ? `<div class="fig vid"><video src="${mediaSrc(id + '-loop')}" poster="media/${id}.jpg" muted autoplay loop playsinline preload="auto" aria-hidden="true"></video></div>`
  : `<div class="fig">${FIG[id]}</div>`;

/* 운동 화면의 영상: 타이머 단계(준비/유지/휴식)에 맞춰 알맞은 동작 구간을 재생합니다 */
function workoutClip(st) {
  const manual = !on('timer');
  const side = st.rep % 2 === 1 ? 'a' : 'b';
  if (st.type === 'prep' || manual) return { name: st.ex + '-loop', loop: true };
  if (st.ex === 'plank') return st.type === 'hold' ? { name: 'plank-loop', loop: true } : { name: 'plank-loop', still: true };
  if (st.ex === 'mckenzie') return { name: st.type === 'hold' ? 'mckenzie-up' : 'mckenzie-down' };
  if (st.setBreak) return { name: 'birddog-loop', still: true };
  return { name: `birddog-${side}-${st.type === 'hold' ? 'out' : 'back'}` };
}
function showWorkoutMedia(st) {
  const box = $('#wo-figure');
  if (!on('video')) { box.innerHTML = `<div class="fig">${FIG[st.ex]}</div>`; return; }
  let v = box.querySelector('video');
  if (!v) {
    box.innerHTML = '<div class="fig vid"><video muted playsinline preload="auto" aria-hidden="true"></video></div>';
    v = box.querySelector('video');
  }
  const clip = workoutClip(st);
  const src = mediaSrc(clip.name);
  v.loop = !!clip.loop;
  v.poster = `media/${st.ex}.jpg`;
  if (!v.src.endsWith(src)) v.src = src;
  try { v.currentTime = 0; } catch { /* 아직 불러오는 중 */ }
  if (clip.still || runner.paused) v.pause();
  else v.play().catch(() => {});
}
function pauseWorkoutMedia(paused) {
  const v = $('#wo-figure video');
  if (!v) return;
  if (paused) v.pause();
  else if (!v.ended && v.loop) v.play().catch(() => {});
  else if (!v.ended && v.currentTime > 0 && v.currentTime < v.duration) v.play().catch(() => {});
}
const exName = id => tx(id).name;
function fmtSec(s) {
  if (s < 60) return t('sec_n', { n: s });
  const m = Math.floor(s / 60), r = s % 60;
  return t('min_n', { n: m }) + (r ? ' ' + t('sec_n', { n: r }) : '');
}
function summary(id) {
  const c = settings.ex[id];
  const side = EXERCISES.find(e => e.id === id).alternate ? t('side_alt') : '';
  const sets = c.sets > 1 ? t('sets_suffix', { n: c.sets }) : '';
  if (!on('timer')) return t('summary_reps', { reps: c.reps }) + side + sets + t('manual_mode');
  return t('summary_hold', { hold: fmtSec(c.hold), reps: c.reps }) + side + sets;
}
function exDuration(id) {
  const c = settings.ex[id];
  return settings.prep + c.sets * (c.reps * c.hold + (c.reps - 1) * c.rest) + (c.sets - 1) * c.setRest;
}
const unitText = (key, v) => `${v}${t(LIMITS[key].unit)}`;

/* ───────────────── 홈 ───────────────── */
function renderHome() {
  $('#today-label').textContent = fmtDate(new Date(), { month: 'long', day: 'numeric', weekday: 'long' });
  const st = streak();
  $('#streak-badge').textContent = st ? t('streak_n', { n: st }) : t('streak_zero');
  $('#streak-badge').hidden = !on('log');

  const entry = on('log') ? log[todayKey()] : null;
  const active = EXERCISES.filter(e => settings.ex[e.id].on);
  const total = active.reduce((a, e) => a + exDuration(e.id), 0);
  const tc = $('#today-card');
  if (entry?.status === 'done') {
    tc.innerHTML = `<div class="big-icon">✅</div><div><strong>${t('today_done_title')}</strong><span class="muted small">${t('today_done_sub', { time: entry.time || '' })}</span></div>`;
    $('#start-btn').textContent = t('start_again');
  } else {
    const sub = t('today_sub', { n: active.length }) + (on('timer') ? t('about_min', { n: Math.ceil(total / 60) }) : t('manual_mode'));
    tc.innerHTML = `<div class="big-icon">☀️</div><div><strong>${t('today_title')}</strong><span class="muted small">${sub}</span></div>`;
    $('#start-btn').textContent = t('start');
  }
  $('#start-btn').disabled = active.length === 0;
  $('#start-note').textContent = t('start_note', {
    a: on('timer') ? t('note_timer') : t('note_manual'),
    b: on('sound') ? t('note_voice') : t('note_screen'),
  });

  $('#ex-list').innerHTML = EXERCISES.map(e => `
    <li class="ex-item ${settings.ex[e.id].on ? '' : 'off'}">
      ${fig(e.id)}
      <div class="info"><strong>${exName(e.id)}</strong><span>${settings.ex[e.id].on ? summary(e.id) : t('ex_off')}</span></div>
      ${on('guide') ? `<button class="icon-btn" data-guide="${e.id}" aria-label="${esc(t('guide_aria', { name: exName(e.id) }))}">ⓘ</button>` : ''}
    </li>`).join('');
}

/* ───────────────── 자세 설명 ───────────────── */
function openGuide(id) {
  const e = tx(id);
  const video = settings.ex[id].video;
  $('#guide-body').innerHTML = `
    <h2>${e.name}</h2><p class="muted small">${e.sub}</p>
    ${fig(id)}
    <h3>${t('guide_method')}</h3>
    <ol>${e.steps.map(s => `<li>${s}</li>`).join('')}</ol>
    ${e.memo ? `<h3>${t('guide_memo')}</h3><div class="memo">✍️ ${e.memo}</div>` : ''}
    <h3>${t('guide_tips')}</h3>
    <ul>${e.tips.map(s => `<li>${s}</li>`).join('')}</ul>
    <div class="caution">${t('guide_caution')}</div>
    ${video ? `<a class="btn primary" href="${encodeURI(video)}" target="_blank" rel="noopener">${t('guide_video')}</a>`
            : `<p class="small muted">${t('guide_video_hint')}</p>`}`;
  $('#guide').showModal();
}
$('#guide-close').onclick = () => $('#guide').close();
$('#guide').addEventListener('click', ev => { if (ev.target.id === 'guide') $('#guide').close(); });
document.addEventListener('click', ev => {
  const g = ev.target.closest('[data-guide]');
  if (g) openGuide(g.dataset.guide);
});

/* ───────────────── 기록 / 달력 ───────────────── */
let calMonth = new Date(); calMonth.setDate(1);
function renderLog() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  $('#cal-title').textContent = fmtDate(calMonth, { year: 'numeric', month: 'long' });
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const tk = todayKey();
  let html = '';
  for (let i = 0; i < first; i++) html += '<span class="cal-day empty"></span>';
  let monthDone = 0;
  for (let d = 1; d <= days; d++) {
    const k = `${y}-${pad(m + 1)}-${pad(d)}`;
    const st = log[k]?.status;
    if (st === 'done') monthDone++;
    const cls = ['cal-day', st || '', k === tk ? 'today' : '', k > tk ? 'future' : ''].join(' ');
    html += `<button class="${cls}" data-day="${k}" ${k > tk ? 'disabled' : ''}>${d}</button>`;
  }
  $('#cal-grid').innerHTML = html;
  const totalDone = Object.values(log).filter(v => v.status === 'done').length;
  $('#stats').innerHTML = `
    <div class="stat"><b>${streak()}</b><span>${t('stat_streak')}</span></div>
    <div class="stat"><b>${monthDone}</b><span>${t('stat_month')}</span></div>
    <div class="stat"><b>${totalDone}</b><span>${t('stat_total')}</span></div>`;
}
$('#cal-prev').onclick = () => { calMonth.setMonth(calMonth.getMonth() - 1); renderLog(); };
$('#cal-next').onclick = () => { calMonth.setMonth(calMonth.getMonth() + 1); renderLog(); };
$('#cal-grid').addEventListener('click', ev => {
  const b = ev.target.closest('[data-day]');
  if (!b) return;
  const k = b.dataset.day;
  const [yy, mm, dd] = k.split('-').map(Number);
  const date = fmtDate(new Date(yy, mm - 1, dd), { month: 'long', day: 'numeric' });
  if (log[k]) {
    if (confirm(t('confirm_clear', { date }))) { delete log[k]; saveLog(); }
  } else if (confirm(t('confirm_mark', { date }))) {
    log[k] = { status: 'done', manual: true };
    saveLog();
  }
  renderLog(); renderHome();
});

/* ───────────────── 설정 ───────────────── */
function stepperHTML(value, key) {
  return `<button type="button" data-d="-1" aria-label="${t('dec')}">−</button><output>${unitText(key, value)}</output><button type="button" data-d="1" aria-label="${t('inc')}">+</button>`;
}
function renderSettings() {
  $('#opt-lang').value = settings.lang;
  $('#settings-features').innerHTML = FEATURE_KEYS.map(k => {
    const [label, desc] = t('feat_' + k);
    return `<label class="row feat"><span><b>${label}</b><small class="muted">${desc}</small></span>
      <input type="checkbox" class="switch" data-feature="${k}" ${on(k) ? 'checked' : ''}></label>`;
  }).join('');
  $('#sound-card').hidden = !on('sound');
  $('#sound-title').hidden = !on('sound');
  $('#prep-card').hidden = !on('timer');
  $('#prep-title').hidden = !on('timer');
  $('#music-card').hidden = !on('music');
  $('#music-title').hidden = !on('music');
  $('#reminder-card').hidden = !native.isNative;
  $('#reminder-title').hidden = !native.isNative;
  $('#opt-reminder').checked = settings.reminder.on;
  $('#opt-reminder-time').value = settings.reminder.time;
  $('#reminder-time-row').hidden = !settings.reminder.on;
  $('#opt-music-style').value = settings.musicStyle;
  $('#opt-music-vol').value = settings.musicVol;
  $('#music-vol-text').textContent = `${settings.musicVol}%`;
  $('#music-preview').textContent = previewTimer ? t('music_stop') : t('music_preview');
  $('#settings-ex').innerHTML = EXERCISES.map(e => {
    const c = settings.ex[e.id], x = tx(e.id);
    const fields = on('timer') ? ['hold', 'reps', 'sets', 'rest'].concat(c.sets > 1 ? ['setRest'] : []) : ['reps', 'sets'];
    return `<div class="card ex-set">
      <h3>${x.name}<input type="checkbox" class="switch" data-on="${e.id}" ${c.on ? 'checked' : ''} aria-label="${esc(t('ex_toggle', { name: x.name }))}"></h3>
      ${x.memo && on('guide') ? `<p class="hint small muted">✍️ ${x.memo}</p>` : ''}
      ${e.alternate ? `<p class="hint small muted">${t('alt_hint')}</p>` : ''}
      ${fields.map(f => `<div class="row"><span>${t('lbl_' + f)}</span>
        <div class="stepper" data-ex="${e.id}" data-key="${f}">${stepperHTML(c[f], f)}</div></div>`).join('')}
      ${on('guide') ? `<div class="row" style="display:block"><span class="small muted">${t('video_label')}</span>
        <input type="url" data-video="${e.id}" placeholder="https://" value="${esc(c.video || '')}"></div>` : ''}
    </div>`;
  }).join('');
  document.querySelector('[data-global="prep"]').innerHTML = stepperHTML(settings.prep, 'prep');
  $('#opt-voice').checked = settings.voice;
  $('#opt-count').checked = settings.count;
  $('#opt-beep').checked = settings.beep;
  $('#opt-rate').value = String(settings.rate);
}
$('#view-settings').addEventListener('click', ev => {
  const btn = ev.target.closest('.stepper button');
  if (!btn) return;
  const box = btn.parentElement;
  const key = box.dataset.key || box.dataset.global;
  const L = LIMITS[key];
  const obj = box.dataset.ex ? settings.ex[box.dataset.ex] : settings;
  obj[key] = Math.min(L.max, Math.max(L.min, obj[key] + Number(btn.dataset.d) * L.step));
  saveSettings();
  if (key === 'sets') renderSettings();
  else box.querySelector('output').textContent = unitText(key, obj[key]);
  renderHome();
});
$('#view-settings').addEventListener('change', ev => {
  const tg = ev.target;
  if (tg.dataset.feature) {
    settings.features[tg.dataset.feature] = tg.checked;
    if (tg.dataset.feature === 'music' && !tg.checked) stopPreview();
    saveSettings(); applyFeatures(); renderAll();
    return;
  }
  if (tg.id === 'opt-lang') {
    settings.lang = tg.value;
    saveSettings();
    if (!native.isNative) pickVoice();
    applyStaticText(); renderAll();
    scheduleReminder(); // 알림 문구도 새 언어로
    return;
  }
  if (tg.id === 'opt-reminder' || tg.id === 'opt-reminder-time') {
    if (tg.id === 'opt-reminder') settings.reminder.on = tg.checked;
    else if (tg.value) settings.reminder.time = tg.value;
    saveSettings(); renderSettings();
    scheduleReminder({ announce: settings.reminder.on });
    return;
  }
  if (tg.dataset.on) settings.ex[tg.dataset.on].on = tg.checked;
  else if (tg.dataset.video) settings.ex[tg.dataset.video].video = /^https?:\/\//i.test(tg.value.trim()) ? tg.value.trim() : '';
  else if (tg.id === 'opt-voice') settings.voice = tg.checked;
  else if (tg.id === 'opt-count') settings.count = tg.checked;
  else if (tg.id === 'opt-beep') settings.beep = tg.checked;
  else if (tg.id === 'opt-rate') settings.rate = Number(tg.value);
  else if (tg.id === 'opt-music-style') { settings.musicStyle = tg.value; music.restart(); }
  else if (tg.id === 'opt-music-vol') settings.musicVol = Number(tg.value);
  else return;
  saveSettings(); renderHome();
});
$('#opt-music-vol').addEventListener('input', ev => {
  settings.musicVol = Number(ev.target.value);
  $('#music-vol-text').textContent = `${settings.musicVol}%`;
});
let previewTimer = null;
function stopPreview() {
  if (!previewTimer) return;
  clearTimeout(previewTimer); previewTimer = null;
  music.stop();
  $('#music-preview').textContent = t('music_preview');
}
$('#music-preview').onclick = () => {
  if (previewTimer) return stopPreview();
  music.start();
  $('#music-preview').textContent = t('music_stop');
  previewTimer = setTimeout(stopPreview, 20000);
};

$('#test-voice').onclick = () => {
  if (!canSpeak()) { alert(t('no_tts')); return; }
  if (!native.isNative) pickVoice();
  say(t('test_voice_say'), { force: true });
  beep();
};
$('#reset-settings').onclick = () => {
  if (!confirm(t('confirm_reset'))) return;
  const keep = { features: settings.features, lang: settings.lang, reminder: settings.reminder };
  settings = { ...clone(DEFAULTS), ...keep };
  saveSettings(); renderSettings(); renderHome();
};

async function exportBackup() {
  const json = JSON.stringify({ app: 'core-fit', settings, log }, null, 2);
  const name = `${t('backup_name')}-${todayKey()}.json`;
  if (native.isNative) {
    // 앱에서는 파일을 만든 뒤 공유 창(카카오톡, 드라이브, 메일 등)으로 보냅니다
    try {
      const { uri } = await native.Files.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
      await native.Share.share({ title: name, files: [uri] });
    } catch (err) { console.warn('backup', err); }
    return;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#export-btn').onclick = exportBackup;
$('#import-btn').onclick = () => $('#import-file').click();
$('#import-file').onchange = async ev => {
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'core-fit') throw new Error();
    if (!confirm(t('confirm_import'))) return;
    store.set('cf.settings', data.settings || {}); settings = loadSettings();
    log = data.log || {}; saveLog();
    applyStaticText(); applyFeatures(); renderAll(); scheduleReminder();
    alert(t('import_ok'));
  } catch { alert(t('import_bad')); }
  ev.target.value = '';
};

/* ───────────────── 운동 진행 ───────────────── */
function buildSteps() {
  const steps = [];
  for (const e of EXERCISES) {
    const c = settings.ex[e.id];
    if (!c.on) continue;
    steps.push({ type: 'prep', ex: e.id, dur: settings.prep });
    for (let s = 1; s <= c.sets; s++) {
      for (let r = 1; r <= c.reps; r++) {
        steps.push({ type: 'hold', ex: e.id, set: s, rep: r, dur: c.hold });
        if (r < c.reps && on('timer')) steps.push({ type: 'rest', ex: e.id, set: s, rep: r, dur: c.rest });
      }
      if (s < c.sets && on('timer')) steps.push({ type: 'rest', ex: e.id, set: s, rep: c.reps, dur: c.setRest, setBreak: true });
    }
    steps.push({ type: 'exdone', ex: e.id, dur: 0 });
  }
  return steps;
}

const runner = {
  active: false, steps: [], i: 0, endAt: 0, remainMs: 0, paused: false, timer: null,
  lastSec: null, completed: new Set(), startedAt: null,
};

function startWorkout() {
  runner.steps = buildSteps();
  if (!runner.steps.length) return;
  runner.active = true; runner.i = 0; runner.paused = false;
  runner.completed = new Set(); runner.startedAt = new Date();
  $('#workout').hidden = false;
  document.body.style.overflow = 'hidden';
  keepAwake(true);
  beep(660, 80, 0.01); // 오디오 잠금 해제
  if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; $('#music-preview').textContent = t('music_preview'); music.stop(0.3); }
  if (on('music')) setTimeout(() => music.start(), 400);
  enterStep();
  runner.timer = setInterval(tick, 100);
}

function enterStep() {
  // 완료 표시 단계는 건너뛰며 기록
  while (runner.steps[runner.i]?.type === 'exdone') {
    runner.completed.add(runner.steps[runner.i].ex);
    runner.i++;
  }
  const st = runner.steps[runner.i];
  if (!st) return finishWorkout(true);
  runner.remainMs = st.dur * 1000;
  runner.endAt = performance.now() + runner.remainMs;
  runner.lastSec = null;
  const e = tx(st.ex), c = settings.ex[st.ex];
  const alternate = EXERCISES.find(x => x.id === st.ex).alternate;

  const W = $('#workout');
  W.dataset.phase = st.type;
  W.classList.toggle('manual', !on('timer'));
  $('#wo-ex').textContent = e.name;
  showWorkoutMedia(st);
  let phase, cue, count = '', speech;
  if (st.type === 'prep') {
    phase = t('phase_prep');
    cue = e.prepCue;
    count = summary(st.ex);
    speech = on('guide') ? `${e.name}. ${e.prepCue}` : t('say_prep_short', { name: e.name });
  } else if (st.type === 'hold') {
    phase = e.holdWord;
    cue = e.holdCue;
    count = t('count_rep', { rep: st.rep, reps: c.reps }) + (c.sets > 1 ? t('set_suffix', { n: st.set }) : '');
    if (alternate) {
      const a = st.rep % 2 === 1;
      phase = t(a ? 'side_a' : 'side_b');
      speech = t('say_rep', { rep: st.rep }) + t(a ? 'say_side_a' : 'say_side_b');
    } else {
      speech = t('say_rep', { rep: st.rep }) + e.holdSay;
    }
    beep(988, 160);
  } else {
    phase = st.setBreak ? t('phase_setrest') : e.restWord;
    cue = st.setBreak ? t('cue_setrest', { n: st.set }) : e.restCue;
    count = t('count_done', { rep: st.rep, reps: c.reps });
    speech = st.setBreak ? t('say_setrest', { n: st.set }) : e.restSay;
    beep(523, 160);
  }
  $('#wo-phase').textContent = phase;
  $('#wo-cue').textContent = cue;
  $('#wo-cue').hidden = !on('guide');
  if (!on('timer')) {
    $('#wo-time').textContent = st.type === 'prep' ? '▶' : st.rep;
    $('#wo-ring').style.strokeDashoffset = st.type === 'prep' ? '0'
      : String(326.73 * (1 - st.rep / settings.ex[st.ex].reps));
    $('#wo-pause').textContent = st.type === 'prep' ? t('manual_start') : t('manual_done', { n: st.rep });
  }
  $('#wo-count').textContent = count;
  say(speech);
  updateProgress();
  tick();
}

function tick() {
  if (!runner.active || !on('timer')) return;
  const st = runner.steps[runner.i];
  if (!st) return;
  const remain = runner.paused ? runner.remainMs : Math.max(0, runner.endAt - performance.now());
  const sec = Math.ceil(remain / 1000);
  $('#wo-time').textContent = sec;
  const frac = st.dur ? remain / (st.dur * 1000) : 0;
  $('#wo-ring').style.strokeDashoffset = String(326.73 * (1 - frac));

  if (!runner.paused && sec !== runner.lastSec) {
    runner.lastSec = sec;
    if (sec > 0 && sec <= 3 && st.dur >= 5) {
      if (settings.count && settings.voice && on('sound')) say(t('count_words')[sec]);
      else beep(740, 90, 0.18);
    } else if (st.type === 'hold' && st.dur >= 20 && sec === Math.floor(st.dur / 2) && sec > 5) {
      // 플랭크처럼 긴 유지에는 중간 안내
      say(t('say_half', { n: sec }));
    }
  }
  if (!runner.paused && remain <= 0) {
    runner.i++;
    enterStep();
  }
}

function updateProgress() {
  const total = runner.steps.length;
  $('#wo-progress-bar').style.width = `${(runner.i / total) * 100}%`;
  const exIds = [...new Set(runner.steps.map(s => s.ex))];
  const cur = runner.steps[runner.i]?.ex;
  $('#wo-progress-text').textContent = cur ? `${exIds.indexOf(cur) + 1}/${exIds.length}` : '';
}

function togglePause() {
  if (!runner.active) return;
  if (!on('timer')) { beep(988, 120); runner.i++; return enterStep(); }
  if (runner.paused) {
    runner.paused = false;
    runner.endAt = performance.now() + runner.remainMs;
    $('#wo-pause').textContent = t('wo_pause');
    $('#workout').classList.remove('paused');
    pauseWorkoutMedia(false);
    if (on('music')) music.start();
    say(t('say_resume'));
  } else {
    runner.paused = true;
    runner.remainMs = Math.max(0, runner.endAt - performance.now());
    $('#wo-pause').textContent = t('wo_resume');
    $('#workout').classList.add('paused');
    pauseWorkoutMedia(true);
    music.stop(0.6);
    say(t('say_pause'));
  }
}
function jump(dir) {
  if (!runner.active) return;
  let i = runner.i + dir;
  if (dir < 0) {
    while (i > 0 && runner.steps[i].type === 'exdone') i--;
    if (i < 0) i = 0;
  }
  runner.i = Math.max(0, i);
  if (runner.paused && on('timer')) togglePause();
  enterStep();
}

function stopRunner() {
  runner.active = false;
  music.stop(2);
  clearInterval(runner.timer);
  keepAwake(false);
  $('#workout').hidden = true;
  $('#wo-figure').innerHTML = '';
  $('#workout').classList.remove('paused');
  $('#wo-pause').textContent = t('wo_pause');
  document.body.style.overflow = '';
}

function finishWorkout(complete) {
  stopRunner();
  const k = todayKey();
  const now = new Date();
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const done = [...runner.completed];
  const names = done.map(exName).join(t('list_sep'));
  if (!on('log')) {
    if (complete) {
      say(t('say_done'));
      $('#done-text').textContent = t('done_text', { names });
      $('#done').hidden = false;
    }
    return renderAll();
  }
  if (complete) {
    log[k] = { status: 'done', time, items: done, minutes: Math.round((now - runner.startedAt) / 60000) };
    saveLog();
    say(t('say_done'));
    beep(1047, 300);
    const st = streak();
    $('#done-text').textContent = t('done_text', { names }) + (st > 1 ? t('done_streak', { n: st }) : '');
    $('#done').hidden = false;
  } else if (done.length && log[k]?.status !== 'done') {
    log[k] = { status: 'partial', time, items: done };
    saveLog();
  }
  renderAll();
}

$('#start-btn').onclick = startWorkout;
$('#wo-pause').onclick = togglePause;
$('#wo-next').onclick = () => jump(1);
$('#wo-prev').onclick = () => jump(-1);
function askQuit() {
  const wasPaused = runner.paused;
  const manual = !on('timer');
  if (!wasPaused && !manual) togglePause();
  if (confirm(t('confirm_quit'))) {
    stopSpeech();
    finishWorkout(false);
  } else if (!wasPaused && !manual) togglePause();
}
$('#wo-close').onclick = askQuit;
$('#done-ok').onclick = () => { $('#done').hidden = true; showView(on('log') ? 'log' : 'home'); };

/* ───────────────── 탭 이동 ───────────────── */
function showView(name) {
  if (name !== 'settings') stopPreview();
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'log') { calMonth = new Date(); calMonth.setDate(1); renderLog(); }
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => showView(b.dataset.view));

/* 안드로이드 뒤로가기: 열린 창 → 운동 화면 → 홈 순서로 닫고, 홈에서는 앱 종료 */
if (native.isNative) {
  window.capacitorExports?.registerPlugin('App')?.addListener?.('backButton', () => {
    if ($('#guide').open) return $('#guide').close();
    if (!$('#done').hidden) return $('#done-ok').click();
    if (runner.active) return askQuit();
    if (!$('#view-home').classList.contains('active')) return showView('home');
    window.capacitorExports.registerPlugin('App').exitApp();
  });
}

function applyFeatures() {
  document.querySelector('.tabbar [data-view="log"]').hidden = !on('log');
  if (!on('log') && $('#view-log').classList.contains('active')) showView('home');
}
function renderAll() { renderHome(); renderLog(); renderSettings(); }
applyStaticText();
applyFeatures();
renderAll();
if (native.isNative && settings.reminder.on) scheduleReminder();
if (native.isNative) {
  window.capacitorExports.registerPlugin('App').getInfo()
    .then(info => { appInfo = { version: info.version, build: info.build }; renderVersion(); })
    .catch(() => {});
}

if (!native.isNative && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
