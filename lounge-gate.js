/* ============================================
   넷폼 라운지 로그인으로 들어오기 (2026-11-09)

   · 이 사이트는 공용 비밀번호를 쓰지 않는다. 접속 권한은 넷폼 라운지에서 관리한다.
     - 관리자    : 라운지에서 관리자인 사람
     - 일반 접속 : 라운지 권한 관리의 '포어·그로홈 입금관리'(pourstore) 목록에 지정된 사람
   · 라운지(mgmtny)를 기본 앱으로 두면 같은 도메인(netformrnd.github.io)의 라운지 로그인을 그대로 쓴다.
   · 서버 함수(appToken)가 라운지 계정·권한을 확인한 뒤 pour-store 입장권을 발급한다.
     권한이 없으면 입장권이 나오지 않으므로 화면뿐 아니라 데이터(Firestore 규칙)도 막힌다.

   쓰는 법(각 페이지 <head>):
     firebase-app / firestore / auth / functions compat → nf-config.js → 이 파일
     페이지 데이터 앱은 firebase.initializeApp(설정, 'pour') 로 따로 만들고,
     시작 코드는 NFGate.onReady(function(){ ... }) 안에서 실행한다.
     첫 화면(입금관리 선택)처럼 데이터를 안 읽는 곳은 <html data-nf-gate="check"> 로 권한만 확인.
   ============================================ */
(function () {
  var LOUNGE_URL = 'https://netformrnd.github.io/nf_lounge/';
  var REGION = 'asia-northeast3';
  var APP_ID = 'pour-store';
  var DATA_APP = 'pour';
  var TITLE = '포어·그로홈 입금관리';

  var root = document.documentElement;
  root.classList.add('nf-gate-wait');
  var st = document.createElement('style');
  st.textContent = 'html.nf-gate-wait body{visibility:hidden}';
  document.head.appendChild(st);

  /* 익명 로그인은 절대 부르지 않는다 — 라운지 메일 세션을 덮어쓰기 때문 */
  try { firebase.app(); } catch (e) { firebase.initializeApp(window.NF_LOUNGE_CONFIG); }

  var domReady = new Promise(function (r) {
    if (document.readyState !== 'loading') r();
    else document.addEventListener('DOMContentLoaded', function () { r(); });
  });

  function currentUser() {
    return new Promise(function (resolve) {
      var done = false;
      var off = firebase.auth().onAuthStateChanged(function (u) {
        if (done) return; done = true; try { off(); } catch (e) {} resolve(u);
      });
      setTimeout(function () { if (!done) { done = true; resolve(null); } }, 8000);
    });
  }

  /* 입장 실패 시 이 기기에 남아 있을 수 있는 pour-store 세션을 지운다(권한 회수 즉시 반영) */
  function dropDataSession() {
    domReady.then(function () {
      try { firebase.auth(firebase.app(DATA_APP)).signOut().catch(function () {}); } catch (e) {}
    });
  }

  function gate(reason, detail) {
    dropDataSession();
    var old = document.getElementById('nfLoungeGate');
    if (old) old.remove();
    var wrap = document.createElement('div');
    wrap.id = 'nfLoungeGate';
    wrap.setAttribute('style', 'position:fixed;inset:0;visibility:visible;display:flex;align-items:center;justify-content:center;background:#F1F5F9;z-index:99999;font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;padding:20px;');
    var box = document.createElement('div');
    box.setAttribute('style', 'background:#fff;border-radius:16px;padding:40px 32px;text-align:center;max-width:400px;box-shadow:0 10px 30px rgba(15,23,42,.08);');
    function add(tag, style, text) {
      var n = document.createElement(tag);
      if (style) n.setAttribute('style', style);
      if (text) n.textContent = text;
      box.appendChild(n);
      return n;
    }
    add('div', 'font-size:36px;margin-bottom:14px;', '🔒');
    add('div', 'font-size:18px;font-weight:700;color:#0F172A;margin-bottom:10px;word-break:keep-all;', TITLE);
    add('div', 'font-size:14px;color:#475569;line-height:1.7;margin-bottom:22px;word-break:keep-all;white-space:pre-line;',
      reason === 'denied' ? '열람 권한이 없는 계정입니다.\n경영관리팀에 요청해 주세요.' : '넷폼 라운지 로그인이 필요합니다.');
    if (reason !== 'denied') {
      var a = document.createElement('a');
      a.href = LOUNGE_URL;
      a.textContent = '로그인하러 가기 →';
      a.setAttribute('style', 'display:inline-block;padding:12px 22px;border-radius:9px;background:#1B2A4A;color:#fff;text-decoration:none;font-size:14px;font-weight:600;');
      box.appendChild(a);
    }
    if (reason === 'error' && detail) {
      add('div', 'margin-top:18px;font-size:12px;color:#64748B;word-break:break-all;', String(detail).slice(0, 200));
    }
    wrap.appendChild(box);
    root.appendChild(wrap);
  }

  async function boot() {
    var checkOnly = root.getAttribute('data-nf-gate') === 'check';
    try {
      var user = await currentUser();
      if (!user || user.isAnonymous || !user.email) { gate('login'); return false; }

      var res;
      try {
        res = await firebase.app().functions(REGION).httpsCallable('appToken')({ app: APP_ID });
      } catch (e) {
        var denied = e && (e.code === 'functions/permission-denied' || e.code === 'functions/unauthenticated');
        gate(denied ? 'denied' : 'error', e && e.message);
        return false;
      }

      if (!checkOnly) {
        await domReady;   // 페이지가 'pour' 앱을 만든 뒤
        var dataAuth = firebase.auth(firebase.app(DATA_APP));
        // 입장권 세션은 메모리에만(브라우저에 저장 안 함) — 페이지를 열 때마다 라운지 권한을 다시 확인
        await dataAuth.setPersistence(firebase.auth.Auth.Persistence.NONE);
        await dataAuth.signInWithCustomToken(res.data.token);
      }
      window.NFGate.me = { uid: res.data.uid, name: res.data.name, admin: !!res.data.admin };
      await domReady;
      root.classList.remove('nf-gate-wait');
      return true;
    } catch (e) {
      console.error('[라운지 로그인]', e);
      gate('error', e && e.message);
      return false;
    }
  }

  var ready = boot();
  window.NFGate = {
    me: null,
    ready: ready,
    onReady: function (fn) { ready.then(function (ok) { if (ok) fn(); }); }
  };
})();
