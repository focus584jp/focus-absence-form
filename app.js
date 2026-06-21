// 連絡フォーム共通ロジック。index.html（欠席）と tardy.html（遅刻）が共有する。
// 各HTMLは <head> で window.__formType（'欠席'|'遅刻'）と window.__liffId を定義する。
// 種別はHTML側にハードコードされた見出し・ラベルで確定済み（ここでは描画しない）。
(function () {
  'use strict';

  // ===== 設定 =====
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbywAFTtPxH5dU4TVnBvXhbjQy10z7cqwWUS4P7q9bg6crE_v8Sfmz117cYfIWRtb7Cpgw/exec';
  const LS_CLASSROOM = 'lastClassroom'; // 教室名を端末にキャッシュし、次回開いたとき即時表示する
  const DEFAULT_PERIODS = [
    { label: '2限', time: '14:00〜' },
    { label: '3限', time: '15:00〜' },
    { label: '4限', time: '16:00〜' },
    { label: '5限', time: '17:00〜' },
    { label: '6限', time: '18:00〜' },
    { label: '7限', time: '19:00〜' },
    { label: '8限', time: '20:00〜' },
    { label: '9限', time: '21:00〜' },
  ];
  // ================

  const formType = window.__formType; // 送信ペイロードの種別に使う
  let userId = null;
  let classroomName = '';

  function showMessage(text, type) {
    const el = document.getElementById('message');
    el.className = 'message ' + type;
    el.textContent = text;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // 各項目のタイトル横に警告を表示し、入力枠を赤くする
  function setFieldError(id, message) {
    const err = document.getElementById('err-' + id);
    if (err) err.textContent = '※' + message;
    const el = document.getElementById(id);
    if (el) el.classList.add('invalid');
  }

  function clearFieldError(id) {
    const err = document.getElementById('err-' + id);
    if (err) err.textContent = '';
    const el = document.getElementById(id);
    if (el) el.classList.remove('invalid');
  }

  function clearAllFieldErrors() {
    ['lastName', 'firstName', 'absenceDate', 'periodGrid', 'reason'].forEach(clearFieldError);
  }

  function buildPeriodGrid(periods) {
    const grid = document.getElementById('periodGrid');
    grid.innerHTML = '';
    periods.forEach(function (p) {
      const item = document.createElement('div');
      item.className = 'period-item';
      item.innerHTML =
        '<input type="checkbox" id="p_' + p.label + '" value="' + p.label + '(' + p.time + ')">' +
        '<div><div class="period-label">' + p.label + '</div>' +
        '<div class="period-time">' + p.time + '</div></div>';
      item.addEventListener('click', function (e) {
        const cb = this.querySelector('input');
        if (e.target !== cb) cb.checked = !cb.checked;
        // 遅刻は時限を1つだけ選択（チェック時に他を解除）。欠席は複数選択のまま。
        if (window.__formType === '遅刻' && cb.checked) {
          document.querySelectorAll('#periodGrid input').forEach(function (other) {
            if (other !== cb) other.checked = false;
          });
          document.querySelectorAll('#periodGrid .period-item').forEach(function (it) {
            it.classList.remove('selected');
          });
        }
        this.classList.toggle('selected', cb.checked);
        clearFieldError('periodGrid');
      });
      grid.appendChild(item);
    });
  }

  // GASからuserIdで登録情報（教室・姓・名）を取得（JSONP。別オリジンのためscriptタグで読む）
  function fetchUserInfo(uid) {
    return new Promise(function (resolve) {
      const cb = 'jsonp_' + Date.now();
      const script = document.createElement('script');
      const timer = setTimeout(function () { cleanup(); resolve(null); }, 8000);
      function cleanup() {
        clearTimeout(timer);
        delete window[cb];
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[cb] = function (data) { cleanup(); resolve(data || null); };
      script.onerror = function () { cleanup(); resolve(null); };
      script.src = GAS_URL + '?action=getClassroom&userId=' + encodeURIComponent(uid) + '&callback=' + cb;
      document.body.appendChild(script);
    });
  }

  function fetchConfigJsonp() {
    return new Promise(function (resolve) {
      const cb = 'jsonp_cfg_' + Date.now();
      const script = document.createElement('script');
      const timer = setTimeout(function () { cleanup(); resolve(null); }, 8000);
      function cleanup() {
        clearTimeout(timer);
        delete window[cb];
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[cb] = function (data) { cleanup(); resolve(data || null); };
      script.onerror = function () { cleanup(); resolve(null); };
      script.src = GAS_URL + '?action=getConfig&callback=' + cb;
      document.body.appendChild(script);
    });
  }

  function setTodayAsDefault() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    document.getElementById('absenceDate').value = y + '-' + m + '-' + d;
  }

  document.getElementById('absenceForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    clearAllFieldErrors();

    if (!userId) {
      showMessage('ユーザー情報を取得できませんでした。一度閉じて開き直してください。', 'error');
      return;
    }

    const lastName = document.getElementById('lastName').value.trim();
    const firstName = document.getElementById('firstName').value.trim();
    const studentName = lastName + ' ' + firstName;
    const absenceDate = document.getElementById('absenceDate').value;
    const reason = document.getElementById('reason').value.trim();
    const periods = Array.from(document.querySelectorAll('#periodGrid input:checked'))
      .map(function (cb) { return cb.value; });

    let firstInvalid = null;
    if (!lastName) { setFieldError('lastName', '姓を入力してください'); firstInvalid = firstInvalid || 'lastName'; }
    if (!firstName) { setFieldError('firstName', '名を入力してください'); firstInvalid = firstInvalid || 'firstName'; }
    if (!absenceDate) { setFieldError('absenceDate', '選択してください'); firstInvalid = firstInvalid || 'absenceDate'; }
    if (periods.length === 0) { setFieldError('periodGrid', '1つ以上選択してください'); firstInvalid = firstInvalid || 'periodGrid'; }
    if (!reason) { setFieldError('reason', '入力してください'); firstInvalid = firstInvalid || 'reason'; }
    if (firstInvalid) {
      document.getElementById(firstInvalid).scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    btn.disabled = true;
    btn.textContent = '送信中...';

    const payload = {
      userId: userId,
      type: formType,
      classroom: classroomName,
      studentName: studentName,
      lastName: lastName,
      firstName: firstName,
      absenceDate: absenceDate,
      periods: periods,
      reason: reason,
    };
    // 次回プリフィル用に端末へ保存（サーバー側はGASのsaveUserNameが更新）
    try { localStorage.setItem('lastName', lastName); localStorage.setItem('firstName', firstName); } catch (e) {}

    const payloadStr = JSON.stringify(payload);
    // GASは別オリジン＆no-corsでレスポンスを読めない。完了を待つ意味が薄いため
    // sendBeaconで投げて即カードを閉じる（受付確認はLINEプッシュで届く）。
    let sent = false;
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([payloadStr], { type: 'text/plain' });
        sent = navigator.sendBeacon(GAS_URL + '?action=absence', blob);
      }
    } catch (err) {
      sent = false;
    }
    if (!sent) {
      // 古いWebView等のフォールバック（完了は待たない）
      fetch(GAS_URL + '?action=absence', {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: payloadStr,
      });
    }
    if (liff.isInClient()) {
      liff.closeWindow();
    } else {
      document.getElementById('absenceForm').style.display = 'none';
      showMessage('送信しました。', 'success');
    }
  });

  // 遅刻・欠席とも先頭に「1限 13:00〜」を足す（マスタは2限〜のため、ここで補う）
  function periodsForForm(base) {
    return [{ label: '1限', time: '13:00〜' }].concat(base);
  }

  // liff 非依存。即実行してフォーム本体を描画する。
  function initFormUI() {
    buildPeriodGrid(periodsForForm(DEFAULT_PERIODS));
    // 裏で最新の時限定義を取得。デフォルトと異なり、かつ未選択のときだけ差し替える（無駄な再描画を避ける）
    fetchConfigJsonp().then(function (config) {
      const anyChecked = document.querySelectorAll('#periodGrid input:checked').length > 0;
      if (config && config.periods && config.periods.length && !anyChecked) {
        if (JSON.stringify(config.periods) !== JSON.stringify(DEFAULT_PERIODS)) {
          buildPeriodGrid(periodsForForm(config.periods));
        }
      }
    });
    setTodayAsDefault();
  }

  // liff 依存。SDK(defer)ロード後に走らせるため DOMContentLoaded で呼ぶ。
  async function initLiff() {
    try {
      await liff.init({ liffId: window.__liffId });
    } catch (err) {
      showMessage('LIFFの初期化に失敗しました: ' + err.message, 'error');
      return;
    }

    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    try {
      const profile = await liff.getProfile();
      userId = profile.userId;
    } catch (err) {
      showMessage('ユーザー情報の取得に失敗しました: ' + err.message, 'error');
      return;
    }

    // 登録情報（教室・姓・名）をGASから取得して補完する。
    const info = await fetchUserInfo(userId) || {};
    const fetched = info.classroom || '';
    if (fetched) {
      classroomName = fetched;
      document.getElementById('classroomDisplay').textContent = fetched;
      try { localStorage.setItem(LS_CLASSROOM, fetched); } catch (e) { /* 無視 */ }
    } else if (!classroomName) {
      document.getElementById('classroomDisplay').textContent = '未登録';
      showMessage('教室が未登録です。LINEのメニューから教室登録を行ってください。', 'error');
    }
    // 姓・名は入力欄が空のときだけ補完（localStorageで既に入っていれば尊重）
    const lnEl = document.getElementById('lastName');
    const fnEl = document.getElementById('firstName');
    if (info.lastName && !lnEl.value) lnEl.value = info.lastName;
    if (info.firstName && !fnEl.value) fnEl.value = info.firstName;
    // 取得した姓・名を端末にキャッシュし、次回はインライン即時プリフィルで開いた瞬間に入る
    try {
      if (info.lastName) localStorage.setItem('lastName', info.lastName);
      if (info.firstName) localStorage.setItem('firstName', info.firstName);
    } catch (e) { /* 無視 */ }
  }

  // 起動：教室名は端末キャッシュ（前回値）で即時表示済み（HTMLの要素直後インライン）。
  // ここではその値を内部状態にも反映しておく。
  try { classroomName = localStorage.getItem(LS_CLASSROOM) || ''; } catch (e) { classroomName = ''; }

  ['lastName', 'firstName', 'absenceDate', 'reason'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', function () { clearFieldError(id); });
  });

  initFormUI();
  document.addEventListener('DOMContentLoaded', initLiff);
})();
