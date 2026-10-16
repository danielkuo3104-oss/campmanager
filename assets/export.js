/* 營隊報名管理系統　© 2026 Daniel GUO. All rights reserved. */
/* 學員名單匯出 PDF：勾選欄位、選直式或橫式，在瀏覽器產生 PDF 直接下載。
 * 中文用網頁已載入的 Noto Sans TC 排版後轉成圖片放進 PDF，所以任何電腦都不會缺字。
 * 需要的兩個程式庫（html2canvas、jsPDF）第一次匯出時才從 cdnjs 載入。 */

var EXPORT_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

function loadScriptOnce_(src) {
  return new Promise(function (resolve, reject) {
    if (document.querySelector('script[data-src="' + src + '"]')) return resolve();
    var s = document.createElement('script');
    s.src = src; s.async = true; s.setAttribute('data-src', src);
    s.onload = function () { resolve(); };
    s.onerror = function () { s.remove(); reject(new Error('無法載入 PDF 程式庫，請確認網路連線後再試')); };
    document.head.appendChild(s);
  });
}

/** 可匯出的系統欄位（表單題目另外列） */
function exportSystemFields_(groups) {
  function g(s) { return s.groupId && groups[s.groupId] ? groups[s.groupId] : null; }
  return [
    { key: 'sys:no', label: '序號', get: function (s, i) { return String(i + 1); } },
    { key: 'sys:status', label: '狀態', get: function (s) { return s.status; } },
    { key: 'sys:squad', label: '小隊', get: function (s) { return s.squad === '' || s.squad === undefined ? '' : String(s.squad); } },
    { key: 'sys:time', label: '報名時間', get: function (s) { return fmtTime(s.time); } },
    { key: 'sys:id', label: '學員編號', get: function (s) { return s.id; } },
    { key: 'sys:price', label: '應繳金額', get: function (s) { return s.price === '' ? '' : money(s.price); } },
    { key: 'sys:priceType', label: '價格方案', get: function (s) { return s.priceType || ''; } },
    { key: 'sys:deadline', label: '匯款期限', get: function (s) { return fmtTime(s.deadline); } },
    { key: 'sys:paid', label: '已繳金額', get: function (s) { return s.paid === '' ? '' : money(s.paid); } },
    { key: 'sys:rank', label: '候補順位', get: function (s) { return s.rank === '' ? '' : String(s.rank); } },
    { key: 'sys:group', label: '團報成員', get: function (s) { var x = g(s); return x ? x.names.join('、') + (s.groupIncomplete ? '（未齊）' : '') : ''; } },
    { key: 'sys:notified', label: '結果通知', get: function (s) { return /^\d{4}-\d{2}-\d{2}T/.test(s.notified) ? '已寄出 ' + fmtTime(s.notified.split(' ')[0]) : (s.notified || ''); } },
    { key: 'sys:last', label: '最新備註', get: function (s) { var h = s.history || []; return h.length ? h[h.length - 1].msg : ''; } }
  ];
}

function exportCellText_(v) {
  var s = String(v === undefined || v === null ? '' : v);
  var parts = s.split(/,\s*/);
  var links = parts.filter(function (x) { return /^https?:\/\//i.test(x); });
  if (links.length && links.length === parts.length) return '（已上傳 ' + links.length + ' 個檔案）';
  return s;
}

/** 中文姓名依筆畫排序（瀏覽器的繁體中文排序就是筆畫序） */
var STROKE_CMP = (window.Intl && Intl.Collator) ? new Intl.Collator('zh-Hant-TW').compare : function (a, b) { return a < b ? -1 : a > b ? 1 : 0; };

/** 功能欄：簽到、繳費確認、簽名、備註等空白欄位（印出來手寫用） */
var EXPORT_TOOLS = [
  { kind: 'check', label: '勾選欄', dflt: '報到', hint: '每格一個方框；按「＋ 新增勾選欄」可加好幾欄，例如報到、保險、繳費' },
  { kind: 'sign', label: '簽名欄', dflt: '簽名', hint: '加寬的空白欄，列高也會加高' },
  { kind: 'note', label: '備註欄', dflt: '備註', hint: '最寬的空白欄' }
];

/**
 * 開啟匯出視窗。
 * o: {prefix, project, groups, filtered:[], all:[], filterLabel, displayCols:[]}
 */
function openExportDialog(o) {
  var p = o.project;
  var sys = exportSystemFields_(o.groups || {});
  var questions = (p.questions || []).slice();
  (o.all || []).forEach(function (s) { Object.keys(s.data || {}).forEach(function (k) { if (questions.indexOf(k) < 0) questions.push(k); }); });
  var display = o.displayCols || [];

  function checkHtml(key, label, on) {
    return '<label class="check"><input type="checkbox" name="col" value="' + esc(key) + '"' + (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  }
  var body = el('<div class="export-dlg">' +
    '<div class="export-row"><span class="export-label">匯出範圍</span><div class="seg">' +
      '<label><input type="radio" name="scope" value="filtered" checked><span>目前畫面（' + esc(o.filterLabel) + '，' + o.filtered.length + ' 筆）</span></label>' +
      '<label><input type="radio" name="scope" value="all"><span>全部學員（' + o.all.length + ' 筆）</span></label></div>' +
      '<div class="row" style="gap:16px;margin-top:8px;flex-wrap:wrap">' +
      '<label class="check"><input type="checkbox" name="noGone" checked><span>不含取消／失敗</span></label>' +
      '<label class="check"><input type="checkbox" name="noWait" checked><span>不含候補</span></label>' +
      '<span class="small muted export-count"></span></div></div>' +
    (o.squads > 0 ? '<div class="export-row"><span class="export-label">排列順序</span><div class="seg">' +
      '<label><input type="radio" name="order" value="screen" checked><span>與畫面相同</span></label>' +
      '<label><input type="radio" name="order" value="squad"><span>依小隊（隊內依姓名筆畫）</span></label>' +
      '<label><input type="radio" name="order" value="stroke"><span>依姓名筆畫</span></label></div>' +
      '<label class="check export-break hidden"><input type="checkbox" name="squadBreak" checked><span>每個小隊從新的一頁開始</span></label></div>'
      : '<div class="export-row"><span class="export-label">排列順序</span><div class="seg">' +
      '<label><input type="radio" name="order" value="screen" checked><span>與畫面相同</span></label>' +
      '<label><input type="radio" name="order" value="stroke"><span>依姓名筆畫</span></label></div></div>') +
    '<div class="export-row"><span class="export-label">紙張方向</span><div class="seg">' +
      '<label><input type="radio" name="orient" value="portrait" checked><span>直式 A4</span></label>' +
      '<label><input type="radio" name="orient" value="landscape"><span>橫式 A4</span></label></div></div>' +
    '<div class="export-row top"><span class="export-label">匯出欄位</span><div class="grow">' +
      '<div class="export-group"><div class="export-group-head"><b>系統欄位</b><span class="spacer"></span><button type="button" class="link" data-all="sys">全選</button><button type="button" class="link" data-none="sys">清除</button></div>' +
        '<div class="export-cols" data-g="sys">' + sys.map(function (f) { return checkHtml(f.key, f.label, f.key === 'sys:no' || f.key === 'sys:status'); }).join('') + '</div></div>' +
      '<div class="export-group"><div class="export-group-head"><b>表單題目</b><span class="spacer"></span><button type="button" class="link" data-all="q">全選</button><button type="button" class="link" data-none="q">清除</button></div>' +
        '<div class="export-cols" data-g="q">' + (questions.length ? questions.map(function (q) { return checkHtml('q:' + q, q, display.indexOf(q) >= 0); }).join('') : '<span class="muted small">尚未讀取表單題目</span>') + '</div></div>' +
      '<div class="export-group"><div class="export-group-head"><b>功能欄</b><span class="small muted">　空白欄位，印出來手寫或打勾；標題可以改</span></div>' +
        '<div class="export-tools">' + EXPORT_TOOLS.map(function (t) {
          if (t.kind === 'check') return '<div class="export-tool"><label class="check"><input type="checkbox" name="tool" value="check"><span>' + esc(t.label) + '</span></label>' +
            '<div class="export-checks-wrap"><div class="export-checks"></div><button type="button" class="btn sm ghost" data-add-check>＋ 新增勾選欄</button></div><span class="small muted">' + esc(t.hint) + '</span></div>';
          return '<div class="export-tool"><label class="check"><input type="checkbox" name="tool" value="' + t.kind + '"><span>' + esc(t.label) + '</span></label>' +
            '<input class="input sm" name="tool_' + t.kind + '" value="' + esc(t.dflt) + '" aria-label="' + esc(t.label) + '標題"><span class="small muted">' + esc(t.hint) + '</span></div>';
        }).join('') + '</div></div>' +
    '</div></div>' +
    '<div class="small muted export-hint"></div>' +
    '<div class="small export-err" style="color:var(--bad);min-height:16px"></div></div>');

  function selected() { return $$('input[name=col]:checked', body).map(function (i) { return i.value; }); }
  function tools() {
    var out = [];
    $$('input[name=tool]:checked', body).forEach(function (i) {
      var names = i.value === 'check'
        ? $$('input[name=checkcol]', body).map(function (x) { return x.value.trim(); }).filter(String)
        : [$('input[name=tool_' + i.value + ']', body).value.trim() || EXPORT_TOOLS.filter(function (t) { return t.kind === i.value; })[0].dflt];
      if (!names.length) names = ['報到'];
      names.forEach(function (n) { out.push({ kind: i.value, label: n }); });
    });
    return out;
  }
  // 勾選欄可以一欄一欄加（每欄一個標題），改標題時自動勾選功能欄
  var checksBox = $('.export-checks', body);
  function addCheck(val, focus) {
    var r = el('<div class="export-check-row"><input class="input sm" name="checkcol" aria-label="勾選欄標題" placeholder="例如：保險"><button type="button" class="btn sm ghost icon" aria-label="刪除這欄">✕</button></div>');
    $('input', r).value = val || '';
    $('button', r).addEventListener('click', function () {
      r.remove();
      if (!$$('input[name=checkcol]', body).length) addCheck('', false);
      syncTool($('input[name=tool][value=check]', body), $$('input[name=checkcol]', body).some(function (x) { return x.value.trim(); }));
    });
    checksBox.appendChild(r);
    if (focus) $('input', r).focus();
  }
  addCheck('報到', false);
  $('[data-add-check]', body).addEventListener('click', function () { addCheck('', true); });
  function syncTool(cb, on) {
    if (cb.checked !== on) { cb.checked = on; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    hint();
  }
  body.addEventListener('input', function (e) {
    if (e.target.name === 'checkcol') syncTool($('input[name=tool][value=check]', body), $$('input[name=checkcol]', body).some(function (x) { return x.value.trim(); }));
    else if (/^tool_/.test(e.target.name || '')) syncTool($('input[name=tool]', e.target.parentNode), !!e.target.value.trim());
  });
  function pick(scope) {
    var noGone = $('input[name=noGone]', body).checked, noWait = $('input[name=noWait]', body).checked;
    return (scope === 'all' ? o.all : o.filtered).filter(function (s) {
      if (noGone && ['報名取消', '報名失敗'].indexOf(s.status) >= 0) return false;
      if (noWait && s.status === '候補中') return false;
      return true;
    });
  }
  function count() { $('.export-count', body).textContent = '將匯出 ' + pick($('input[name=scope]:checked', body).value).length + ' 筆'; }
  function hint() {
    var n = selected().length + tools().length;
    $('.export-hint', body).textContent = '已選 ' + n + ' 欄。欄位多於 7 欄時建議用橫式；PDF 的欄位順序與上面相同，功能欄放在最後。';
  }
  $$('[data-all],[data-none]', body).forEach(function (b) {
    b.addEventListener('click', function () {
      var g = b.getAttribute('data-all') || b.getAttribute('data-none');
      $$('[data-g="' + g + '"] input', body).forEach(function (i) { i.checked = b.hasAttribute('data-all'); });
      hint();
    });
  });
  body.addEventListener('change', function (e) {
    if (e.target.name === 'order') { var br = $('.export-break', body); if (br) br.classList.toggle('hidden', e.target.value !== 'squad'); }
    if (e.target.name === 'col' || e.target.name === 'tool') {
      // 欄位一多自動建議橫式（使用者仍可改回）
      if (selected().length + tools().length > 7 && !body.dataset.touched) $('input[name=orient][value=landscape]', body).checked = true;
      hint();
    }
    if (e.target.name === 'orient') body.dataset.touched = '1';
    if (['scope', 'noGone', 'noWait'].indexOf(e.target.name) >= 0) count();
  });
  count();
  // 預設勾選的欄位多於 7 欄就先選橫式
  if (selected().length > 7) $('input[name=orient][value=landscape]', body).checked = true;
  hint();

  return modal({
    title: '匯出學員名單 PDF', wide: true, body: body,
    buttons: [{ label: '取消', value: null }, {
      label: '匯出 PDF', cls: 'primary',
      validate: function () {
        if (!selected().length && !tools().length) { $('.export-err', body).textContent = '請至少勾選一個欄位'; return false; }
        return true;
      },
      value: function () {
        return {
          scope: $('input[name=scope]:checked', body).value,
          list: pick($('input[name=scope]:checked', body).value),
          exclude: [$('input[name=noGone]', body).checked ? '不含取消' : '', $('input[name=noWait]', body).checked ? '不含候補' : ''].filter(String).join('、'),
          orientation: $('input[name=orient]:checked', body).value,
          keys: selected(), tools: tools(),
          order: $('input[name=order]:checked', body).value,
          squadBreak: !!($('input[name=squadBreak]', body) || {}).checked
        };
      }
    }]
  }).then(function (v) {
    if (!v) return;
    var fields = v.keys.map(function (k) {
      if (k.indexOf('sys:') === 0) return sys.filter(function (f) { return f.key === k; })[0];
      var q = k.slice(2);
      return { key: k, label: q, hl: (p.highlight || {})[q], raw: function (s) { return (s.data || {})[q]; }, get: function (s) { return exportCellText_((s.data || {})[q]); } };
    });
    v.tools.forEach(function (t, i) {
      fields.push({ key: 'tool:' + i, label: t.label, tool: t.kind, get: function () { return t.kind === 'check' ? '☐' : ''; } });
    });
    var list = v.list.slice();
    if (v.order === 'stroke') list.sort(function (a, b) { return STROKE_CMP(a.name, b.name); });
    if (v.order === 'squad') list.sort(function (a, b) {
      return (a.squad === '' || a.squad === undefined ? 999 : a.squad) - (b.squad === '' || b.squad === undefined ? 999 : b.squad) || STROKE_CMP(a.name, b.name);
    });
    if (!list.length) { toast('沒有可匯出的學員', true); return; }
    var scopeText = (v.scope === 'all' ? '全部學員' : '篩選：' + o.filterLabel) + (v.order === 'squad' ? '　·　依小隊' : v.order === 'stroke' ? '　·　依筆畫' : '') + (v.exclude ? '　·　' + v.exclude : '');
    return confirmDialog({
      title: '此內容包含學員個資', desc: '匯出的 PDF 含有學員個人資料，僅供營隊用途使用。',
      lines: ['請勿轉寄、公開或用於營隊以外的目的', '用畢請妥善保管或刪除檔案', '每頁頁尾會標示「含學員個資，僅供營隊用途」，匯出會記錄在操作紀錄'],
      okLabel: '我了解，匯出'
    }).then(function (agreed) {
    if (!agreed) return;
    busy(true);
    return api('logExport', o.prefix, { columns: fields.map(function (f) { return f.label; }), count: list.length, orientation: v.orientation, scope: scopeText })
      .then(function () { return buildStudentsPdf_({ project: p, fields: fields, list: list, orientation: v.orientation, scopeText: scopeText, bySquad: v.order === 'squad', squadBreak: v.order === 'squad' && v.squadBreak }); })
      .then(function (r) { busy(false); toast('已匯出 ' + list.length + ' 筆，共 ' + r.pages + ' 頁'); })
      .catch(function (e) { busy(false); toast(e.message, true); });
    });
  });
}

/** 依頁面大小把表格分頁，每頁轉成圖片放進 A4 PDF 後下載 */
function buildStudentsPdf_(o) {
  var land = o.orientation === 'landscape';
  var W = land ? 1123 : 794, H = land ? 794 : 1123;   // A4 在 96 dpi 下的像素
  var PAD = 40, FOOT = 28;
  var now = new Date();
  var stamp = fmtTime(now.toISOString());
  var user = (App.user && (App.user.name || App.user.email)) || '';
  var p = o.project;

  return Promise.all(EXPORT_LIBS.map(loadScriptOnce_))
    .then(function () { return document.fonts && document.fonts.ready; })
    .then(function () {
      var host = el('<div class="pdf-host" aria-hidden="true"></div>');
      document.body.appendChild(host);
      var pages = [];
      var tableStyle = '';
      var TOOL_W = { check: 40, sign: 100, note: 140 };
      function toolStyle(f) { return f.tool ? ' style="width:' + TOOL_W[f.tool] + 'px;min-width:' + TOOL_W[f.tool] + 'px"' : ''; }
      var head = '<tr>' + o.fields.map(function (f) { return '<th' + toolStyle(f) + (f.tool ? ' class="tool"' : '') + '>' + esc(f.label) + '</th>'; }).join('') + '</tr>';
      var hasSign = o.fields.some(function (f) { return f.tool === 'sign'; });
      function squadLabel(s) { return s.squad === '' || s.squad === undefined ? '未分隊' : '第 ' + s.squad + ' 小隊'; }

      function newPage() {
        var first = !pages.length;
        var pg = el('<div class="pdf-page' + (land ? ' land' : '') + '" style="width:' + W + 'px;height:' + H + 'px;padding:' + PAD + 'px ' + PAD + 'px 0">' +
          '<div class="pdf-flow">' +
            (first
              ? '<div class="pdf-title"><h1></h1><div class="pdf-meta"></div></div>'
              : '<div class="pdf-cont"></div>') +
            '<table class="pdf-table" style="' + tableStyle + '"><thead>' + head + '</thead><tbody></tbody></table>' +
          '</div><div class="pdf-foot" style="left:' + PAD + 'px;right:' + PAD + 'px;bottom:' + (PAD / 2) + 'px"><span></span><span class="pn"></span></div></div>');
        if (first) {
          $('h1', pg).textContent = p.name + '　學員名單';
          $('.pdf-meta', pg).textContent = p.prefix + '　·　營期 ' + fmtDate(p.start) + ' – ' + fmtDate(p.end) + '　·　' + o.scopeText + '　·　共 ' + o.list.length + ' 筆　·　' + stamp + ' 由 ' + user + ' 匯出';
        } else {
          $('.pdf-cont', pg).textContent = p.name + '　學員名單（續）';
        }
        $('.pdf-foot span', pg).textContent = p.prefix + '　' + stamp + '　·　含學員個資，僅供營隊用途，請勿外流　·　' + COPYRIGHT;
        host.appendChild(pg);
        pages.push(pg);
        return pg;
      }

      var avail = H - PAD - FOOT - PAD / 2;
      // 先算好每格內容；內容都很短的欄位（狀態、電話、金額）不換行，長文字欄位才換行
      // 依小隊排列時，序號在每一隊重新從 1 開始
      var seq = [], cnt = {};
      o.list.forEach(function (s) { var k = o.bySquad ? squadLabel(s) : ''; cnt[k] = (cnt[k] || 0) + 1; seq.push(cnt[k] - 1); });
      var rows = o.list.map(function (s, i) { return o.fields.map(function (f) { return String(f.get(s, seq[i]) || ''); }); });
      var noWrap = o.fields.map(function (f, c) {
        return !f.tool && rows.every(function (r) { return r[c].length <= 14; });
      });
      // 欄位太多放不下時，自動縮小字級；最小 6px 仍放不下就讓短欄位也換行
      var contentW = W - PAD * 2;
      var font = land ? 11 : 10.5;
      function tableWidth(px, useNw) {
        var t = el('<table class="pdf-table" style="width:auto;font-size:' + px + 'px"><thead>' + head + '</thead><tbody></tbody></table>');
        var tb = t.querySelector('tbody');
        rows.forEach(function (r) {
          var tr = document.createElement('tr');
          r.forEach(function (v, c) { var td = document.createElement('td'); td.textContent = v; if (useNw && noWrap[c]) td.className = 'nw'; if (o.fields[c].tool) td.style.minWidth = TOOL_W[o.fields[c].tool] + 'px'; tr.appendChild(td); });
          tb.appendChild(tr);
        });
        var box = el('<div class="pdf-page" style="width:' + (contentW * 4) + 'px"></div>');
        box.appendChild(t); host.appendChild(box);
        var w = t.offsetWidth; box.remove();
        return w;
      }
      var natural = tableWidth(font, true);
      if (natural > contentW) {
        font = Math.max(6, Math.floor(font * contentW / natural * 10) / 10);
        if (tableWidth(font, true) > contentW) noWrap = noWrap.map(function () { return false; });
      }
      tableStyle = 'font-size:' + font + 'px' + (font < 9 ? ';--cellpad:' + Math.max(2, Math.round(font / 2.2)) + 'px' : '');

      var pg = newPage();
      var lastSquad = null;
      function fits() { return $('.pdf-flow', pg).offsetHeight <= avail; }
      o.list.forEach(function (s, i) {
        var tb = $('tbody', pg);
        if (o.bySquad && squadLabel(s) !== lastSquad) {
          var n = o.list.filter(function (x) { return squadLabel(x) === squadLabel(s); }).length;
          if (o.squadBreak && lastSquad !== null && tb.children.length) { pg = newPage(); tb = $('tbody', pg); }
          var hr = el('<tr class="squad-head"><td colspan="' + o.fields.length + '"></td></tr>');
          hr.firstChild.textContent = squadLabel(s) + '（' + n + ' 人）';
          tb.appendChild(hr);
          if (!fits() && tb.children.length > 1) { tb.removeChild(hr); pg = newPage(); tb = $('tbody', pg); tb.appendChild(hr); }
          lastSquad = squadLabel(s);
        }
        var tr = document.createElement('tr');
        if (['報名取消', '報名失敗'].indexOf(s.status) >= 0) tr.className = 'gone';
        if (hasSign) tr.classList.add('tall');
        rows[i].forEach(function (v, c) {
          var td = document.createElement('td');
          td.textContent = v;
          if (noWrap[c]) td.className = 'nw';
          if (o.fields[c].tool) td.classList.add('tool', 'tool-' + o.fields[c].tool);
          if (o.fields[c].hl && highlightHit(o.fields[c].hl, o.fields[c].raw(s))) td.classList.add('hl');   // 和名單一樣的強調顯示
          tr.appendChild(td);
        });
        tb.appendChild(tr);
        if (!fits() && tb.children.length > 1) {
          tb.removeChild(tr);
          var prevHead = tb.lastElementChild && tb.lastElementChild.classList.contains('squad-head') ? tb.lastElementChild : null;
          if (prevHead) tb.removeChild(prevHead);       // 小隊標題不要孤單留在上一頁底部
          pg = newPage();
          if (prevHead) $('tbody', pg).appendChild(prevHead);
          else if (o.bySquad) {                         // 跨頁的小隊在新頁標示「（續）」
            var cont = el('<tr class="squad-head"><td colspan="' + o.fields.length + '"></td></tr>');
            cont.firstChild.textContent = squadLabel(s) + '（續）';
            $('tbody', pg).appendChild(cont);
          }
          $('tbody', pg).appendChild(tr);
        }
      });
      pages.forEach(function (x, i) { $('.pn', x).textContent = '第 ' + (i + 1) + ' / ' + pages.length + ' 頁'; });

      var doc = new window.jspdf.jsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
      var mmW = land ? 297 : 210, mmH = land ? 210 : 297;
      var chain = Promise.resolve();
      pages.forEach(function (x, i) {
        chain = chain.then(function () {
          return window.html2canvas(x, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, width: W, height: H, windowWidth: W, windowHeight: H });
        }).then(function (canvas) {
          if (i > 0) doc.addPage('a4', land ? 'landscape' : 'portrait');
          doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, mmW, mmH, undefined, 'FAST');
        });
      });
      return chain.then(function () {
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        var name = p.prefix + '_學員名單_' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes()) + '.pdf';
        var url = URL.createObjectURL(doc.output('blob'));
        var a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        host.remove();
        return { pages: pages.length, file: name };
      }, function (e) { host.remove(); throw e; });
    });
}
