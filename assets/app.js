/* 營隊報名管理系統　© 2026 Daniel GUO. All rights reserved. */
/* 共用程式：API、頁面框架、彈窗、確認視窗、提示 */
/* ============ 共用：API、登入、路由、彈窗、提示 ============ */
var App = {
  token: null,
  user: null
};

/**
 * 登入 token：一般登入存 sessionStorage（關掉視窗就登出）；
 * 勾「保持登入」存 localStorage（關掉瀏覽器或桌面捷徑後仍保持登入，有效天數由後端決定）。
 * store(key) 讀取、store(key, null) 兩邊都清掉、store(key, val, true) 存到 localStorage。
 */
function store(key, val, persist) {
  try {
    if (val === undefined) return sessionStorage.getItem(key) || localStorage.getItem(key);
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
    if (key === 'camp_token' && val === null) cacheClear();   // 登出或換人：畫面快取一起清掉
    if (val !== null) (persist ? localStorage : sessionStorage).setItem(key, val);
  } catch (e) { return null; }
}

/** 呼叫 Apps Script 後端 API（text/plain 避免 CORS 預檢） */
function api(name) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (name !== 'login' && name !== 'register' && name !== 'forgotPassword') args = [App.token].concat(args);
  if (!window.CAMP_CONFIG || !CAMP_CONFIG.API_URL || /請填入/.test(CAMP_CONFIG.API_URL)) {
    return Promise.reject(new Error('尚未設定後端網址：請編輯 assets/config.js 的 API_URL'));
  }
  return fetch(CAMP_CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ fn: name, args: args }),
    redirect: 'follow'
  }).then(function (r) {
    if (!r.ok) throw new Error('連線失敗（HTTP ' + r.status + '）');
    return r.json();
  }, function () {
    throw new Error('無法連線到後端，請檢查網路或 API_URL 設定');
  }).then(function (j) {
    if (j.ok) return j.result;
    var msg = String(j.error || '發生錯誤').replace(/^(Exception|Error):\s*/, '');
    if (msg.indexOf('AUTH:') === 0) {
      store('camp_token', null);
      location.href = 'index.html?msg=' + encodeURIComponent(msg.slice(5));
      return new Promise(function () {});
    }
    throw new Error(msg);
  });
}

/* ---------- 畫面資料快取：切換頁面先顯示上次的資料，同時向後端拿最新的 ----------
 * 存在 sessionStorage（只在這個分頁，關掉就清掉），並綁定登入 token，換人登入不會看到別人的資料。 */
var CACHE_PREFIX = 'camp-c:';
function cacheKey(name, args) { return CACHE_PREFIX + name + ':' + JSON.stringify(args || []); }
function cacheGet(key) {
  try {
    var o = JSON.parse(sessionStorage.getItem(key) || 'null');
    return o && o.t === App.token ? o.d : null;
  } catch (e) { return null; }
}
function cacheSet(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ t: App.token, d: data })); }
  catch (e) { try { sessionStorage.removeItem(key); } catch (e2) {} }   // 資料太大存不下就算了
}
function cacheClear() {
  try { Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf(CACHE_PREFIX) === 0) sessionStorage.removeItem(k); }); } catch (e) {}
}
/**
 * 讀取型 API 的快速版：有上次的資料就先 show(data, false)，拿到最新的再 show(data, true)。
 * 用法 apiFast('getProjectData', prefix, show)；回傳的 Promise 在拿到最新資料後完成。
 */
function apiFast(name) {
  var args = Array.prototype.slice.call(arguments, 1);
  var show = args.pop();
  var key = cacheKey(name, args);
  var hit = cacheGet(key);
  if (hit) show(hit, false);
  return api.apply(null, [name].concat(args)).then(function (d) {
    cacheSet(key, d);
    show(d, true);
    return d;
  });
}
/** 背景預先載入（還沒有快取的才抓），一次一個，不影響畫面 */
function prefetch(list) {
  var i = 0;
  (function next() {
    if (i >= list.length) return;
    var it = list[i++], key = cacheKey(it[0], it.slice(1));
    if (cacheGet(key)) return next();
    api.apply(null, it).then(function (d) { cacheSet(key, d); }).catch(function () {}).then(next);
  })();
}

/** 匯款資訊檢查（與後端 normBank_ 相同規則） */
function bankError(b) {
  var miss = [['bank', '銀行'], ['branch', '分行'], ['name', '戶名'], ['no', '帳號']].filter(function (x) { return !String(b[x[0]] || '').trim(); }).map(function (x) { return x[1]; });
  if (miss.length) return '匯款帳號請填：' + miss.join('、');
  if (b.code && !/^\d{3}$/.test(b.code)) return '銀行代碼是 3 碼數字（例如台灣銀行 004）';
  if (!/^[\d\s-]+$/.test(b.no)) return '帳號只能有數字、空白或 -';
  return '';
}

/**
 * 名單強調顯示（學員列表與匯出 PDF 共用）：不做文字偵測，只看設定的規則。
 * rule = {mode:'filled'} 有填寫就強調，但「無」「沒有」「-」之類不算；{mode:'match', values:[…]} 答案（多選題任一個）符合時強調。
 */
var HL_NONE = /^(無|沒有|没有|無特殊|皆無|none|no|n\/?a|-+|—+|／|\/|x|0)$/i;
function highlightHit(rule, v) {
  if (!rule) return false;
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (!s) return false;
  if (rule.mode === 'filled') return !HL_NONE.test(s.replace(/[\s。.、，,]+$/g, ''));
  if (rule.mode !== 'match') return false;
  var parts = s.split(/,\s*/).map(function (x) { return x.trim(); });
  return (rule.values || []).some(function (x) { return x === s || parts.indexOf(x) >= 0; });
}

/** 手機版（窄螢幕）：只留瀏覽、寄信等操作與專案設定，版面複雜的編輯功能請用電腦（樣式見 .desk-only） */
function isPhone() { return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches); }

/** 版權標示：每一頁最下方 */
var COPYRIGHT = '© 2026 Daniel GUO. All rights reserved.';
document.addEventListener('DOMContentLoaded', function () {
  if (document.querySelector('.copyright')) return;
  var f = document.createElement('footer');
  f.className = 'copyright';
  f.textContent = '營隊報名管理系統　' + COPYRIGHT;
  document.body.appendChild(f);
});

function esc(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function money(n) { return (n === '' || n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US'); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function fmtTime(v) {
  if (!v) return '';
  var d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function fmtDate(v) {
  if (!v) return '';
  var m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return m[1] + '/' + m[2] + '/' + m[3];
  return fmtTime(v).slice(0, 10);
}
function el(html) {
  var t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

var STATUS_COLORS = {
  '已報名': 'info', '資格審核中': 'brand', '繳款待核覆': 'brand', '匯款逾期': 'bad', '匯款異常': 'bad', '程序完成': 'ok',
  '候補中': 'warn', '招生期外': 'warn', '報名取消': 'mute', '報名失敗': 'mute',
  '運作中': 'ok', '系統維護': 'warn', '已停止': 'bad', '已封存': 'mute', '已過期': 'mute', '全部停止': 'bad',
  '待核准': 'warn', '未核准': 'bad'
};
function pill(status) {
  return '<span class="pill ' + (STATUS_COLORS[status] || 'mute') + '">' + esc(status) + '</span>';
}

/* ---------- 提示與忙碌 ---------- */
function toast(msg, bad) {
  var t = el('<div class="toast' + (bad ? ' bad' : '') + '"></div>');
  t.textContent = msg;
  $('#toast-root').appendChild(t);
  setTimeout(function () { t.remove(); }, bad ? 6000 : 3200);
}
var busyCount = 0;
function busy(on) {
  busyCount += on ? 1 : -1;
  var v = $('#busy-veil');
  if (busyCount > 0 && !v) document.body.appendChild(el('<div class="busy-veil" id="busy-veil"><div class="spinner"></div></div>'));
  if (busyCount <= 0) { busyCount = 0; if (v) v.remove(); }
}
function withBusy(p) {
  busy(true);
  return p.then(function (r) { busy(false); return r; }, function (e) { busy(false); throw e; });
}

/* ---------- 彈窗 ---------- */
function modal(opts) {
  return new Promise(function (resolve) {
    var ov = el('<div class="overlay"><div class="modal' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h2></h2>' + (opts.desc ? '<p></p>' : '') + '</div>' +
      '<div class="modal-body"></div><div class="modal-foot"></div></div></div>');
    $('h2', ov).textContent = opts.title || '';
    if (opts.desc) $('.modal-head p', ov).textContent = opts.desc;
    var body = $('.modal-body', ov);
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
    var foot = $('.modal-foot', ov);
    function close(v) { document.removeEventListener('keydown', onKey); ov.remove(); resolve(v); }
    function onKey(e) { if (e.key === 'Escape') close(null); }
    (opts.buttons || [{ label: '確定', cls: 'primary', value: true }]).forEach(function (b) {
      var btn = el('<button class="btn ' + (b.cls || '') + '" type="button"></button>');
      btn.textContent = b.label;
      btn.addEventListener('click', function () {
        if (b.validate) { var r = b.validate(ov); if (r !== true) return; }
        close(typeof b.value === 'function' ? b.value(ov) : b.value);
      });
      foot.appendChild(btn);
    });
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(null); });
    document.addEventListener('keydown', onKey);
    $('#modal-root').appendChild(ov);
    if (opts.onOpen) opts.onOpen(ov);
    var first = $('input, textarea, select', body);
    if (first) setTimeout(function () { first.focus(); }, 30);
  });
}

function confirmDialog(o) {
  var body = '<ul class="summary-list">' + (o.lines || []).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
  return modal({
    title: o.title, desc: o.desc, body: o.lines && o.lines.length ? body : '',
    buttons: (o.cancelLabel === null ? [] : [{ label: o.cancelLabel || '取消', value: false }]).concat([{ label: o.okLabel || '確認', cls: o.danger ? 'danger' : 'primary', value: true }])
  }).then(function (v) { return !!v; });
}

/** fields: [{name,label,type,options,value,required,hint,placeholder}] */
function formDialog(o) {
  var form = el('<form style="display:flex;flex-direction:column;gap:14px" onsubmit="return false"></form>');
  o.fields.forEach(function (f) {
    var id = 'f_' + f.name;
    var wrap;
    if (f.type === 'note') {
      // 唯讀資訊方塊（html 由呼叫端組好並跳脫）
      wrap = el('<div class="dlg-note"></div>'); wrap.innerHTML = f.html || '';
    } else if (f.type === 'checkbox') {
      wrap = el('<label class="check"><input type="checkbox" name="' + f.name + '"' + (f.value ? ' checked' : '') + '><span></span></label>');
      $('span', wrap).textContent = f.label;
    } else if (f.type === 'checklist') {
      // 多選清單（附搜尋）：options [{value, label, sub}]，回傳勾選的 value 陣列
      wrap = el('<div class="field"><span></span><input class="input sm" type="search" placeholder="搜尋姓名"><div class="check-list"></div></div>');
      $('span', wrap).innerHTML = esc(f.label) + (f.required ? '<em>*</em>' : '');
      var cl = $('.check-list', wrap);
      (f.options || []).forEach(function (op) {
        var it = el('<label class="check"><input type="checkbox" data-cl="' + f.name + '"><span><span></span> <small class="muted"></small></span></label>');
        $('input', it).value = op.value;
        $('span span', it).textContent = op.label;
        $('small', it).textContent = op.sub || '';
        cl.appendChild(it);
      });
      $('input[type=search]', wrap).addEventListener('input', function (e) {
        var q = e.target.value.trim().toLowerCase();
        $$('label', cl).forEach(function (l) { l.classList.toggle('hidden', !!q && l.textContent.toLowerCase().indexOf(q) < 0); });
      });
      if (f.hint) { var h0 = el('<span class="hint"></span>'); h0.textContent = f.hint; wrap.appendChild(h0); }
    } else {
      wrap = el(f.format || (f.presets && f.presets.length) ? '<div class="field"><span></span></div>' : '<label class="field"><span></span></label>');
      $('span', wrap).innerHTML = esc(f.label) + (f.required ? '<em>*</em>' : '');
      var input;
      if (f.type === 'textarea') input = el('<textarea class="input"></textarea>');
      else if (f.type === 'select') {
        input = el('<select class="input"></select>');
        (f.options || []).forEach(function (op) {
          var v = typeof op === 'object' ? op.value : op, l = typeof op === 'object' ? op.label : op;
          var o2 = document.createElement('option'); o2.value = v; o2.textContent = l; input.appendChild(o2);
        });
      } else input = el('<input class="input" type="' + (f.type || 'text') + '">');
      input.name = f.name; input.id = id;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.value !== undefined && f.value !== null) input.value = f.value;
      if (f.type === 'number') input.step = 'any';
      var target = input;
      wrap.appendChild(input);
      if (f.format) { target = chipEditor(input); wrap.insertBefore(formatToolbar(target, { vars: true }), input); }
      if (f.presets && f.presets.length) wrap.appendChild(presetChips(target, f.presets, f.presetJoin));
      if (f.hint) { var h = el('<span class="hint"></span>'); h.textContent = f.hint; wrap.appendChild(h); }
    }
    form.appendChild(wrap);
  });
  var err = el('<div class="small" style="color:var(--bad);min-height:16px"></div>');
  form.appendChild(err);
  return modal({
    title: o.title, desc: o.desc, body: form, wide: o.wide,
    buttons: [{ label: '取消', value: null }, {
      label: o.okLabel || '下一步', cls: o.danger ? 'danger' : 'primary',
      validate: function () {
        for (var i = 0; i < o.fields.length; i++) {
          var f = o.fields[i];
          if (f.type === 'note') continue;
          if (f.type === 'checklist') { if (f.required && !$$('input[data-cl="' + f.name + '"]:checked', form).length) { err.textContent = '請至少勾選一位'; return false; } continue; }
          if (f.required && f.type !== 'checkbox' && !String(form.elements[f.name].value).trim()) { err.textContent = '請填寫「' + f.label + '」'; return false; }
        }
        return true;
      },
      value: function () {
        var out = {};
        o.fields.forEach(function (f) {
          if (f.type === 'note') return;
          if (f.type === 'checklist') { out[f.name] = $$('input[data-cl="' + f.name + '"]:checked', form).map(function (i) { return i.value; }); return; }
          var i = form.elements[f.name]; out[f.name] = f.type === 'checkbox' ? i.checked : i.value;
        });
        return out;
      }
    }]
  });
}

/* ---------- 預製表單（匯款回報、取消候補、取消報名）的內容編輯 ---------- */
var FORM_VAR_NAMES = { pay: '匯款回報', unwait: '取消候補', cancel: '取消報名', consent: '簽署同意書' };

/** 編輯一張表單的標題、按鈕文字、說明、送出後訊息；回傳 {title, button, intro, done} 或 null */
function openFormEditor(f, desc) {
  var fields = [
    { name: 'title', label: '表單標題', required: true, value: f.title },
    { name: 'button', label: '信裡按鈕的文字', required: true, value: f.button, hint: '信件可放 {{' + FORM_VAR_NAMES[f.kind] + '按鈕}}（置中的按鈕）或 {{' + FORM_VAR_NAMES[f.kind] + '連結}}（網址）' },
    { name: 'intro', label: '表單說明（顯示在最上方）', type: 'textarea', format: true, value: f.intro, hint: f.kind === 'consent' ? '可用粗體、顏色、卡片等格式。學員先輸入姓名與身分證字號查到自己的報名，再閱讀並簽署下面兩份同意書' : '可用粗體、顏色、卡片等格式。學員先輸入姓名與身分證字號查到自己的報名，最後一欄固定是「任何想說的話」' },
    { name: 'done', label: '送出後顯示的訊息', type: 'textarea', format: true, value: f.done }
  ];
  if (f.kind === 'consent') {
    fields.push(
      { name: 'guardianTitle', label: '第一份同意書標題', required: true, value: f.guardianTitle },
      { name: 'guardian', label: '第一份同意書內容', type: 'textarea', format: true, value: f.guardian, hint: '可用 {{姓名}}（學員姓名）、{{營隊名稱}}、{{營期}} 等變數。簽名欄與日期由系統加在最後，不用寫在內容裡' },
      { name: 'privacyTitle', label: '第二份同意書標題', required: true, value: f.privacyTitle },
      { name: 'privacy', label: '第二份同意書內容', type: 'textarea', format: true, value: f.privacy }
    );
  }
  return formDialog({ title: '編輯「' + f.name + '」', desc: desc, wide: true, okLabel: '儲存', fields: fields });
}

/* ---------- 日期防呆：開始招生 ≤ 早鳥期限 ≤ 結束招生 ≤ 營期開始 ≤ 營期結束 ---------- */
var DATE_ORDER = [['regStart', '開始招生日期'], ['earlyDeadline', '早鳥期限'], ['regEnd', '預計結束招生日期'], ['start', '營期開始'], ['end', '營期結束']];

/** 檢查一組日期（{regStart:'2027-04-01',...}），有錯回傳說明文字 */
function dateOrderError(d) {
  var list = DATE_ORDER.filter(function (x) { return d[x[0]]; });
  for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
    if (String(d[list[j][0]]).slice(0, 10) < String(d[list[i][0]]).slice(0, 10)) return '「' + list[j][1] + '」不可早於「' + list[i][1] + '」';
  }
  return '';
}

/** 依前後日期自動設定日期選擇器可選範圍，選不到會時光倒流的日子 */
function guardDates(form) {
  function apply() {
    DATE_ORDER.forEach(function (x, i) {
      var inp = form.elements[x[0]];
      if (!inp) return;
      var min = '', max = '';
      DATE_ORDER.slice(0, i).forEach(function (y) { var v = form.elements[y[0]] && form.elements[y[0]].value; if (v && v > min) min = v; });
      DATE_ORDER.slice(i + 1).forEach(function (y) { var v = form.elements[y[0]] && form.elements[y[0]].value; if (v && (!max || v < max)) max = v; });
      inp.min = min; inp.max = max;
    });
  }
  DATE_ORDER.forEach(function (x) { var inp = form.elements[x[0]]; if (inp) inp.addEventListener('change', apply); });
  apply();
}

/* ---------- 信件格式：粗體、顏色、連結、按鈕 ---------- */
/** 預設顏色：在範本寫 [R]文字[/R]（R 紅 O 橙 Y 黃 G 綠 B 藍 P 紫 K 黑），與後端 MAIL_COLORS 相同 */
var FORMAT_COLORS = [['R', '#d32f2f', '紅'], ['O', '#ef6c00', '橙'], ['Y', '#d4a106', '黃'], ['G', '#2e7d32', '綠'], ['B', '#1565c0', '藍'], ['P', '#7b1fa2', '紫'], ['K', '#111111', '黑']];
var MAIL_VARS = ['姓名', '營隊名稱', '營期', '應繳金額', '價格類型', '匯款帳號', '銀行', '分行', '戶名', '帳號', '匯款期限', '已繳金額', '退款金額', '候補順位', '團報名單', '未填同伴', '預留期限', '原因', '原金額', '訊息', '回覆內容', '聯絡人員', '匯款資訊', '退款規定', '飯店資訊', '飯店名稱', '飯店地址', '飯店電話', '房號', '匯款回報按鈕', '匯款回報連結', '取消候補按鈕', '取消候補連結', '取消報名按鈕', '取消報名連結', '簽署同意書按鈕', '簽署同意書連結', '同意書保存期限', '學員專區', '學員專區按鈕', '學員專區連結'];
/** 預覽用的代入值：文字用 OOO、數字用 000 */
var MAIL_SAMPLE = { '姓名': 'OOO', '營隊名稱': 'OOO 營隊', '營期': '[nowrap]0000/00/00（O）～00/00（O）[/nowrap]', '應繳金額': '0,000', '價格類型': 'OOO',
  '匯款帳號': 'OOO銀行（000）OOO分行　戶名：OOO　帳號：000-000-000000', '銀行': 'OOO銀行（000）', '分行': 'OOO分行', '戶名': 'OOO', '帳號': '000-000-000000', '未填同伴': 'OOO', '預留期限': '0000/00/00 00:00', '匯款期限': '0000/00/00 00:00', '已繳金額': '0,000', '退款金額': '0,000', '候補順位': '0',
  '團報名單': 'OOO、OOO', 'Email': 'ooo@example.com', '報名時間': '0000/00/00 00:00', '報名結果': '已報名', '結果說明': '', '目前人數': '已錄取 00 人／上限 00 人', '管理頁按鈕': '[center][button=https://example.com/students.html]到報名與學員管理[/button][/center]', '招生期間': '0000/00/00～0000/00/00', '需要名額': '0', '剩餘名額': '0', '預留人數': '0', '原因': 'OOO', '原金額': '0,000', '訊息': 'OOO', '團報說明': '', '回覆內容': '%%ECHO%%', '聯絡人員': '%%CONTACTS%%', '匯款資訊': '%%PAYINFO%%', '退款規定': '%%REFUND%%', '飯店資訊': '%%HOTEL%%', '飯店名稱': 'OOO 飯店', '飯店地址': 'OO市OO路 000 號', '飯店電話': '00-0000-0000', '房號': '000',
  '匯款回報按鈕': '[center][button=https://example.com/form.html]匯款回報[/button][/center]', '匯款回報連結': 'https://example.com/form.html?f=pay',
  '取消候補按鈕': '[center][button=https://example.com/form.html #6b7280]取消候補[/button][/center]', '取消候補連結': 'https://example.com/form.html?f=unwait',
  '取消報名按鈕': '[center][button=https://example.com/form.html #6b7280]取消報名[/button][/center]', '取消報名連結': 'https://example.com/form.html?f=cancel', '簽署同意書按鈕': '[center][button=https://example.com/consent.html]簽署同意書[/button][/center]', '簽署同意書連結': 'https://example.com/consent.html', '同意書保存期限': '營隊結束後 12 個月（0000/00/00）',
  '學員專區': '%%PORTAL%%', '學員專區按鈕': '[center][button=https://example.com/portal.html]學員專區：查詢報名進度[/button][/center]', '學員專區連結': 'https://example.com/portal.html?p=OOOO' };

/** 預覽用的回覆內容表格（實際信件依專案設定勾選的題目） */
function echoSampleHtml(fields) {
  var rows = fields ? fields.map(function (q) {
    return [q, /身分證|身份證|證號/.test(q) ? 'A000000000' : /日期|生日/.test(q) ? '0000/00/00' : /電話|手機/.test(q) ? '0000-000-000' : /mail|信箱/i.test(q) ? 'ooo@gmail.com' : 'OOO'];
  }) : [['學員姓名', 'OOO'], ['身分證字號', 'A000000000'], ['出生日期', '0000/00/00'], ['家長電話', '0000-000-000']];
  if (!rows.length) return '';
  return '<div style="margin:16px 0 4px;font-weight:700;color:#2f5d62">您填寫的報名資料</div>' +
    '<div style="font-size:13px;color:#6b7280;margin-bottom:8px">請確認以下資料是否正確，如有錯誤請洽籌辦團隊。</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;background:#f9faf8">' +
    rows.map(function (r) {
      return '<tr><td style="padding:8px 12px;border-bottom:1px solid #eef0ee;color:#5b665f;white-space:nowrap">' + esc(r[0]) + '</td><td style="padding:8px 12px;border-bottom:1px solid #eef0ee;color:#1f2937">' + r[1] + '</td></tr>';
    }).join('') + '</table>';
}

/** IG、LINE 連結（與後端 igLink_、lineLink_ 相同） */
function igLink(v) {
  v = String(v || '').trim();
  var m = v.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:\?.*)?$/i) || v.match(/^@?([A-Za-z0-9._]{1,30})$/);
  return m ? { href: 'https://www.instagram.com/' + m[1] + '/', label: 'IG @' + m[1] } : null;
}
function lineLink(v) {
  v = String(v || '').trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(v)) return { href: v, label: 'LINE' };
  var m = v.match(/^@?([A-Za-z0-9._-]{2,40})$/);
  return m ? { href: 'https://line.me/ti/p/' + (v.charAt(0) === '@' ? '@' : '~') + m[1], label: 'LINE ID：' + v } : null;
}

/** {{匯款資訊}} 的預覽（與後端 payInfoHtml_ 相同的卡片列表） */
function payInfoSampleHtml() {
  var rows = [['應繳金額', '0,000 元（OOO）', 'amount'], ['匯款期限', '0000/00/00 00:00', 'deadline'], ['銀行', 'OOO銀行（000）'], ['分行', 'OOO分行'], ['戶名', 'OOO'], ['帳號', '000-000-000000', 'no']];
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:12px 0;border-collapse:separate;border-spacing:0;background:#f6f8f7;border:1px solid #e3e8e5;border-radius:12px">' +
    rows.map(function (r, i) {
      var style = r[2] === 'amount' ? 'font-size:18px;font-weight:700;color:#1f2937' : r[2] === 'deadline' ? 'font-weight:700;color:#b3261e' : r[2] === 'no' ? 'font-weight:700;color:#1f2937;letter-spacing:.5px' : 'color:#1f2937';
      return '<tr><td style="padding:10px 16px;width:84px;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top' + (i ? ';border-top:1px solid #e3e8e5' : '') + '">' + esc(r[0]) + '</td>' +
        '<td style="padding:10px 16px 10px 0;' + style + (i ? ';border-top:1px solid #e3e8e5' : '') + '">' + esc(r[1]) + '</td></tr>';
    }).join('') + '</table>';
}

/** {{退款規定}}（與後端 refundHtml_ 相同）；沒有傳入規定時用示意資料 */
function dayW(ymd) {
  var m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 'OOOO/OO/OO（O）';
  return m[1] + '/' + m[2] + '/' + m[3] + '（' + '日一二三四五六'.charAt(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()) + '）';
}
function refundSampleHtml(r) {
  var sample = !r;
  r = r || { tiers: [{ until: '', pct: 100 }, { until: '', pct: 50 }], note: '自行取消報名者，需自行負擔衍生費用（郵匯費、手續費等）。' };
  var tiers = r.tiers || [];
  if (!tiers.length && !r.note) return sample ? '' : '<div style="font-size:12px;color:#9ca3af">（這個專案還沒設定退款規定，寄出時不會出現；到「專案設定 → 退款規定」設定）</div>';
  var rows = tiers.map(function (t) { return [dayW(t.until) + ' 前取消', t.pct ? '退還 ' + t.pct + '%' : '不予退費']; });
  if (tiers.length && tiers[tiers.length - 1].pct > 0) rows.push([dayW(tiers[tiers.length - 1].until) + ' 之後取消', '不予退費']);
  var td = 'padding:9px 16px;border-top:1px solid #e3e8e5;';
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:12px 0;border-collapse:separate;border-spacing:0;background:#f6f8f7;border:1px solid #e3e8e5;border-radius:12px">' +
    '<tr><td colspan="2" style="padding:10px 16px;font-weight:700;color:#1f2937">退款規定</td></tr>' +
    rows.map(function (x) {
      return '<tr><td style="' + td + 'color:#374151;font-size:14px">' + esc(x[0]) + '</td>' +
        '<td style="' + td + 'text-align:right;white-space:nowrap;font-weight:700;color:' + (x[1] === '不予退費' ? '#6b7280' : '#1f2937') + '">' + esc(x[1]) + '</td></tr>';
    }).join('') +
    (r.note ? '<tr><td colspan="2" style="' + td + 'color:#6b7280;font-size:13px;line-height:1.7">' + mailTextToHtml(esc(r.note)) + '</td></tr>' : '') +
    '</table>';
}

/** {{飯店資訊}}（與後端 hotelHtml_ 相同）；沒有傳入飯店時用示意資料 */
/** {{學員專區}} 方塊（與後端 portalBlockHtml_ 相同）；url 為 '' 表示這個專案的學員專區還沒開放 */
function portalSampleHtml(url, keyLabel) {
  if (url === '') return '<div style="font-size:12px;color:#9ca3af">（這個專案的學員專區還沒開放，寄出時不會出現；到上方「學員專區」開放）</div>';
  url = url || 'https://example.com/portal.html?p=OOOO';
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:12px 0;border-collapse:separate;border-spacing:0;background:#eef4fb;border:1px solid #d3e1f1;border-radius:12px"><tr><td style="padding:16px 18px;color:#1f2937;line-height:1.7">' +
    '<div style="font-size:16px;font-weight:700;color:#1d4f86">學員專區</div>' +
    '<div style="margin-top:4px">登入後可以隨時查看報名進度、繳費資訊、營隊資訊與行前須知。</div>' +
    '<div style="margin-top:2px;color:#4b5563;font-size:13px">登入方式：學員姓名＋' + esc(keyLabel || '身分證字號') + '</div>' +
    '<div style="margin-top:12px"><a href="' + esc(url) + '" style="display:inline-block;padding:10px 22px;border-radius:999px;background:#1d64b5;color:#ffffff;font-weight:700;text-decoration:none">進入學員專區</a></div>' +
    '<div style="margin-top:10px;font-size:12px;color:#6b7280;word-break:break-all">網址：<a href="' + esc(url) + '" style="color:#1d64b5">' + esc(url) + '</a></div>' +
    '</td></tr></table>';
}

function hotelSampleHtml(h) {
  if (h && !h.name) return '<div style="font-size:12px;color:#9ca3af">（這個專案還沒填飯店資訊，寄出時不會出現；到「專案設定 → 飯店資訊」填寫）</div>';
  h = h || { name: 'OOO 飯店', address: 'OO市OO路 000 號', phone: '00-0000-0000', checkin: '0/00 15:00', checkout: '0/00 11:00', url: '', note: '' };
  var rows = [['飯店', '<b style="font-size:16px">' + esc(h.name) + '</b>'],
    ['地址', esc(h.address) + '　<a href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(h.name + ' ' + h.address) + '" style="color:#1565c0;white-space:nowrap">地圖</a>'],
    ['電話', '<a href="tel:' + esc(String(h.phone).replace(/[^\d+#]/g, '')) + '" style="color:#1f2937;text-decoration:none">' + esc(h.phone) + '</a>']];
  if (h.checkin) rows.push(['入住', esc(h.checkin)]);
  if (h.checkout) rows.push(['退房', esc(h.checkout)]);
  if (h.url) rows.push(['網站', '<a href="' + esc(h.url) + '" style="color:#1565c0">飯店網站</a>']);
  if (h.note) rows.push(['說明', mailTextToHtml(esc(stripNotes(h.note)))]);
  return '<div style="margin:12px 0"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;background:#f6f8f7;border:1px solid #e3e8e5;border-radius:12px">' +
    rows.map(function (r, i) {
      var bt = i ? ';border-top:1px solid #e3e8e5' : '';
      return '<tr><td style="padding:10px 16px;width:56px;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top' + bt + '">' + r[0] + '</td>' +
        '<td style="padding:10px 16px 10px 0;color:#1f2937;line-height:1.7' + bt + '">' + r[1] + '</td></tr>';
    }).join('') + '</table></div>';
}

/** 聯絡人員（與後端 contactsHtml_ 相同）；沒有傳入名單時用示意資料 */
function contactsSampleHtml(list) {
  list = (list || [{ title: '總召', name: 'OOO', phone: '0900-000-000', email: 'ooo@gmail.com', ig: '@ooo_camp', line: 'ooo' }]).filter(function (c) { return c && (c.name || c.title); });
  if (!list.length) return '';
  var a = 'color:#1565c0;text-decoration:none';
  return '<div style="margin:16px 0 4px;font-weight:700;color:#2f5d62">聯絡人員</div>' +
    '<div style="font-size:13px;line-height:1.7;background:#f9faf8;border-radius:8px">' + list.map(function (c) {
      var ways = [];
      if (c.phone) ways.push('<span style="color:#1f2937">' + esc(c.phone) + '</span>');
      if (c.email) ways.push('<span style="' + a + '">' + esc(c.email) + '</span>');
      var ig = c.ig ? igLink(c.ig) : null, ln = c.line ? lineLink(c.line) : null;
      if (ig) ways.push('<span style="' + a + '">' + esc(ig.label) + '</span>');
      if (ln) ways.push('<span style="' + a + '">' + esc(ln.label) + '</span>');
      if (c.link && /^https?:\/\//i.test(c.link)) ways.push('<span style="' + a + '">' + esc(String(c.link).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')) + '</span>');
      return '<div style="padding:8px 12px;border-bottom:1px solid #eef0ee">' + (c.title && c.name ? '<span style="color:#5b665f;margin-right:8px">' + esc(c.title) + '</span>' : '') +
        '<b style="color:#1f2937">' + esc(c.name || c.title) + '</b>' + (ways.length ? '<div style="margin-top:2px;word-break:break-all">' + ways.join('<span style="color:#c4c9c5">　｜　</span>') + '</div>' : '') + '</div>';
    }).join('') + '</div>';
}

/** 在游標處插入，或把選取的文字包起來 */
function wrapSelection(ta, before, after, placeholder) {
  var a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
  var mid = v.slice(a, b) || placeholder || '';
  ta.value = v.slice(0, a) + before + mid + after + v.slice(b);
  ta.focus();
  ta.selectionStart = a + before.length;
  ta.selectionEnd = a + before.length + mid.length;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 把選取範圍內的每一行加上條列符號（沒選取就是游標所在行） */
function prefixLines(ta, mark) {
  var v = ta.value, a = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
  var z = v.indexOf('\n', Math.max(ta.selectionEnd - (ta.selectionEnd > ta.selectionStart ? 1 : 0), ta.selectionStart));
  if (z < 0) z = v.length;
  var block = v.slice(a, z).split('\n').map(function (ln) { return mark + ln.replace(/^[ \t\u3000]*(?:[-–]\s+|[•・]\s*|\[[ xXvV✓]?\]\s+)/, ''); }).join('\n');
  ta.value = v.slice(0, a) + block + v.slice(z);
  ta.focus();
  ta.selectionStart = a; ta.selectionEnd = a + block.length;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function safeMailUrl(u) {
  u = String(u || '').trim();
  return /^(https?:\/\/|mailto:)[^\s"'<>\]]+$/i.test(u) ? u : '';
}

/** 色號欄位：調色盤＋可直接輸入 #RRGGBB，兩邊同步 */
function hexField(cls, val) {
  return '<span class="fmt-hex ' + cls + '" title="色號，例如 #1a73e8"><input type="color" value="' + (normHex(val) || '#2f5d62') + '" aria-label="選顏色">' +
    '<input class="fmt-hexin" value="' + esc(val) + '" placeholder="' + (val ? '#000000' : '色號（可不填）') + '" maxlength="7" spellcheck="false" aria-label="色號"></span>';
}
function bindHexField(w) {
  var pick = $('input[type=color]', w), txt = $('.fmt-hexin', w);
  pick.addEventListener('input', function () { txt.value = pick.value; txt.classList.remove('bad'); });
  txt.addEventListener('input', function () {
    var c = normHex(txt.value);
    txt.classList.toggle('bad', !!txt.value.trim() && !c);
    if (c) pick.value = c;
  });
}

/** 信件內容上方的工具列（opts.vars=true 時多一個插入變數選單） */
function formatToolbar(ta, opts) {
  opts = opts || {};
  var bar = el('<div class="fmt-bar"><div class="fmt-row">' +
    '<button type="button" class="fmt-btn" data-f="bold" title="粗體"><b>B</b></button><span class="fmt-sep"></span>' +
    FORMAT_COLORS.map(function (c) { return '<button type="button" class="fmt-swatch" data-color="' + c[0] + '" title="' + c[2] + '（[' + c[0] + ']文字[/' + c[0] + ']）" style="background:' + c[1] + '">' + c[0] + '</button>'; }).join('') +
    '<span class="fmt-sep"></span>' + hexField('fmt-hex-main', '#c62828') +
    '<button type="button" class="fmt-btn" data-f="color" title="[#色號]文字[/#]">文字色</button><button type="button" class="fmt-btn" data-f="bg" title="[hl=#色號]文字[/hl]">底色</button><span class="fmt-sep"></span>' +
    '<button type="button" class="fmt-btn" data-f="hl" title="螢光標記 ==文字==" style="background:#fde68a;color:#111">螢光</button>' +
    '<button type="button" class="fmt-btn" data-f="ul" title="條列：行首「- 」">• 條列</button><button type="button" class="fmt-btn" data-f="sub" title="子項目：行首「  - 」">– 子項</button><button type="button" class="fmt-btn" data-f="cb" title="核取方塊：行首「[ ] 」，信件顯示 ☐，學員專區可以打勾">☐ 核取</button>' +
    '<button type="button" class="fmt-btn" data-f="center" title="[center]文字[/center]">置中</button>' +
    '<button type="button" class="fmt-btn fmt-card" data-f="card" title="卡片：[card]文字[/card]，淡色底、粗體色字的提醒方塊；用左邊的色號或顏色代號換顏色">卡片</button>' +
    '<select class="fmt-size" aria-label="字級" title="字級：[大]文字[/大]"><option value="">字級…</option><option>特大</option><option>大</option><option>中</option><option>小</option></select>' +
    '<button type="button" class="fmt-btn" data-f="hr" title="分隔線：一行只有 ---">分隔線</button><span class="fmt-sep"></span>' +
    '<button type="button" class="fmt-btn" data-f="link">連結</button><button type="button" class="fmt-btn" data-f="button">按鈕</button>' +
    '<button type="button" class="fmt-btn" data-f="img" title="圖片：[img]https://圖片網址[/img]">圖片</button><button type="button" class="fmt-btn" data-f="map" title="地點：[map]地址[/map]">地點</button><button type="button" class="fmt-btn" data-f="table" title="表格：每行 | 儲存格 | 儲存格 |">表格</button>' +
    '<span class="fmt-sep"></span><button type="button" class="fmt-btn fmt-note" data-f="note" title="內部備註 [備註]…[/備註]：給之後維護的人看，寄出時自動拿掉">備註</button>' +
    (opts.vars ? '<span class="fmt-sep"></span><select class="fmt-var"><option value="">插入變數…</option>' + MAIL_VARS.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('') + '</select>' : '') +
    '</div><div class="fmt-link hidden">' +
    '<div class="seg sm"><label><input type="radio" name="fmt-kind" value="link" checked><span>文字連結</span></label><label><input type="radio" name="fmt-kind" value="button"><span>按鈕</span></label></div>' +
    '<input class="input" data-k="text" placeholder="顯示文字，例如：前往繳費"><input class="input" data-k="url" placeholder="網址 https://…">' + hexField('fmt-hex-link', '') +
    '<button type="button" class="btn sm primary" data-f="insert">插入</button><button type="button" class="btn sm ghost" data-f="close">取消</button>' +
    '<div class="small fmt-err"></div></div>' +
    '<div class="fmt-link fmt-ins hidden"><b class="fmt-ins-title"></b><input class="input" data-k="a"><input class="input" data-k="b">' +
    '<button type="button" class="btn sm primary" data-f="ins-ok">插入</button><button type="button" class="btn sm ghost" data-f="ins-close">取消</button>' +
    '<div class="small muted fmt-ins-tip"></div><div class="small fmt-err"></div></div><div class="small fmt-err fmt-hex-err"></div></div>');
  var panel = $('.fmt-link', bar);
  var ins = $('.fmt-ins', bar), insKind = '';
  var INS = {
    img: { title: '插入圖片', a: '圖片網址 https://…', b: '圖片說明（選填）', tip: '可貼 Google 雲端硬碟的分享連結（檔案要設成「知道連結的任何人都能查看」），或其他 https 開頭的圖片網址。' },
    map: { title: '插入地點', a: '地點名稱或地址，例如：台北車站東三門', b: 'Google 地圖分享網址（選填）', tip: '會顯示成地點卡片與「在 Google 地圖開啟」連結；學員專區還會顯示地圖。' },
    table: { title: '插入表格', a: '欄數（2–6）', b: '列數（不含標題列，1–20）', tip: '插入後直接改文字：每行一列，儲存格用「|」分開，第一行是標題列。' }
  };
  function openIns(kind) {
    insKind = kind; panel.classList.add('hidden'); ins.classList.remove('hidden');
    var c = INS[kind];
    $('.fmt-ins-title', ins).textContent = c.title;
    $('[data-k=a]', ins).placeholder = c.a; $('[data-k=b]', ins).placeholder = c.b;
    $('[data-k=a]', ins).value = kind === 'table' ? '2' : (kind === 'map' ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : '');
    $('[data-k=b]', ins).value = kind === 'table' ? '3' : '';
    $('.fmt-ins-tip', ins).textContent = c.tip; $('.fmt-err', ins).textContent = '';
    $('[data-k=a]', ins).focus();
  }
  // 圖片、地點、表格自成一段：前後不是換行就補上
  function insertBlock(code) {
    var v = ta.value, a = ta.selectionStart, z = ta.selectionEnd;
    var pre = a > 0 && v[a - 1] !== '\n' ? '\n' : '', post = z < v.length && v[z] !== '\n' ? '\n' : '';
    ta.value = v.slice(0, a) + pre + code + post + v.slice(z);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = a + pre.length + code.length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ins.classList.add('hidden');
  }
  function insOk() {
    var A = $('[data-k=a]', ins).value.trim(), B = $('[data-k=b]', ins).value.trim(), err = $('.fmt-err', ins);
    if (insKind === 'img') {
      if (!/^https:\/\/[^\s"'<>\[\]]+$/.test(A)) { err.textContent = '圖片網址需以 https:// 開頭，且不能有空白'; return; }
      insertBlock('[img' + (B ? '=' + B.replace(/[\[\]]/g, '') : '') + ']' + A + '[/img]');
    }
    if (insKind === 'map') {
      if (!A) { err.textContent = '請填地點名稱或地址'; return; }
      if (B && !/^https?:\/\/[^\s"'<>\]]+$/.test(B)) { err.textContent = '地圖網址需以 https:// 開頭，且不能有空白'; return; }
      insertBlock('[map' + (B ? '=' + B : '') + ']' + A.replace(/[\[\]]/g, '') + '[/map]');
    }
    if (insKind === 'table') {
      var c = Math.min(6, Math.max(2, parseInt(A, 10) || 2)), r = Math.min(20, Math.max(1, parseInt(B, 10) || 3)), rows = [], i, cells;
      cells = []; for (i = 0; i < c; i++) cells.push(i ? '說明' : '項目'); rows.push('| ' + cells.join(' | ') + ' |');
      cells = []; for (i = 0; i < c; i++) cells.push('內容');
      for (i = 0; i < r; i++) rows.push('| ' + cells.join(' | ') + ' |');
      insertBlock(rows.join('\n'));
    }
  }
  ins.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); insOk(); } });
  bindHexField($('.fmt-hex-main', bar)); bindHexField($('.fmt-hex-link', bar));
  function mainHex() {
    var c = normHex($('.fmt-hex-main .fmt-hexin', bar).value);
    $('.fmt-hex-err', bar).textContent = c ? '' : '色號格式是 # 加 6 碼（例如 #1a73e8）或 3 碼（例如 #f00）';
    return c;
  }
  function openLink(kind) {
    panel.classList.remove('hidden');
    $('input[value=' + kind + ']', panel).checked = true;
    var sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    $('[data-k=text]', panel).value = sel;
    $('[data-k=url]', panel).value = '';
    $('.fmt-hex-link .fmt-hexin', panel).value = '';
    $('.fmt-err', panel).textContent = '';
    $(sel ? '[data-k=url]' : '[data-k=text]', panel).focus();
  }
  bar.addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });   // 不讓按鈕搶走選取範圍
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var f = b.getAttribute('data-f'), color = b.getAttribute('data-color');
    if (f === 'bold') wrapSelection(ta, '**', '**', '粗體文字');
    if (f === 'hl') wrapSelection(ta, '==', '==', '標記文字');
    if (f === 'center') wrapSelection(ta, '[center]', '[/center]', '置中文字');
    if (f === 'card') {
      // 卡片用目前選的色號；預設紅色時直接寫 [card]
      var cc = mainHex(); if (!cc) return;
      wrapSelection(ta, cc === '#c62828' ? '[card]' : '[card=' + cc + ']', '[/card]', '請務必於期限前完成匯款');
    }
    if (f === 'note') {
      // 沒選取文字時，備註自成一行，比較好認
      var v1 = ta.value, a1 = ta.selectionStart, z1 = ta.selectionEnd;
      if (a1 === z1) {
        var pre1 = a1 > 0 && v1[a1 - 1] !== '\n' ? '\n' : '', post1 = v1[a1] === '\n' || a1 === v1.length ? '' : '\n', ph = '給之後維護的人看的說明';
        ta.value = v1.slice(0, a1) + pre1 + '[備註]' + ph + '[/備註]' + post1 + v1.slice(a1);
        ta.focus();
        ta.selectionStart = a1 + pre1.length + 4; ta.selectionEnd = ta.selectionStart + ph.length;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      } else wrapSelection(ta, '[備註]', '[/備註]', '');
    }
    if (f === 'hr') {
      // 分隔線要獨立一行：前後不是換行就補上
      var v0 = ta.value, a0 = ta.selectionStart, z0 = ta.selectionEnd;
      var pre = a0 > 0 && v0[a0 - 1] !== '\n' ? '\n' : '', post = v0[z0] === '\n' ? '' : '\n';
      ta.value = v0.slice(0, a0) + pre + '---' + post + v0.slice(z0);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = a0 + pre.length + 3 + post.length;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (f === 'ul' || f === 'sub' || f === 'cb') prefixLines(ta, f === 'ul' ? '- ' : f === 'sub' ? '  - ' : '[ ] ');
    if (color) wrapSelection(ta, '[' + color + ']', '[/' + color + ']', '彩色文字');
    if (f === 'color' || f === 'bg') {
      var hx = mainHex();
      if (hx && f === 'color') wrapSelection(ta, '[' + hx + ']', '[/#]', '彩色文字');
      if (hx && f === 'bg') wrapSelection(ta, '[hl=' + hx + ']', '[/hl]', '標記文字');
    }
    if (f === 'link' || f === 'button') { ins.classList.add('hidden'); openLink(f); }
    if (f === 'img' || f === 'map' || f === 'table') openIns(f);
    if (f === 'ins-ok') insOk();
    if (f === 'ins-close') ins.classList.add('hidden');
    if (f === 'close') panel.classList.add('hidden');
    if (f === 'insert') {
      var kind = $('input[name=fmt-kind]:checked', panel).value;
      var text = $('[data-k=text]', panel).value.trim();
      var url = safeMailUrl($('[data-k=url]', panel).value);
      if (!url) { $('.fmt-err', panel).textContent = '網址需以 https://、http:// 或 mailto: 開頭，且不能有空白'; return; }
      var rawHex = $('.fmt-hex-link .fmt-hexin', panel).value.trim(), lc = normHex(rawHex);
      if (rawHex && !lc) { $('.fmt-err', panel).textContent = '色號格式是 # 加 6 碼（例如 #1a73e8）或 3 碼；不填就用預設顏色'; return; }
      var a = ta.selectionStart, z = ta.selectionEnd, v = ta.value;
      var code = '[' + kind + '=' + url + (lc ? ' ' + lc : '') + ']' + (text || (kind === 'button' ? '前往' : url)) + '[/' + kind + ']';
      ta.value = v.slice(0, a) + code + v.slice(z);
      ta.selectionStart = ta.selectionEnd = a + code.length;
      ta.focus();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      panel.classList.add('hidden');
    }
  });
  $('.fmt-hex-main .fmt-hexin', bar).addEventListener('input', function () { $('.fmt-hex-err', bar).textContent = ''; });
  var sz = $('.fmt-size', bar);
  sz.addEventListener('change', function () { if (sz.value) wrapSelection(ta, '[' + sz.value + ']', '[/' + sz.value + ']', sz.value + '字'); sz.value = ''; });
  var vs = $('.fmt-var', bar);
  if (vs) vs.addEventListener('change', function () { if (vs.value) wrapSelection(ta, '{{' + vs.value + '}}', '', ''); vs.value = ''; });
  return bar;
}

/**
 * 變數方塊編輯器：{{營隊名稱}} 這類變數顯示成一整塊方塊，不會打錯或只刪掉一半。
 * 原本的 textarea／input 隱藏起來、值隨時同步（表單照常讀取）。
 * 回傳的物件跟 textarea 一樣有 value、selectionStart、selectionEnd、focus，工具列與常用清單可以直接使用。
 */
var VAR_TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
function chipEditor(ta) {
  var single = ta.tagName === 'INPUT';
  var ed = el('<div class="chip-editor input' + (single ? ' single' : '') + '" contenteditable="true" spellcheck="false" role="textbox"></div>');
  if (!single) ed.setAttribute('aria-multiline', 'true');
  if (ta.placeholder) ed.setAttribute('data-ph', ta.placeholder);
  if (ta.disabled || ta.readOnly) ed.setAttribute('contenteditable', 'false');
  ta.parentNode.insertBefore(ed, ta.nextSibling);
  ta.classList.add('chip-src');
  var saved = null, composing = false;

  function known(name) { return MAIL_VARS.indexOf(name) >= 0 || MAIL_SAMPLE[name] !== undefined; }
  function chip(name) {
    var c = document.createElement('span');
    c.className = 'var-chip' + (known(name) ? '' : ' unknown');
    c.setAttribute('contenteditable', 'false');
    c.setAttribute('data-var', name);
    c.textContent = name;
    c.title = known(name) ? '變數：寄信時換成實際的「' + name + '」' : '系統沒有「' + name + '」這個變數，寄出時會照原樣顯示';
    return c;
  }
  function serialize(node) {
    var out = '';
    Array.prototype.forEach.call(node.childNodes, function (n) {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeType !== 1) return;
      else if (n.hasAttribute('data-var')) out += '{{' + n.getAttribute('data-var') + '}}';
      else if (n.nodeName === 'BR') out += n.hasAttribute('data-end') ? '' : '\n';
      else {
        if (/^(DIV|P)$/.test(n.nodeName) && out && !/\n$/.test(out)) out += '\n';
        out += serialize(n);
      }
    });
    return single ? out.replace(/\n/g, ' ') : out;
  }
  function render(v) {
    ed.textContent = '';
    var last = 0, m;
    VAR_TOKEN_RE.lastIndex = 0;
    while ((m = VAR_TOKEN_RE.exec(v))) {
      if (m.index > last) ed.appendChild(document.createTextNode(v.slice(last, m.index)));
      ed.appendChild(chip(m[1].trim()));
      last = m.index + m[0].length;
    }
    if (last < v.length) ed.appendChild(document.createTextNode(v.slice(last)));
    if (!single) { var br = document.createElement('br'); br.setAttribute('data-end', ''); ed.appendChild(br); }
    ed.classList.toggle('is-empty', !v);
  }
  function offsetOf(container, offset) {
    var r = document.createRange();
    r.setStart(ed, 0);
    try { r.setEnd(container, offset); } catch (e) { return serialize(ed).length; }
    var tmp = document.createElement('div');
    tmp.appendChild(r.cloneContents());
    return serialize(tmp).length;
  }
  function inside() {
    var sel = window.getSelection();
    return sel && sel.rangeCount && ed.contains(sel.getRangeAt(0).startContainer) ? sel : null;
  }
  function offsets() {
    var sel = inside();
    if (!sel) { var n = serialize(ed).length; return saved ? [Math.min(saved[0], n), Math.min(saved[1], n)] : [n, n]; }
    var r = sel.getRangeAt(0);
    return [offsetOf(r.startContainer, r.startOffset), offsetOf(r.endContainer, r.endOffset)];
  }
  function tokenLen(n) {
    if (n.nodeType === 3) return n.nodeValue.length;
    if (n.hasAttribute && n.hasAttribute('data-var')) return n.getAttribute('data-var').length + 4;
    return 0;
  }
  function posAt(off) {
    var kids = ed.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 1 && n.hasAttribute('data-end')) return [ed, i];
      var len = tokenLen(n);
      if (n.nodeType === 3) { if (off <= len) return [n, off]; off -= len; continue; }
      if (off <= 0) return [ed, i];
      if (off < len) return [ed, i + 1];
      off -= len;
    }
    return [ed, kids.length];
  }
  function setCaret(a, b) {
    saved = [a, b === undefined ? a : b];
    if (document.activeElement !== ed) return;
    var sel = window.getSelection(), r = document.createRange();
    var pa = posAt(saved[0]), pb = posAt(saved[1]);
    r.setStart(pa[0], pa[1]); r.setEnd(pb[0], pb[1]);
    sel.removeAllRanges(); sel.addRange(r);
  }
  function sync() { ta.value = serialize(ed); ed.classList.toggle('is-empty', !ta.value); }
  function clean() {
    var ok = Array.prototype.every.call(ed.childNodes, function (n, i) {
      if (n.nodeType === 3) return !/\{\{\s*[^{}]+?\s*\}\}/.test(n.nodeValue);
      return n.nodeType === 1 && (n.hasAttribute('data-var') || (n.hasAttribute('data-end') && i === ed.childNodes.length - 1));
    }) && (single || (ed.lastChild && ed.lastChild.nodeType === 1 && ed.lastChild.hasAttribute('data-end')));
    if (ok) return;
    var o = offsets();
    render(serialize(ed));
    setCaret(o[0], o[1]);
  }
  function insertText(t) {
    var o = offsets(), v = serialize(ed);
    render(v.slice(0, o[0]) + t + v.slice(o[1]));
    setCaret(o[0] + t.length);
    sync();
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  }

  ed.addEventListener('compositionstart', function () { composing = true; });
  ed.addEventListener('compositionend', function () { composing = false; sync(); clean(); ed.dispatchEvent(new Event('input', { bubbles: true })); });
  ed.addEventListener('input', function (e) { if (composing || e.isComposing) return; sync(); clean(); });
  ed.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); if (!single) insertText('\n'); }
  });
  ed.addEventListener('paste', function (e) {
    e.preventDefault();
    var t = (e.clipboardData || window.clipboardData).getData('text');
    insertText(single ? t.replace(/\s*\n\s*/g, ' ') : t.replace(/\r\n?/g, '\n'));
  });
  ed.addEventListener('drop', function (e) { e.preventDefault(); });
  ed.addEventListener('blur', function () { saved = offsets(); });
  document.addEventListener('selectionchange', function onSel() {
    if (!ed.isConnected) { document.removeEventListener('selectionchange', onSel); return; }
    if (inside()) saved = offsets();
  });
  // 點方塊時把游標放到方塊後面
  ed.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('.var-chip');
    if (!c) return;
    var r = document.createRange(); r.setStartAfter(c); r.collapse(true);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  });
  render(ta.value);

  return {
    el: ed, source: ta, isChipEditor: true,
    get value() { return serialize(ed); },
    set value(v) { render(String(v === undefined || v === null ? '' : v)); sync(); },
    get selectionStart() { return offsets()[0]; },
    set selectionStart(v) { var o = offsets(); setCaret(v, Math.max(v, o[1])); },
    get selectionEnd() { return offsets()[1]; },
    set selectionEnd(v) { var o = offsets(); setCaret(Math.min(o[0], v), v); },
    setSelectionRange: function (a, b) { setCaret(a, b); },
    focus: function () { var s = saved; ed.focus(); if (s) setCaret(s[0], s[1]); },
    dispatchEvent: function (e) { sync(); return ed.dispatchEvent(e); }
  };
}

/** 單獨的「插入變數」選單（例如主旨欄） */
function varPicker(target) {
  var s = el('<select class="fmt-var sm" aria-label="插入變數"><option value="">插入變數…</option>' + MAIL_VARS.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('') + '</select>');
  s.addEventListener('mousedown', function () { /* 保留游標位置 */ });
  s.addEventListener('change', function () { if (s.value) wrapSelection(target, '{{' + s.value + '}}', '', ''); s.value = ''; });
  return s;
}

/** 與後端 formatMarkup_ 相同的轉換，給編輯時即時預覽用 */
/* 以下兩個函式與後端 Mail.gs 相同（預覽與實際信件一致） */
var MAIL_SIZES = { '特大': 24, '大': 19, '中': 16, '小': 12 };
var DEFAULT_SIGNATURE = '{{營隊名稱}} 籌辦團隊 敬上';
var MAIL_COLOR_CODES = { R: '#d32f2f', O: '#ef6c00', Y: '#d4a106', G: '#2e7d32', B: '#1565c0', P: '#7b1fa2', K: '#111111' };
var HEX_RE = '#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})';

/** 色號 #RGB 或 #RRGGBB → 小寫 #rrggbb；不合法回傳空字串 */
function normHex(v) {
  v = String(v || '').trim().replace(/^#?/, '#');
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return '';
  if (v.length === 4) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  return v.toLowerCase();
}

/** 按鈕底色夠淺就用黑字，否則用白字 */
function textOn(hex) {
  hex = normHex(hex);
  var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#111111' : '#ffffff';
}

var CARD_COLOR = '#b3261e';
/** 卡片底色：顏色和白色混合 */
function tint(hex, ratio) {
  hex = normHex(hex) || CARD_COLOR;
  var out = '#';
  for (var i = 1; i < 7; i += 2) { var v = Math.round(parseInt(hex.substr(i, 2), 16) * ratio + 255 * (1 - ratio)); out += ('0' + v.toString(16)).slice(-2); }
  return out;
}

/** 表格：每行以「|」開頭，儲存格用「|」分隔；第一行是標題列；|---|---| 這種分隔行會略過 */
var TABLE_ROW_RE = /^\s*\|(.*?)\|?\s*$/;
var TABLE_SEP_RE = /^\s*\|?[\s:|-]*-[\s:|-]*$/;
function mdTable(rows) {
  var n = 0;
  rows = rows.map(function (r) { var c = r.split('|'); n = Math.max(n, c.length); return c; });
  var cell = 'border:1px solid #e5e7eb;padding:8px 10px;text-align:left;vertical-align:top';
  return '<div style="overflow-x:auto;margin:10px 0"><table style="border-collapse:collapse;width:100%;font-size:14px;line-height:1.6">' + rows.map(function (r, i) {
    var tag = i ? 'td' : 'th', out = '<tr>';
    for (var k = 0; k < n; k++) out += '<' + tag + ' style="' + cell + (i ? '' : ';background:#f3f4f6;font-weight:700') + '">' + String(r[k] === undefined ? '' : r[k]).trim() + '</' + tag + '>';
    return out + '</tr>';
  }).join('') + '</table></div>';
}

/** Google 雲端硬碟的分享連結換成可以直接顯示的圖片網址（檔案要設成「知道連結的人都能查看」） */
function driveImg(url) {
  var m = String(url).match(/^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&(?:amp;)?)?id=)([\w-]{20,})/);
  return m ? 'https://drive.google.com/thumbnail?id=' + m[1] + '&amp;sz=w1600' : url;
}

/** 已跳脫的文字還原成原字（地圖搜尋用） */
function unescHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function formatMarkup(html) {
  var out = String(html || '');
  for (var i = 0; i < 3; i++) {   // 允許粗體與顏色互相包住
    out = out.replace(/\[([ROYGBPK])\]([\s\S]*?)\[\/\1\]/g, function (_, k, t) { return '<span style="color:' + MAIL_COLOR_CODES[k] + '">' + t + '</span>'; });
    out = out.replace(new RegExp('\\[color=(' + HEX_RE + ')\\]([\\s\\S]*?)\\[\\/color\\]', 'g'), function (_, c, t) { return '<span style="color:' + normHex(c) + '">' + t + '</span>'; });
    // 色號簡寫 [#1a73e8]文字[/#]，由內往外處理
    out = out.replace(new RegExp('\\[(' + HEX_RE + ')\\]((?:(?!\\[#[0-9a-fA-F])[\\s\\S])*?)\\[\\/#\\]', 'g'), function (_, c, t) { return '<span style="color:' + normHex(c) + '">' + t + '</span>'; });
    out = out.replace(new RegExp('\\[hl=(' + HEX_RE + ')\\]([\\s\\S]*?)\\[\\/hl\\]', 'g'), function (_, c, t) { return '<span style="background:' + normHex(c) + ';padding:0 2px;border-radius:3px">' + t + '</span>'; });
  }
  // 圖片 [img]https://網址[/img]、[img=說明文字]https://網址[/img]：只接受 https，雲端硬碟分享連結會自動轉換
  out = out.replace(/\[img(?:=([^\]]*))?\]\s*(https:\/\/[^\s"'<>\[\]]+)\s*\[\/img\]/g, function (_, cap, url) {
    cap = String(cap || '').trim();
    return '<div style="margin:12px 0;text-align:center"><img src="' + driveImg(url) + '" alt="' + cap + '" style="display:inline-block;max-width:100%;height:auto;border-radius:10px">' +
      (cap ? '<div style="font-size:13px;color:#6b7280;margin-top:4px">' + cap + '</div>' : '') + '</div>';
  });
  // 地點 [map]地址或地點名稱[/map]、[map=Google 地圖分享網址]顯示名稱[/map]：地點卡片＋「在 Google 地圖開啟」
  out = out.replace(/\[map(?:=(https?:\/\/[^\]\s"'<>]+))?\]([\s\S]*?)\[\/map\]/g, function (_, url, name) {
    name = name.replace(/<br>/g, ' ').trim();
    var q = encodeURIComponent(unescHtml(name));
    if (!q) return '';
    return '<div data-map="' + q + '" style="margin:12px 0;padding:14px 16px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc">' +
      '<div style="font-weight:700;line-height:1.6">📍 ' + name + '</div>' +
      '<a href="' + (url || 'https://www.google.com/maps/search/?api=1&amp;query=' + q) + '" style="display:inline-block;margin-top:6px;color:#2f5d62;font-weight:700;text-decoration:underline">在 Google 地圖開啟</a></div>';
  });
  // 連結與按鈕：只接受 http、https、mailto；網址後可加空白與色號，例如 [button=https://… #c62828]
  out = out.replace(new RegExp('\\[(link|button)=((?:https?:\\/\\/|mailto:)[^\\]\\s"\'<>]+)(?: +(' + HEX_RE + '))?\\]([\\s\\S]*?)\\[\\/\\1\\]', 'g'), function (_, kind, url, color, text) {
    text = text || url;
    color = normHex(color) || '#2f5d62';
    if (kind === 'link') return '<a href="' + url + '" style="color:' + color + ';text-decoration:underline">' + text + '</a>';
    return '<a href="' + url + '" style="display:inline-block;margin:6px 0;background:' + color + ';color:' + textOn(color) + ';padding:10px 24px;border-radius:999px;text-decoration:none;font-weight:700">' + text + '</a>';
  });
  for (var j = 0; j < 3; j++) {
    out = out.replace(/\[(特大|大|中|小)\]([\s\S]*?)\[\/\1\]/g, function (_, k, t) { return '<span style="font-size:' + MAIL_SIZES[k] + 'px;line-height:1.5">' + t + '</span>'; });
  }
  out = out.replace(/==([^=\n][\s\S]*?)==/g, '<span style="background:#fde68a;padding:0 2px;border-radius:3px">$1</span>');
  out = out.replace(new RegExp('(?:<br>)?\\[card(?:=([ROYGBPK]|' + HEX_RE + '))?\\]([\\s\\S]*?)\\[\\/card\\](?:<br>)?', 'g'), function (_, c, t) {
    var col = c ? (MAIL_COLOR_CODES[c] || normHex(c)) : CARD_COLOR;
    return '<div style="margin:14px 0;padding:16px 20px;border-radius:12px;background:' + tint(col, 0.1) + ';color:' + col + ';font-weight:700;line-height:1.8">' + t.replace(/^(<br>)+|(<br>)+$/g, '') + '</div>';
  });
  out = out.replace(/\[center\]([\s\S]*?)\[\/center\]/g, '<div style="text-align:center">$1</div>');
  out = out.replace(/\[nowrap\]([\s\S]*?)\[\/nowrap\]/g, '<span style="white-space:nowrap">$1</span>');
  return out.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>');
}

/** 已跳脫的信件文字 → HTML：先處理條列與換行，再套用粗體、顏色等格式 */
/** 區塊（卡片、置中、表格、分隔線、條列）前後多出來的 <br> 會變成一整行空白，拿掉 */
function blockBr(html) {
  return String(html || '').replace(/(?:<br>)+(?=<(?:div|table|hr|ul)\b)/g, '').replace(/(<\/(?:div|table|ul)>|<hr[^>]*>)(?:<br>)+/g, '$1');
}

function mailTextToHtml(text) {
  var html = '', list = null, lastBlock = false, table = null;
  function flush() {
    if (table) { html += mdTable(table); table = null; lastBlock = true; }
    if (!list) return;
    html += '<ul style="margin:6px 0;padding-left:22px">' + list.map(function (it) {
      return '<li style="margin:3px 0' + (it.text === null ? ';list-style:none' : '') + '">' + (it.text || '') +
        (it.subs.length ? '<ul style="list-style:none;margin:2px 0;padding-left:2px">' + it.subs.map(function (t) { return '<li style="margin:2px 0">– ' + t + '</li>'; }).join('') + '</ul>' : '') + '</li>';
    }).join('') + '</ul>';
    list = null;
    lastBlock = true;
  }
  String(text || '').split('\n').forEach(function (ln) {
    var tr = ln.match(TABLE_ROW_RE);
    if (tr) {
      if (table && TABLE_SEP_RE.test(ln)) return;
      if (!table) flush();
      table = table || [];
      table.push(tr[1]);
      return;
    }
    if (table) flush();
    if (/^\s*(?:-{3,}|\[hr\])\s*$/.test(ln)) {
      flush();
      html += '<hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0">';
      lastBlock = true;
      return;
    }
    // 核取方塊：行首 [ ] 或 [x]，信件顯示 ☐／☑，學員專區可以打勾
    var cb = ln.match(/^\s*\[([ xXvV✓]?)\]\s+(.*)$/);
    if (cb) {
      flush();
      var on = !!cb[1].trim();
      html += '<div data-cb="' + (on ? 1 : 0) + '" style="margin:2px 0;padding-left:1.5em;text-indent:-1.5em;line-height:1.75"><span style="display:inline-block;width:1.5em;text-indent:0;color:#6b7280">' + (on ? '☑' : '☐') + '</span>' + cb[2] + '</div>';
      lastBlock = true;
      return;
    }
    var sub = ln.match(/^[ \t\u3000]+(?:[-–]\s+|[•・]\s*)(.*)$/);
    var top = sub ? null : ln.match(/^(?:[-–]\s+|[•・]\s*)(.*)$/);
    if (sub) {
      list = list || [];
      if (!list.length) list.push({ text: null, subs: [] });
      list[list.length - 1].subs.push(sub[1]);
      return;
    }
    if (top) { list = list || []; list.push({ text: top[1], subs: [] }); return; }
    flush();
    if (!ln.trim()) {   // 空行＝段落間距：固定 12px，不用整行高的 <br>（手機信箱會放大成一大段空白）
      if (html) html += '<div style="height:12px;line-height:12px;font-size:1px">&nbsp;</div>';
      lastBlock = true;
      return;
    }
    html += (html && !lastBlock ? '<br>' : '') + ln;
    lastBlock = false;
  });
  flush();
  return blockBr(formatMarkup(html));
}

/** 編輯時即時預覽：代入範例值後轉成與實際信件相同的 HTML */
/** 內部備註 [備註]…[/備註]：寄出時拿掉（與後端 stripNotes_ 相同）；預覽可選擇顯示成黃色便條 */
var NOTE_RE = /\[備註\]([\s\S]*?)\[\/備註\]/g;
var MAIL_NOTES_SHOWN = (function () { try { return localStorage.getItem('camp-show-notes') !== '0'; } catch (e) { return true; } })();   // 預設顯示
function stripNotes(text) {
  return String(text || '').replace(/^[ \t\u3000]*\[備註\][\s\S]*?\[\/備註\][ \t\u3000]*(?:\r?\n|$)/gm, '').replace(NOTE_RE, '');
}

function markupToHtml(text, vars) {
  text = MAIL_NOTES_SHOWN ? String(text || '').replace(NOTE_RE, function (m, inner) { return '\u0001' + inner.replace(/\n/g, '\u0002') + '\u0003'; }) : stripNotes(text);
  var filled = esc(text).replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (m, k) { return vars && vars[k] !== undefined ? esc(vars[k]) : m; });
  return mailTextToHtml(filled).replace(/\u0001([\s\S]*?)\u0003/g, function (m, inner) {
    return '<span style="display:inline-block;background:#fff8c5;border:1px dashed #d4a106;color:#7a5b00;border-radius:6px;padding:2px 8px;font-size:12px;line-height:1.6">備註（不會寄出）：' + inner.replace(/\u0002/g, '<br>') + '</span>';
  });
}

/** 信件結尾預覽：分隔線＋附註（小字）→ 署名（置中）；與後端 mailClosingHtml_ 相同 */
function mailClosingPreview(footer, signature, vars, contactsHtml) {
  if (!MAIL_NOTES_SHOWN) { footer = stripNotes(footer).trim(); signature = stripNotes(signature).trim(); }
  var html = contactsHtml ? '<div style="margin-top:24px">' + contactsHtml + '</div>' : '';
  if (footer) html += '<div style="margin-top:28px;padding-top:12px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.7">' + markupToHtml(footer, vars) + '</div>';
  html += '<div style="margin-top:' + (footer ? 20 : 28) + 'px;text-align:center;color:#6b7280;font-size:14px">' + markupToHtml(String(signature || '').trim() || DEFAULT_SIGNATURE, vars) + '</div>';
  return html;
}

function mailPreviewDoc(campName, bodyHtml, headerColor) {
  var head = normHex(headerColor) || '#2f5d62';
  return '<div style="font-family:\'Noto Sans TC\',\'PingFang TC\',sans-serif;background:#f4f5f7;padding:24px">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">' +
    '<div style="background:' + head + ';color:' + textOn(head) + ';padding:16px 24px;font-size:16px;font-weight:700">' + esc(campName) + '</div>' +
    '<div style="padding:24px;font-size:15px;line-height:1.8;color:#1f2937">' + bodyHtml + '</div></div></div>';
}

/**
 * 範本編輯視窗（系統預設與專案自訂共用）：工具列、格式說明、即時預覽。
 * opts: {signature 專案署名, campName, note 上方說明, resetLabel 有值時多一個「恢復系統預設」按鈕}
 * 回傳 {subject, body}、{reset:true} 或 null（取消）
 */
function openTemplateEditor(t, opts) {
  opts = opts || {};
  var sample = {};
  Object.keys(MAIL_SAMPLE).forEach(function (k) { sample[k] = MAIL_SAMPLE[k]; });
  if (opts.campName) sample['營隊名稱'] = opts.campName;
  var help = '<div class="fmt-help"><b>格式寫法</b>（用上方按鈕插入也可以）<br>' +
    '<code>**粗體**</code>　<code>[R]紅字[/R]</code>　顏色代號：R 紅、O 橙、Y 黃、G 綠、B 藍、P 紫、K 黑<br>' +
    '<code>[#1a73e8]任意色號[/#]</code>　<code>[hl=#bbf7d0]任意底色[/hl]</code>　色號可寫 6 碼或 3 碼（#f00）<br>' +
    '<code>==螢光==</code>　<code>[center]置中[/center]</code>　<code>[card]提醒卡片[/card]</code>（<code>[card=B]</code> 換顏色）　行首 <code>- </code> 條列、<code>&nbsp;&nbsp;- </code> 子項目、<code>[ ] </code> 核取方塊（<code>[x] </code> 已勾）<br>' +
    '字級：<code>[特大]…[/特大]</code> <code>[大]…[/大]</code> <code>[中]…[/中]</code> <code>[小]…[/小]</code>　分隔線：一行只寫 <code>---</code><br>' +
    '<code>[備註]說明[/備註]</code> 內部備註：給之後維護的人看，寄出時自動拿掉；預覽上方可切換要不要顯示<br>' +
    '<code>[link=https://網址]顯示文字[/link]</code> 文字連結　<code>[button=https://網址]按鈕文字[/button]</code> 按鈕<br>' +
    '<code>[img]https://圖片網址[/img]</code> 圖片（<code>[img=說明]…[/img]</code> 加說明）　<code>[map]地址[/map]</code> 地點卡片　表格：每行 <code>| 儲存格 | 儲存格 |</code>，第一行是標題列<br>' +
    '連結、按鈕要換顏色：網址後空一格加色號，例如 <code>[button=https://網址 #c62828]按鈕文字[/button]</code><br>' +
    '變數會顯示成<span class="var-chip">方塊</span>，用「插入變數」選單加入，刪除時整塊一起刪；也可以直接打 <code>{{姓名}}</code>，打完會自動變成方塊。' +
    '</div>';
  var ECHO_CODES = ['REG_SUCCESS', 'WAITLIST', 'PROMOTED'];
  var footMode = t.footer === '-' ? 'none' : t.footer ? 'custom' : 'default';
  var sigMode = t.signature ? 'custom' : 'default';
  var defSig = String(opts.signature || '').trim() || DEFAULT_SIGNATURE;
  var defHead = normHex(opts.headerColor) || '#2f5d62';   // 沒自訂時用的顏色（專案預設，沒設就是墨綠）
  var headCustom = !!normHex(t.headerColor) && normHex(t.headerColor) !== defHead;
  var body = el('<div class="tpl-editor"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">' +
    (opts.note ? '<div class="banner" style="background:var(--surface-2);margin:0">' + esc(opts.note) + '</div>' : '') +
    '<div class="field"><div class="row" style="gap:8px"><span class="grow">主旨</span><span class="subj-var"></span></div><input class="input" name="subject"></div>' +
    '<div class="field"><span>內容</span><div class="tpl-bar"></div><textarea class="input" name="body"></textarea></div>' +
    '<div class="tpl-echo hidden"><div class="row" style="gap:8px"><b class="grow small">報名資料表（內容裡的<span class="var-chip">回覆內容</span>方塊）</b></div>' +
    (opts.questions ?
      '<div class="small muted" style="margin:4px 0 8px">勾選要在表格裡顯示的題目。這是專案共用的設定，報名成功、候補、遞補錄取三種信都會一起改。</div>' +
      '<div class="multi-q">' + opts.questions.map(function (q) { return '<label class="check"><input type="checkbox" value="' + esc(q) + '"' + ((opts.echoFields || []).indexOf(q) >= 0 ? ' checked' : '') + (opts.onSaveEcho ? '' : ' disabled') + '><span>' + esc(q) + '</span></label>'; }).join('') + '</div>' +
      (opts.onSaveEcho ? '<div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn sm" type="button" data-echo-save>儲存勾選的題目</button></div>' : '')
      : '<div class="small muted" style="margin-top:4px">表格顯示哪些題目由各專案勾選（專案的「信件範本」或「專案設定 → 報名結果信附上的回覆內容」）。把方塊刪掉就不附表格。</div>') +
    '</div>' +
    '<div class="tpl-closing"><b class="small">這封信的結尾</b>' +
    '<div class="field"><div class="row" style="gap:8px"><span class="grow">附註（分隔線下的灰色小字）</span><select class="input sm" name="footMode"><option value="default">跟著預設</option><option value="custom">這封信自訂</option><option value="none">這封信不加</option></select></div>' +
    '<div class="small muted foot-def"></div><div class="foot-edit"><textarea class="input" name="footer" rows="4"></textarea></div></div>' +
    '<div class="field"><div class="row" style="gap:8px"><span class="grow">署名（最後置中）</span><select class="input sm" name="sigMode"><option value="default">跟著預設</option><option value="custom">這封信自訂</option></select></div>' +
    '<div class="small muted sig-def"></div><div class="sig-edit"><input class="input" name="signature"></div></div></div>' +
    '<details class="fmt-details"><summary class="small">格式寫法</summary>' + help + '</details>' +
    '<div class="small tpl-err" style="color:var(--bad);min-height:16px"></div></div>' +
    '<div style="display:flex;flex-direction:column;gap:8px;min-width:0"><div class="row wrap" style="gap:8px"><span class="small muted grow">即時預覽（文字以 OOO、數字以 000 代入）</span><label class="check small"><input type="checkbox" class="note-toggle"' + (MAIL_NOTES_SHOWN ? ' checked' : '') + '><span>顯示內部備註</span></label></div>' +
    '<div class="row wrap tpl-head" style="gap:8px"><span class="small">這封信的標頭顏色</span>' + hexField('tpl-headhex', normHex(t.headerColor) || defHead) +
    '<button class="btn sm ghost" type="button" data-head-reset>恢復預設</button><span class="small muted grow head-state"></span></div>' +
    '<div class="small" data-subj style="font-weight:600"></div><iframe class="mail-frame" sandbox=""></iframe></div></div>');
  var subj = $('[name=subject]', body), ta = $('[name=body]', body), frame = $('iframe', body);
  subj.value = t.subject; ta.value = t.body;
  // 報名成功、候補、遞補錄取沒放 {{回覆內容}} 時，寄出會自動附在最後：編輯框也直接顯示那個方塊，左右才對得起來
  if (ECHO_CODES.indexOf(t.code) >= 0 && !/\{\{\s*回覆內容\s*\}\}/.test(stripNotes(ta.value))) ta.value = ta.value.replace(/\s+$/, '') + '\n{{回覆內容}}';
  var subjEd = chipEditor(subj), bodyEd = chipEditor(ta);
  var footTa = $('[name=footer]', body), sigIn = $('[name=signature]', body);
  footTa.value = footMode === 'custom' ? t.footer : (opts.footer || '');
  sigIn.value = sigMode === 'custom' ? t.signature : defSig;
  var footEd = chipEditor(footTa), sigEd = chipEditor(sigIn);
  footTa.parentNode.insertBefore(formatToolbar(footEd, { vars: true }), footTa);
  sigIn.parentNode.insertBefore(formatToolbar(sigEd, { vars: true }), sigIn);
  var footSel = $('[name=footMode]', body), sigSel = $('[name=sigMode]', body);
  footSel.value = footMode; sigSel.value = sigMode;
  function closingUi() {
    var fm = footSel.value, sm = sigSel.value;
    $('.foot-edit', body).classList.toggle('hidden', fm !== 'custom');
    $('.foot-def', body).textContent = fm === 'default' ? (opts.footer ? '目前預設：' + stripNotes(opts.footer).replace(/\n/g, ' ／ ') : '目前預設不加附註') + (opts.footerWhere ? '（' + opts.footerWhere + '）' : '') : fm === 'none' ? '這封信不加附註（也不加分隔線）' : '';
    $('.sig-edit', body).classList.toggle('hidden', sm !== 'custom');
    $('.sig-def', body).textContent = sm === 'default' ? '目前預設：' + defSig.replace(/\{\{\s*營隊名稱\s*\}\}/g, sample['營隊名稱']) + (opts.sigWhere ? '（' + opts.sigWhere + '）' : '') : '';
    $('.tpl-echo', body).classList.toggle('hidden', !/\{\{\s*回覆內容\s*\}\}/.test(stripNotes(ta.value)));
  }
  footSel.addEventListener('change', function () {
    if (footSel.value === 'custom' && !footTa.value.trim()) { footEd.value = opts.footer || ''; }
    closingUi(); preview();
  });
  sigSel.addEventListener('change', function () { closingUi(); preview(); });
  function usedFooter() { return footSel.value === 'custom' ? footTa.value : footSel.value === 'none' ? '' : (opts.footer || ''); }
  function usedSig() { return sigSel.value === 'custom' && sigIn.value.trim() ? sigIn.value : defSig; }
  $('.subj-var', body).appendChild(varPicker(subjEd));
  $('.tpl-bar', body).appendChild(formatToolbar(bodyEd, { vars: true }));
  function preview() {
    $('[data-subj]', body).textContent = '主旨：' + stripNotes(subj.value).replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (m, k) { return sample[k] !== undefined ? sample[k] : m; })
      .replace(/\*\*|==|\[\/?[ROYGBPK]\]|\[\/?center\]|\[\/?nowrap\]|\[\/?(?:特大|大|中|小)\]|\[color=#[0-9a-fA-F]{3,6}\]|\[\/color\]/g, '');
    // 報名成功、候補、遞補錄取：專案有勾選回覆內容時會自動附在最後
    var text = ta.value;
    var auto = false;
    var fields = opts.questions ? $$('.tpl-echo input:checked', body).map(function (i) { return i.value; }) : undefined;
    var echo = echoSampleHtml(fields);
    var html = markupToHtml(text, sample).split('%%ECHO%%').join(echo +
      (!fields ? '<div style="font-size:12px;color:#9ca3af;margin-top:6px">（預覽示意：實際顯示各專案勾選的題目；沒勾選就不附）</div>' : '') +
      (fields && !fields.length && /%%ECHO%%/.test(markupToHtml(text, sample)) && !auto ? '<div style="font-size:12px;color:#9ca3af">（目前沒有勾選要附上的報名資料）</div>' : ''));
    // 聯絡人員：範本或附註有 {{聯絡人員}} 就放那裡，否則（有勾選時）附在附註上方
    var contacts = contactsSampleHtml(opts.contacts);
    var placed = /\{\{\s*聯絡人員\s*\}\}/.test(stripNotes(text) + '\n' + stripNotes(usedFooter()));
    html += mailClosingPreview(usedFooter(), usedSig(), sample, !placed && opts.contactsInMail !== false ? contacts : '') +
      (opts.closingNote ? '<div style="margin-top:6px;text-align:center;font-size:11px;color:#b0b5b2">' + esc(opts.closingNote) + '</div>' : '');
    html = html.replace(/(?:<br>)?%%PAYINFO%%(?:<br>)?/g, payInfoSampleHtml()).replace(/(?:<br>)?%%REFUND%%(?:<br>)?/g, refundSampleHtml(opts.refund)).replace(/(?:<br>)?%%HOTEL%%(?:<br>)?/g, hotelSampleHtml(opts.hotel)).replace(/(?:<br>)?%%PORTAL%%(?:<br>)?/g, portalSampleHtml(opts.portalUrl, opts.portalKeyLabel));
    frame.srcdoc = mailPreviewDoc(sample['營隊名稱'], blockBr(html.split('%%CONTACTS%%').join(contacts)), normHex($('.tpl-headhex .fmt-hexin', body).value) || opts.headerColor);
  }
  body.addEventListener('change', function (e) { if (e.target.closest('.tpl-echo')) preview(); });
  bindHexField($('.tpl-headhex', body));
  function headState() {
    $('.head-state', body).textContent = headCustom ? '這封信自訂顏色' : '目前用預設 ' + defHead + (defHead === '#2f5d62' ? '（墨綠）' : '（專案設定）');
    $('[data-head-reset]', body).disabled = !headCustom;
  }
  $('.tpl-headhex', body).addEventListener('input', function () {
    var hx = normHex($('.tpl-headhex .fmt-hexin', body).value);
    headCustom = !!hx && hx !== defHead; headState();
  });
  $('[data-head-reset]', body).addEventListener('click', function () {
    $('.tpl-headhex .fmt-hexin', body).value = defHead; $('.tpl-headhex input[type=color]', body).value = defHead;
    headCustom = false; headState(); preview();
  });
  headState();
  var echoSave = $('[data-echo-save]', body);
  if (echoSave) {
    echoSave.addEventListener('click', function () {
      var list = $$('.tpl-echo input:checked', body).map(function (i) { return i.value; });
      Promise.resolve(opts.onSaveEcho(list)).then(function () { toast('已更新報名資料表的題目（' + list.length + ' 題）'); })
        .catch(function (e) { toast(e.message, true); });
    });
  }
  $('.note-toggle', body).addEventListener('change', function (e) {
    MAIL_NOTES_SHOWN = e.target.checked;
    try { localStorage.setItem('camp-show-notes', MAIL_NOTES_SHOWN ? '1' : '0'); } catch (err) {}
    preview();
  });
  var timer = null;
  body.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { closingUi(); preview(); }, 150); });
  closingUi();
  preview();
  var buttons = [{ label: '取消', value: null }];
  if (opts.resetLabel) buttons.push({ label: opts.resetLabel, cls: 'ghost', value: { reset: true } });
  buttons.push({
    label: '儲存', cls: 'primary',
    validate: function () {
      if (!subj.value.trim() || !ta.value.trim()) { $('.tpl-err', body).textContent = '主旨與內容不可空白'; return false; }
      if (!normHex($('.tpl-headhex .fmt-hexin', body).value)) { $('.tpl-err', body).textContent = '標頭顏色格式是 # 加 6 碼（例如 #2f5d62）或 3 碼'; return false; }
      return true;
    },
    value: function () {
      var fm = footSel.value, ft = footTa.value.replace(/\r\n/g, '\n').trim();
      return { subject: subj.value, body: ta.value,
        footer: fm === 'default' ? '' : fm === 'none' || !ft ? '-' : ft,
        signature: sigSel.value === 'custom' ? sigIn.value.trim() : '',
        headerColor: headCustom ? normHex($('.tpl-headhex .fmt-hexin', body).value) : '' };
    }
  });
  return modal({ title: '編輯範本：' + t.name, cls: 'xwide', body: body, buttons: buttons });
}

/** 常用清單：點一下填入（reason 類欄位用「；」接在後面，訊息類換行接上） */
function presetChips(target, items, joiner) {
  var box = el('<div class="preset-chips"><span class="small muted">常用：</span></div>');
  (items || []).forEach(function (t) {
    var c = el('<button type="button" class="preset-chip"></button>');
    c.textContent = t; c.title = t;
    c.addEventListener('click', function () {
      var v = target.value.trim();
      target.value = v ? v + (joiner || '；') + t : t;
      target.focus();
      target.dispatchEvent(new Event('input', { bubbles: true }));
    });
    box.appendChild(c);
  });
  return box;
}

/** 對外通知的確認視窗：收件人、改寄說明、主旨、信件預覽、剩餘額度 */
function mailConfirm(pv, extraLines) {
  var m = pv.mail;
  var body = el('<div style="display:flex;flex-direction:column;gap:14px"></div>');
  var lines = (pv.summary || []).concat(extraLines || []);
  if (lines.length) {
    body.appendChild(el('<ul class="summary-list">' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>'));
  }
  if (m) {
    body.appendChild(el('<dl class="kv"><dt>收件人</dt><dd>' + esc(m.to) + (pv.count > 1 ? '　等 ' + pv.count + ' 人' : '') + '</dd>' +
      '<dt>通知類型</dt><dd>' + esc(m.templateName) + '</dd><dt>主旨</dt><dd>' + esc(m.subject) + '</dd>' +
      '<dt>今日剩餘額度</dt><dd>' + esc(pv.quota) + ' 封</dd></dl>'));
    if (m.redirectedFrom || pv.redirected) {
      body.appendChild(el('<div class="redirect-note">此專案為「系統維護」模式，信件不會寄給學員，會改寄到設定維護的管理員信箱。</div>'));
    }
    var frame = el('<iframe class="mail-frame" sandbox=""></iframe>');
    frame.srcdoc = m.html;
    body.appendChild(frame);
  }
  return modal({
    title: (m ? '確認寄出：' : '確認執行：') + (pv.label || ''),
    desc: pv.student ? pv.student.name + (pv.student.email ? '（' + pv.student.email + '）' : '') : '',
    body: body, wide: !!m,
    buttons: [{ label: '取消', value: false }, { label: m ? '確認寄出' : '確認執行', cls: 'primary', value: true }]
  }).then(function (v) { return !!v; });
}

/* ---------- 浮動選單 ---------- */
function popMenu(anchor, items) {
  closePopMenu();
  var m = el('<div class="menu-pop" id="menu-pop"></div>');
  items.forEach(function (it) {
    if (it.sep) { m.appendChild(el('<hr>')); return; }
    if (it.header) { var h = el('<div class="menu-label"></div>'); h.textContent = it.header; m.appendChild(h); return; }
    var b = el('<button type="button"' + (it.danger ? ' class="danger"' : '') + '></button>');
    b.textContent = it.label;
    // mail：'yes' 會寄信給學員、'opt' 可選擇是否寄信（確認前都能預覽）
    if (it.mail) { var tg = el('<span class="mail-tag' + (it.mail === 'opt' ? ' opt' : '') + '"></span>'); tg.textContent = it.mail === 'opt' ? '可選寄信' : '寄信'; tg.title = it.mail === 'opt' ? '下一步可以選擇要不要寄信' : '會寄信給學員（確認前可預覽）'; b.appendChild(tg); }
    if (it.disabled) { b.disabled = true; b.style.opacity = .4; }
    b.addEventListener('click', function (e) { e.stopPropagation(); closePopMenu(); it.onClick(); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  var r = anchor.getBoundingClientRect();
  var top = r.bottom + 4, left = r.right - m.offsetWidth;
  if (top + m.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - m.offsetHeight - 4);
  m.style.top = top + 'px';
  m.style.left = Math.max(8, left) + 'px';
  setTimeout(function () { document.addEventListener('click', closePopMenu, { once: true }); }, 0);
}
function closePopMenu() { var m = $('#menu-pop'); if (m) m.remove(); }

/* ---------- 側邊抽屜 ---------- */
function drawer(o) {
  var ov = el('<div class="drawer-overlay"></div>');
  var d = el('<aside class="drawer"><div class="drawer-head"><div class="grow"><h2></h2><div class="muted small sub"></div></div>' +
    '<button class="btn ghost icon" type="button" aria-label="關閉">✕</button></div><div class="drawer-body"></div></aside>');
  $('h2', d).textContent = o.title || '';
  $('.sub', d).innerHTML = o.sub || '';
  function close() { ov.remove(); d.remove(); document.removeEventListener('keydown', onKey); if (o.onClose) o.onClose(); }
  function onKey(e) { if (e.key === 'Escape' && !$('.overlay')) close(); }
  ov.addEventListener('click', close);
  $('.drawer-head button', d).addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  document.body.appendChild(d);
  return { el: d, body: $('.drawer-body', d), close: close };
}

/* ---------- 頁面：每個功能一個 HTML ---------- */
var PAGE_TITLES = { menu: '功能選單', students: '報名與學員管理', newproject: '開始新專案', admin: '系統管理', logs: '操作紀錄' };

function go(name, params) {
  var q = params ? Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&') : '';
  location.href = name + '.html' + (q ? '?' + q : '');
}
function reload() { location.reload(); }

function getParams() {
  var out = {};
  new URLSearchParams(location.search).forEach(function (v, k) { out[k] = v; });
  return out;
}

function renderTopbar(name, params) {
  var bar = el('<header class="topbar">' +
    '<div class="brand" id="brand"><div class="brand-mark">營</div><span>營隊報名管理</span></div>' +
    '<div class="crumb" id="crumb"></div><div class="spacer"></div>' +
    '<button class="bell" id="bell" type="button" aria-label="通知"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" fill="currentColor"/></svg><span class="bell-badge hidden" id="bell-badge"></span></button>' +
    '<div class="user-chip" id="user-chip"><span id="user-name"></span><span class="role-tag" id="user-role"></span><div class="avatar" id="user-avatar"></div></div>' +
    '</header>');
  document.body.insertBefore(bar, document.body.firstChild);
  $('#crumb').innerHTML = name === 'menu' ? '' : '<b>' + esc(PAGE_TITLES[name] || '') + '</b>' + (params.title ? '　/　' + esc(params.title) : '');
  $('#user-name').textContent = App.user.name;
  $('#user-role').textContent = App.user.role;
  if (App.user.isOwner) { $('#user-role').classList.add('owner'); $('#user-avatar').classList.add('root'); $('#user-role').title = App.user.isChief ? '兼任協同總管' : '協同總管已交給其他人；你仍保有全部權限'; }
  else if (App.user.isRoot) { $('#user-role').classList.add('root'); $('#user-avatar').classList.add('root'); }
  else if (App.user.perms && App.user.perms.length) { $('#user-role').textContent = '共同管理＋授權'; $('#user-role').title = '總管授予的權限可在系統管理使用'; }
  if (App.user.siteMaint) {
    var mt = el('<a class="maint-pill" href="admin.html?tab=projects">全站維護中</a>');
    mt.title = '暫停：' + (App.user.siteMaintLabels || []).join('、') + '（到系統管理調整）';
    $('#user-chip').parentNode.insertBefore(mt, $('#user-chip'));
  }
  $('#user-avatar').textContent = (App.user.name || '?').slice(0, 1).toUpperCase();
  $('#brand').addEventListener('click', function () { go('menu'); });
  $('#user-chip').addEventListener('click', function (e) {
    e.stopPropagation();
    popMenu($('#user-chip'), [
      { header: App.user.email },
      { label: '修改密碼', onClick: changeMyPassword },
      { label: '安裝到桌面', onClick: installApp },
      { label: '使用手冊', onClick: function () { openManual(''); } },
      { label: '問題快速排除', onClick: function () { openManual('troubleshoot'); } },
      { label: '聯絡開發人員', onClick: contactDeveloper },
      { sep: true },
      { label: '登出', danger: true, onClick: function () { api('logout').finally(function () { store('camp_token', null); location.href = 'index.html'; }); } }
    ]);
  });
  if (PAGE_TITLES[name]) document.title = PAGE_TITLES[name] + '｜營隊報名管理';
  Bell.init();
}

/* ---------- 通知鈴鐺（站內通知，不寄信） ---------- */
var Bell = {
  timer: null, count: 0, data: null, view: 'all',
  init: function () {
    var self = this;
    $('#bell').addEventListener('click', function (e) { e.stopPropagation(); self.toggle(); });
    this.poll();
    this.timer = setInterval(function () { if (!document.hidden) self.poll(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) self.poll(); });
  },
  setCount: function (n) {
    this.count = n;
    var b = $('#bell-badge');
    if (!b) return;
    b.textContent = n > 99 ? '99+' : String(n);
    b.classList.toggle('hidden', !n);
    $('#bell').setAttribute('aria-label', n ? '通知，' + n + ' 則未讀' : '通知');
  },
  poll: function () {
    var self = this;
    api('notifyCount').then(function (r) { self.setCount(r.unread); }).catch(function () { /* 背景更新失敗就略過 */ });
  },
  close: function () {
    var p = $('#bell-pop'); if (p) p.remove();
    document.removeEventListener('click', Bell.outside);
  },
  outside: function (e) { if (!e.target.closest('#bell-pop') && !e.target.closest('.overlay')) Bell.close(); },
  toggle: function () {
    if ($('#bell-pop')) { this.close(); return; }
    closePopMenu();
    var pop = el('<div class="bell-pop" id="bell-pop" role="dialog" aria-label="通知"><div class="bell-head"><b>通知</b><span class="spacer"></span>' +
      '<button type="button" class="btn sm ghost" data-act="all">全部已讀</button><button type="button" class="btn sm ghost icon" data-act="settings" aria-label="通知設定" title="通知設定">⚙</button></div>' +
      '<div class="bell-tabs"><button type="button" data-v="all" class="on">全部</button><button type="button" data-v="unread">未讀</button></div>' +
      '<div class="bell-body"><div class="loading"><div class="spinner"></div>載入中</div></div></div>');
    document.body.appendChild(pop);
    this.place();
    var self = this;
    setTimeout(function () { document.addEventListener('click', Bell.outside); }, 0);
    $('[data-act=all]', pop).addEventListener('click', function () {
      api('markNotifications', 'all').then(function (r) { self.setCount(r.unread); self.load(); });
    });
    $('[data-act=settings]', pop).addEventListener('click', function () { self.settings(); });
    $$('.bell-tabs button', pop).forEach(function (b) {
      b.addEventListener('click', function () {
        self.view = b.getAttribute('data-v');
        $$('.bell-tabs button', pop).forEach(function (x) { x.classList.toggle('on', x === b); });
        self.render();
      });
    });
    this.view = 'all';
    this.load();
  },
  place: function () {
    var pop = $('#bell-pop'), bell = $('#bell');
    if (!pop || !bell) return;
    var r = bell.getBoundingClientRect();
    pop.style.top = (r.bottom + 8) + 'px';
    var w = pop.offsetWidth, left = Math.min(r.right + 60 - w, window.innerWidth - w - 8);
    pop.style.left = Math.max(8, left) + 'px';
  },
  load: function () {
    var self = this;
    return api('getNotifications').then(function (d) { self.data = d; self.setCount(d.unread); self.render(); })
      .catch(function (e) { var b = $('#bell-pop .bell-body'); if (b) b.innerHTML = '<div class="empty small"></div>', $('.empty', b).textContent = e.message; });
  },
  ago: function (iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return '剛剛';
    if (s < 3600) return Math.floor(s / 60) + ' 分鐘前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小時前';
    if (s < 86400 * 7) return Math.floor(s / 86400) + ' 天前';
    return fmtTime(iso);
  },
  render: function () {
    var body = $('#bell-pop .bell-body');
    if (!body || !this.data) return;
    var self = this, items = this.data.items.filter(function (n) { return self.view === 'all' || !n.read; });
    body.innerHTML = '';
    if (!items.length) {
      body.innerHTML = '<div class="bell-empty">' + (this.view === 'unread' ? '沒有未讀通知' : '最近 30 天沒有通知') + '</div>';
    }
    items.forEach(function (n) {
      var it = el('<button type="button" class="bell-item' + (n.read ? '' : ' unread') + '"><span class="bell-dot" aria-hidden="true"></span><span class="bell-main">' +
        '<span class="bell-top"><span class="pill ' + esc(n.tone || 'mute') + '"></span><span class="bell-proj"></span><span class="bell-time"></span></span>' +
        '<span class="bell-title"></span><span class="bell-text"></span></span></button>');
      $('.pill', it).textContent = n.label;
      $('.bell-proj', it).textContent = n.project ? n.project + (n.projectName ? ' ' + n.projectName : '') : '';
      $('.bell-time', it).textContent = self.ago(n.time);
      $('.bell-time', it).title = fmtTime(n.time);
      $('.bell-title', it).textContent = n.title;
      $('.bell-text', it).textContent = n.body;
      if (!n.body) $('.bell-text', it).remove();
      it.addEventListener('click', function () { self.open(n); });
      body.appendChild(it);
    });
    body.appendChild(el('<div class="bell-foot">未讀超過 ' + this.data.autoReadDays + ' 天自動標為已讀，通知保留 30 天</div>'));
  },
  /** 點通知：先看完整內容，再決定要不要前往學員或專案（同一個專案頁直接打開學員，不重新載入） */
  open: function (n) {
    var self = this;
    self.close();
    if (!n.read) {
      n.read = true;
      api('markNotifications', [n.id]).then(function (r) { self.setCount(r.unread); }).catch(function () {});
    }
    var body = el('<div class="notify-detail"><div class="row wrap" style="gap:8px"><span class="pill"></span><span class="small muted nd-proj"></span><span class="spacer"></span><span class="small muted nd-time"></span></div><div class="nd-body"></div></div>');
    $('.pill', body).className = 'pill ' + (n.tone || 'mute');
    $('.pill', body).textContent = n.label || '通知';
    $('.nd-proj', body).textContent = n.project ? n.project + (n.projectName ? ' ' + n.projectName : '') : '';
    $('.nd-time', body).textContent = fmtTime(n.time);
    $('.nd-body', body).textContent = n.body || '（沒有其他內容）';
    var buttons = [{ label: '關閉', value: null }];
    if (n.admin) buttons.push({ label: '前往系統管理', cls: 'primary', value: 'admin' });
    else if (n.project && n.studentId) buttons.push({ label: '查看這位學員', cls: 'primary', value: 'student' });
    else if (n.project) buttons.push({ label: '前往專案', cls: 'primary', value: 'project' });
    modal({ title: n.title, body: body, buttons: buttons }).then(function (v) {
      if (v === 'admin') go('admin', { tab: n.project ? 'projects' : 'staff' });
      if (v === 'project') go('students', { prefix: n.project, title: n.projectName });
      if (v === 'student') {
        // 已經在這個專案的名單頁：直接打開，不重新載入
        if (App.openStudent && getParams().prefix === n.project && App.openStudent(n.studentId)) return;
        go('students', { prefix: n.project, title: n.projectName, student: n.studentId });
      }
    });
  },
  settings: function () {
    var self = this, d = this.data;
    if (!d) return;
    this.close();
    var form = el('<div class="notify-settings"></div>');
    var groups = [];
    d.types.forEach(function (t) { if (groups.indexOf(t.group) < 0) groups.push(t.group); });
    groups.forEach(function (g) {
      var sec = el('<div class="notify-group"><div class="small muted"></div><div class="notify-grid"></div></div>');
      $('.small', sec).textContent = g;
      d.types.filter(function (t) { return t.group === g; }).forEach(function (t) {
        var it = el('<label class="check"><input type="checkbox"><span></span></label>');
        $('input', it).value = t.key; $('input', it).checked = d.off.indexOf(t.key) < 0;
        $('span', it).textContent = t.label;
        $('.notify-grid', sec).appendChild(it);
      });
      form.appendChild(sec);
    });
    // 寄信：新報名時寄信給專案管理員（預設開啟）
    var ms = el('<div class="notify-group"><div class="small muted">寄信給我</div><div class="notify-grid"><label class="check"><input type="checkbox" value="mailRegister"><span>新報名寄信通知我（我負責的專案）</span></label></div></div>');
    $('input', ms).checked = d.off.indexOf('mailRegister') < 0;
    form.appendChild(ms);
    modal({
      title: '通知設定', desc: '勾選要在鈴鐺顯示的通知，以及要不要寄信給你。這裡只影響你自己；自己做的操作不會通知自己。', body: form,
      buttons: [{ label: '取消', value: null }, { label: '儲存', cls: 'primary', value: function () {
        return $$('input', form).filter(function (i) { return !i.checked; }).map(function (i) { return i.value; });
      } }]
    }).then(function (off) {
      if (!off) return;
      withBusy(api('saveNotifySettings', off)).then(function () { toast('通知設定已儲存'); self.poll(); }).catch(function (e) { toast(e.message, true); });
    });
  }
};
window.addEventListener('resize', function () { Bell.place(); });

/** 每個功能頁呼叫：確認登入 → 畫頂部列 → 執行頁面程式 */
App.page = function (name, init) {
  function start() {
    App.token = store('camp_token');
    if (!App.token) { location.href = 'index.html'; return; }
    // 上次確認過的登入資料先用，畫面不用等；背景再向後端確認一次（失效會自動跳回登入頁）
    var known = cacheGet(cacheKey('whoami'));
    var quick = !!(known && !known.mustChange && !known.termsNeeded);
    var check = api('whoami', location.href).then(function (u) {
      cacheSet(cacheKey('whoami'), u);
      if (quick) { if (u.mustChange || u.termsNeeded) location.reload(); else App.user = u; }   // 需要改密碼或重新同意條款：重新走一次檢查
      return u;
    });
    if (quick) check.catch(function () {});
    var who = quick ? Promise.resolve(known) : check;
    who.then(function (u) {
      App.user = u;
      var params = getParams();
      renderTopbar(name, params);
      var root = $('#app').firstElementChild;
      root.classList.remove('hidden');
    var ld = $('#page-loading'); if (ld) ld.remove();
      var flagged = u.mustChange || u.termsNeeded;
      var gate = u.mustChange ? forceNewPassword() : Promise.resolve();
      gate.then(function () { return u.termsNeeded ? requireTerms() : null; }).then(function () {
        if (flagged) cacheSet(cacheKey('whoami'), Object.assign({}, u, { mustChange: false, termsNeeded: false }));   // 已改密碼／已同意，下一頁不用再等
        init(root, params);
      });
    }).catch(function (e) {
      $('#app').innerHTML = '<div class="card card-pad empty"></div>';
      $('#app .empty').textContent = e.message;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
};

/** 登入頁 */
App.loginPage = function () {
  function start() {
    var msg = getParams().msg;
    if (msg) $('#login-error').textContent = msg;
    App.token = store('camp_token');
    if (App.token && !msg) { location.replace('menu.html'); return; }   // 選單頁會驗證 token，失效就帶訊息跳回登入頁
    if (msg) store('camp_token', null);
    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      $('#login-error').textContent = '';
      withBusy(api('login', f.email.value, f.password.value, f.remember.checked)).then(function (r) {
        store('camp_token', r.token, f.remember.checked);
        App.token = r.token;
        if (r.user.mustChange) forceNewPassword().then(function () { go('menu'); });
        else go('menu');
      }).catch(function (err) { $('#login-error').textContent = err.message; });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
};

/** 忘記密碼：寄一組臨時密碼到帳號信箱 */
function forgotPassword() {
  var typed = ($('#login-form') && $('#login-form').email.value) || '';
  formDialog({
    title: '忘記密碼', okLabel: '寄出臨時密碼',
    desc: '系統會寄一組臨時密碼到你的帳號信箱，' + '30 分鐘內有效。用它登入後，再設定新的密碼。原本的密碼在你改密碼前仍可使用。',
    fields: [{ name: 'email', label: '帳號信箱', type: 'email', required: true, value: typed }]
  }).then(function (v) {
    if (!v) return;
    withBusy(api('forgotPassword', v.email)).then(function (msg) {
      modal({ title: '已送出', desc: msg + ' 沒收到的話，請看一下垃圾郵件匣。', buttons: [{ label: '知道了', cls: 'primary', value: true }] });
    }).catch(function (e) { toast(e.message, true); });
  });
}

/** 用臨時密碼（或總管重設的密碼）登入後，必須先設定新密碼才能使用 */
function forceNewPassword() {
  return formDialog({
    title: '請設定新密碼', okLabel: '儲存',
    desc: '你是用臨時密碼登入的，請設定一組自己的新密碼。',
    fields: [
      { name: 'pw', label: '新密碼', type: 'password', required: true, hint: '至少 8 個字元' },
      { name: 'pw2', label: '再輸入一次新密碼', type: 'password', required: true }
    ]
  }).then(function (v) {
    if (!v) return forceNewPassword();
    if (v.pw !== v.pw2) { toast('兩次輸入的新密碼不一致', true); return forceNewPassword(); }
    return withBusy(api('changePassword', '', v.pw)).then(function () {
      if (App.user) App.user.mustChange = false;
      toast('新密碼已設定');
    }, function (e) { toast(e.message, true); return forceNewPassword(); });
  });
}

/* ---------- 聲明同意書 ---------- */
function termsHtml(t) {
  return '<div class="terms-title">' + esc(t.title) + '<span class="terms-ver">第 ' + t.version + ' 版</span></div><div class="terms-text">' + esc(t.text) + '</div>';
}

/** 已登入但還沒同意目前版本：必須同意才能繼續，不同意就登出 */
function requireTerms() {
  return api('getTerms').then(function (t) {
    var body = el('<div><div class="terms-box">' + termsHtml(t) + '</div>' +
      '<label class="check" style="margin-top:14px"><input type="checkbox" name="agree"><span>我已閱讀並同意遵守以上聲明</span></label>' +
      '<div class="small terms-err" style="color:var(--bad);min-height:16px;margin-top:6px"></div></div>');
    return modal({
      title: '請閱讀並同意使用聲明', desc: '系統內有學員個人資料，使用前請先確認以下事項。',
      body: body, wide: true,
      buttons: [{ label: '不同意並登出', value: false }, {
        label: '同意並繼續', cls: 'primary',
        validate: function () { if ($('input[name=agree]', body).checked) return true; $('.terms-err', body).textContent = '請先勾選「我已閱讀並同意」'; return false; },
        value: true
      }]
    }).then(function (ok) {
      if (!ok) return api('logout').finally(function () { store('camp_token', null); location.href = 'index.html'; }).then(function () { return new Promise(function () {}); });
      return withBusy(api('agreeTerms', t.version)).then(function () { if (App.user) App.user.termsNeeded = false; toast('已同意，感謝配合'); },
        function (e) { toast(e.message, true); return requireTerms(); });
    });
  });
}

/** 註冊頁：閱讀並勾選同意書後送出申請，等總管核准 */
App.registerPage = function () {
  function start() {
    var terms = null;
    api('getTerms').then(function (t) { terms = t; $('#reg-terms').innerHTML = termsHtml(t); })
      .catch(function (e) { $('#reg-terms').textContent = '同意書載入失敗：' + e.message; });
    $('#reg-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var err = $('#reg-error');
      err.textContent = '';
      if (f.password.value !== f.password2.value) { err.textContent = '兩次輸入的密碼不一致'; return; }
      if (!terms) { err.textContent = '同意書還沒載入，請稍候或重新整理'; return; }
      if (!f.agree.checked) { err.textContent = '請閱讀並勾選同意「' + terms.title + '」'; return; }
      withBusy(api('register', f.name.value, f.email.value, f.password.value, f.note.value, terms.version)).then(function (r) {
        if (r === 'approved') {
          $('#reg-done h1').textContent = '帳號已建立';
          $('#reg-done p').textContent = '現在就可以用剛才的信箱與密碼登入；需要管理的營隊請聯絡總管或專案負責人把你加入。';
        }
        $('#reg-form').classList.add('hidden');
        $('#reg-done').classList.remove('hidden');
      }).catch(function (x) { err.textContent = x.message; });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
};

/* ---------- 密碼欄位：顯示／隱藏 ---------- */
var EYE_ON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>';
var EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M2.1 3.51 3.5 2.1l18.4 18.4-1.41 1.41-3.2-3.2A12.4 12.4 0 0 1 12 19c-5 0-9.27-3.11-11-7a12.6 12.6 0 0 1 4.05-5.06L2.1 3.51ZM12 7.5c2.49 0 4.5 2.01 4.5 4.5 0 .74-.18 1.43-.5 2.05l3.32 3.32A12.5 12.5 0 0 0 23 12c-1.73-3.89-6-7-11-7-1.4 0-2.75.24-4 .69l1.95 1.95c.62-.32 1.31-.5 2.05-.5ZM7.55 9.45A4.48 4.48 0 0 0 12 16.5c.74 0 1.43-.18 2.05-.5l-1.6-1.6A2.5 2.5 0 0 1 9.6 11.55l-2.05-2.1Z"/></svg>';
function addPasswordToggle(input) {
  if (input.getAttribute('data-pwt')) return;
  input.setAttribute('data-pwt', '1');
  var wrap = document.createElement('span');
  wrap.className = 'pw-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  var b = el('<button type="button" class="pw-eye" aria-label="顯示密碼" title="顯示密碼">' + EYE_ON + '</button>');
  b.addEventListener('mousedown', function (e) { e.preventDefault(); });   // 不搶走輸入框焦點
  b.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.innerHTML = show ? EYE_OFF : EYE_ON;
    b.setAttribute('aria-label', show ? '隱藏密碼' : '顯示密碼');
    b.title = show ? '隱藏密碼' : '顯示密碼';
    b.classList.toggle('on', show);
  });
  wrap.appendChild(b);
}
function scanPasswordFields(root) { $$('input[type=password]', root || document).forEach(addPasswordToggle); }
(function () {
  function boot() {
    scanPasswordFields();
    new MutationObserver(function (list) {
      list.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.matches && n.matches('input[type=password]')) addPasswordToggle(n); else scanPasswordFields(n); } }); });
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* ---------- 安裝成桌面應用程式（PWA） ---------- */
var installPrompt = null;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  installPrompt = e;
  $$('.install-btn').forEach(function (b) { b.classList.remove('hidden'); });
});
window.addEventListener('appinstalled', function () {
  installPrompt = null;
  $$('.install-btn').forEach(function (b) { b.classList.add('hidden'); });
  toast('已安裝，之後可以從桌面或應用程式清單直接開啟');
});
window.addEventListener('load', function () {
  try { if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) { /* 沙盒環境不能用 */ }
});
function isStandalone() {
  return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}
function installApp() {
  if (isStandalone()) { toast('目前已經是桌面應用程式'); return; }
  if (installPrompt) {
    installPrompt.prompt();
    installPrompt.userChoice.finally(function () { installPrompt = null; });
    return;
  }
  var ua = navigator.userAgent;
  var safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|CriOS|FxiOS/.test(ua);
  var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var lines = ios ? ['在 Safari 點下方的「分享」按鈕', '選「加入主畫面」，再按「新增」'] :
    safari ? ['在 Safari 選單列點「檔案」', '選「加入 Dock」，再按「加入」', '之後可以從 Dock、啟動台或應用程式資料夾開啟'] :
    ['Chrome／Edge：網址列右側會有「安裝」圖示（一台電腦加一個箭頭），點它後按「安裝」',
     '找不到圖示時：右上角「⋮」→「投放、儲存及分享」→「安裝網頁應用程式」', '安裝後會出現在桌面、Dock 或開始選單'];
  modal({
    title: '安裝到桌面', desc: '安裝後會有獨立視窗與圖示，像一般應用程式一樣開啟。',
    body: '<ol class="summary-list">' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ol>',
    buttons: [{ label: '知道了', cls: 'primary', value: true }]
  });
}

/** 使用手冊（manual.html）：另開分頁，section 是章節錨點，例如 troubleshoot＝問題快速排除 */
function openManual(section) {
  window.open('manual.html' + (section ? '#' + section : ''), '_blank', 'noopener');
}

/** 聯絡開發人員：問題回報或功能建議直接寄給開發人員，回信會寄到自己的信箱 */
function contactDeveloper() {
  formDialog({
    title: '聯絡開發人員', okLabel: '寄出',
    desc: '問題回報、功能建議都可以寫在這裡，會寄給系統開發人員；對方回信會寄到你的信箱 ' + ((App.user && App.user.email) || '') + '。',
    fields: [
      { name: 'kind', label: '類型', type: 'select', value: 'bug', options: [{ value: 'bug', label: '問題回報' }, { value: 'idea', label: '功能建議' }, { value: 'other', label: '其他' }] },
      { name: 'subject', label: '主旨', required: true },
      { name: 'body', label: '內容', type: 'textarea', required: true, hint: '問題回報請寫：在哪一頁、做了什麼、看到什麼訊息。目前頁面網址與瀏覽器會自動附上' }
    ]
  }).then(function (v) {
    if (!v) return;
    v.page = location.pathname.split('/').pop() + location.search;
    v.ua = navigator.userAgent;
    withBusy(api('contactDeveloper', v)).then(function () { toast('已寄給開發人員，謝謝你的回報'); }).catch(function (e) { toast(e.message, true); });
  });
}

function changeMyPassword() {

  formDialog({
    title: '修改密碼', okLabel: '儲存',
    fields: [
      { name: 'old', label: '目前密碼', type: 'password', required: true },
      { name: 'pw', label: '新密碼', type: 'password', required: true, hint: '至少 8 個字元' },
      { name: 'pw2', label: '再輸入一次新密碼', type: 'password', required: true }
    ]
  }).then(function (v) {
    if (!v) return;
    if (v.pw !== v.pw2) { toast('兩次輸入的新密碼不一致', true); return; }
    withBusy(api('changePassword', v.old, v.pw)).then(function () { toast('密碼已更新'); }).catch(function (e) { toast(e.message, true); });
  });
}
