/* earllnRainOrNot 웹앱 (아이폰·안드로이드 브라우저용)
 * 흐름: 위치 → 중계 서버(/nearby)로 주변 CCTV → 프레임 3장 확보 → Gemini 분석 → 결과·음성 */
(function () {
  'use strict';
  const A = window.RainAnalysis;
  const CFG = window.RAIN_CONFIG || {};
  const PROXIES = (CFG.proxies || (CFG.proxy ? [CFG.proxy] : [])).map(p => p.replace(/\/+$/, ''));
  const MODELS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
  const MIN_API_INTERVAL_MS = 6100;
  const RESULT_CACHE_MS = 5 * 60 * 1000;
  const MAX_RETRY = 4, NEARBY_POOL = 8, MAX_EMPTY_SCENE_TRIES = 2;
  const HLS_JS = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
  // 웹앱 버전: 기능을 바꿀 때 함께 올린다 (index.html 의 ?v= 캐시 쿼리도 같이 갱신)
  const WEB_VERSION = '1.3.1', WEB_DATE = '2026-11-02';

  const $ = id => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('rain.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('rain.' + k, JSON.stringify(v)); } catch (_) { /* 사생활 보호 모드 등 */ } },
  };
  const settings = Object.assign({ key: '', itsKey: '', radius: 10, auto: true, voice: true, sheltered: true }, store.get('settings', {}));
  let favorites = store.get('favs', []);
  let items = [], here = null, running = false, workingModel = null, lastSpeech = '', currentItem = null;
  const cache = new Map();

  // ── 화면 ────────────────────────────────────────────
  function showCard() { $('resultCard').hidden = false; }
  function setBusy(name, msg) {
    showCard();
    $('spinner').hidden = false;
    $('resStatus').textContent = name || '';
    $('resDist').textContent = '';
    $('resMain').className = 'result__main';
    $('resMain').textContent = msg;
    $('resDetail').textContent = '';
    $('resActions').hidden = true;
  }
  function setError(msg, status = '⚠️ 분석 오류') {
    showCard();
    $('spinner').hidden = true;
    $('resStatus').textContent = status;
    $('resDist').textContent = '';
    $('resMain').className = 'result__main error';
    $('resMain').textContent = msg;
    $('resDetail').textContent = '';
    $('resActions').hidden = true;
  }
  function setResult(item, r, isAuto) {
    showCard();
    $('spinner').hidden = true;
    $('resStatus').textContent = (isAuto ? '자동분석 · ' : '') + item.name;
    $('resDist').textContent = '📍 ' + fmtDist(item.distanceKm);
    $('resMain').className = 'result__main';
    $('resMain').textContent = A.displayText(r);
    $('resDetail').textContent = A.detailLines(r).join('\n');
    $('resActions').hidden = false;
    currentItem = item;
    lastSpeech = `${item.name} 입니다. ${A.speechText(r)}`;
    speak(lastSpeech);
  }
  function notice(msg) { const n = $('notice'); n.hidden = !msg; n.textContent = msg || ''; }
  const fmtDist = km => km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
  const typeLabel = t => t === '1' ? '실시간' : t === '2' ? '동영상' : '정지영상';

  function renderList() {
    const ul = $('cctvList');
    ul.innerHTML = '';
    $('listSection').hidden = items.length === 0;
    $('listCount').textContent = items.length ? `${items.length}곳` : '';
    for (const it of items) {
      const li = document.createElement('li');
      li.className = 'cctv';
      const fav = favorites.includes(it.id);
      li.innerHTML = `<button class="cctv__fav" type="button" aria-label="즐겨찾기">${fav ? '⭐' : '☆'}</button>
        <div class="cctv__info"><div class="cctv__name"></div>
        <div class="cctv__meta">${typeLabel(it.type)}${it.crosswalk ? ' · 교차로' : ''} · ${fmtDist(it.distanceKm)}</div></div>
        <button class="chip chip--icon js-view" type="button" aria-label="CCTV 보기">📹</button>
        <button class="chip js-analyze" type="button">우산 분석</button>`;
      li.querySelector('.cctv__name').textContent = it.name;
      li.querySelector('.cctv__fav').onclick = () => toggleFav(it);
      li.querySelector('.js-view').onclick = () => openViewer(it);
      li.querySelector('.js-analyze').onclick = () => { unlockSpeech(); analyzeManual(it); };
      ul.appendChild(li);
    }
  }
  function toggleFav(it) {
    favorites = favorites.includes(it.id) ? favorites.filter(x => x !== it.id) : [it.id, ...favorites].slice(0, 5);
    store.set('favs', favorites);
    renderList();
  }

  // ── 음성 (iOS 는 사용자 터치로 한 번 깨워야 이후 재생됨) ──
  let speechUnlocked = false;
  function unlockSpeech() {
    if (speechUnlocked || !('speechSynthesis' in window)) return;
    speechUnlocked = true;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
  function speak(text) {
    if (!settings.voice || !('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    const ko = speechSynthesis.getVoices().find(v => /^ko/i.test(v.lang));
    if (ko) u.voice = ko;
    speechSynthesis.speak(u);
  }

  // ── 위치 · 주변 CCTV ─────────────────────────────────
  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('이 브라우저는 위치 기능을 지원하지 않습니다.'));
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        e => reject(new Error(e.code === 1 ? '위치 권한이 필요합니다. 브라우저 설정에서 위치 접근을 허용해 주세요.' : '위치를 가져올 수 없습니다. 잠시 후 다시 시도해 주세요.')),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
    });
  }
  /** fetch 실패(네트워크·CORS)를 단계 이름이 붙은 메시지로 바꾼다 */
  async function fetchStep(step, url, init) {
    try { return await fetch(url, init); }
    catch (e) { const err = new Error(`${step} 연결 실패 (${e.message || e})`); err.network = true; throw err; }
  }
  /** 서울(TOPIS) 목록과 전국 국도(ITS) 목록을 함께 받아 합친다. ITS 는 실패해도 무시한다. */
  async function fetchNearby(pos) {
    // 한쪽이 실패해도 다른 쪽 결과는 쓴다. 둘 다 비면 서울 목록의 오류를 알린다.
    const [mainRes, its] = await Promise.all([
      fetchProxyNearby(pos).then(v => ({ ok: true, v }), e => ({ ok: false, e })),
      fetchItsNearby(pos),
    ]);
    if (!mainRes.ok && !its.length) throw mainRes.e;
    const main = mainRes.ok ? mainRes.v : [];
    const seen = new Set();
    return [...main, ...its]
      .filter(i => !seen.has(i.id) && seen.add(i.id))
      .sort((a, b) => (b.crosswalk - a.crosswalk) || (a.distanceKm - b.distanceKm));
  }
  async function fetchItsNearby(pos) {
    if (!CFG.its || !settings.itsKey) return [];   // 지방(국도) CCTV 는 각자 발급받은 ITS 키가 있을 때만
    try {
      const r = await fetch(`${CFG.its}?lat=${pos.lat}&lon=${pos.lon}&radius=${settings.radius}`, {
        headers: { 'X-ITS-Key': settings.itsKey }, signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return ((await r.json()).items || []).filter(i => i.media);
    } catch (e) {
      console.warn('국도(ITS) CCTV 조회 실패 → 서울 CCTV만 사용', e.message);
      return [];
    }
  }
  /** 중계 서버 주소를 순서대로 시도한다 (earlln.com/rain-api → workers.dev) */
  async function fetchProxyNearby(pos) {
    let lastErr = null;
    for (const base of PROXIES) {
      try {
        const r = await fetchStep('CCTV 목록 서버', `${base}/nearby?lat=${pos.lat}&lon=${pos.lon}&radius=${settings.radius}`);
        if (!r.ok) throw new Error('CCTV 목록을 가져오지 못했습니다 (중계 서버 ' + r.status + ')');
        return (await r.json()).items || [];
      } catch (e) { lastErr = e; console.warn('중계 서버 실패 → 다음 주소', base, e.message); }
    }
    throw lastErr || new Error('중계 서버가 설정되지 않았습니다');
  }

  // ── 프레임 확보 ──────────────────────────────────────
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function toCanvas(src, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    return c;
  }
  function sameImage(a, b) {
    if (a.width !== b.width || a.height !== b.height) return false;
    const s = 32, ca = toCanvas(a, s, s).getContext('2d').getImageData(0, 0, s, s).data;
    const cb = toCanvas(b, s, s).getContext('2d').getImageData(0, 0, s, s).data;
    let d = 0; for (let i = 0; i < ca.length; i += 4) d += Math.abs(ca[i] - cb[i]);
    return d / (s * s) < 0.5;
  }
  async function loadImageCanvas(url) {
    const r = await fetchStep('CCTV 이미지', url, { cache: 'no-store' });
    if (!r.ok) throw new Error('CCTV 이미지를 가져올 수 없습니다');
    const bmp = await createImageBitmap(await r.blob());
    return toCanvas(bmp, bmp.width, bmp.height);
  }
  async function grabStill(url) {
    const frames = [await loadImageCanvas(url)];
    for (let i = 0; i < 2; i++) {
      await sleep(2500);
      const next = await loadImageCanvas(url).catch(() => null);
      if (!next || sameImage(next, frames[frames.length - 1])) break; // 아직 갱신 안 됨
      frames.push(next);
    }
    return frames;
  }
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('hls.js 로드 실패')); document.head.appendChild(s); });
  }
  /** 재생 위치가 from + delta 초를 넘을 때까지 기다린다. 시간 안에 못 넘으면 false */
  function waitAdvance(v, from, delta, timeoutMs) {
    return new Promise(res => {
      const t0 = Date.now();
      const tick = () => {
        if (v.currentTime >= from + delta) return res(true);
        if (v.ended || Date.now() - t0 > timeoutMs) return res(false);
        setTimeout(tick, 50);
      };
      tick();
    });
  }
  async function grabVideo(url, isHls) {
    const v = document.createElement('video');
    v.className = 'capture';
    v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.crossOrigin = 'anonymous'; v.preload = 'auto';
    document.body.appendChild(v);
    let hls = null;
    try {
      if (isHls && !v.canPlayType('application/vnd.apple.mpegurl')) {
        if (!window.Hls) await loadScript(HLS_JS);
        if (!window.Hls || !window.Hls.isSupported()) throw new Error('이 브라우저에서는 실시간 영상을 재생할 수 없습니다');
        hls = new window.Hls({ maxBufferLength: 6, liveSyncDurationCount: 2 });
        hls.loadSource(url); hls.attachMedia(v);
      } else {
        v.src = url;
      }
      await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('CCTV 영상 응답 시간 초과')), 20000);
        v.addEventListener('playing', () => { clearTimeout(t); res(); }, { once: true });
        v.addEventListener('error', () => { clearTimeout(t); rej(new Error('CCTV 영상을 재생할 수 없습니다')); }, { once: true });
        v.play().catch(() => { /* playing 이벤트를 기다린다 */ });
      });
      await waitAdvance(v, v.currentTime, 0.3, 3000);
      const frames = [];
      for (let i = 0; i < 3; i++) {
        if (!v.videoWidth) break;
        frames.push(toCanvas(v, v.videoWidth, v.videoHeight));
        // 고정 시간 대신 실제 재생 위치가 0.7초 이상 진행됐을 때 다음 프레임을 찍는다 (버퍼링·정지 대비)
        if (i < 2 && !(await waitAdvance(v, v.currentTime, 0.7, 4000))) break;
      }
      frames[0].getContext('2d').getImageData(0, 0, 1, 1); // CORS 오염 여부 확인 (오염 시 예외)
      return frames;
    } catch (e) {
      if (e && e.name === 'SecurityError') throw new Error('CCTV 영상을 읽을 수 없습니다 (보안 정책)');
      throw e;
    } finally {
      try { v.pause(); } catch (_) { }
      if (hls) hls.destroy();
      v.remove();
    }
  }
  async function grabFrom(url, it) {
    if (it.type === '3') return grabStill(url);
    try { return await grabVideo(url, it.type === '1'); }
    catch (e) { if (it.type === '2') return grabStill(url); throw e; }
  }
  /** CCTV 서버에서 직접 받는 것을 먼저 시도하고(대부분 CORS 허용), 안 되면 중계 서버를 거친다. */
  async function grabFrames(it) {
    const direct = it.direct && /^https:/i.test(it.direct) ? it.direct : null;
    if (direct) {
      try { return await grabFrom(direct, it); }
      catch (e) { console.warn('직접 연결 실패 → 중계 서버 사용', it.name, e.message); }
    }
    return grabFrom(it.media, it);
  }

  // ── Gemini 분석 ──────────────────────────────────────
  function lumaFrames(frames) {
    const w = Math.min(320, frames[0].width), h = Math.max(1, Math.round(frames[0].height * w / frames[0].width));
    return frames.map(f => {
      const d = toCanvas(f, w, h).getContext('2d').getImageData(0, 0, w, h).data;
      const px = new Uint8Array(w * h);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) px[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      return { width: w, height: h, pixels: px };
    });
  }
  function jpegB64(canvas, maxLong, q) {
    const long = Math.max(canvas.width, canvas.height);
    const c = long > maxLong ? toCanvas(canvas, Math.round(canvas.width * maxLong / long), Math.round(canvas.height * maxLong / long)) : canvas;
    return c.toDataURL('image/jpeg', q).split(',')[1];
  }
  function cropCanvas(src, b, targetLong = 1024) {
    const x = Math.floor(b.xmin * src.width / 1000), y = Math.floor(b.ymin * src.height / 1000);
    const w = Math.max(1, Math.floor((b.xmax - b.xmin) * src.width / 1000)), h = Math.max(1, Math.floor((b.ymax - b.ymin) * src.height / 1000));
    const s = Math.min(4, Math.max(1, targetLong / Math.max(w, h)));
    const c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
    return c;
  }
  async function throttle() {
    const wait = MIN_API_INTERVAL_MS - (Date.now() - store.get('lastCall', 0));
    if (wait > 0) await sleep(wait);
    store.set('lastCall', Date.now());
  }
  async function callGemini(body) {
    const order = workingModel ? [workingModel, ...MODELS.filter(m => m !== workingModel)] : MODELS;
    let last = '';
    for (const model of order) {
      const r = await fetchStep('Gemini AI', `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.key }, body,
      });
      const j = await r.json().catch(() => ({}));
      const msg = (j.error && j.error.message) || '';
      if (r.status === 429) { const e = new Error('Gemini API 사용 한도 도달. 1분 후 다시 시도해주세요.'); e.quota = true; throw e; }
      if (r.status === 404 || /not found|not supported/i.test(msg)) { last = msg; continue; }
      if (r.status === 400 && /API key/i.test(msg)) throw new Error('Gemini API 키가 유효하지 않습니다. 설정에서 키를 확인해주세요.');
      if (!r.ok) throw new Error(`Gemini 오류(${r.status}): ${msg || '알 수 없는 API 오류'}`);
      if (j.promptFeedback && j.promptFeedback.blockReason) throw new Error('Gemini가 이미지를 처리하지 못했습니다');
      const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      const text = parts.filter(p => !p.thought && p.text).map(p => p.text).join('');
      if (!text) throw new Error('분석 결과 없음 (이미지를 인식하지 못했습니다)');
      workingModel = model;
      return { text, model };
    }
    throw new Error('사용 가능한 Gemini 모델이 없습니다: ' + last);
  }
  async function analyzeFrames(frames) {
    const latest = frames[frames.length - 1];
    const motion = A.detectMotion(lumaFrames(frames));
    const crops = A.planCrops(motion);
    const infos = [{ kind: 'latest' }], images = [jpegB64(latest, 1600, 0.88)];
    if (frames.length > 1 && motion.reliable) { infos.push({ kind: 'earlier' }); images.push(jpegB64(frames[0], 1024, 0.8)); }
    for (const b of crops) { infos.push({ kind: 'zoom', region: b }); images.push(jpegB64(cropCanvas(latest, b), 1024, 0.88)); }
    const motionNote = motion.reliable
      ? `프레임 ${frames.length}장 비교, 움직임 영역 ${motion.boxes.length}곳` + (motion.boxes.length ? ': ' + motion.boxes.slice(0, 8).map(A.describe).join('; ') : ' (움직이는 물체 없음)')
      : `움직임 정보 없음 (${motion.reason}) — motion 은 자세로 추정하거나 unknown. 서 있는 사람도 빠짐없이 기록`;
    const parts = [];
    images.forEach((b64, i) => {
      const k = infos[i];
      parts.push({ text: `이미지 ${i + 1} (${k.kind === 'latest' ? '최신 전체 화면' : k.kind === 'earlier' ? '이전 전체 화면' : '확대: ' + A.describe(k.region)})` });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64 } });
    });
    parts.push({ text: A.buildPrompt(infos, motionNote) });
    const body = JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: A.RESPONSE_SCHEMA, maxOutputTokens: 8192 },
    });
    await throttle();
    const { text, model } = await callGemini(body);
    const verdict = A.parseVerdict(text);
    if (!verdict) throw new Error('분석 결과 없음 (응답 JSON 파싱 실패)');
    return A.aggregate(verdict, motion, frames.length, settings.sheltered, model);
  }
  async function analyzeOne(it) {
    const c = cache.get(it.id);
    if (c && Date.now() - c.ts < RESULT_CACHE_MS) return c.result;
    setBusy(it.name, '📡 CCTV 영상 프레임 가져오는 중...');
    const frames = await grabFrames(it);
    setBusy(it.name, '🤖 AI 분석 중 (보행자·우산 확인)...');
    const result = await analyzeFrames(frames);
    cache.set(it.id, { result, ts: Date.now() });
    return result;
  }

  // ── 분석 흐름 ────────────────────────────────────────
  function needKey() {
    if (settings.key) return false;
    setError('Gemini API 키가 없습니다. 오른쪽 위 ⚙️ 설정에서 키를 입력해주세요.', '⚠️ 키 필요');
    openSettings();
    return true;
  }
  const priority = it => (it.crosswalk ? 10 : 0) + ({ '1': 4, '2': 3, '3': 2 }[it.type] || 0);
  function candidates() {
    const favs = favorites.map(id => items.find(i => i.id === id)).filter(Boolean);
    const near = items.slice().sort((a, b) => a.distanceKm - b.distanceKm).slice(0, NEARBY_POOL)
      .sort((a, b) => (priority(b) - priority(a)) || (a.distanceKm - b.distanceKm));
    const seen = new Set();
    return [...favs, ...near].filter(i => !seen.has(i.id) && seen.add(i.id)).slice(0, MAX_RETRY);
  }
  async function autoAnalyze() {
    if (needKey()) return;
    let noPeople = null, empty = 0, lastErr = null;
    for (const it of candidates()) {
      try {
        const r = await analyzeOne(it);
        if (r.allPedestrians > 0 || r.isSunny) return setResult(it, r, true);
        if (!noPeople) noPeople = [it, r];
        if (++empty >= MAX_EMPTY_SCENE_TRIES) break;
      } catch (e) {
        if (e.quota) { if (!noPeople) return setError(e.message); break; }
        if (/API 키/.test(e.message)) return setError(e.message);
        console.warn('분석 실패 → 다음 CCTV', it.name, e);
        lastErr = e;
        if (/^Gemini AI 연결 실패/.test(e.message)) break; // 다른 CCTV 로 바꿔도 같은 결과
      }
    }
    if (noPeople) return setResult(noPeople[0], noPeople[1], true);
    setError('주변 CCTV 영상을 분석하지 못했습니다.' + (lastErr ? `\n(${lastErr.message})` : '') + '\n잠시 후 다시 시도해 주세요.');
  }
  /** 목록 아래쪽에서 눌러도 결과가 보이도록 결과 카드로 화면을 올린다 */
  function revealResult() {
    const card = $('resultCard');
    if (card.hidden) return;
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  function flashResult() {
    const card = $('resultCard');
    card.classList.remove('result--flash');
    void card.offsetWidth;   // 애니메이션 다시 시작
    card.classList.add('result--flash');
  }
  async function analyzeManual(it) {
    // 다른 분석(자동 분석 포함)이 진행 중이면 그 진행 카드를 보여 주고 깜빡여 알린다
    if (running) { revealResult(); flashResult(); return; }
    if (needKey()) return;
    running = true;
    try {
      const job = analyzeOne(it);   // 진행 카드를 먼저 띄운 뒤 그 위치로 올려 보여 준다
      revealResult();
      setResult(it, await job, false);
    }
    catch (e) { setError(e.message || '분석 중 오류가 발생했습니다'); }
    finally { running = false; revealResult(); }
  }
  async function start() {
    if (running) return;
    if (!PROXIES.length) { notice('중계 서버가 아직 설정되지 않았습니다. 곧 사용할 수 있어요.'); return; }
    running = true;
    $('btnStart').disabled = true;
    notice('');
    try {
      setBusy('', '📍 현재 위치 확인 중...');
      here = await getLocation();
      $('locLine').textContent = `📍 ${here.lat.toFixed(4)}°N, ${here.lon.toFixed(4)}°E`;
      setBusy('', '🔎 주변 CCTV 찾는 중...');
      items = await fetchNearby(here);
      renderList();
      if (!items.length) { setError(`검색 반경(${settings.radius}km) 안에 CCTV가 없습니다. 설정에서 반경을 늘려보세요.\n` + (settings.itsKey ? '(서울 시내와 전국 국도 CCTV를 지원합니다)' : '서울 밖이라면 ⚙️ 설정에 ITS API 키를 넣으면 전국 국도 CCTV도 볼 수 있어요. (발급 방법은 설정에 있어요)'), 'CCTV 없음'); return; }
      await autoAnalyze();
    } catch (e) {
      setError(e.message || '알 수 없는 오류', '⚠️ 오류');
    } finally {
      running = false;
      $('btnStart').disabled = false;
      $('btnStart').textContent = '↻ 다시 확인하기';
    }
  }

  // ── CCTV 보기 ────────────────────────────────────────
  let viewerHls = null, viewerTimer = null;
  function viewerStatus(msg) { const el = $('viewerStatus'); el.hidden = !msg; el.textContent = msg || ''; }
  function openViewer(it) {
    stopViewer();
    $('viewerTitle').textContent = it.name;
    $('viewerMeta').textContent = `${typeLabel(it.type)} · ${fmtDist(it.distanceKm)}`;
    const d = $('viewer');
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    const direct = it.direct && /^https:/i.test(it.direct) ? it.direct : null;
    const urls = [direct, it.media].filter(Boolean);
    if (it.type === '3') showStill(urls); else showVideo(urls, it.type === '1');
  }
  function showStill(urls) {
    const img = $('viewerImg'), v = $('viewerVideo');
    v.hidden = true; img.hidden = false;
    viewerStatus('불러오는 중...');
    let i = 0;
    const load = () => { img.src = urls[i] + (urls[i].includes('?') ? '&' : '?') + 't=' + Date.now(); };
    img.onload = () => viewerStatus('');
    img.onerror = () => { if (++i < urls.length) load(); else viewerStatus('CCTV 이미지를 불러올 수 없습니다.'); };
    load();
    viewerTimer = setInterval(() => { if (!img.hidden) load(); }, 10000); // 정지영상은 10초마다 새로고침
  }
  async function showVideo(urls, isHls) {
    const img = $('viewerImg'), v = $('viewerVideo');
    img.hidden = true; v.hidden = false;
    for (const url of urls) {
      viewerStatus('영상 연결 중...');
      try {
        await playInto(v, url, isHls);
        viewerStatus('');
        return;
      } catch (e) { console.warn('CCTV 보기 실패 → 다음 주소', e.message); }
    }
    viewerStatus('영상을 재생할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }
  async function playInto(v, url, isHls) {
    if (viewerHls) { viewerHls.destroy(); viewerHls = null; }
    v.removeAttribute('src'); v.load();
    if (isHls && !v.canPlayType('application/vnd.apple.mpegurl')) {
      if (!window.Hls) await loadScript(HLS_JS);
      if (!window.Hls || !window.Hls.isSupported()) throw new Error('이 브라우저에서는 실시간 영상을 재생할 수 없습니다');
      viewerHls = new window.Hls({ liveSyncDurationCount: 2 });
      viewerHls.loadSource(url); viewerHls.attachMedia(v);
    } else {
      v.src = url;
    }
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('응답 시간 초과')), 15000);
      v.addEventListener('playing', () => { clearTimeout(t); res(); }, { once: true });
      v.addEventListener('error', () => { clearTimeout(t); rej(new Error('재생 오류')); }, { once: true });
      v.play().catch(() => { /* playing 이벤트를 기다린다 */ });
    });
  }
  function stopViewer() {
    clearInterval(viewerTimer); viewerTimer = null;
    if (viewerHls) { viewerHls.destroy(); viewerHls = null; }
    const v = $('viewerVideo'); try { v.pause(); } catch (_) { }
    v.removeAttribute('src'); v.load();
    $('viewerImg').removeAttribute('src');
  }
  function closeViewer() {
    stopViewer(); // 닫자마자 영상 연결을 끊는다 (close 이벤트는 비동기)
    const d = $('viewer');
    if (typeof d.close === 'function' && d.open) d.close(); else d.removeAttribute('open');
  }

  // ── 설정 ─────────────────────────────────────────────
  function openSettings() {
    $('setKey').value = settings.key;
    $('setItsKey').value = settings.itsKey || '';
    $('setRadius').value = String(settings.radius);
    $('setAuto').checked = settings.auto;
    $('setVoice').checked = settings.voice;
    $('setSheltered').checked = settings.sheltered;
    const d = $('settings');
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  }
  $('settings').addEventListener('close', () => {
    if ($('settings').returnValue !== 'save') return;
    Object.assign(settings, {
      key: $('setKey').value.trim(), itsKey: $('setItsKey').value.trim(), radius: Number($('setRadius').value), auto: $('setAuto').checked,
      voice: $('setVoice').checked, sheltered: $('setSheltered').checked,
    });
    store.set('settings', settings);
    cache.clear();
    updateHint();
  });

  $('btnSettings').onclick = openSettings;
  $('btnStart').onclick = () => { unlockSpeech(); start(); };
  $('btnSpeak').onclick = () => { unlockSpeech(); speak(lastSpeech); };
  $('btnAgain').onclick = () => { unlockSpeech(); cache.clear(); start(); };
  $('btnView').onclick = () => { if (currentItem) openViewer(currentItem); };
  $('btnViewerClose').onclick = closeViewer;
  $('viewer').addEventListener('close', stopViewer);

  // 위치 권한이 이미 허용돼 있고 '열 때 바로 분석'이면 자동 시작
  if (settings.auto && settings.key && navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(p => { if (p.state === 'granted') start(); }).catch(() => { });
  }
  function updateHint() {
    $('heroHint').innerHTML = settings.key
      ? '현재 위치 주변 CCTV를 찾아 AI가 우산 쓴 사람을 확인합니다.'
      : '처음이라면 ⚙️ 설정에서 <b>Gemini API 키</b>(무료)를 먼저 입력해 주세요.';
  }
  updateHint();
  const versionText = `웹 버전 ${WEB_VERSION} (${WEB_DATE})`;
  $('aboutLine').textContent = versionText;
  $('footVersion').textContent = versionText;
})();
