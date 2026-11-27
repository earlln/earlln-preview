/* Earlln 방문 통계 (Google 애널리틱스 4)
 *
 * - GA_ID 가 비어 있으면 아무것도 하지 않아요. (측정 ID: GA 관리 → 데이터 스트림 → 'G-'로 시작)
 * - 실제 사이트(earlln.com)에서만 켜져요. 미리보기(github.io)·내 컴퓨터(localhost)는 세지 않아요.
 * - 이름·입력한 글 같은 개인정보는 보내지 않아요. 보내는 건 페이지 주소와 아래 이벤트뿐이에요.
 * - 유럽(EEA·영국·스위스) 방문자는 동의 전까지 쿠키를 쓰지 않는 방식(consent mode 기본 거부)으로 둬요.
 *
 * 다른 스크립트는 window.earllnTrack(이름, {값}) 으로 이벤트를 남겨요. (GA 가 꺼져 있으면 아무 일도 안 함)
 *   lab_open      실습 페이지를 열었을 때          lab_id, step_id
 *   lab_step      실습에서 다른 단계로 넘어갔을 때   lab_id, step_id, step_kind
 *   lab_stuck     '아니요, 안 돼요'를 눌렀을 때      lab_id, step_id
 *   lab_complete  정리 화면까지 왔을 때             lab_id
 *   lab_restart   '처음부터 다시 하기'             lab_id
 *   lab_ask       'Claude에게 물어보기'            lab_id, step_id
 *   diag_complete 1분 진단을 마쳤을 때             stage
 *   sample_download 예시 파일·사진 내려받기         file
 *   lang_switch   EN/한국어 버튼                   lang
 */
(function () {
  "use strict";
  var GA_ID = "G-H35PJSSVBS";

  window.earllnTrack = function () {};
  if (!GA_ID) return;
  if (!/(^|\.)earlln\.com$/.test(location.hostname)) return;
  if (/admin\.html$/.test(location.pathname)) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("consent", "default", {
    ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied",
    region: ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT",
      "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "CH"]
  });
  gtag("js", new Date());
  gtag("config", GA_ID);

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_ID);
  document.head.appendChild(s);

  window.earllnTrack = function (name, params) {
    try { gtag("event", name, params || {}); } catch (e) { /* 통계 실패는 무시 */ }
  };

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var a = t.closest("a[download]");
    if (a) window.earllnTrack("sample_download", { file: a.getAttribute("download") || a.getAttribute("href") });
    var lang = t.closest("[data-lang-toggle]");
    // 누른 뒤 바뀔 언어 (버튼 글자가 'EN' 이면 영어로 바뀜)
    if (lang) window.earllnTrack("lang_switch", { lang: /EN/.test(lang.textContent) ? "en" : "ko" });
  }, true);
})();
