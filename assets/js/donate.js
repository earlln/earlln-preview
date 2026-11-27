/* Earlln.com — 운영비 후원 섹션 (계좌번호 보기·복사, 카카오페이 QR)
 * 워드프레스 플러그인 earlln-donate-v2 와 같은 동작을 정적 사이트용으로 옮긴 것.
 * 한/영 문구는 site.js 의 data-en 처리에 맡기고, 여기서는 동작만 담당한다. */
(function () {
  "use strict";

  function isEnglish() {
    return (document.documentElement.getAttribute("lang") || "").toLowerCase().indexOf("en") === 0;
  }

  function isMobile() {
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true;
    return !!(window.matchMedia && window.matchMedia("(pointer:coarse)").matches);
  }

  // 계좌번호는 크롤러에 그대로 노출되지 않도록 뒤집어서 base64 로 넣어 둔다.
  function decodeAcct(s) {
    try { return atob(s).split("").reverse().join(""); } catch (e) { return ""; }
  }

  function copyText(txt, done) {
    function fallback() {
      var t = document.createElement("textarea");
      t.value = txt; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); done(); } catch (e) { /* ignore */ }
      document.body.removeChild(t);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(txt).then(done, fallback);
    } else {
      fallback();
    }
  }

  function init(root) {
    // 카카오페이: 모바일은 앱으로 여는 버튼, PC는 휴대폰으로 찍을 QR
    var qrBox = root.querySelector("[data-donate-qr]");
    if (isMobile()) {
      root.classList.remove("donate--noqr");
      root.classList.add("donate--mobile");
    } else if (qrBox && typeof window.qrcode === "function") {
      try {
        var qr = window.qrcode(0, "M");
        qr.addData(qrBox.getAttribute("data-donate-qr"));
        qr.make();
        qrBox.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        root.classList.remove("donate--noqr");
      } catch (e) { /* 실패하면 donate--noqr 유지 → 버튼 표시 */ }
    }

    // 계좌번호 보기 / 복사
    var reveal = root.querySelector("[data-donate-reveal]");
    var bank = root.querySelector("[data-donate-acct]");
    if (!reveal || !bank) return;
    var acct = decodeAcct(bank.getAttribute("data-donate-acct"));
    reveal.addEventListener("click", function () {
      bank.querySelector("[data-donate-acct-out]").textContent = acct;
      bank.hidden = false;
      reveal.hidden = true;
    });
    var btn = bank.querySelector("[data-donate-copy]");
    if (!btn) return;
    var busy = false;
    btn.addEventListener("click", function () {
      if (busy) return;
      var nameEl = bank.querySelector("[data-donate-bank]");
      var txt = (nameEl ? nameEl.textContent.trim() + " " : "") + acct;
      copyText(txt, function () {
        busy = true;
        var orig = btn.textContent;
        btn.textContent = isEnglish() ? "Copied!" : "복사되었습니다";
        setTimeout(function () { btn.textContent = orig; busy = false; }, 1500);
      });
    });
  }

  function run() {
    var roots = document.querySelectorAll("[data-donate]");
    for (var i = 0; i < roots.length; i++) init(roots[i]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
