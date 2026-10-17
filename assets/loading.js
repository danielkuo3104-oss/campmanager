/* 營隊報名管理系統　© 2026 Daniel GUO. All rights reserved. */
/* 學員專區、預製表單、同意書等公開頁面的載入畫面：轉圈動畫，等比較久時說明原因，讓人知道沒有當掉。 */

/** 在 box 裡顯示載入動畫；box 的內容被換掉後，提示文字就不再更新 */
function showLoading(box, msg) {
  box.innerHTML = '<div class="ld" role="status" aria-live="polite"><div class="ld-spin"></div><div class="ld-msg"></div><div class="ld-sub"></div></div>';
  var root = box.firstChild;
  root.querySelector('.ld-msg').textContent = msg || '載入中…';
  [[2500, '正在連線到營隊系統…'], [6000, '第一次開啟需要喚醒伺服器，通常要 5～10 秒'], [15000, '網路比較慢，仍在努力載入中，請不要關閉頁面']].forEach(function (s) {
    setTimeout(function () { if (document.body.contains(root)) root.querySelector('.ld-sub').textContent = s[1]; }, s[0]);
  });
}

/** 按鈕的處理中狀態：文字旁邊有轉圈，等太久時按鈕下方補一句說明 */
function btnBusy(btn, on, label, busyLabel) {
  btn.disabled = on;
  btn.classList.toggle('is-busy', on);
  btn.textContent = on ? (busyLabel || '處理中…') : label;
  clearTimeout(btn._slow);
  var note = btn.parentNode && btn.parentNode.querySelector('.ld-note');
  if (note) note.remove();
  if (on) btn._slow = setTimeout(function () {
    if (!btn.classList.contains('is-busy') || !btn.parentNode) return;
    var n = document.createElement('div');
    n.className = 'ld-note';
    n.textContent = '還在處理，第一次使用可能要等 5～10 秒，請不要重複按或關閉頁面';
    btn.parentNode.appendChild(n);
  }, 4000);
}

/** LINE、Instagram、Facebook 的 App 內建瀏覽器：常常不能下載檔案（PDF、行事曆），要請對方改用 Safari／Chrome 開啟 */
function inAppBrowser() {
  var ua = navigator.userAgent || '';
  return /\bLine\//i.test(ua) ? 'LINE' : /Instagram/i.test(ua) ? 'Instagram' : /FBAN|FBAV|FB_IAB/.test(ua) ? 'Facebook' : '';
}

/** 複製文字：先用剪貼簿 API，不行（舊瀏覽器、內建瀏覽器）就用暫時的輸入框 */
function copyText(text) {
  function old() {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error('無法自動複製，請長按選取後複製'));
  }
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(old);
  return old();
}

/** 按了「複製」之後，按鈕上暫時顯示「已複製」 */
function copyBtn(btn, text) {
  var label = btn.textContent;
  copyText(text).then(function () { btn.textContent = '已複製'; }).catch(function (e) { btn.textContent = '複製失敗'; alert(e.message + '\n\n' + text); })
    .then(function () { setTimeout(function () { btn.textContent = label; }, 1800); });
}

/**
 * 內建瀏覽器的提示（what：例如「下載同意書 PDF」）：請用 Safari／Chrome 開啟，附「複製連結」按鈕。
 * 不是內建瀏覽器時回傳 null。url 預設是目前的網址。
 */
function inAppHint(what, url) {
  var app = inAppBrowser();
  if (!app) return null;
  var box = document.createElement('div');
  box.className = 'inapp-hint';
  box.setAttribute('role', 'note');
  box.style.cssText = 'padding:12px 14px;border-radius:12px;background:var(--warn-soft,#fdf3dc);color:var(--warn,#8a5a00);line-height:1.7;font-size:14px;display:flex;flex-direction:column;gap:8px;align-items:flex-start';
  box.innerHTML = '<div></div><button class="btn sm" type="button">複製連結</button>';
  box.firstChild.textContent = '你正在用 ' + app + ' 的內建瀏覽器，可能沒辦法' + (what || '下載檔案') + '。請點右上角「⋯」選「用瀏覽器開啟」，或按下面的按鈕複製連結，貼到 Safari／Chrome 打開。';
  box.querySelector('button').addEventListener('click', function () { copyBtn(this, url || location.href); });
  return box;
}
