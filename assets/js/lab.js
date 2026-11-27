/* Earlln AI AGENT — 버튼을 눌러 한 단계씩 따라 하는 실습 화면
 *
 * <div data-lab="data/lab/<id>.json" data-base="../"></div> 에 실습을 그립니다.
 * 실습 내용(단계, 버튼, 확인 질문, 자주 묻는 질문)은 JSON 에 있고, 이 파일은 그것을 보여 주기만 합니다.
 *
 * 단계(step) 필드
 *   id, title, html            제목과 본문(HTML). {{folder}} {{paste}} {{device}} 같은 값이 바뀌어 들어감
 *   win / mac / phone / pc     고른 기기(device 또는 where 값)별로 덮어쓸 필드 (title, html, image, code …)
 *   image, alt                 설명 그림 (사이트 루트 기준 경로)
 *   code, codeLabel            복사 버튼이 있는 입력 상자
 *   input {var,label,default,hint}   직접 입력 받기
 *   choices [{label,sub,icon,set,next}]   큰 선택 버튼
 *   check {q, yes, no, yesLabel, noLabel} 해 봤는지 확인 (예/아니요)
 *   next, button               "다음" 버튼으로 갈 단계
 *   faq [{q,a}], ask           궁금한 점: 준비된 답 + Claude에게 물어보기 (Claude 준비 단계 이후에만)
 *   askNow                     이 단계에서는 바로 물어보기 칸을 펼쳐 보여 줌 (연습용)
 *   stage                      진행 표시용 큰 단계 번호 (lab.stages 의 몇 번째인지)
 *   kind: "help" | "summary"   도움말 단계 / 총정리 단계
 */
(function () {
  "use strict";
  var host = document.querySelector("[data-lab]");
  if (!host) return;
  var base = host.getAttribute("data-base") || "";
  var KEY = "earlln-lab-" + host.getAttribute("data-lab");
  var lab, byId = {}, state;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 저장 못 해도 진행은 됨 */ }
  }
  // 언어: site.js 가 html[data-lang] 을 정함. 아직 안 정했으면 저장된 값/주소를 봄
  function lang() {
    var l = document.documentElement.getAttribute("data-lang");
    if (l === "en" || l === "ko") return l;
    var q = (location.search.match(/[?&]lang=(ko|en)\b/) || [])[1];
    if (q) return q;
    try { return localStorage.getItem("earlln-lang") === "en" ? "en" : "ko"; } catch (e) { return "ko"; }
  }
  function T(ko, en) { return lang() === "en" ? en : ko; }
  var DEVICE = { win: ["Windows 컴퓨터", "Windows PC"], mac: ["Mac 컴퓨터", "Mac"] };
  function deviceName(d) { return DEVICE[d] ? T(DEVICE[d][0], DEVICE[d][1]) : ""; }
  function vars() {
    var mac = state.vars.device === "mac";
    return {
      folder: esc(state.vars.folder || T("연습", "Practice")),
      device: deviceName(state.vars.device) || T("컴퓨터", "computer"),
      paste: mac ? "<kbd>⌘ Command</kbd>+<kbd>V</kbd>" : "<kbd>Ctrl</kbd>+<kbd>V</kbd>",
      enterkey: mac ? "<kbd>return</kbd>" : "<kbd>Enter</kbd>",
      base: base,
      copy: mac ? "<kbd>⌘ Command</kbd>+<kbd>C</kbd>" : "<kbd>Ctrl</kbd>+<kbd>C</kbd>"
    };
  }
  function fill(s) {
    var v = vars();
    return String(s || "").replace(/\{\{(\w+)\}\}/g, function (m, k) { return v[k] != null ? v[k] : m; });
  }
  // 기기별 내용(win/mac)을 합친 단계
  // 고른 값(device: win/mac, where: phone/pc …)과 같은 이름의 필드가 있으면 그 내용으로 덮어씀
  function resolve(step) {
    var out = {};
    Object.keys(step).forEach(function (k) { out[k] = step[k]; });
    ["device", "where"].forEach(function (v) {
      var key = state.vars[v];
      if (key && step[key] && typeof step[key] === "object") Object.keys(step[key]).forEach(function (k) { out[k] = step[key][k]; });
    });
    return out;
  }
  // 진행 표시: 단계마다 stage(1부터) 번호, 전체 이름은 lab.stages
  function progress(id) {
    var st = byId[id] && byId[id].stage;
    return st ? { n: st, total: lab.stages.length, name: lab.stages[st - 1] } : null;
  }

  function go(id, push) {
    if (!byId[id]) return;
    if (push !== false && state.at && state.at !== id) state.history.push(state.at);
    state.at = id;
    save();
    render();
    var top = host.getBoundingClientRect().top + window.pageYOffset - 80;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }
  function back() {
    var prev = state.history.pop();
    if (prev) { state.at = prev; save(); render(); }
  }
  // 1분 진단(diagnose.js)에서 고른 기기를 이어받음
  function profileVars() {
    try {
      var p = JSON.parse(localStorage.getItem("earlln-profile"));
      var d = p && p.a && p.a.device;
      return d === "win" || d === "mac" ? { device: d, fromProfile: true } : {};
    } catch (e) { return {}; }
  }
  function restart() {
    state = { at: lab.steps[0].id, history: [], vars: profileVars() };
    save();
    render();
  }

  function askPrompt(step, question) {
    if (lang() === "en") {
      return [
        "I'm a complete beginner with computers. I'm following the '" + lab.title + "' practice in the earlln.com AI AGENT section.",
        "- My device: " + (state.vars.where === "phone" ? "phone (Claude app)" : state.vars.where === "pc" ? "computer (browser)" : deviceName(state.vars.device) || "not chosen yet"),
        "- The step I'm on: " + step.title,
        step.code ? "- What I type in this step: " + step.code : "",
        "",
        "My question: " + question,
        "",
        "Please explain step by step in very simple words: what to click and what to type."
      ].filter(function (l, i) { return l !== "" || i > 3; }).join("\n");
    }
    var lines = [
      "나는 컴퓨터를 잘 모르는 초보자야. earlln.com AI AGENT 메뉴의 '" + lab.title + "' 실습을 따라 하고 있어.",
      "- 내 기기: " + (state.vars.where === "phone" ? "휴대폰 (Claude 앱)" : state.vars.where === "pc" ? "컴퓨터 (브라우저)" : deviceName(state.vars.device) || "아직 고르지 않음"),
      "- 지금 하고 있는 단계: " + step.title,
      step.code ? "- 이 단계에서 입력하는 것: " + step.code : "",
      "",
      "궁금한 점: " + question,
      "",
      "어려운 말 없이, 무엇을 누르고 무엇을 입력하는지 한 단계씩 아주 쉽게 알려줘."
    ];
    return lines.filter(function (l, i) { return l !== "" || i > 3; }).join("\n");
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolveP, reject) {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy") ? resolveP() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  // 전체 과정 안내(course-nav.js)에 보여 줄 진행 상황
  var LAB_ID = (host.getAttribute("data-lab").match(/([^\/]+)\.json$/) || [])[1];
  function record(step, p) {
    if (!LAB_ID) return;
    var all;
    try { all = JSON.parse(localStorage.getItem("earlln-progress")) || {}; } catch (e) { all = {}; }
    all.labs = all.labs || {};
    var prev = all.labs[LAB_ID] || {};
    var done = prev.done || step.kind === "summary";
    all.labs[LAB_ID] = { stage: p ? p.n : (prev.stage || 1), total: p ? p.total : (prev.total || 0), done: done };
    try { localStorage.setItem("earlln-progress", JSON.stringify(all)); } catch (e) { return; }
    try { document.dispatchEvent(new CustomEvent("earlln:progress")); } catch (e) { /* 오래된 브라우저 */ }
  }

  // 방문 통계 (analytics.js). 같은 단계를 언어만 바꿔 다시 그릴 때는 다시 보내지 않음
  var lastTracked = null;
  function track(name, params) {
    if (!window.earllnTrack) return;
    params = params || {};
    params.lab_id = LAB_ID;
    window.earllnTrack(name, params);
  }
  function trackStep(step) {
    if (lastTracked === step.id) return;
    var first = lastTracked === null;
    lastTracked = step.id;
    if (first) track("lab_open", { step_id: step.id });
    else track("lab_step", { step_id: step.id, step_kind: step.kind || "step" });
    if (step.kind === "summary") track("lab_complete");
  }

  function render() {
    var raw = byId[state.at] || lab.steps[0];
    var s = resolve(raw);
    var p = progress(raw.id);
    record(raw, p);
    trackStep(raw);
    var h = [];
    h.push('<div class="lab__bar">');
    if (state.history.length) h.push('<button type="button" class="lab__back" data-back>' + T("← 이전", "← Back") + '</button>');
    else h.push("<span></span>");
    if (p) h.push('<span class="lab__count">' + p.n + " / " + p.total + " · " + esc(p.name) + "</span>");
    else if (s.kind === "help") h.push('<span class="lab__count lab__count--help">' + T("도움말", "Help") + '</span>');
    h.push("</div>");
    if (p) h.push('<div class="lab__progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + p.total + '" aria-valuenow="' + p.n + '"><span style="width:' + Math.round(p.n / p.total * 100) + '%"></span></div>');

    h.push('<section class="lab__card' + (s.kind ? " lab__card--" + s.kind : "") + '">');
    h.push('<h2 class="lab__title">' + fill(s.title) + "</h2>");
    if (s.html) h.push('<div class="lab__body">' + fill(s.html) + "</div>");
    if (s.image) h.push('<figure class="lab__fig"><a href="' + base + esc(s.image) + '" target="_blank" rel="noopener"><img src="' + base + esc(s.image) + '" alt="' + esc(s.alt || "") + '"></a><figcaption>' + T("그림을 누르면 크게 볼 수 있어요", "Tap the picture to see it larger") + '</figcaption></figure>');
    if (s.code) h.push('<div class="lab__code">' + (s.codeLabel ? '<span class="lab__code-label">' + esc(s.codeLabel) + "</span>" : "") +
      '<pre' + (/[가-힣]/.test(s.code) ? ' class="ko"' : '') + '><code>' + esc(s.code) + '</code></pre><button type="button" class="lab__copy" data-copy>' + T("복사하기", "Copy") + '</button></div>');
    if (s.input) {
      var cur = state.vars[s.input["var"]] || s.input["default"] || "";
      h.push('<label class="lab__input"><span>' + esc(s.input.label) + '</span><input type="text" data-input value="' + esc(cur) + '" autocomplete="off">' +
        (s.input.hint ? '<small>' + esc(s.input.hint) + "</small>" : "") + '<em class="lab__err" data-err hidden></em></label>');
    }

    h.push('<div class="lab__actions">');
    if (s.choices) {
      s.choices.forEach(function (c, i) {
        // 진단에서 고른 기기는 표시해 줌
        var picked = state.vars.fromProfile && c.set && c.set.device && c.set.device === state.vars.device;
        h.push('<button type="button" class="lab__btn lab__btn--choice' + (picked ? " is-on" : "") + '" data-choice="' + i + '">' +
          (c.icon ? '<span class="lab__icon">' + esc(c.icon) + "</span>" : "") +
          '<span><b>' + esc(c.label) + "</b>" + (picked ? "<small>" + T("1분 진단에서 고르신 기기예요", "The device you picked in the 1-minute check-in") + "</small>" : c.sub ? "<small>" + esc(c.sub) + "</small>" : "") + "</span></button>");
      });
    } else if (s.check) {
      h.push('<p class="lab__check">' + fill(s.check.q) + "</p>");
      h.push('<div class="lab__yesno"><button type="button" class="lab__btn lab__btn--yes" data-yes>' + esc(s.check.yesLabel || T("네, 됐어요", "Yes, done")) + "</button>" +
        '<button type="button" class="lab__btn lab__btn--no" data-no>' + esc(s.check.noLabel || T("아니요, 안 돼요", "No, it didn't work")) + "</button></div>");
    } else if (s.next) {
      h.push('<button type="button" class="lab__btn lab__btn--next" data-next>' + esc(s.button || T("다음", "Next")) + " →</button>");
    } else if (s.kind === "help") {
      h.push('<button type="button" class="lab__btn lab__btn--next" data-back>' + esc(s.button || T("다시 해 볼게요", "Let me try again")) + "</button>");
    }
    h.push("</div>");

    if ((s.faq && s.faq.length) || s.ask) {
      h.push('<details class="lab__ask"' + (s.askNow ? " open" : "") + '><summary>' + T("궁금한 점이 있어요", "I have a question") + '</summary><div class="lab__ask-body">');
      if (s.faq && s.faq.length) {
        h.push('<p class="lab__ask-head">' + T("자주 묻는 질문", "Common questions") + '</p>');
        s.faq.forEach(function (f) { h.push('<details class="lab__faq"><summary>' + esc(f.q) + "</summary><div>" + fill(f.a) + "</div></details>"); });
      }
      if (s.ask && (state.vars.claudeReady || s.askNow)) {
        h.push('<p class="lab__ask-head">' + T("Claude에게 물어보기", "Ask Claude") + '</p>' +
          '<textarea data-q rows="3" placeholder="' + T("예) 붙여 넣었는데 빨간 글씨가 나와요", "e.g. I pasted it and red text appeared") + '"></textarea>' +
          '<button type="button" class="lab__btn lab__btn--ask" data-ask>' + T("Claude에게 물어보기", "Ask Claude") + '</button>' +
          '<p class="lab__ask-note" data-ask-note hidden></p>');
      } else if (s.ask) {
        h.push('<p class="lab__ask-note">' + T("Claude 준비 단계를 마치면, 여기서 궁금한 점을 Claude에게 바로 물어볼 수 있어요.", "Once you've set up Claude, you can ask it your questions right here.") + '</p>');
      }
      h.push("</div></details>");
    }
    h.push("</section>");
    var again = '<button type="button" class="lab__link" data-restart>' + T("처음부터 다시 하기", "Start over") + "</button>";
    if (s.kind === "summary") h.push('<p class="lab__restart">' + again + "</p>");
    else h.push('<p class="lab__restart">' + again + T(" · 진행 상황은 이 브라우저에 저장돼요.", " · Your progress is saved in this browser.") + "</p>");

    host.innerHTML = h.join("");
    wire(s);
  }

  function wire(s) {
    host.querySelectorAll("[data-back]").forEach(function (b) { b.addEventListener("click", back); });
    host.querySelectorAll("[data-restart]").forEach(function (b) {
      b.addEventListener("click", function () { if (confirm(T("처음부터 다시 할까요? 지금까지 고른 내용이 지워져요.", "Start over? Your choices so far will be cleared."))) { track("lab_restart"); restart(); } });
    });
    var inp = host.querySelector("[data-input]");
    if (inp) inp.addEventListener("input", function () { host.querySelector("[data-err]").hidden = true; });
    var nextBtn = host.querySelector("[data-next]");
    if (nextBtn) nextBtn.addEventListener("click", function () { if (takeInput(s)) { applySet(s.set); go(s.next); } });
    host.querySelectorAll("[data-choice]").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = s.choices[+b.getAttribute("data-choice")];
        applySet(c.set);
        go(c.next);
      });
    });
    var yes = host.querySelector("[data-yes]"), no = host.querySelector("[data-no]");
    if (yes) yes.addEventListener("click", function () { if (takeInput(s)) { applySet(s.check.set); go(s.check.yes); } });
    if (no) no.addEventListener("click", function () { track("lab_stuck", { step_id: s.id }); go(s.check.no); });
    var copy = host.querySelector("[data-copy]");
    if (copy) copy.addEventListener("click", function () {
      copyText(s.code).then(function () { copy.textContent = T("복사됐어요 ✓", "Copied ✓"); setTimeout(function () { copy.textContent = T("복사하기", "Copy"); }, 2000); },
        function () { copy.textContent = T("길게 눌러 직접 복사해 주세요", "Press and hold to copy it yourself"); });
    });
    var ask = host.querySelector("[data-ask]");
    if (ask) ask.addEventListener("click", function () {
      track("lab_ask", { step_id: s.id });
      var q = (host.querySelector("[data-q]").value || "").trim();
      var note = host.querySelector("[data-ask-note]");
      if (!q) { note.hidden = false; note.textContent = T("궁금한 점을 먼저 적어 주세요.", "Please type your question first."); return; }
      var prompt = askPrompt(s, q);
      var open = function () { window.open("https://claude.ai/new?q=" + encodeURIComponent(prompt), "_blank", "noopener"); };
      copyText(prompt).then(function () {
        note.hidden = false;
        note.innerHTML = T("질문을 <b>복사</b>해 두었어요. 새로 열린 Claude 창의 입력 칸에 글이 들어가 있으면 <kbd>Enter</kbd>, 비어 있으면 입력 칸을 누르고 " + vars().paste + " 로 붙여 넣은 뒤 <kbd>Enter</kbd> 를 누르세요.",
          "Your question is <b>copied</b>. In the new Claude window, if the box already has the text, press <kbd>Enter</kbd>. If it's empty, click the box, paste with " + vars().paste + ", then press <kbd>Enter</kbd>.");
        open();
      }, function () {
        note.hidden = false;
        note.textContent = T("새로 열린 Claude 창에 궁금한 점을 직접 적어 주세요.", "Type your question in the new Claude window.");
        open();
      });
    });
  }
  function applySet(set) {
    if (!set) return;
    Object.keys(set).forEach(function (k) { state.vars[k] = set[k]; });
    save();
  }
  // 입력 칸이 있으면 값을 확인하고 저장. 문제가 있으면 false
  function takeInput(s) {
    if (!s.input) return true;
    var el = host.querySelector("[data-input]"), err = host.querySelector("[data-err]");
    var v = (el.value || "").trim();
    var msg = "";
    if (!v) msg = T("이름을 적어 주세요. 잘 모르겠으면 '연습'이라고 적으세요.", "Please type a name. If you're not sure, type 'Practice'.");
    else if (/[\\/:*?"<>|]/.test(v)) msg = T("폴더 이름에는 \\ / : * ? \" < > | 를 쓸 수 없어요.", "Folder names can't use \\ / : * ? \" < > |");
    else if (v.length > 30) msg = T("조금 더 짧게 적어 주세요.", "Please make it a little shorter.");
    if (msg) { err.hidden = false; err.textContent = msg; el.focus(); return false; }
    state.vars[s.input["var"]] = v;
    save();
    return true;
  }

  // 영어는 data/lab/<id>.en.json (단계 id 는 한국어판과 같아서 진행 상황이 그대로 이어짐)
  var loadedLang = null;
  function fetchLab() {
    var l = lang(), src = host.getAttribute("data-lab");
    if (l === "en") src = src.replace(/\.json$/, ".en.json");
    return fetch(base + src, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        lab = data; byId = {}; loadedLang = l;
        lab.steps.forEach(function (st) { byId[st.id] = st; });
        if (!state) state = load();
        if (!state || !byId[state.at]) state = { at: lab.steps[0].id, history: [], vars: profileVars() };
        render();
      });
  }
  document.addEventListener("earlln:lang", function () { if (lab && lang() !== loadedLang) fetchLab().catch(function () { render(); }); handoff(); });

  // 컴퓨터로 열었을 때: 휴대폰 카메라로 비추면 같은 실습이 열리는 QR 코드 (qrcode.js 가 있을 때만)
  var HANDOFF_KEY = "earlln-lab-handoff-closed";
  function isPhone() {
    return (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || window.innerWidth < 900;
  }
  function handoff() {
    var box = document.querySelector("[data-lab-handoff]");
    var closed = false;
    try { closed = localStorage.getItem(HANDOFF_KEY) === "1"; } catch (e) { /* ignore */ }
    if (isPhone() || closed || typeof window.qrcode !== "function") { if (box) box.remove(); return; }
    var url = location.origin + location.pathname + "?lang=" + lang();
    var svg = "";
    try { var qr = window.qrcode(0, "M"); qr.addData(url); qr.make(); svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
    catch (e) { return; }
    if (!box) {
      box = document.createElement("aside");
      box.className = "lab-handoff";
      box.setAttribute("data-lab-handoff", "");
      host.parentNode.insertBefore(box, host);
    }
    box.innerHTML = '<div class="lab-handoff__qr" aria-hidden="true">' + svg + "</div>" +
      '<div class="lab-handoff__text"><b>' + T("휴대폰으로 보면서 따라 하기", "Follow along on your phone") + "</b>" +
      "<p>" + T("휴대폰 카메라로 이 QR 코드를 비추면, 이 실습이 휴대폰에서 열려요. 화면은 휴대폰에 두고 컴퓨터에서 따라 하면 편해요.",
        "Point your phone's camera at this QR code to open this practice on your phone. Keep the steps on your phone and do them on your computer.") + "</p>" +
      '<small>' + T("진행 상황은 기기마다 따로 저장돼요.", "Progress is saved separately on each device.") + "</small></div>" +
      '<button type="button" class="lab__link lab-handoff__close" data-handoff-close>' + T("닫기", "Close") + "</button>";
    box.querySelector("[data-handoff-close]").addEventListener("click", function () {
      try { localStorage.setItem(HANDOFF_KEY, "1"); } catch (e) { /* ignore */ }
      box.remove();
    });
  }
  handoff();
  fetchLab()
    .catch(function () {
      host.innerHTML = '<p class="lab__fail">' + T("실습을 불러오지 못했어요. 새로고침해 보세요.", "Couldn't load the practice. Please refresh the page.") + "</p>";
    });
})();
