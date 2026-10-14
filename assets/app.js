/* 共用程式：API、頁面框架、彈窗、確認視窗、提示 */
/* ============ 共用：API、登入、路由、彈窗、提示 ============ */
var App = {
  token: null,
  user: null
};

function store(key, val) {
  try {
    if (val === undefined) return sessionStorage.getItem(key);
    if (val === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, val);
  } catch (e) { return null; }
}

/** 呼叫 Apps Script 後端 API（text/plain 避免 CORS 預檢） */
function api(name) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (name !== 'login') args = [App.token].concat(args);
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
  '已報名': 'info', '繳款待核覆': 'brand', '匯款逾期': 'bad', '匯款異常': 'bad', '程序完成': 'ok',
  '候補中': 'warn', '報名取消': 'mute', '報名失敗': 'mute',
  '運作中': 'ok', '系統維護': 'warn', '已停止': 'bad', '已封存': 'mute', '已過期': 'mute', '全部停止': 'bad'
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
    var ov = el('<div class="overlay"><div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
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
    buttons: [{ label: '取消', value: false }, { label: o.okLabel || '確認', cls: o.danger ? 'danger' : 'primary', value: true }]
  }).then(function (v) { return !!v; });
}

/** fields: [{name,label,type,options,value,required,hint,placeholder}] */
function formDialog(o) {
  var form = el('<form style="display:flex;flex-direction:column;gap:14px" onsubmit="return false"></form>');
  o.fields.forEach(function (f) {
    var id = 'f_' + f.name;
    var wrap;
    if (f.type === 'checkbox') {
      wrap = el('<label class="check"><input type="checkbox" name="' + f.name + '"' + (f.value ? ' checked' : '') + '><span></span></label>');
      $('span', wrap).textContent = f.label;
    } else {
      wrap = el('<label class="field"><span></span></label>');
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
      wrap.appendChild(input);
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
          if (f.required && f.type !== 'checkbox' && !String(form.elements[f.name].value).trim()) { err.textContent = '請填寫「' + f.label + '」'; return false; }
        }
        return true;
      },
      value: function () {
        var out = {};
        o.fields.forEach(function (f) { var i = form.elements[f.name]; out[f.name] = f.type === 'checkbox' ? i.checked : i.value; });
        return out;
      }
    }]
  });
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
    '<div class="user-chip" id="user-chip"><span id="user-name"></span><span class="role-tag" id="user-role"></span><div class="avatar" id="user-avatar"></div></div>' +
    '</header>');
  document.body.insertBefore(bar, document.body.firstChild);
  $('#crumb').innerHTML = name === 'menu' ? '' : '<b>' + esc(PAGE_TITLES[name] || '') + '</b>' + (params.title ? '　/　' + esc(params.title) : '');
  $('#user-name').textContent = App.user.name;
  $('#user-role').textContent = App.user.role;
  $('#user-avatar').textContent = (App.user.name || '?').slice(0, 1).toUpperCase();
  $('#brand').addEventListener('click', function () { go('menu'); });
  $('#user-chip').addEventListener('click', function (e) {
    e.stopPropagation();
    popMenu($('#user-chip'), [
      { header: App.user.email },
      { label: '修改密碼', onClick: changeMyPassword },
      { sep: true },
      { label: '登出', danger: true, onClick: function () { api('logout').finally(function () { store('camp_token', null); location.href = 'index.html'; }); } }
    ]);
  });
  if (PAGE_TITLES[name]) document.title = PAGE_TITLES[name] + '｜營隊報名管理';
}

/** 每個功能頁呼叫：確認登入 → 畫頂部列 → 執行頁面程式 */
App.page = function (name, init) {
  function start() {
    App.token = store('camp_token');
    if (!App.token) { location.href = 'index.html'; return; }
    api('whoami').then(function (u) {
      App.user = u;
      var params = getParams();
      renderTopbar(name, params);
      var root = $('#app').firstElementChild;
      root.classList.remove('hidden');
    var ld = $('#page-loading'); if (ld) ld.remove();
      init(root, params);
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
    if (App.token && !msg) api('whoami').then(function () { go('menu'); }).catch(function () { store('camp_token', null); });
    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      $('#login-error').textContent = '';
      withBusy(api('login', f.email.value, f.password.value)).then(function (r) {
        store('camp_token', r.token);
        go('menu');
      }).catch(function (err) { $('#login-error').textContent = err.message; });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
};

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
