/* 전체 과정 안내 (실습·강의 페이지)
 *
 * 목록 자체는 scripts/build-ai.py 가 HTML 로 만들어 둡니다.
 * 이 파일은 브라우저에 저장된 진행 상황으로 완료·진행 중 표시를 채우고,
 * PC 화면에서는 목록을 펼쳐 둡니다.
 *
 * 저장 위치 (localStorage "earlln-progress")
 *   { labs: { <실습 id>: { stage, total, done } }, read: { <강의 slug>: 1 } }
 *   실습 진행은 lab.js 가, 강의 읽음은 이 파일이 기록합니다.
 */
(function () {
  "use strict";
  var nav = document.querySelector("[data-course-nav]");
  if (!nav) return;
  var KEY = "earlln-progress";
  var box = nav.querySelector(".cn__box");

  function lang() { return document.documentElement.getAttribute("data-lang") === "en" ? "en" : "ko"; }
  function T(ko, en) { return lang() === "en" ? en : ko; }
  function load() {
    var p;
    try { p = JSON.parse(localStorage.getItem(KEY)); } catch (e) { p = null; }
    p = p || {};
    p.labs = p.labs || {};
    p.read = p.read || {};
    return p;
  }
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* 저장 못 해도 화면은 됨 */ } }
  function started(id) {
    // 이 기능이 생기기 전에 시작한 실습도 '진행 중'으로 보이게
    try { return !!localStorage.getItem("earlln-lab-data/lab/" + id + ".json"); } catch (e) { return false; }
  }

  function paint() {
    var p = load(), total = 0, done = 0;
    nav.querySelectorAll("[data-cn-item]").forEach(function (li) {
      var labA = li.querySelector("[data-cn-lab]"), readA = li.querySelector("[data-cn-read]");
      var labId = labA && labA.getAttribute("data-cn-lab");
      var slug = readA && readA.getAttribute("data-cn-read");
      var lp = labId ? p.labs[labId] : null;
      var labDone = !!(lp && lp.done), labDoing = !!lp || (labId && started(labId));
      var read = !!(slug && p.read[slug]);
      if (labA) labA.classList.toggle("is-done", labDone);
      if (readA) readA.classList.toggle("is-done", read);
      var isDone = labId ? labDone : read;
      var isDoing = !isDone && (labDoing || read);
      var mark = li.querySelector(".cn__mark");
      mark.classList.toggle("is-done", isDone);
      mark.classList.toggle("is-doing", isDoing);
      var tip = isDone ? T("완료", "Done") : isDoing ? (lp && lp.total ? T("진행 중 · ", "In progress · ") + lp.stage + "/" + lp.total : T("진행 중", "In progress")) : T("아직", "Not started");
      mark.setAttribute("title", tip);
      total++;
      if (isDone) done++;
    });
    var pct = total ? Math.round(done * 100 / total) : 0;
    var bar = nav.querySelector("[data-cn-bar]");
    if (bar) bar.style.width = pct + "%";
    var text = nav.querySelector("[data-cn-text]");
    if (text) text.textContent = T(done + " / " + total + " 완료", done + " / " + total + " done");
    var count = nav.querySelector("[data-cn-count]");
    if (count) count.textContent = done + "/" + total;
  }

  // PC(넓은 화면)에서는 항상 펼쳐 두고, 휴대폰에서는 접어 둠
  var wide = window.matchMedia("(min-width: 1100px)");
  function fit() {
    if (wide.matches) box.open = true;
    else box.open = false;
    if (wide.matches) scrollToCurrent();
  }
  function scrollToCurrent() {
    var cur = nav.querySelector(".cn__item.is-current"), body = nav.querySelector(".cn__body");
    if (!cur || !body) return;
    var c = cur.getBoundingClientRect(), b = body.getBoundingClientRect();
    // 지금 위치가 목록 아래로 가려져 있을 때만 내림
    if (c.bottom > b.bottom) body.scrollTop += c.top - b.top - 120;
  }
  box.addEventListener("toggle", function () { if (box.open) scrollToCurrent(); });
  if (wide.addEventListener) wide.addEventListener("change", fit); else if (wide.addListener) wide.addListener(fit);
  fit();

  // 강의를 끝까지 내려 읽으면 '읽음'
  var end = document.querySelector(".article-nav");
  var cur = nav.querySelector(".cn__link[aria-current][data-cn-read]");
  if (end && cur && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (x) { return x.isIntersecting; })) {
        var p = load();
        p.read[cur.getAttribute("data-cn-read")] = 1;
        save(p);
        paint();
        io.disconnect();
      }
    });
    io.observe(end);
  }

  paint();
  document.addEventListener("earlln:progress", paint);
  document.addEventListener("earlln:lang", paint);
  window.addEventListener("storage", function (e) { if (e.key === KEY) paint(); });
})();
