/* earllnRainOrNot 분석 로직 (안드로이드 앱 analysis 패키지의 JS 이식판).
 * 브라우저에서는 window.RainAnalysis, Node 테스트에서는 module.exports 로 쓴다. */
(function (root) {
  'use strict';
  const SCALE = 1000;

  // ── Box: 정규화 좌표(0~1000), Gemini box_2d [ymin, xmin, ymax, xmax] ──
  function box(ymin, xmin, ymax, xmax) { return { ymin, xmin, ymax, xmax }; }
  const bw = b => Math.max(0, b.xmax - b.xmin);
  const bh = b => Math.max(0, b.ymax - b.ymin);
  const area = b => bw(b) * bh(b);
  const cx = b => Math.floor((b.xmin + b.xmax) / 2);
  const cy = b => Math.floor((b.ymin + b.ymax) / 2);
  function intersection(a, b) {
    const w = Math.min(a.xmax, b.xmax) - Math.max(a.xmin, b.xmin);
    const h = Math.min(a.ymax, b.ymax) - Math.max(a.ymin, b.ymin);
    return (w <= 0 || h <= 0) ? 0 : w * h;
  }
  function iou(a, b) { const i = intersection(a, b); const u = area(a) + area(b) - i; return u <= 0 ? 0 : i / u; }
  const union = (a, b) => box(Math.min(a.ymin, b.ymin), Math.min(a.xmin, b.xmin), Math.max(a.ymax, b.ymax), Math.max(a.xmax, b.xmax));
  const contains = (b, x, y) => x >= b.xmin && x <= b.xmax && y >= b.ymin && y <= b.ymax;
  function ensureMinSize(b, minW, minH) {
    const w = Math.min(SCALE, Math.max(bw(b), minW)), h = Math.min(SCALE, Math.max(bh(b), minH));
    const x0 = Math.max(0, Math.min(SCALE - w, cx(b) - Math.floor(w / 2)));
    const y0 = Math.max(0, Math.min(SCALE - h, cy(b) - Math.floor(h / 2)));
    return box(y0, x0, y0 + h, x0 + w);
  }
  function pad(b, r) {
    const px = Math.floor(bw(b) * r), py = Math.floor(bh(b) * r);
    return box(Math.max(0, b.ymin - py), Math.max(0, b.xmin - px), Math.min(SCALE, b.ymax + py), Math.min(SCALE, b.xmax + px));
  }
  const describe = b => `가로 ${Math.floor(b.xmin / 10)}~${Math.floor(b.xmax / 10)}%, 세로 ${Math.floor(b.ymin / 10)}~${Math.floor(b.ymax / 10)}%`;
  function boxFromList(v) {
    if (!Array.isArray(v) || v.length !== 4) return null;
    const [a, b, c, d] = v.map(n => Math.max(0, Math.min(SCALE, Math.trunc(Number(n)))));
    const r = box(Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d));
    return (bw(r) === 0 || bh(r) === 0) ? null : r;
  }

  // ── 움직임 검출 (프레임 차분) ──
  const DIFF_THRESHOLD = 22, IDENTICAL_MEAN_DIFF = 0.6, MAX_CHANGED = 0.35, MAX_BOX_AREA = 0.25;

  /** frames: [{width, height, pixels(Uint8Array/Array 휘도 0~255)}] */
  function detectMotion(frames) {
    const unavailable = reason => ({ reliable: false, boxes: [], reason, overlapRatio: () => 0 });
    if (frames.length < 2) return unavailable('프레임 1장');
    const w = frames[0].width, h = frames[0].height, n = w * h;
    if (frames.some(f => f.width !== w || f.height !== h)) return unavailable('프레임 크기 불일치');
    const mean = f => { let s = 0; for (let i = 0; i < n; i++) s += f.pixels[i]; return s / n; };
    const raw = new Uint8Array(n);
    let distinct = 0;
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1].pixels, b = frames[i].pixels, off = mean(frames[i]) - mean(frames[i - 1]);
      let sum = 0;
      for (let p = 0; p < n; p++) sum += Math.abs(b[p] - a[p] - off);
      if (sum / n < IDENTICAL_MEAN_DIFF) continue;
      distinct++;
      for (let p = 0; p < n; p++) if (Math.abs(b[p] - a[p] - off) > DIFF_THRESHOLD) raw[p] = 1;
    }
    if (distinct === 0) return unavailable('모든 프레임이 동일 (정지영상 미갱신)');
    let changedCount = 0; for (let p = 0; p < n; p++) changedCount += raw[p];
    if (changedCount / n > MAX_CHANGED) return unavailable('화면 전체 변화 (카메라 이동/장면 전환)');

    const cleaned = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!raw[y * w + x]) continue;
      let nb = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h && raw[yy * w + xx]) nb++;
      }
      cleaned[y * w + x] = nb >= 2 ? 1 : 0;
    }
    const dilate = m => {
      const o = new Uint8Array(n);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && xx < w && yy >= 0 && yy < h) o[yy * w + xx] = 1;
        }
      }
      return o;
    };
    const mask = dilate(dilate(cleaned));

    const seen = new Uint8Array(n), stack = new Int32Array(n), boxes = [];
    for (let s = 0; s < n; s++) {
      if (!mask[s] || seen[s]) continue;
      let sp = 0; stack[sp++] = s; seen[s] = 1;
      let count = 0, minX = w, minY = h, maxX = 0, maxY = 0;
      while (sp > 0) {
        const p = stack[--sp]; count++;
        const x = p % w, y = (p / w) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        const visit = q => { if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; } };
        if (x > 0) visit(p - 1); if (x < w - 1) visit(p + 1); if (y > 0) visit(p - w); if (y < h - 1) visit(p + w);
      }
      if (count < 6) continue;
      const b = box(Math.floor(minY * SCALE / h), Math.floor(minX * SCALE / w), Math.floor((maxY + 1) * SCALE / h), Math.floor((maxX + 1) * SCALE / w));
      if (area(b) <= MAX_BOX_AREA * SCALE * SCALE) boxes.push(b);
    }
    const overlapRatio = b => {
      const x0 = Math.max(0, Math.min(w - 1, Math.floor(b.xmin * w / SCALE)));
      const x1 = Math.max(x0, Math.min(w - 1, Math.floor(b.xmax * w / SCALE)));
      const y0 = Math.max(0, Math.min(h - 1, Math.floor(b.ymin * h / SCALE)));
      const y1 = Math.max(y0, Math.min(h - 1, Math.floor(b.ymax * h / SCALE)));
      let hit = 0, total = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { total++; hit += mask[y * w + x]; }
      return total ? hit / total : 0;
    };
    return { reliable: true, boxes, reason: `프레임 ${frames.length}장 비교`, overlapRatio };
  }

  // ── 확대 영역 선택 ──
  const TILES = [box(0, 0, 560, 560), box(0, 440, 560, 1000), box(440, 0, 1000, 560), box(440, 440, 1000, 1000)];
  function planCrops(motion, maxCrops = 4) {
    if (!motion.reliable || !motion.boxes.length) return TILES.slice();
    const ordered = motion.boxes.slice().sort((a, b) => ((bh(b) >= bw(b)) - (bh(a) >= bw(a))) || (area(a) - area(b)));
    const wins = [];
    for (const b of ordered) {
      const win = ensureMinSize(pad(b, 0.5), 260, 260);
      const idx = wins.findIndex(x => intersection(x, win) > 0 && bw(union(x, win)) <= 520 && bh(union(x, win)) <= 520);
      if (idx >= 0) wins[idx] = union(wins[idx], win);
      else if (!wins.some(x => intersection(x, win) >= area(win) * 0.7)) wins.push(win);
      if (wins.length >= maxCrops) break;
    }
    return wins.length ? wins : TILES.slice();
  }

  // ── 프롬프트 / 스키마 ──
  function buildPrompt(infos, motionNote) {
    const lines = infos.map((info, i) => {
      const n = i + 1;
      if (info.kind === 'latest') return `- 이미지 ${n}: 가장 최근 전체 화면 (좌표 기준 이미지)`;
      if (info.kind === 'earlier') return `- 이미지 ${n}: 약 1~3초 전 전체 화면 (움직임 비교용)`;
      return `- 이미지 ${n}: 이미지 1의 확대본 [${describe(info.region)}] — box_2d 는 반드시 이미지 1 전체 기준으로 환산`;
    }).join('\n');
    return `당신은 교통 CCTV 영상에서 보행자의 우산 사용 여부로 비가 오는지 판단하는 분석가입니다.

[입력 이미지]
${lines}
[앱의 움직임 분석] ${motionNote}

[작업 순서]
1. 확대본까지 모두 꼼꼼히 살펴 화면의 모든 보행자(걷는 사람, 신호를 기다리며 서 있는 사람, 자전거·킥보드 탄 사람)를 찾으세요.
   - 차량·버스 안의 사람, 광고판/포스터 속 인물, 마네킹, 표지판은 제외합니다.
   - 확대본과 전체 화면에 같은 사람이 보이면 한 명으로만 기록합니다.
2. 각 보행자마다 기록:
   - box_2d: 이미지 1 기준 [ymin, xmin, ymax, xmax] (0~1000 정규화)
   - motion: 이전 프레임과 비교해 위치가 바뀌었거나 걷는 자세면 "moving", 제자리면 "stationary", 비교 불가면 "unknown"
   - sheltered: 버스정류장 지붕·건물 처마·차양·고가 아래, 실내, 차 안처럼 비를 맞지 않는 위치면 true,
     하늘이 트인 인도·횡단보도(신호 대기 포함)면 false
   - umbrella: 펼친 우산을 머리 위에 쓰고 있으면 "open_overhead", 접은 우산을 들고만 있으면 "closed_or_carried",
     우산이 없으면 "none", 너무 작거나 가려져 판단할 수 없으면 "unclear"
     (CCTV 는 위에서 내려다보므로 펼친 우산은 사람 머리 위의 둥글거나 다각형인 단색 덩어리로 보입니다.
      어두운 머리카락·모자·후드·큰 가방과 혼동하지 마세요. 확신이 없으면 "unclear")
   - confidence: 이 사람이 실제 보행자라는 확신 0~1
3. 환경 단서(scene)를 따로 판단하세요: 노면 젖음/반사, 빗줄기·빗방울, 차량 물보라, 렌즈 물방울, 야간 여부, 시야.
   sunny_hard_shadows 는 햇빛이 직접 비쳐 사람·차·건물의 그림자가 또렷하게 생길 때만 true 입니다
   (흐린 날, 밤, 가로등 그림자는 false). 이때 보이는 우산은 양산일 수 있습니다.
4. 보행자와 환경을 종합해 rain_judgement(raining/not_raining/uncertain)와 rain_confidence(0~1)를 정하고,
   summary 에 한국어 한 문장으로 근거를 쓰세요.

보행자가 없으면 pedestrians 는 빈 배열로 두세요. JSON 외의 텍스트는 출력하지 마세요.`;
  }

  const RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
      pedestrians: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } },
            motion: { type: 'STRING', enum: ['moving', 'stationary', 'unknown'] },
            umbrella: { type: 'STRING', enum: ['open_overhead', 'closed_or_carried', 'none', 'unclear'] },
            sheltered: { type: 'BOOLEAN' },
            confidence: { type: 'NUMBER' },
          },
          required: ['box_2d', 'motion', 'umbrella', 'sheltered', 'confidence'],
          propertyOrdering: ['box_2d', 'motion', 'umbrella', 'sheltered', 'confidence'],
        },
      },
      scene: {
        type: 'OBJECT',
        properties: {
          wet_road_reflection: { type: 'BOOLEAN' }, rain_streaks_or_drops: { type: 'BOOLEAN' },
          splashes_or_spray: { type: 'BOOLEAN' }, lens_droplets: { type: 'BOOLEAN' },
          sunny_hard_shadows: { type: 'BOOLEAN' }, night: { type: 'BOOLEAN' },
          visibility: { type: 'STRING', enum: ['good', 'fair', 'poor'] },
        },
        required: ['wet_road_reflection', 'rain_streaks_or_drops', 'splashes_or_spray', 'lens_droplets', 'sunny_hard_shadows', 'night', 'visibility'],
      },
      rain_judgement: { type: 'STRING', enum: ['raining', 'not_raining', 'uncertain'] },
      rain_confidence: { type: 'NUMBER' },
      summary: { type: 'STRING' },
    },
    required: ['pedestrians', 'scene', 'rain_judgement', 'rain_confidence', 'summary'],
    propertyOrdering: ['pedestrians', 'scene', 'rain_judgement', 'rain_confidence', 'summary'],
  };

  function parseVerdict(text) {
    const cleaned = String(text || '').replace(/```json/g, '').replace(/```/g, '').trim();
    const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try { return JSON.parse(cleaned.slice(s, e + 1)); } catch (_) { return null; }
  }

  // ── 집계 ──
  const MIN_CONFIDENCE = 0.35, DEDUPE_IOU = 0.45, STATIC_FIGURE_MAX_CONF = 0.6;

  function isMoving(obs, b, motion) {
    if (obs.motion === 'moving') return true;
    if (!motion.reliable || !b) return false;
    return motion.overlapRatio(b) >= 0.2;
  }
  function isStaticFigure(p, motion) {
    if (!motion.reliable || p.moving || !p.box) return false;
    return motion.overlapRatio(p.box) === 0 && p.confidence < STATIC_FIGURE_MAX_CONF;
  }
  function dedupe(people) {
    const out = [];
    for (const p of people.slice().sort((a, b) => b.confidence - a.confidence)) {
      const idx = !p.box ? -1 : out.findIndex(q => q.box && (iou(q.box, p.box) >= DEDUPE_IOU ||
        (contains(q.box, cx(p.box), cy(p.box)) && contains(p.box, cx(q.box), cy(q.box)))));
      if (idx < 0) out.push(p);
      else {
        const q = out[idx];
        out[idx] = { ...q, moving: q.moving || p.moving, umbrella: q.umbrella === 'unclear' ? p.umbrella : q.umbrella };
      }
    }
    return out;
  }

  function aggregate(verdict, motion, frameCount, excludeSheltered, model = '') {
    const people = dedupe((verdict.pedestrians || [])
      .filter(o => (o.confidence ?? 1) >= MIN_CONFIDENCE)
      .map(o => {
        const b = boxFromList(o.box_2d);
        return { box: b, moving: isMoving(o, b, motion), sheltered: o.sheltered === true, umbrella: o.umbrella || 'unclear', confidence: o.confidence ?? 1 };
      })).filter(p => !isStaticFigure(p, motion));

    const sheltered = people.filter(p => p.sheltered).length;
    const population = excludeSheltered ? people.filter(p => !p.sheltered) : people;
    const judged = population.filter(p => p.umbrella !== 'unclear');
    const open = judged.filter(p => p.umbrella === 'open_overhead').length;

    const sc = verdict.scene || {};
    const evidence = [];
    let env = 0;
    if (sc.rain_streaks_or_drops) { env += 2; evidence.push('빗줄기'); }
    if (sc.lens_droplets) { env += 2; evidence.push('렌즈 물방울'); }
    if (sc.wet_road_reflection) { env += 1; evidence.push('젖은 노면'); }
    if (sc.splashes_or_spray) { env += 1; evidence.push('물보라'); }
    const sunnyShadows = sc.sunny_hard_shadows === true;
    if (sunnyShadows) env -= 2;

    let umb = 0;
    if (judged.length) {
      const ratio = open / judged.length;
      umb = (judged.length >= 2 && ratio >= 0.5) ? 3 : (judged.length >= 2 && ratio >= 0.25) ? 2 : open >= 1 ? 1 : judged.length >= 3 ? -1 : 0;
      if (open > 0) evidence.push(`우산 ${open}/${judged.length}명`);
    }
    // 해가 떠 있으면 우산 판단 없이 '화창' (보이는 우산은 양산으로 본다)
    const isSunny = sunnyShadows && sc.night !== true && !sc.wet_road_reflection && !sc.rain_streaks_or_drops &&
      !sc.lens_droplets && !sc.splashes_or_spray;
    const modelScore = verdict.rain_judgement === 'raining' ? 2 : verdict.rain_judgement === 'not_raining' ? -2 : 0;
    const isRaining = !isSunny && env + umb + modelScore >= 2;

    return {
      total: judged.length, umbrella: open, isRaining, isSunny,
      allPedestrians: people.length, movingCount: people.filter(p => p.moving).length,
      shelteredExcluded: excludeSheltered ? sheltered : 0, motionAvailable: motion.reliable,
      unclearCount: population.length - judged.length, frameCount, evidence, summary: verdict.summary, model,
    };
  }

  // ── 결과 문구 (안드로이드 AnalysisResult 와 동일) ──
  const pct = r => r.total ? Math.round(r.umbrella * 100 / r.total) : 0;
  function displayText(r) {
    if (r.isSunny) return '☀️ 날씨가 화창합니다';
    if (r.total === 0) return r.isRaining ? '☔ 비 오는 중 (도로/환경 분석)' : '☀️ 비 없음 (도로/환경 분석)';
    if (r.umbrella === 0) return `${r.isRaining ? '☔' : '☀️'} 보행자 ${r.total}명 / 우산 0명`;
    if (r.umbrella === r.total) return `☔ 보행자 ${r.total}명 모두 우산`;
    return `${r.isRaining ? '☔' : '🌂'} 보행자 ${r.total}명 중 ${r.umbrella}명 우산 (${pct(r)}%)`;
  }
  function detailLines(r) {
    const tail = `프레임 ${r.frameCount}장 분석${r.model ? ' · ' + r.model : ''}`;
    if (r.isSunny) return ['햇빛 그림자와 마른 노면이 보여 우산 판단을 생략했습니다', tail];
    let people = `전체 보행자 ${r.allPedestrians}명`;
    if (r.shelteredExcluded > 0) people += ` · 지붕 아래 ${r.shelteredExcluded}명 제외`;
    if (r.unclearCount > 0) people += ` · 판단불가 ${r.unclearCount}명 제외`;
    const lines = [people, r.motionAvailable ? `움직임 확인: 이동 중 ${r.movingCount}명` : '정지영상이라 움직임 비교 불가'];
    if (r.evidence.length) lines.push('근거: ' + r.evidence.join(', '));
    lines.push(tail);
    return lines;
  }
  function speechText(r) {
    if (r.isSunny) return '날씨가 화창합니다.';
    const t = r.total, u = r.umbrella;
    if (t === 0) return r.isRaining ? '현재 CCTV 화면에 사람이 없지만 도로나 환경을 보니 비가 오는 것으로 판단됩니다. 우산을 챙기세요.'
      : '현재 CCTV 화면에 사람이 없으며 비가 오지 않는 것으로 보입니다.';
    if (u === 0) return r.isRaining ? `보행자 ${t}명이 있으며 우산을 쓴 사람은 없지만 도로 상태를 보니 비가 오는 것 같습니다.`
      : `보행자 ${t}명이 있으며 우산을 쓴 사람이 없습니다. 비가 오지 않는 것 같습니다.`;
    if (u === t) return `보행자 ${t}명 모두 우산을 쓰고 있습니다. 비가 오고 있습니다. 우산을 챙기세요.`;
    return r.isRaining ? `보행자 ${t}명 중 ${u}명이 우산을 쓰고 있습니다. 비가 오는 것 같으니 우산을 챙기세요.`
      : `보행자 ${t}명 중 ${u}명이 우산을 쓰고 있습니다. 비는 오지 않는 것 같습니다.`;
  }

  const api = { box, boxFromList, describe, detectMotion, planCrops, TILES, buildPrompt, RESPONSE_SCHEMA, parseVerdict, aggregate, displayText, detailLines, speechText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RainAnalysis = api;
})(typeof window !== 'undefined' ? window : globalThis);
