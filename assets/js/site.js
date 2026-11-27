/* Earlln.com — progressive enhancements + JSON-driven content (no dependencies) */
(function () {
  "use strict";

  /* ------------------------------------------------------------------
   * Fallback configuration. Everything here can be overridden from
   * data/site.json (editable on a phone via admin.html).
   * ------------------------------------------------------------------ */
  var CONFIG = {
    dataUrl: "data/site.json",
    youtubeHandle: "earlln",
    youtubeChannelId: "",
    youtubeVideoId: ""
  };

  // Pages in sub-folders (ai/*.html) load this script as ../assets/js/site.js;
  // resolve the data file from the script's own address so it works anywhere.
  var self = document.currentScript && document.currentScript.src;
  if (self) CONFIG.dataUrl = new URL("../../data/site.json", self).href;

  var root = document.documentElement;
  var LANG_KEY = "earlln-lang";
  var ATTRS = ["title", "alt", "aria-label", "placeholder", "content"];
  var lang = "ko";
  var siteData = null;
  var bibleBase = "";
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

  /* ---------- Language (Korean by default, remembered per browser) ---------- */
  function readLang() {
    var q = (location.search.match(/[?&]lang=(ko|en)\b/) || [])[1];
    if (q) { try { localStorage.setItem(LANG_KEY, q); } catch (e) { /* ignore */ } return q; }
    try { var saved = localStorage.getItem(LANG_KEY); if (saved === "ko" || saved === "en") return saved; } catch (e) { /* ignore */ }
    return "ko";
  }

  // Links to the previous Bible search (WordPress, fallback on bible.html); hand it the chosen language.
  function applyBibleLinks() {
    if (!bibleBase) return;
    var href = bibleBase;
    if (lang === "en") href += (href.indexOf("?") === -1 ? "?" : "&") + "lang=en";
    $$("[data-bible-url]").forEach(function (a) { a.setAttribute("href", href); });
    var meta = $('meta[http-equiv="refresh"]');
    if (meta) {
      var m = /^(\s*\d+\s*;\s*url=)/i.exec(meta.getAttribute("content") || "");
      if (m) meta.setAttribute("content", m[1] + href);
    }
  }

  function applyLang(next) {
    lang = next === "en" ? "en" : "ko";
    root.setAttribute("lang", lang === "en" ? "en" : "ko");
    root.setAttribute("data-lang", lang);

    $$("[data-en]").forEach(function (el) {
      if (el.dataset.ko === undefined) el.dataset.ko = el.textContent;
      el.textContent = lang === "en" ? el.getAttribute("data-en") : el.dataset.ko;
    });
    $$("[data-en-html]").forEach(function (el) {
      if (el.dataset.koHtml === undefined) el.dataset.koHtml = el.innerHTML;
      el.innerHTML = lang === "en" ? el.getAttribute("data-en-html") : el.dataset.koHtml;
    });
    ATTRS.forEach(function (attr) {
      $$("[data-en-" + attr + "]").forEach(function (el) {
        var store = "ko" + attr.replace(/(^|-)([a-z])/g, function (m, d, c) { return c.toUpperCase(); });
        if (el.dataset[store] === undefined) el.dataset[store] = el.getAttribute(attr) || "";
        el.setAttribute(attr, lang === "en" ? el.getAttribute("data-en-" + attr) : el.dataset[store]);
      });
    });

    $$("[data-lang-toggle]").forEach(function (btn) {
      btn.textContent = lang === "en" ? "한국어" : "EN";
      btn.setAttribute("aria-label", lang === "en" ? "한국어로 보기" : "View in English");
      btn.setAttribute("title", lang === "en" ? "한국어로 보기" : "View in English");
    });

    if (siteData) applyData(siteData);
    applyBibleLinks();
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignore */ }
    // AI AGENT 실습·진단(lab.js, diagnose.js)이 언어 변경을 알 수 있게
    try { document.dispatchEvent(new CustomEvent("earlln:lang", { detail: lang })); } catch (e) { /* old browsers */ }
  }

  /* ---------- Theme toggle (remembers per browser) ---------- */
  try {
    var saved = localStorage.getItem("earlln-theme");
    if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);
  } catch (e) { /* storage unavailable */ }

  $$("[data-theme-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var current = root.getAttribute("data-theme");
      var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      var isDark = current ? current === "dark" : prefersDark;
      var next = isDark ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("earlln-theme", next); } catch (e) { /* ignore */ }
    });
  });

  $$("[data-lang-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () { applyLang(lang === "en" ? "ko" : "en"); });
  });

  /* ---------- Mobile navigation ---------- */
  var toggle = $("[data-nav-toggle]");
  var nav = $("[data-nav]");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  /* ---------- Image fallbacks (remote brand images → local SVG) ---------- */
  $$("img[data-fallback]").forEach(function (img) {
    var swap = function () {
      if (img.dataset.swapped) return;
      img.dataset.swapped = "1";
      img.src = img.getAttribute("data-fallback");
      var frame = img.closest(".frame, .qr");
      if (frame) frame.classList.add("is-fallback");
    };
    img.addEventListener("error", swap);
    if (img.complete && img.naturalWidth === 0) swap();
  });

  /* ---------- Copy buttons on code blocks (ai/*.html) ---------- */
  $$(".code pre").forEach(function (pre) {
    if (!navigator.clipboard) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code__copy";
    btn.textContent = "복사";
    btn.setAttribute("data-en", "Copy");
    btn.addEventListener("click", function () {
      navigator.clipboard.writeText(pre.textContent.trim()).then(function () {
        var before = btn.textContent;
        btn.textContent = lang === "en" ? "Copied" : "복사됨";
        setTimeout(function () { btn.textContent = before; }, 1500);
      });
    });
    pre.parentNode.appendChild(btn);
  });

  /* ---------- Footer year ---------- */
  $$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Helpers ---------- */
  // Falls back to the Korean text when a translation has not been filled in.
  function pick(obj, key) {
    if (!obj) return "";
    var en = obj[key + "_en"];
    return lang === "en" && en != null && String(en).trim() !== "" ? en : (obj[key] || "");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function isExternal(url) { return /^https?:\/\//i.test(url || ""); }
  function linkAttrs(url) { return isExternal(url) ? ' target="_blank" rel="noopener"' : ""; }
  // Plain text → paragraphs; URLs become links.
  function richText(text) {
    var paras = String(text || "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
    return paras.map(function (p) {
      var html = esc(p).replace(/(https?:\/\/[^\s<]+)/g, function (u) {
        return '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>";
      }).replace(/\n/g, "<br>");
      return "<p>" + html + "</p>";
    }).join("");
  }
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function fmtDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    if (!m) return esc(iso);
    if (lang === "en") return MONTHS[Number(m[2]) - 1] + " " + Number(m[3]) + ", " + m[1];
    return m[1] + "년 " + String(Number(m[2])) + "월 " + String(Number(m[3])) + "일";
  }
  function txt(ko, en) { return lang === "en" ? en : ko; }
  var DOWN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M6 10l6 6 6-6M4 20h16"/></svg>';
  var EXT_ICON = '<svg class="ext" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

  /* ---------- Renderers ---------- */
  var PROD_ICONS = {
    excel: "excel", ppt: "ppt", wbs: "wbs", bible: "bible", yt: "yt", mail: "mail"
  };

  // The product pages and the cards on the home page are built from data/site.json,
  // so a new product needs no change to the markup.
  function renderProducts(products) {
    if (!products) return;
    var list = Array.isArray(products) ? products : Object.keys(products).map(function (k) {
      var p = products[k]; p.id = p.id || k; return p;                     // older single-download shape
    });

    var groups = groupProducts(list);
    $$("[data-product-list]").forEach(function (host) {
      host.innerHTML = groups.map(function (g) {
        return '<section class="product-group" id="group-' + g.id + '" aria-labelledby="group-' + g.id + '-title">' +
          '<h2 class="product-group__title" id="group-' + g.id + '-title">' + esc(pick(g, "name")) + "</h2>" +
          g.items.map(function (p) { return productArticle(p); }).join("") +
        "</section>";
      }).join("");
    });
    $$("[data-product-cards]").forEach(function (host) {
      host.innerHTML = groups.map(function (g) {
        return '<div class="product-group product-group--cards">' +
          '<h3 class="product-group__title">' + esc(pick(g, "name")) + "</h3>" +
          '<div class="grid grid--3">' + g.items.map(function (p) { return productCard(p); }).join("") + "</div>" +
        "</div>";
      }).join("");
    });
  }

  // 제품 분류 — site.json 의 products[].category 값. 비어 있거나 모르는 값이면 "기타"로 묶는다.
  var PRODUCT_CATEGORIES = [
    { id: "office", name: "일반사무", name_en: "Office work" },
    { id: "project", name: "프로젝트", name_en: "Project" },
    { id: "etc", name: "기타", name_en: "Others" }
  ];
  function groupProducts(list) {
    var known = {};
    PRODUCT_CATEGORIES.forEach(function (c) { known[c.id] = true; });
    return PRODUCT_CATEGORIES.map(function (c) {
      return {
        id: c.id, name: c.name, name_en: c.name_en,
        items: list.filter(function (p) { return (known[p.category] ? p.category : "etc") === c.id; })
      };
    }).filter(function (g) { return g.items.length; });
  }

  function downloads(p) {
    var d = p.downloads && p.downloads.length ? p.downloads
          : [{ label: "최신버전", label_en: "Latest", version: p.version, date: p.date, file: p.file, url: p.url }];
    return d.filter(function (x) { return x && x.url; });
  }

  function dlLabel(d) { return pick(d, "label") || txt("다운로드", "Download"); }

  function productArticle(p) {
    var dl = downloads(p), main = dl[0] || {};
    var feats = (p.features || []).map(function (f) {
      return "<li>" + esc(lang === "en" && f.en ? f.en : (f.ko || "")) + "</li>";
    }).join("");
    var rest = dl.slice(1).map(function (d) {
      return '<a class="download-more" href="' + esc(d.url) + '">' +
        '<span class="download-more__name">' + esc(dlLabel(d)) + (d.version ? ' <span class="version-pill">' + esc(d.version) + "</span>" : "") + "</span>" +
        '<span class="download-more__file">' + esc(d.file || "") + (d.date ? " · " + esc(d.date) : "") + "</span>" +
        "<span class=\"download-more__go\">" + txt("받기", "Get") + " " + DOWN_ICON + "</span></a>";
    }).join("");

    return '<article class="product" id="' + esc(p.id) + '">' +
      '<aside class="product__aside">' +
        '<span class="badge">' + esc(p.badge || "") + "</span>" +
        "<h3>" + esc(p.name || "") + "</h3>" +
        '<div class="tagline">' + esc(pick(p, "tagline")) + "</div>" +
        (main.url || p.video ? '<div class="product__cta">' +
          (main.url ? '<a class="btn btn--navy" href="' + esc(main.url) + '">' + txt("최신버전 다운로드", "Download the latest") + " " + DOWN_ICON + "</a>" : "") +
          videoButton(p, "") +
        "</div>" : "") +
      "</aside>" +
      '<div class="product__body">' +
        '<p class="lead">' + esc(pick(p, "lead")) + "</p>" +
        (feats ? '<ul class="feature-list">' + feats + "</ul>" : "") +
        (main.url ?
          '<div class="download">' +
            '<div class="download__meta"><b>' + esc(p.name || "") +
              (main.version ? ' <span class="version-pill">' + esc(main.version) + "</span>" : "") + "</b>" +
              "<span>" + esc(main.file || "") + (main.date ? " · " + esc(main.date) : "") + "</span></div>" +
            '<div class="download__actions">' +
              videoButton(p, " btn--sm") +
              '<a class="btn btn--primary btn--sm" href="' + esc(main.url) + '">' + txt("최신버전 다운로드", "Download the latest") + " " + DOWN_ICON + "</a>" +
            "</div>" +
          "</div>" : "") +
        (rest ? '<div class="download-list">' + rest + "</div>" : "") +
        (p.id === "earllne" ? installHowto() : "") +
      "</div></article>";
  }

  // 제품 소개 영상(유튜브 등) — 다운로드 전에 볼 수 있도록 다운로드 버튼 옆에 둔다
  var PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  function videoButton(p, size) {
    if (!p.video) return "";
    return '<a class="btn btn--ghost' + size + '" href="' + esc(p.video) + '" target="_blank" rel="noopener">' +
      PLAY_ICON + " " + txt("소개 영상 보기", "Watch the video") + "</a>";
  }

  function productCard(p) {
    var icon = PROD_ICONS[p.icon] || "wbs";
    return '<a class="card" href="product.html#' + esc(p.id) + '">' +
      '<div class="card__icon ' + icon + '">' + esc(p.letter || (p.name || "?").charAt(0)) + "</div>" +
      '<span class="sub">' + esc(p.badge || "") + "</span>" +
      "<h3>" + esc(p.name || "") + "</h3>" +
      "<p>" + esc(pick(p, "summary") || pick(p, "lead")) + "</p>" +
      '<span class="card__more">' + txt("자세히 보기", "Learn more") + " →</span></a>";
  }

  function renderNews(news) {
    $$("[data-news-list]").forEach(function (list) {
      var limit = parseInt(list.getAttribute("data-limit") || "0", 10);
      var items = (news || []).slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
      if (limit > 0) items = items.slice(0, limit);
      var empty = $("[data-news-empty]", list.parentNode);
      if (!items.length) { list.innerHTML = ""; if (empty) empty.hidden = false; return; }
      if (empty) empty.hidden = true;
      var compact = list.hasAttribute("data-compact");
      var current = decodeURIComponent((location.hash || "").slice(1));
      list.innerHTML = items.map(function (n) {
        var id = esc(n.id || n.date);
        var tagText = pick(n, "tag");
        var tag = tagText ? '<span class="news__tag news__tag--' + esc(String(n.tag || "").toLowerCase()) + '">' + esc(tagText) + "</span>" : "";
        var more = n.url ? '<a class="news__more" href="' + esc(n.url) + '"' + linkAttrs(n.url) + ">" + txt("자세히 보기 ", "Read more ") + (isExternal(n.url) ? EXT_ICON : "→") + "</a>" : "";
        if (compact) {
          var href = "news.html#" + encodeURIComponent(n.id || n.date);
          return '<a class="news-row" href="' + href + '">' +
            '<span class="news-row__meta">' + tag + '<time datetime="' + esc(n.date) + '">' + fmtDate(n.date) + "</time></span>" +
            '<span class="news-row__title">' + esc(pick(n, "title")) + "</span></a>";
        }
        var open = current && current === (n.id || n.date) ? " open" : "";
        return '<details class="news" id="' + id + '"' + open + ">" +
          '<summary><span class="news__meta">' + tag + '<time datetime="' + esc(n.date) + '">' + fmtDate(n.date) + "</time></span>" +
          '<span class="news__title">' + esc(pick(n, "title")) + "</span></summary>" +
          '<div class="news__body">' + richText(pick(n, "body")) + more + "</div></details>";
      }).join("");
      if (current) { var el = document.getElementById(current); if (el) el.scrollIntoView({ block: "start" }); }
    });
  }

  function renderFaq(faq) {
    $$("[data-faq-list]").forEach(function (list) {
      var items = faq || [];
      if (!items.length) { list.closest("section") && (list.closest("section").hidden = true); return; }
      list.innerHTML = items.map(function (f) {
        return '<details class="faq"><summary>' + esc(pick(f, "q")) + "</summary><div class=\"faq__body\">" + richText(pick(f, "a")) + "</div></details>";
      }).join("");
    });
  }

  function renderBanner(banner) {
    var el = $("[data-banner]");
    if (!el) return;
    var bannerText = pick(banner, "text");
    if (!banner || !banner.enabled || !bannerText) { el.hidden = true; return; }
    var inner = esc(bannerText);
    if (banner.url) inner = '<a href="' + esc(banner.url) + '"' + linkAttrs(banner.url) + ">" + inner + " →</a>";
    el.innerHTML = '<div class="container">' + inner + "</div>";
    el.hidden = false;
  }

  function renderSettings(s) {
    if (!s) return;
    if (s.email) $$("[data-email]").forEach(function (a) { a.textContent = s.email; if (a.tagName === "A") a.href = "mailto:" + s.email; });
    if (s.bibleUrl) bibleBase = s.bibleUrl;
    if (s.licenseFormUrl) $$("[data-license-form]").forEach(function (a) { a.href = s.licenseFormUrl; });
    if (s.youtubeUrl) $$("[data-youtube-url]").forEach(function (a) { a.href = s.youtubeUrl; });
    if (s.youtubeChannelId) CONFIG.youtubeChannelId = s.youtubeChannelId;
    if (s.youtubeHandle) CONFIG.youtubeHandle = s.youtubeHandle;
    if (s.youtubeVideoId) CONFIG.youtubeVideoId = s.youtubeVideoId;
  }

  function installHowto() {
    return '<details class="howto"><summary>' + txt("설치 방법 (EarllnE.xlam 적용)", "How to install (EarllnE.xlam)") + "</summary>" +
      '<div class="howto__body"><ol>' +
      (lang === "en"
        ? "<li>Open Excel.</li><li>Click [File] – [Options].</li><li>Choose the [Add-ins] tab.</li>" +
          "<li>At the bottom, set [Manage] to 'Excel Add-ins' and click [Go...].</li>" +
          "<li>Click [Browse...] and pick the <code>EarllnE.xlam</code> file you downloaded.</li>" +
          "<li>Click [OK] and an 'EarllnE' tab appears in the Excel ribbon.</li></ol>" +
          '<p style="margin:12px 0 0">Your registration key is under [EarllnE] › [About EarllnE] › [Check license] in Excel; request the license itself on the <a href="license.html">LICENSE</a> page.</p>'
        : "<li>엑셀을 실행합니다.</li><li>[파일] – [옵션]을 클릭합니다.</li><li>[추가 기능] 탭을 선택합니다.</li>" +
          "<li>하단 [관리(A):] 항목에서 'Excel 추가 기능'을 선택하고 [이동(G)...] 버튼을 클릭합니다.</li>" +
          "<li>[찾아보기(B)...] 버튼을 클릭하여 다운로드한 <code>EarllnE.xlam</code> 파일을 선택합니다.</li>" +
          "<li>[확인]을 누르면 엑셀 상단 리본 메뉴에 'EarllnE' 탭이 추가됩니다.</li></ol>" +
          '<p style="margin:12px 0 0">정품등록키는 엑셀 메뉴 [EarllnE] › [EarllnE란] › [라이선스확인]에서 확인할 수 있으며, 라이선스는 <a href="license.html">LICENSE</a> 페이지에서 발급받습니다.</p>') +
      "</div></details>";
  }

  function renderYoutube() {
    var video = $("[data-youtube]");
    if (!video) return;
    var channelId = (CONFIG.youtubeChannelId || "").trim();
    var videoId = (CONFIG.youtubeVideoId || "").trim();
    var src = "";
    if (/^UC[\w-]{22}$/.test(channelId)) {
      // Uploads playlist ID = channel ID with the leading "UC" replaced by "UU".
      src = "https://www.youtube-nocookie.com/embed/videoseries?list=UU" + channelId.slice(2);
    } else if (/^[\w-]{11}$/.test(videoId)) {
      src = "https://www.youtube-nocookie.com/embed/" + videoId;
    }
    var iframe = video.querySelector("iframe");
    if (src && iframe && iframe.src === src) {
      // Already embedded: only the label language can have changed.
      iframe.title = txt("유튜브 얼른 채널 최신 영상", "Latest videos from the Earlln channel");
      return;
    }
    video.innerHTML = "";
    if (!src) {
      // No channel ID and no video ID: YouTube no longer serves handle-based
      // embeds, so link to the channel instead of showing a dead player.
      video.classList.add("video--link");
      var url = CONFIG.youtubeUrl || "https://www.youtube.com/@" + CONFIG.youtubeHandle;
      var a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "video__link";
      a.innerHTML =
        '<span class="video__play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor">' +
        '<path d="M23 12s0-3.4-.4-5a2.7 2.7 0 0 0-1.9-1.9C19 4.7 12 4.7 12 4.7s-7 0-8.7.4A2.7 2.7 0 0 0 1.4 7C1 8.6 1 12 1 12s0 3.4.4 5a2.7 2.7 0 0 0 1.9 1.9c1.7.4 8.7.4 8.7.4s7 0 8.7-.4a2.7 2.7 0 0 0 1.9-1.9c.4-1.6.4-5 .4-5zM9.8 15.2V8.8L15.6 12l-5.8 3.2z"/>' +
        "</svg></span><span class=\"video__label\">" +
        txt("유튜브에서 최신 영상 보기", "Watch the latest videos on YouTube") +
        '</span><span class="video__sub">@' + CONFIG.youtubeHandle + "</span>";
      video.appendChild(a);
      return;
    }
    video.classList.remove("video--link");
    iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = txt("유튜브 얼른 채널 최신 영상", "Latest videos from the Earlln channel");
    iframe.loading = "lazy";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.setAttribute("allowfullscreen", "");
    video.appendChild(iframe);
  }

  /* ---------- Load data/site.json (static HTML stays as the fallback) ---------- */
  function applyData(data) {
    siteData = data;
    renderSettings(data.settings);
    applyBibleLinks();
    renderProducts(data.products);
    renderNews(data.news);
    renderFaq(data.faq);
    renderBanner(data.settings && data.settings.banner);
    renderYoutube();
  }
  var needsData = $("[data-news-list], [data-faq-list], [data-product-download], [data-banner], [data-youtube]");
  if (needsData && window.fetch) {
    fetch(CONFIG.dataUrl, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(applyData)
      .catch(function () { renderNews([]); renderFaq([]); })
      .then(renderYoutube);
  } else {
    renderYoutube();
  }

  bibleBase = (function () { var a = $("[data-bible-url]"); return a ? a.getAttribute("href") : ""; })();
  applyLang(readLang());
})();
