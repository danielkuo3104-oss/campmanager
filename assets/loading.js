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
