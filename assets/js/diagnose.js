/* Earlln AI AGENT — 1분 진단: 지금 수준과 하고 싶은 것을 묻고, 맞는 실습·강의 순서를 추천
 *
 * <div data-diagnose data-base="../"></div> 에 그립니다. (lab/practice.html 맨 위)
 * 답은 이 브라우저(localStorage "earlln-profile")에만 저장되고 서버로 보내지 않습니다.
 * 실습(lab.js)은 여기서 고른 기기(Windows/Mac)를 이어받습니다.
 *
 * 핵심은 "채팅만 쓰는 사람"과 "에이전트까지 쓰는 사람"을 가르는 것:
 *   채팅 = 내가 묻고, 답을 읽고, 필요하면 내가 복사해서 옮김
 *   에이전트 = AI가 내 컴퓨터의 파일을 직접 만들고 고침 (Claude Code 등)
 */
(function () {
  "use strict";
  var host = document.querySelector("[data-diagnose]");
  if (!host) return;
  var base = host.getAttribute("data-base") || "";
  var KEY = "earlln-profile";

  // 언어: site.js 가 html[data-lang] 을 정함. 문구는 [한국어, 영어] 쌍으로 두고 tx() 로 고름
  function lang() {
    var l = document.documentElement.getAttribute("data-lang");
    if (l === "en" || l === "ko") return l;
    var q = (location.search.match(/[?&]lang=(ko|en)\b/) || [])[1];
    if (q) return q;
    try { return localStorage.getItem("earlln-lang") === "en" ? "en" : "ko"; } catch (e) { return "ko"; }
  }
  function T(ko, en) { return lang() === "en" ? en : ko; }
  function tx(v) { return Array.isArray(v) ? T(v[0], v[1]) : (v || ""); }

  // 추천에 쓰는 실습·강의
  var ITEMS = {
    lab0: { kind: ["실습 0", "Practice 0"], title: ["AI와 첫 대화 (무료)", "Your first chat with AI (free)"], href: "lab/ai-first-chat.html", note: ["휴대폰으로도 할 수 있어요 · 10~15분", "Works on a phone too · 10–15 min"] },
    // 데스크톱 과정 (기본)
    dlab1: { kind: ["데스크톱 1", "Desktop 1"], title: ["Claude 데스크톱 앱으로 첫 작업 시키기", "Your first task with the Claude desktop app"], href: "lab/desktop-install.html", note: ["AI 에이전트 첫 경험 · 버튼만 눌러요 · 20~30분", "Your first AI agent · just buttons · 20–30 min"] },
    dlab2: { kind: ["데스크톱 2", "Desktop 2"], title: ["바뀐 내용 보고 고치게 하기", "Check the changes and have it edit"], href: "lab/desktop-edit.html", note: ["허락 카드 읽기 · 10~15분", "Read the permission card · 10–15 min"] },
    dguide1: { kind: ["데스크톱 강의 1편", "Desktop guide 1"], title: ["Claude 데스크톱 앱으로 첫 작업 시키기", "Your first task with the Claude desktop app"], href: "ai/desktop-install.html", note: ["글로 먼저 훑어보기 · 5분", "Skim it as a guide first · 5 min"] },
    // 실무 활용 (2단계)
    wlab1: { kind: ["실무 1", "Work 1"], title: ["엑셀(CSV) 합계·정렬·정리 맡기기", "Hand off spreadsheet (CSV) totals and cleanup"], href: "lab/work-csv.html", note: ["실무 첫걸음 · 예시 파일로 · 20분", "First real-work practice · with a sample file · 20 min"] },
    // 휴대폰으로 쓰기
    mlab2: { kind: ["휴대폰 2", "Phone 2"], title: ["클라우드 준비: GitHub 저장소 만들고 연결하기", "Cloud setup: make a GitHub repository and connect it"], href: "lab/mobile-github.html", note: ["컴퓨터 없이 휴대폰으로 · 유료 요금제 · 20분 (이어서 휴대폰 3)", "Phone only, no computer · paid plan · 20 min (then Phone 3)"] },
    mlab1: { kind: ["휴대폰 1", "Phone 1"], title: ["휴대폰으로 내 컴퓨터의 Claude에게 일 시키기", "Give your computer's Claude a job from your phone"], href: "lab/mobile-remote.html", note: ["데스크톱 1 다음에 · 밖에서도 일 맡기기 · 10~15분", "After Desktop 1 · hand off jobs on the go · 10–15 min"] },
    // 터미널 과정 (CLI · 심화)
    guide4: { kind: ["터미널 강의 4편", "Terminal guide 4"], title: ["여러 파일 한꺼번에 정리하기", "Organize several files at once"], href: "ai/claude-code-organize-files.html", note: ["옮기기·이름 바꾸기, 명령 허락 화면 · 5분", "Move, rename, and the command permission screen · 5 min"] }
  };
  // 하고 싶은 일 → 앞으로 배울 수 있는 것 (시리즈 계획)
  var FUTURE = {
    docs: { t: ["문서 요약·보고서 초안 맡기기 (실무 2·3)", "Hand off summaries and report drafts (Work 2–3)"], href: "lab/work-summary.html" },
    excel: { t: ["엑셀(CSV) 합계·정렬·정리 맡기기 (실무 1)", "Hand off spreadsheet (CSV) totals, sorting and cleanup (Work 1)"], href: "lab/work-csv.html" },
    files: { t: ["여러 파일 이름 바꾸고 폴더 정리하기", "Rename many files and tidy folders"], href: "ai/claude-code-organize-files.html" },
    search: { t: ["웹 자료 찾아서 정리하기 (실무 7)", "Find information on the web and organize it (Work 7)"], href: "lab/work-web.html" },
    build: { t: ["나만의 앱 만들기 (앱 1~4, 휴대폰만으로도·안드로이드 앱까지)", "Build your own app (App 1–4, even with just a phone, up to an Android app)"], href: "lab/app-web.html" }
  };

  var Q = [
    { id: "know", type: "one", title: ["AI(ChatGPT, Claude 같은 것)를 써 본 적이 있나요?", "Have you ever used AI (like ChatGPT or Claude)?"],
      opts: [["none", ["한 번도 안 써 봤어요", "Never"]], ["few", ["몇 번 써 봤어요", "A few times"]], ["often", ["자주 써요", "Often"], ["일주일에 몇 번 이상", "Several times a week or more"]]] },
    { id: "tools", type: "many", skip: function (a) { return a.know === "none"; },
      title: ["써 본 AI를 모두 골라 주세요", "Pick every AI you've used"], help: ["여러 개 골라도 돼요.", "You can pick more than one."],
      opts: [["chatgpt", "ChatGPT"], ["claude", "Claude"], ["gemini", ["Gemini (구글)", "Gemini (Google)"]], ["korean", ["국내 AI", "Korean AI services"], ["네이버 클로바X, 뤼튼 등", "Naver CLOVA X, Wrtn, etc."]], ["copilot", ["Copilot (마이크로소프트)", "Copilot (Microsoft)"]], ["devtool", ["Claude Code, Cursor, Codex 같은 도구", "Tools like Claude Code, Cursor or Codex"], ["컴퓨터에 설치해서 쓰는 AI 도구", "AI tools you install on a computer"]]],
      input: ["다른 AI를 쓰고 있다면 적어 주세요 (선택)", "Using another AI? Type it here (optional)"] },
    { id: "use", type: "many", skip: function (a) { return a.know === "none"; },
      title: ["AI를 주로 어떤 일에 쓰세요?", "What do you mostly use AI for?"], help: ["해 본 것을 모두 골라 주세요.", "Pick everything you've tried."],
      opts: [["ask", ["궁금한 것 물어보기", "Asking questions"], ["검색 대신 묻기", "Instead of searching"]], ["write", ["글 쓰기·다듬기", "Writing and polishing text"], ["이메일, 보고서, 문자", "Emails, reports, messages"]], ["summary", ["긴 글 요약·번역", "Summarizing or translating long text"]],
             ["excel", ["엑셀·표·데이터 정리", "Spreadsheets, tables and data"]], ["image", ["그림·사진 만들기", "Making pictures or images"]], ["code", ["프로그램·코드 만들기", "Making programs or code"]], ["files", ["컴퓨터 파일 정리·반복 작업", "Organizing files and repetitive tasks"]]] },
    // 필요할 때만 묻는 추가 질문: 결과물을 내가 옮기는지(채팅 방식), AI가 파일을 바로 다루는지(에이전트 방식)
    { id: "output", type: "one", skip: function (a) {
        if (a.know === "none") return true;
        var use = a.use || [], tools = a.tools || [];
        return !(tools.indexOf("devtool") >= 0 || ["excel", "code", "files"].some(function (u) { return use.indexOf(u) >= 0; }));
      },
      title: ["그런 일을 할 때, AI가 만든 결과는 어떻게 쓰세요?", "When you do that, how do you use what the AI makes?"], help: ["가장 자주 하는 방법 하나만 골라 주세요.", "Pick the one you do most often."],
      opts: [["self", ["AI 답을 보고 내가 직접 작업해요", "I read the answer and do the work myself"]], ["copy", ["AI 답을 복사해서 내 파일에 붙여 넣어요", "I copy the answer and paste it into my file"], ["문서·엑셀·코드 파일 등", "Documents, spreadsheets, code files, etc."]],
             ["direct", ["AI가 내 컴퓨터의 파일을 바로 만들거나 고쳐 줘요", "The AI creates or edits files on my computer directly"], ["내가 옮기지 않아도 돼요", "I don't have to copy anything"]], ["unsure", ["잘 모르겠어요", "I'm not sure"]]] },
    { id: "goal", type: "many", title: ["AI로 가장 해 보고 싶은 일은 뭔가요?", "What would you most like to do with AI?"], help: ["여러 개 골라도 돼요.", "You can pick more than one."],
      opts: [["docs", ["보고서·문서 작업 줄이기", "Spend less time on reports and documents"]], ["excel", ["엑셀·데이터 처리", "Handle spreadsheets and data"]], ["files", ["파일·폴더 정리", "Tidy files and folders"]], ["search", ["자료 찾고 요약하기", "Find and summarize information"]], ["build", ["나만의 프로그램·앱·홈페이지 만들기", "Build my own program, app or website"]], ["explore", ["아직 잘 모르겠어요", "Not sure yet"], ["일단 구경해 보고 싶어요", "I just want to look around"]]],
      input: ["구체적으로 하고 싶은 일이 있다면 적어 주세요 (선택). 예) 매주 하는 판매 보고서 정리", "Have a specific task in mind? Type it here (optional). e.g. my weekly sales report"] },
    { id: "target", type: "one", title: ["어느 정도까지 하고 싶으세요?", "How far would you like to go?"],
      opts: [["talk", ["AI와 대화하는 게 편해지는 정도", "Get comfortable chatting with AI"]], ["delegate", ["내 일 몇 가지를 AI에게 맡기는 정도", "Hand a few of my tasks to AI"]], ["automate", ["AI가 알아서 일하도록 자동화하는 정도", "Automate work so AI does it on its own"]], ["create", ["AI로 프로그램·서비스를 만드는 정도", "Build programs or services with AI"]]] },
    { id: "time", type: "one", title: ["배우는 데 쓸 수 있는 시간은요?", "How much time can you spend learning?"],
      opts: [["short", ["하루 10분 정도", "About 10 minutes a day"]], ["week", ["일주일에 1~2시간", "1–2 hours a week"]], ["lots", ["시간 여유가 많아요", "Plenty of time"]]] },
    { id: "budget", type: "one", title: ["AI에 매달 쓸 수 있는 돈은 어느 정도인가요?", "How much could you spend on AI each month?"],
      help: ["Claude Code 같은 AI 에이전트는 대부분 유료 요금제가 필요해요. 무료로도 시작할 수 있어요.", "AI agents like Claude Code mostly need a paid plan. You can also start for free."],
      opts: [["free", ["무료로만 해 볼래요", "Free only, for now"]], ["basic", ["기본 유료 요금제 정도", "About a basic paid plan"], ["매달 몇만 원", "A few tens of dollars a month"]], ["more", ["효과가 있으면 더 쓸 수 있어요", "More, if it pays off"]], ["company", ["회사가 지원해 줘요", "My company pays"]]] },
    { id: "device", type: "one", title: ["실습에 쓸 수 있는 기기는요?", "Which device can you practice on?"],
      opts: [["win", ["Windows 컴퓨터", "Windows PC"]], ["mac", ["Mac 컴퓨터", "Mac"]], ["mobile", ["휴대폰·태블릿만 있어요", "Only a phone or tablet"]]] }
  ];
  var LABEL = {};
  Q.forEach(function (q) { LABEL[q.id] = {}; q.opts.forEach(function (o) { LABEL[q.id][o[0]] = o[1]; }); });
  function label(qid, v) { return tx(LABEL[qid][v]); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 저장 못 해도 진행 */ } }

  var st = load() || { a: {}, at: -1, done: false };

  function visible() { return Q.filter(function (q) { return !(q.skip && q.skip(st.a)); }); }

  // ---------- 결과 계산 ----------
  function result() {
    var a = st.a, tools = a.tools || [];
    // 에이전트 방식 = AI가 파일을 바로 다룸. 설치형 도구를 쓴다고 했고 다른 방식이라고 하지 않았으면 에이전트로 봄
    var direct = a.output === "direct" || (tools.indexOf("devtool") >= 0 && (a.output === undefined || a.output === "unsure"));
    var stage = a.know === "none" ? "first" : direct ? "agent" : "chat";
    var why = stage === "first" ? T("AI를 아직 써 보지 않았다고 하셨어요.", "You said you haven't used AI yet.")
      : stage === "agent" ? T("AI가 내 컴퓨터의 파일을 바로 만들고 고치는 방식으로 쓰고 계세요.", "You already have AI create and edit files on your computer directly.")
      : a.output === "copy" ? T("AI가 만든 결과를 직접 복사해서 옮기고 계세요.", "You copy what the AI makes and move it over yourself.")
      : a.output === "self" ? T("AI 답을 보고 직접 작업하고 계세요.", "You read the AI's answers and do the work yourself.")
      : T("AI에게 묻고 답을 받아 보는 방식(대화)으로 쓰고 계세요.", "You use AI by asking and reading its answers (chat).");
    var paid = a.budget === "basic" || a.budget === "more" || a.budget === "company";
    var pc = a.device === "win" || a.device === "mac";
    var rec = [], notes = [];
    if (stage === "first") {
      rec.push("lab0");
      if (pc && paid) rec.push("dlab1"); else rec.push("dguide1");
    } else if (stage === "chat") {
      if (pc && paid) { rec.push("dlab1", "dlab2", "mlab1"); }
      else if (!pc && paid) { rec.push("lab0", "mlab2"); notes.push(T("컴퓨터가 없어도 <b>휴대폰 2·3</b>으로 클라우드에서 Claude Code를 쓸 수 있어요. GitHub 가입이 필요해서 조금 낯설 수 있으니, 실습 0으로 먼저 손을 풀어 보세요.", "Even without a computer, <b>Phone 2 and 3</b> let you use Claude Code in the cloud. It needs a GitHub account, which may feel new, so warm up with Practice 0 first.")); }
      else if (!pc) { rec.push("dguide1", "lab0"); notes.push(T("AI 에이전트(Claude Code)는 <b>컴퓨터</b>가 있어야 해요. 컴퓨터가 생기면 데스크톱 1로 오세요. 그 다음엔 휴대폰으로 컴퓨터에 일을 시킬 수도 있어요(휴대폰 1).", "An AI agent (Claude Code) needs a <b>computer</b>. Come to Desktop 1 when you have one. After that, you can even give it jobs from your phone (Phone 1).")); }
      else { rec.push("dguide1", "lab0"); notes.push(T("AI 에이전트(Claude Code)는 <b>유료 요금제</b>가 필요해요. 데스크톱 강의 1편을 먼저 읽어 보고, 해 볼 만하다 싶을 때 데스크톱 1을 시작해도 늦지 않아요.", "An AI agent (Claude Code) needs a <b>paid plan</b>. Read Desktop guide 1 first, and start Desktop 1 when it seems worth it.")); }
    } else {
      rec.push("wlab1", "guide4");
      rec.push(pc ? "mlab1" : "mlab2");
      notes.push(T("기초는 건너뛰어도 돼요. 이미 명령어 도구에 익숙하다면 <b>터미널 과정(CLI · 심화)</b>이 잘 맞아요. 실무에 바로 쓰려면 <b>실무 활용(2단계)</b>부터 시작해도 좋아요.", "You can skip the basics. If you're already comfortable with command-line tools, the <b>terminal course (CLI, advanced)</b> suits you. To put it to work right away, start with <b>Real work (stage 2)</b>."));
    }
    if (a.time === "short" && rec.indexOf("dlab1") >= 0) notes.push(T("데스크톱 1은 20~30분 걸려요. 진행 상황이 저장되니 <b>하루 10분씩 나눠서</b> 해도 돼요.", "Desktop 1 takes 20–30 minutes. Your progress is saved, so you can do <b>10 minutes a day</b>."));
    if ((a.target === "automate" || a.target === "create") && stage !== "agent") notes.push(T("목표가 높을수록, 기초부터 한 단계씩 가는 게 가장 빨라요. 지금 추천 순서대로 시작해 보세요.", "The bigger the goal, the faster it is to go step by step from the basics. Start with the order below."));
    if (a.budget === "free" && stage !== "agent") notes.push(T("무료로도 AI와 대화하는 실력은 충분히 키울 수 있어요. 실습 0이 바로 그 내용이에요.", "You can get good at chatting with AI for free. That's exactly what Practice 0 covers."));
    var future = (a.goal || []).filter(function (g) { return FUTURE[g]; }).map(function (g) {
      var f = FUTURE[g];
      return f.t ? { t: tx(f.t), href: f.href } : { t: tx(f) };
    });
    return { stage: stage, why: why, rec: rec, notes: notes, future: future };
  }
  var STAGE = {
    first: { name: ["AI 첫걸음", "AI first steps"], desc: ["AI를 처음 만나는 단계예요. 무료로 <b>AI와 대화하는 것</b>부터 시작하면 돼요.", "You're just meeting AI. Start by <b>chatting with AI</b> for free."] },
    chat: { name: ["채팅 사용자", "Chat user"], desc: ["AI와 <b>대화(채팅)</b>는 해 봤지만, AI가 내 컴퓨터에서 <b>직접 일하는 '에이전트'</b>는 아직이에요. 지금 가장 많은 분들이 여기에 있어요.", "You've <b>chatted</b> with AI, but not yet used an <b>'agent'</b> that works directly on your computer. Most people are here right now."] },
    agent: { name: ["에이전트 사용자", "Agent user"], desc: ["이미 AI가 파일을 직접 다루는 <b>에이전트</b>를 써 보셨어요. 실무에 맞게 더 깊이 쓰는 법으로 가면 돼요.", "You've already used an <b>agent</b> that works on files directly. Next is using it more deeply for real work."] }
  };

  function profileText() {
    var a = st.a, lines = [];
    Q.forEach(function (q) {
      var v = a[q.id];
      if (v == null || (Array.isArray(v) && !v.length)) return;
      var txt = Array.isArray(v) ? v.map(function (x) { return label(q.id, x); }).join(", ") : label(q.id, v);
      lines.push("- " + tx(q.title) + " " + txt);
    });
    if (a.toolsText) lines.push(T("- 그 밖에 쓰는 AI: ", "- Other AI I use: ") + a.toolsText);
    if (a.goalText) lines.push(T("- 구체적으로 하고 싶은 일: ", "- A specific task I want to do: ") + a.goalText);
    return lines.join("\n");
  }
  function planPrompt() {
    if (lang() === "en") {
      return "I want to learn to use AI. Here's my situation:\n" + profileText() +
        "\n\nPlease make a 4-week learning plan for me in simple words. Give 2–3 things to do each week, and explain very simply what to click and what to try." +
        " (FYI: the earlln.com/lab.html AI AGENT section has beginner practices in order.)";
    }
    return "나는 AI를 배우고 싶은 사람이야. 내 상황은 이래:\n" + profileText() +
      "\n\n이 상황에 맞게, 어려운 말 없이 4주 동안 할 수 있는 학습 계획을 짜 줘. 주마다 할 일을 2~3개씩, 무엇을 누르고 무엇을 해 보면 되는지 아주 쉽게 알려 줘." +
      " (참고: earlln.com/lab.html (AI AGENT 메뉴)에 초보자용 실습이 순서대로 있어.)";
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return Promise.reject(new Error("no clipboard"));
  }

  // ---------- 그리기 ----------
  function render() {
    var h = [];
    if (st.done) {
      var r = result(), s = STAGE[r.stage];
      h.push('<div class="diag diag--result">');
      h.push('<p class="diag__eyebrow">' + T("나에게 맞는 시작점", "Your starting point") + "</p>");
      h.push('<h2 class="diag__title">' + T("지금 단계: ", "Where you are: ") + '<span class="diag__stage">' + tx(s.name) + "</span></h2>");
      h.push('<p class="diag__why">' + T("이렇게 판단했어요 · ", "Why we think so · ") + esc(r.why) + "</p>");
      h.push('<p class="diag__desc">' + tx(s.desc) + "</p>");
      h.push('<p class="diag__head">' + T("이 순서로 해 보세요", "Try them in this order") + '</p><ol class="diag__rec">');
      r.rec.forEach(function (k, i) {
        var it = ITEMS[k];
        var inner = '<span class="diag__kind">' + tx(it.kind) + "</span><b>" + esc(tx(it.title)) + "</b><small>" + tx(it.note) + "</small>";
        h.push("<li>" + (it.href ? '<a class="diag__item' + (i === 0 ? " diag__item--first" : "") + '" href="' + base + it.href + '">' + inner + "<em>" + (i === 0 ? T("여기서 시작 →", "Start here →") : "→") + "</em></a>"
          : '<div class="diag__item diag__item--soon">' + inner + "</div>") + "</li>");
      });
      h.push("</ol>");
      if (r.notes.length) h.push('<ul class="diag__notes">' + r.notes.map(function (n) { return "<li>" + n + "</li>"; }).join("") + "</ul>");
      if (r.future.length) {
        h.push('<p class="diag__head">' + T("하고 싶다고 하신 일, 이렇게 배우게 돼요", "What you'll learn for the things you want to do") + '</p><ul class="diag__future">' +
          r.future.map(function (f) {
            return "<li>" + (f.href ? '<a href="' + base + f.href + '">' + esc(f.t) + "</a> <span class=\"is-ready\">" + T("지금 볼 수 있어요", "Available now") + "</span>"
              : esc(f.t) + " <span>" + T("준비 중", "Coming soon") + "</span>") + "</li>";
          }).join("") + "</ul>");
      }
      if (st.a.know !== "none") {
        h.push('<div class="diag__plan"><p>' + T("<b>더 자세한 맞춤 계획이 필요하면</b> — 내 답을 정리한 질문을 복사해서 Claude에게 물어볼 수 있어요.", "<b>Want a more detailed plan?</b> — We'll copy a question built from your answers so you can ask Claude.") + '</p>' +
          '<button type="button" class="lab__btn lab__btn--ask" data-plan>' + T("Claude에게 내 학습 계획 물어보기", "Ask Claude for my learning plan") + '</button><p class="lab__ask-note" data-plan-note hidden></p></div>');
      }
      h.push('<p class="diag__foot"><button type="button" class="lab__link" data-redo>' + T("진단 다시 하기", "Take it again") + "</button>" + T(" · 답은 이 브라우저에만 저장돼요.", " · Your answers are saved only in this browser.") + "</p>");
      h.push("</div>");
    } else if (st.at < 0) {
      h.push('<div class="diag diag--intro">');
      h.push('<p class="diag__eyebrow">' + T("처음이라면 먼저", "New here? Start with this") + '</p><h2 class="diag__title">' + T("나에게 맞는 시작점 찾기", "Find your starting point") + ' <span class="diag__time">' + T("1분", "1 min") + "</span></h2>");
      h.push('<p class="diag__desc">' + T("몇 가지만 물어볼게요. 지금 AI를 어떻게 쓰는지, 무엇을 하고 싶은지에 맞춰 <b>어디서부터 시작하면 좋을지</b> 알려 드려요.", "Just a few questions. Based on how you use AI now and what you want to do, we'll show you <b>where to start</b>.") + "</p>");
      h.push('<button type="button" class="lab__btn lab__btn--next" data-start>' + T("시작하기 →", "Start →") + "</button>");
      h.push('<p class="diag__foot">' + T("답은 서버로 보내지 않고 이 브라우저에만 저장돼요.", "Your answers aren't sent anywhere; they're saved only in this browser.") + "</p></div>");
    } else {
      var vis = visible(), q = vis[st.at], n = st.at + 1;
      var cur = st.a[q.id];
      h.push('<div class="diag diag--q">');
      h.push('<div class="lab__bar">' + (st.at > 0 ? '<button type="button" class="lab__back" data-prev>' + T("← 이전", "← Back") + "</button>" : '<button type="button" class="lab__back" data-cancel>' + T("← 나가기", "← Exit") + "</button>") +
        '<span class="lab__count">' + T("질문 ", "Question ") + n + " / " + vis.length + "</span></div>");
      h.push('<div class="lab__progress"><span style="width:' + Math.round(n / vis.length * 100) + '%"></span></div>');
      h.push('<h2 class="diag__title">' + esc(tx(q.title)) + "</h2>");
      if (q.help) h.push('<p class="diag__help">' + esc(tx(q.help)) + "</p>");
      h.push('<div class="lab__actions">');
      q.opts.forEach(function (o) {
        var on = q.type === "many" ? (cur || []).indexOf(o[0]) >= 0 : cur === o[0];
        h.push('<button type="button" class="lab__btn lab__btn--choice' + (on ? " is-on" : "") + '" data-opt="' + o[0] + '" aria-pressed="' + on + '">' +
          (q.type === "many" ? '<span class="diag__check" aria-hidden="true">' + (on ? "✓" : "") + "</span>" : "") +
          "<span><b>" + esc(tx(o[1])) + "</b>" + (o[2] ? "<small>" + esc(tx(o[2])) + "</small>" : "") + "</span></button>");
      });
      h.push("</div>");
      if (q.input) h.push('<label class="lab__input"><span>' + esc(tx(q.input)) + '</span><textarea rows="2" data-text>' + esc(st.a[q.id + "Text"] || "") + "</textarea></label>");
      h.push('<div class="diag__nav">');
      if (q.type === "many") h.push('<button type="button" class="lab__btn lab__btn--next" data-next>' + T("다음 →", "Next →") + "</button>");
      h.push('<button type="button" class="lab__link" data-skip>' + T("잘 모르겠어요 · 건너뛰기", "Not sure · Skip") + "</button></div>");
      h.push("</div>");
    }
    host.innerHTML = h.join("");
    wire();
  }

  function next() {
    var t = host.querySelector("[data-text]");
    var vis = visible(), q = vis[st.at];
    if (t && q) st.a[q.id + "Text"] = t.value.trim().slice(0, 300);
    vis = visible();
    if (st.at + 1 >= vis.length) {
      // 건너뛴 질문의 예전 답은 지움 (예: 'AI 안 써 봤어요'로 바꾼 경우)
      Q.forEach(function (x) { if (x.skip && x.skip(st.a)) { delete st.a[x.id]; delete st.a[x.id + "Text"]; } });
      st.done = true; st.at = -1;
      // 방문 통계 (analytics.js): 어떤 단계로 나왔는지만 (답한 내용은 보내지 않음)
      if (window.earllnTrack) window.earllnTrack("diag_complete", { stage: result().stage });
    } else st.at++;
    save(); render();
    var top = host.getBoundingClientRect().top + window.pageYOffset - 80;
    if (top < window.pageYOffset) window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }
  function wire() {
    var on = function (sel, fn) { var el = host.querySelector(sel); if (el) el.addEventListener("click", fn); };
    on("[data-start]", function () { st = { a: {}, at: 0, done: false }; save(); render(); });
    on("[data-cancel]", function () { st.at = -1; save(); render(); });
    on("[data-prev]", function () { st.at = Math.max(0, st.at - 1); save(); render(); });
    on("[data-skip]", function () { var q = visible()[st.at]; delete st.a[q.id]; next(); });
    on("[data-next]", next);
    on("[data-redo]", function () { st = { a: {}, at: 0, done: false }; save(); render(); });
    host.querySelectorAll("[data-opt]").forEach(function (b) {
      b.addEventListener("click", function () {
        var q = visible()[st.at], v = b.getAttribute("data-opt");
        if (q.type === "many") {
          var arr = (st.a[q.id] || []).slice(), i = arr.indexOf(v);
          if (i >= 0) arr.splice(i, 1); else arr.push(v);
          var t = host.querySelector("[data-text]");
          if (t) st.a[q.id + "Text"] = t.value.trim().slice(0, 300);
          st.a[q.id] = arr; save(); render();
        } else {
          st.a[q.id] = v; next();
        }
      });
    });
    on("[data-plan]", function () {
      var note = host.querySelector("[data-plan-note]"), prompt = planPrompt();
      var open = function () { window.open("https://claude.ai/new?q=" + encodeURIComponent(prompt), "_blank", "noopener"); };
      copyText(prompt).then(function () {
        note.hidden = false;
        note.innerHTML = T("질문을 <b>복사</b>해 두었어요. 새로 열린 Claude 창의 입력 칸이 비어 있으면, 입력 칸을 누르고 <b>붙여 넣기</b> 한 뒤 보내세요.", "Your question is <b>copied</b>. If the box in the new Claude window is empty, tap it, <b>paste</b>, and send.");
        open();
      }, function () {
        note.hidden = false;
        note.textContent = T("새로 열린 Claude 창에 원하는 것을 직접 적어 주세요.", "Type what you want in the new Claude window.");
        open();
      });
    });
  }

  document.addEventListener("earlln:lang", render);
  render();
})();
