/* ==========================================================================
   성경 구절 검색 (bible.html)
   - 본문은 카페24의 /bible-api.php 가 워드프레스 DB(개역개정·ESV)와 NLT·NIV API 에서 가져옵니다.
   - 화면 구성, 복사, 읽어주기는 이 파일이 맡습니다. 책 목록은 bible-books.js.
   ========================================================================== */
(function () {
  "use strict";

  var BOOKS = window.BIBLE_BOOKS || [];
  var ALIASES = window.BIBLE_ALIASES || {};
  var VERSIONS = ["NLT", "ESV", "NIV"];
  var host = location.hostname;
  var API = /(^|\.)earlln\.com$|^localhost$|^127\.0\.0\.1$/.test(host) ? "/bible-api.php" : "https://earlln.com/bible-api.php";

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var isEn = function () { return document.documentElement.getAttribute("data-lang") === "en"; };
  var T = function (ko, en) { return isEn() ? en : ko; };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장소를 못 쓰는 브라우저 */ } }
  };
  var bookIndex = {};
  BOOKS.forEach(function (b, i) { bookIndex[b.ko] = i; });

  var form = $("#bkForm"), qInput = $("#bkQ"), out = $("#bkResult"), status = $("#bkStatus");
  if (!form || !BOOKS.length) return;

  /* ---------- 보기 설정 (브라우저에 기억) ---------- */
  var opts = {
    ver: store.get("bk-ver", "NLT"),
    order: store.get("bk-order", "block"),   // block: 한글 전체 → 영어 전체 · pair: 절마다 한·영
    flow: store.get("bk-flow", "lines")      // lines: 절마다 줄바꿈 · para: 이어서
  };
  if (VERSIONS.indexOf(opts.ver) < 0) opts.ver = "NLT";
  if (opts.order !== "pair") opts.order = "block";
  if (opts.flow !== "para") opts.flow = "lines";

  var state = { q: "", data: null, kind: "", seq: 0 };

  /* ---------- 구절 읽기 (예: 요 3:16, John 3:16-18, 창세기 1장 1절~5절, 시 23편) ---------- */
  var aliasKeys = Object.keys(ALIASES).sort(function (a, b) { return b.length - a.length; });
  var aliasAlt = aliasKeys.map(function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|");
  function parseRefs(txt) {
    var norm = String(txt).replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "").replace(/\s+/g, " ").toLowerCase();
    norm = norm.replace(/song\s*of\s*(solomon|songs)/g, "songof$1").replace(/([123])\s+(?=[a-z])/g, "$1");
    var re = new RegExp(
      "(^|[^가-힣a-z0-9])(" + aliasAlt + ")" +
      "(?:\\s*\\.?\\s*(\\d+)\\s*[:：]\\s*(\\d+)(?:\\s*[-~–—]\\s*(\\d+))?" +
      "|\\s*\\.?\\s*(\\d+)\\s*(?:장|편)(?:\\s*(\\d+)\\s*절?(?:\\s*[-~–—]\\s*(\\d+)\\s*절?)?)?" +
      "|\\s*\\.?\\s*(\\d+)(?=\\s*(?:$|[,;/]|\\s+(?:[가-힣a-z]|$))))", "g");
    var found = [], seen = {}, m;
    while ((m = re.exec(norm)) !== null) {
      var bi = ALIASES[m[2]];
      var ch = parseInt(m[3] || m[6] || m[9], 10);
      if (bi === undefined || !ch || ch > BOOKS[bi].v.length) continue;
      var a = m[4] || m[7], b = m[5] || m[8];
      var v1 = a ? parseInt(a, 10) : 1;
      var v2 = b ? parseInt(b, 10) : (a ? v1 : 999);
      if (v2 < v1) v2 = v1;
      var key = bi + "|" + ch + "|" + v1 + "|" + v2;
      if (seen[key]) continue;
      seen[key] = 1;
      found.push({ b: BOOKS[bi].ko, c: ch, v1: v1, v2: v2 });
      if (found.length >= 20) break;
    }
    return found;
  }

  /* ---------- 서버 호출 ---------- */
  function api(params) {
    var qs = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
    return fetch(API + "?" + qs, { headers: { "Accept": "application/json" } })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (j) { if (!j || !j.ok) { var e = new Error((j && j.error) || "server"); e.api = j; throw e; } return j; });
  }

  function run(q, push) {
    q = String(q || "").trim();
    if (!q) { showStatus(T("구절 또는 검색어를 입력하세요.", "Enter a verse reference or a keyword."), "warn"); qInput.focus(); return; }
    qInput.value = q;
    state.q = q;
    if (push) {
      var url = location.pathname + "?q=" + encodeURIComponent(q);
      if (url !== location.pathname + location.search) history.pushState({ q: q }, "", url);
    }
    stopSpeak();
    var refs = parseRefs(q), seq = ++state.seq;
    showStatus(T("불러오는 중…", "Loading…"), "busy");
    var req = refs.length
      ? api({ action: "passage", refs: JSON.stringify(refs), ver: opts.ver, lang: isEn() ? "en" : "ko" })
      : api({ action: "search", kw: q.replace(/\s+/g, " ").slice(0, 40), ver: opts.ver, lang: isEn() ? "en" : "ko" });
    req.then(function (j) {
      if (seq !== state.seq) return;
      state.kind = refs.length ? "passage" : "search";
      state.data = j;
      showStatus("", "");
      render();
      if (state.kind === "passage") syncPicker(j.passages[0]);
    }).catch(function (e) {
      if (seq !== state.seq) return;
      state.data = null;
      out.innerHTML = "";
      if (e.api && e.api.error) {
        showStatus(T("검색하지 못했어요. 입력한 내용을 다시 확인해 주세요.", "That search did not work. Please check what you entered."), "warn");
      } else {
        showStatus(T("검색 서버에 연결하지 못했어요. 잠시 뒤 다시 해 보시거나, ", "Could not reach the search server. Try again shortly, or ") +
          '<a data-bible-url href="' + esc(fallbackUrl()) + '" target="_blank" rel="noopener">' +
          T("예전 검색 페이지에서 열어 보세요 →", "open it on the previous search page →") + "</a>", "warn", true);
      }
    });
  }
  function fallbackUrl() {
    var a = $("[data-bible-fallback]");
    var href = a ? a.getAttribute("href") : "https://earlln.com/?page_id=389";
    return href + (isEn() && href.indexOf("lang=") < 0 ? (href.indexOf("?") < 0 ? "?" : "&") + "lang=en" : "");
  }
  function showStatus(msg, kind, html) {
    status.className = "bible-status" + (kind ? " bible-status--" + kind : "");
    status.hidden = !msg;
    if (html) status.innerHTML = msg; else status.textContent = msg;
  }

  /* ---------- 그리기 ---------- */
  var KO_LABEL = function () { return T("개역개정", "NKRV"); };
  function refText(p) {
    var r = p.from === p.to ? String(p.from) : p.from + "–" + p.to;
    return { ko: p.book + " " + p.chapter + ":" + r, en: p.eng + " " + p.chapter + ":" + r };
  }
  function titleSay(p) {
    var one = p.from === p.to;
    return {
      ko: p.book + " " + p.chapter + "장 " + (one ? p.from + "절" : p.from + "절부터 " + p.to + "절까지"),
      en: p.eng + " chapter " + p.chapter + ", " + (one ? "verse " + p.from : "verses " + p.from + " to " + p.to)
    };
  }
  function verseHtml(v, lang, text) {
    if (!text) return '<span class="bv bv--missing"><sup class="bv__n">' + v + "</sup>—</span>";
    return '<span class="bv"><sup class="bv__n">' + v + '</sup><span class="bk-' + lang + '" lang="' + lang + '">' + esc(text) + "</span></span>";
  }

  function renderPassage(p, ver) {
    var r = refText(p);
    if (!p.found) {
      return '<article class="bible-card bible-card--empty"><h2 class="bible-card__ref">' + esc(isEn() ? r.en : r.ko) + "</h2><p class=\"muted\">" +
        T("이 구절을 찾지 못했어요. 장·절 번호를 확인해 주세요.", "This passage was not found. Please check the chapter and verse.") + "</p></article>";
    }
    var say = titleSay(p), hasEn = p.hasEnglish, body = "";
    var sep = opts.flow === "lines" ? "" : " ";
    var missing = '<p class="bible-missing">' + esc(ver) + " " + T("본문을 가져오지 못했어요.", "text could not be loaded.") + "</p>";
    if (opts.order === "block") {
      body += '<div class="bible-block"><h3 class="bible-block__label">' + KO_LABEL() + '</h3><p class="bible-verses">' +
        p.verses.map(function (x) { return verseHtml(x.v, "ko", x.ko); }).join(sep) + "</p></div>";
      body += '<div class="bible-block bible-block--en"><h3 class="bible-block__label">' + esc(ver) + "</h3>" +
        (hasEn ? '<p class="bible-verses">' + p.verses.map(function (x) { return verseHtml(x.v, "en", x.en); }).join(sep) + "</p>" : missing) + "</div>";
    } else {
      body += '<ol class="bible-pairs">' + p.verses.map(function (x) {
        return '<li class="bible-pair"><span class="bible-pair__n">' + x.v + '</span><div class="bible-pair__txt">' +
          '<span class="bk-ko" lang="ko">' + esc(x.ko) + "</span>" +
          (hasEn ? (opts.flow === "lines" ? "" : " ") + (x.en ? '<span class="bk-en" lang="en">' + esc(x.en) + "</span>" : '<span class="bible-missing">—</span>') : "") +
          "</div></li>";
      }).join("") + "</ol>" + (hasEn ? "" : missing);
    }
    return '<article class="bible-card" data-flow="' + opts.flow + '" data-order="' + opts.order + '">' +
      '<header class="bible-card__head"><h2 class="bible-card__ref">' +
      '<span class="bk-ko" data-say="' + esc(say.ko) + '" hidden></span><span class="bk-en" data-say="' + esc(say.en) + '" hidden></span>' +
      esc(isEn() ? r.en : r.ko) + '</h2><span class="bible-card__sub">' + esc(isEn() ? p.book + " · " + r.ko.split(" ").pop() : r.en) +
      " · " + KO_LABEL() + (hasEn ? " / " + esc(ver) : "") + "</span></header>" + body + "</article>";
  }

  function chapterNav(p) {
    if (!p || !p.found) return "";
    var bi = bookIndex[p.book], ch = p.chapter, n = BOOKS[bi].v.length;
    var prev = ch > 1 ? [bi, ch - 1] : (bi > 0 ? [bi - 1, BOOKS[bi - 1].v.length] : null);
    var next = ch < n ? [bi, ch + 1] : (bi < BOOKS.length - 1 ? [bi + 1, 1] : null);
    var whole = p.from === 1 && p.to >= BOOKS[bi].v[ch - 1];
    var link = function (x, cls, label) {
      if (!x) return '<span class="btn btn--ghost btn--sm ' + cls + '" aria-disabled="true">' + label + "</span>";
      var b = BOOKS[x[0]], q = b.ko + " " + x[1] + "장";
      return '<a class="btn btn--ghost btn--sm ' + cls + '" href="?q=' + encodeURIComponent(q) + '" data-q="' + esc(q) + '">' + label + "</a>";
    };
    var name = function (x) { return x ? (isEn() ? BOOKS[x[0]].en : BOOKS[x[0]].ko) + " " + x[1] : ""; };
    return '<nav class="bible-chapnav" aria-label="' + T("장 이동", "Chapter navigation") + '">' +
      link(prev, "bible-chapnav__prev", "← " + esc(name(prev))) +
      (whole ? "" : link([bi, ch], "bible-chapnav__all", T("이 장 전체 보기", "Read the whole chapter"))) +
      link(next, "bible-chapnav__next", esc(name(next)) + " →") + "</nav>";
  }

  function mark(text, kw, ci) {
    var h = esc(text);
    if (!kw) return h;
    var k = esc(kw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return h.replace(new RegExp(k, ci ? "gi" : "g"), function (s) { return "<mark>" + s + "</mark>"; });
  }
  function renderSearch(j) {
    var head = '<div class="bible-sum"><b>“' + esc(j.kw) + "”</b> " +
      T(j.total + "건", j.total + (j.total === 1 ? " verse" : " verses")) +
      (j.total > j.shown ? ' <span class="muted">' + T("(처음 " + j.shown + "건 표시)", "(showing the first " + j.shown + ")") + "</span>" : "") + "</div>";
    if (!j.rows.length) {
      return head + '<p class="bible-card bible-card--empty muted">' + T("일치하는 구절이 없어요. 다른 낱말로 찾아보세요.", "No verse matched. Try another word.") + "</p>";
    }
    var item = function (r, lang) {
      var ref = (lang === "ko" ? r.book : r.ebook) + " " + r.chapter + ":" + r.verse;
      var q = r.book + " " + r.chapter + "장";
      var refA = '<a class="bible-hit__ref" href="?q=' + encodeURIComponent(q) + '" data-q="' + esc(q) + '" title="' +
        T("이 장 전체 보기", "Read the whole chapter") + '">' + esc(ref) + "</a>";
      if (lang === "ko") {
        return refA + '<span class="bk-ko" lang="ko" data-say="' + esc(r.book + " " + r.chapter + "장 " + r.verse + "절. " + r.ko) + '">' + mark(r.ko, j.kw) + "</span>";
      }
      if (!r.en) return refA + '<span class="bible-missing">—</span>';
      return refA + '<span class="bk-en" lang="en" data-say="' + esc(r.eng + " chapter " + r.chapter + ", verse " + r.verse + ". " + r.en) + '">' + mark(r.en, j.kw, true) + "</span>";
    };
    var body;
    if (opts.order === "block") {
      body = '<div class="bible-block"><h3 class="bible-block__label">' + KO_LABEL() + '</h3><ol class="bible-hits">' +
        j.rows.map(function (r) { return '<li class="bible-hit">' + item(r, "ko") + "</li>"; }).join("") + "</ol></div>" +
        '<div class="bible-block bible-block--en"><h3 class="bible-block__label">' + esc(j.ver) + '</h3><ol class="bible-hits">' +
        j.rows.map(function (r) { return '<li class="bible-hit">' + item(r, "en") + "</li>"; }).join("") + "</ol></div>";
    } else {
      body = '<ol class="bible-hits bible-hits--pair">' + j.rows.map(function (r) {
        return '<li class="bible-hit"><div class="bible-hit__ko">' + item(r, "ko") + '</div><div class="bible-hit__en">' + item(r, "en") + "</div></li>";
      }).join("") + "</ol>";
    }
    return head + '<article class="bible-card" data-flow="' + opts.flow + '" data-order="' + opts.order + '">' + body + "</article>";
  }

  function toolbar() {
    var rates = ["0.2", "0.4", "0.6", "0.8", "1"];
    var cur = String(getRate());
    return '<div class="bible-tools" role="toolbar" aria-label="' + T("결과 도구", "Result tools") + '">' +
      '<button type="button" class="btn btn--primary btn--sm" data-act="copy">' + icon("copy") + "<span>" + T("복사", "Copy") + "</span></button>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-act="ko">' + icon("play") + "<span>" + T("한글 읽기", "Read Korean") + "</span></button>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-act="en">' + icon("play") + "<span>" + T("영어 읽기", "Read English") + "</span></button>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-act="stop" disabled>' + icon("stop") + "<span>" + T("정지", "Stop") + "</span></button>" +
      '<label class="bible-rate">' + T("속도", "Speed") + ' <select data-act="rate">' +
      rates.map(function (r) { return '<option value="' + r + '"' + (r === cur || (r === "1" && cur === "1.0") ? " selected" : "") + ">" + (r === "1" ? "1.0" : r) + "x</option>"; }).join("") +
      "</select></label>" + '<span class="bible-tools__note" data-tts-note></span></div>';
  }
  function icon(n) {
    var p = {
      copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
      play: '<path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
      stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>'
    }[n];
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>";
  }

  function render() {
    var j = state.data;
    if (!j) return;
    var notes = (j.notices || []).map(function (n) { return '<p class="bible-note">※ ' + esc(n) + "</p>"; }).join("");
    var html;
    if (state.kind === "passage") {
      var ps = j.passages, ok = ps.some(function (p) { return p.found; });
      html = (ps.length > 1 ? '<div class="bible-sum">' + T("찾은 구절 " + ps.length + "곳", ps.length + " passages") + "</div>" : "") +
        notes + (ok ? toolbar() : "") + '<div id="copyText">' + ps.map(function (p) { return renderPassage(p, j.ver); }).join("") + "</div>" +
        (ps.length === 1 ? chapterNav(ps[0]) : "");
    } else {
      html = notes + (j.rows.length ? toolbar() : "") + '<div id="copyText">' + renderSearch(j) + "</div>";
    }
    out.innerHTML = html;
  }

  /* ---------- 복사: 예전 위젯과 같은 글 모양 (PPT·메신저에 붙여 넣기 좋게) ---------- */
  function plainText() {
    var j = state.data, lines = [];
    if (!j) return "";
    var label = T("개역개정", "NKRV");
    if (state.kind === "passage") {
      j.passages.forEach(function (p) {
        if (!p.found) { lines.push("▷" + p.book + " " + p.chapter + " : " + p.from + (p.to > p.from && p.to < 999 ? " ~ " + p.to : "") + "  → " + T("결과 없음", "no result"), ""); return; }
        var range = p.from === p.to ? p.from : p.from + " ~ " + p.to;
        lines.push("▷" + p.book + " (" + (p.ebook || p.eng) + ") " + p.chapter + " : " + range, "");
        var ko = p.verses.map(function (x) { return x.v + " " + x.ko; });
        var en = p.verses.map(function (x) { return x.v + " " + (x.en || "—"); });
        var sep = opts.flow === "lines" ? "\n" : " ";
        if (opts.order === "block") {
          lines.push(ko.join(sep) + " (" + label + ")", "");
          lines.push(p.hasEnglish ? en.join(sep) + " (" + j.ver + ")" : "(" + j.ver + " " + T("본문을 가져오지 못했습니다", "text could not be loaded") + ")");
        } else {
          lines.push(p.verses.map(function (x, i) { return ko[i] + (p.hasEnglish ? sep + en[i] : ""); }).join("\n") +
            (p.hasEnglish ? " (" + label + " / " + j.ver + ")" : ""));
        }
        lines.push("");
      });
    } else {
      var ko = function (r) { return r.book + " " + r.chapter + ":" + r.verse + " " + r.ko; };
      var en = function (r) { return r.ebook + " " + r.chapter + ":" + r.verse + " " + (r.en || "—"); };
      if (opts.order === "block") {
        lines.push("▷" + T("개역개정(NKRV)", "Korean Revised (NKRV)"));
        j.rows.forEach(function (r) { lines.push(ko(r)); });
        lines.push("", "▷" + j.ver);
        j.rows.forEach(function (r) { lines.push(en(r)); });
      } else {
        j.rows.forEach(function (r) { lines.push(opts.flow === "para" ? ko(r) + " / " + en(r) : ko(r) + "\n" + en(r)); });
      }
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function copy(btn) {
    var t = plainText();
    if (!t) return;
    var done = function () { flash(btn, T("복사됨", "Copied")); };
    var fallback = function () {
      var el = document.createElement("textarea");
      el.value = t; el.setAttribute("readonly", ""); el.style.position = "fixed"; el.style.opacity = "0";
      document.body.appendChild(el); el.select();
      try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ }
      document.body.removeChild(el);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback);
    else fallback();
  }
  function flash(btn, msg) {
    var s = btn.querySelector("span"); if (!s) return;
    var org = s.getAttribute("data-label") || s.textContent;
    s.setAttribute("data-label", org); s.textContent = msg;
    setTimeout(function () { s.textContent = org; }, 1200);
  }

  /* ---------- 읽어주기 (Web Speech API) ---------- */
  var tts = { els: [], utts: [], speaking: false, timer: null, seq: 0, lang: "" };
  var hasTTS = "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  if (hasTTS) {
    try { speechSynthesis.getVoices(); window.addEventListener("beforeunload", function () { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }); } catch (e) { /* ignore */ }
  }
  function getRate() {
    var r = parseFloat(store.get("bkTtsRate", "1"));
    return isNaN(r) ? 1 : Math.min(1, Math.max(0.2, r));
  }
  function voices(cb) {
    var v = speechSynthesis.getVoices() || [];
    if (v.length) { cb(v); return; }
    var done = false, fire = function () { if (done) return; done = true; cb(speechSynthesis.getVoices() || []); };
    try { speechSynthesis.addEventListener("voiceschanged", fire, { once: true }); } catch (e) { speechSynthesis.onvoiceschanged = fire; }
    setTimeout(fire, 800);
  }
  function pickVoice(list, lang) {
    var pref = lang === "ko" ? ["ko-kr", "ko"] : ["en-us", "en-gb", "en-au", "en"];
    var best = null, bs = -1;
    list.forEach(function (v) {
      var l = (v.lang || "").replace("_", "-").toLowerCase(), s = -1;
      for (var i = 0; i < pref.length; i++) { if (l === pref[i] || l.indexOf(pref[i] + "-") === 0) { s = 100 - i * 10; break; } }
      if (s < 0 && l.indexOf(pref[pref.length - 1]) === 0) s = 10;
      if (s < 0) return;
      if (/Google|Microsoft|Natural|Premium|Enhanced|Neural/i.test(v.name)) s += 5;
      if (v.localService === false) s += 1;
      if (s > bs) { bs = s; best = v; }
    });
    return best;
  }
  function chunks(text, max) {
    var res = [], parts = text.split(/(?<=[.!?。]["”’)]?)\s+|(?<=[다요오죠까네라])\.\s+/);
    parts.forEach(function (p) {
      p = p.trim();
      while (p.length > max) {
        var cut = Math.max(p.lastIndexOf(", ", max), p.lastIndexOf("; ", max), p.lastIndexOf(" ", max));
        if (cut < max * 0.4) cut = max;
        res.push(p.slice(0, cut).trim()); p = p.slice(cut).trim();
      }
      if (p) res.push(p);
    });
    return res;
  }
  function note(msg) { var n = $("[data-tts-note]", out); if (n) n.textContent = msg || ""; }
  function setSpeaking(on) {
    tts.speaking = on;
    var s = $('[data-act="stop"]', out); if (s) s.disabled = !on;
  }
  function highlight(el, on) { if (el && !el.hasAttribute("hidden")) el.classList.toggle("is-reading", on); }
  function speak(lang) {
    if (!hasTTS) { alert(T("이 브라우저는 음성 읽기를 지원하지 않습니다.", "This browser cannot read text aloud.")); return; }
    stopSpeak();
    var items = [];
    $$("#copyText .bk-" + lang, out).forEach(function (el) {
      var t = el.getAttribute("data-say");
      if (t === null) t = el.textContent;
      t = (t || "").replace(/\s+/g, " ").trim();
      if (t && t !== "—") items.push({ el: el, text: t });
    });
    if (!items.length) { alert(lang === "ko" ? T("한글 본문이 없습니다.", "There is no Korean text.") : T("영어 본문이 없습니다.", "There is no English text.")); return; }
    var seq = ++tts.seq, rate = getRate();
    tts.lang = lang;
    setSpeaking(true);
    voices(function (list) {
      if (seq !== tts.seq) return;
      var voice = pickVoice(list, lang), code = voice ? voice.lang : (lang === "ko" ? "ko-KR" : "en-US");
      note(voice || lang !== "en" ? "" : T("이 기기에 영어 음성이 없어 기본 음성으로 읽습니다.", "No English voice on this device, so the default voice is used."));
      tts.els = items.map(function (it) { return it.el; });
      var utts = [];
      items.forEach(function (it) {
        var cs = chunks(it.text, 160);
        cs.forEach(function (c, ci) {
          var u = new SpeechSynthesisUtterance(c);
          u.lang = code; if (voice) u.voice = voice;
          u.rate = rate;
          if (ci === 0) u.onstart = function () { highlight(it.el, true); };
          if (ci === cs.length - 1) u.onend = function () { highlight(it.el, false); };
          u.onerror = function () { highlight(it.el, false); };
          utts.push(u);
        });
      });
      var last = utts[utts.length - 1], prevEnd = last.onend;
      last.onend = function () { if (prevEnd) prevEnd(); setSpeaking(false); };
      tts.utts = utts;
      try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      utts.forEach(function (u) { speechSynthesis.speak(u); });
      var ua = navigator.userAgent;
      if (/Chrome/i.test(ua) && !/Android|Mobile/i.test(ua)) {   // 크롬 데스크톱이 긴 낭독을 끊는 문제 방지
        tts.timer = setInterval(function () {
          if (!speechSynthesis.speaking) { clearInterval(tts.timer); tts.timer = null; return; }
          try { speechSynthesis.pause(); speechSynthesis.resume(); } catch (e) { /* ignore */ }
        }, 10000);
      }
    });
  }
  function stopSpeak() {
    if (!hasTTS) return;
    tts.seq++;
    if (tts.timer) { clearInterval(tts.timer); tts.timer = null; }
    try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    tts.els.forEach(function (el) { highlight(el, false); });
    tts.els = []; tts.utts = [];
    note("");
    setSpeaking(false);
  }

  /* ---------- 책·장·절 고르기 ---------- */
  var pb = $("#bkBook"), pc = $("#bkChap"), pv1 = $("#bkV1"), pv2 = $("#bkV2");
  function fillBooks() {
    var cur = pb.value || "0";
    var group = function (from, to, label) {
      var o = '<optgroup label="' + label + '">';
      for (var i = from; i < to; i++) o += '<option value="' + i + '">' + esc(isEn() ? BOOKS[i].en + " · " + BOOKS[i].ko : BOOKS[i].ko + " (" + BOOKS[i].ab + ")") + "</option>";
      return o + "</optgroup>";
    };
    pb.innerHTML = group(0, 39, T("구약", "Old Testament")) + group(39, 66, T("신약", "New Testament"));
    pb.value = cur;
  }
  function fillNums(sel, n, cur, blank) {
    var o = blank ? '<option value="">' + blank + "</option>" : "";
    for (var i = 1; i <= n; i++) o += '<option value="' + i + '">' + i + "</option>";
    sel.innerHTML = o;
    sel.value = cur && cur <= n ? String(cur) : (blank ? "" : "1");
  }
  function fillChapters(keep) { fillNums(pc, BOOKS[+pb.value].v.length, keep ? +pc.value : 1); fillVerses(keep); }
  function fillVerses(keep) {
    var n = BOOKS[+pb.value].v[+pc.value - 1] || 1;
    fillNums(pv1, n, keep ? +pv1.value : 0, T("처음", "Start"));
    fillNums(pv2, n, keep ? +pv2.value : 0, T("끝", "End"));
  }
  function syncPicker(p) {
    if (!p || !p.found || !pb) return;
    pb.value = String(bookIndex[p.book]); fillChapters(false);
    pc.value = String(p.chapter); fillVerses(false);
    var n = BOOKS[bookIndex[p.book]].v[p.chapter - 1];
    if (!(p.from === 1 && p.to >= n)) { pv1.value = String(p.from); pv2.value = String(p.to); }
  }
  function pickerQuery() {
    var b = BOOKS[+pb.value], c = +pc.value, a = +pv1.value, z = +pv2.value;
    if (!a && !z) return b.ko + " " + c + "장";
    if (!a) a = 1;
    if (!z || z < a) z = a;
    return b.ko + " " + c + ":" + a + (z > a ? "-" + z : "");
  }

  /* ---------- 탭 ---------- */
  function setTab(name) {
    $$("[data-tab]", form).forEach(function (t) {
      var on = t.getAttribute("data-tab") === name;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    $$("[data-panel]", form).forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
    store.set("bk-tab", name);
  }
  $$("[data-tab]", form).forEach(function (t) {
    t.addEventListener("click", function () { setTab(t.getAttribute("data-tab")); });
    t.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var tabs = $$("[data-tab]", form), i = tabs.indexOf(t);
      var n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      setTab(n.getAttribute("data-tab")); n.focus();
    });
  });

  /* ---------- 이벤트 ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var tab = $('[data-tab][aria-selected="true"]', form);
    run(tab && tab.getAttribute("data-tab") === "pick" ? pickerQuery() : qInput.value, true);
  });
  pb.addEventListener("change", function () { fillChapters(false); });
  pc.addEventListener("change", function () { fillVerses(false); });
  pv1.addEventListener("change", function () { if (+pv2.value < +pv1.value) pv2.value = pv1.value; });

  $$('input[name="bkVer"], input[name="bkOrder"], input[name="bkFlow"]', form).forEach(function (r) {
    if (r.value === opts[{ bkVer: "ver", bkOrder: "order", bkFlow: "flow" }[r.name]]) r.checked = true;
    r.addEventListener("change", function () {
      var k = { bkVer: "ver", bkOrder: "order", bkFlow: "flow" }[r.name];
      opts[k] = r.value; store.set("bk-" + k, r.value);
      if (k === "ver") { if (state.q && state.data) run(state.q, false); }
      else { stopSpeak(); render(); }
    });
  });

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-q]");
    if (a && (out.contains(a) || form.contains(a))) {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      run(a.getAttribute("data-q"), true);
      if (out.contains(a)) form.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    var b = e.target.closest && e.target.closest("[data-act]");
    if (!b || !out.contains(b) || b.tagName === "SELECT") return;
    var act = b.getAttribute("data-act");
    if (act === "copy") copy(b);
    else if (act === "ko" || act === "en") speak(act);
    else if (act === "stop") stopSpeak();
  });
  out.addEventListener("change", function (e) {
    if (e.target.getAttribute("data-act") !== "rate") return;
    store.set("bkTtsRate", e.target.value);
    if (tts.speaking && tts.lang) speak(tts.lang);
  });
  qInput.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { qInput.value = ""; }
  });

  window.addEventListener("popstate", function () {
    var q = new URLSearchParams(location.search).get("q") || "";
    if (q) run(q, false); else { state.data = null; state.q = ""; out.innerHTML = ""; qInput.value = ""; showStatus("", ""); }
  });
  document.addEventListener("earlln:lang", function () {
    var bi = pb.value; fillBooks(); pb.value = bi; fillVerses(true);
    if (state.data) {
      if (state.q) run(state.q, false);   // 안내 문구도 그 언어로 다시 받기
    }
  });

  /* ---------- 시작 ---------- */
  fillBooks(); fillChapters(false);
  setTab(store.get("bk-tab", "quick") === "pick" ? "pick" : "quick");
  var q0 = new URLSearchParams(location.search).get("q");
  if (q0) run(q0, false);
})();
