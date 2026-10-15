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
      '<label><input type="radio" name="scope" value="all"><span>全部學員（' + o.all.length + ' 筆）</span></label></div></div>' +
    '<div class="export-row"><span class="export-label">紙張方向</span><div class="seg">' +
      '<label><input type="radio" name="orient" value="portrait" checked><span>直式 A4</span></label>' +
      '<label><input type="radio" name="orient" value="landscape"><span>橫式 A4</span></label></div></div>' +
    '<div class="export-row top"><span class="export-label">匯出欄位</span><div class="grow">' +
      '<div class="export-group"><div class="export-group-head"><b>系統欄位</b><span class="spacer"></span><button type="button" class="link" data-all="sys">全選</button><button type="button" class="link" data-none="sys">清除</button></div>' +
        '<div class="export-cols" data-g="sys">' + sys.map(function (f) { return checkHtml(f.key, f.label, f.key === 'sys:no' || f.key === 'sys:status'); }).join('') + '</div></div>' +
      '<div class="export-group"><div class="export-group-head"><b>表單題目</b><span class="spacer"></span><button type="button" class="link" data-all="q">全選</button><button type="button" class="link" data-none="q">清除</button></div>' +
        '<div class="export-cols" data-g="q">' + (questions.length ? questions.map(function (q) { return checkHtml('q:' + q, q, display.indexOf(q) >= 0); }).join('') : '<span class="muted small">尚未讀取表單題目</span>') + '</div></div>' +
    '</div></div>' +
    '<div class="small muted export-hint"></div>' +
    '<div class="small export-err" style="color:var(--bad);min-height:16px"></div></div>');

  function selected() { return $$('input[name=col]:checked', body).map(function (i) { return i.value; }); }
  function hint() {
    var n = selected().length;
    $('.export-hint', body).textContent = '已選 ' + n + ' 欄。欄位多於 7 欄時建議用橫式；PDF 的欄位順序與上面相同。';
  }
  $$('[data-all],[data-none]', body).forEach(function (b) {
    b.addEventListener('click', function () {
      var g = b.getAttribute('data-all') || b.getAttribute('data-none');
      $$('[data-g="' + g + '"] input', body).forEach(function (i) { i.checked = b.hasAttribute('data-all'); });
      hint();
    });
  });
  body.addEventListener('change', function (e) {
    if (e.target.name === 'col') {
      // 欄位一多自動建議橫式（使用者仍可改回）
      if (selected().length > 7 && !body.dataset.touched) $('input[name=orient][value=landscape]', body).checked = true;
      hint();
    }
    if (e.target.name === 'orient') body.dataset.touched = '1';
  });
  // 預設勾選的欄位多於 7 欄就先選橫式
  if (selected().length > 7) $('input[name=orient][value=landscape]', body).checked = true;
  hint();

  return modal({
    title: '匯出學員名單 PDF', wide: true, body: body,
    buttons: [{ label: '取消', value: null }, {
      label: '匯出 PDF', cls: 'primary',
      validate: function () {
        if (!selected().length) { $('.export-err', body).textContent = '請至少勾選一個欄位'; return false; }
        return true;
      },
      value: function () {
        return {
          scope: $('input[name=scope]:checked', body).value,
          orientation: $('input[name=orient]:checked', body).value,
          keys: selected()
        };
      }
    }]
  }).then(function (v) {
    if (!v) return;
    var fields = v.keys.map(function (k) {
      if (k.indexOf('sys:') === 0) return sys.filter(function (f) { return f.key === k; })[0];
      var q = k.slice(2);
      return { key: k, label: q, get: function (s) { return exportCellText_((s.data || {})[q]); } };
    });
    var list = v.scope === 'all' ? o.all : o.filtered;
    if (!list.length) { toast('沒有可匯出的學員', true); return; }
    var scopeText = v.scope === 'all' ? '全部學員' : '篩選：' + o.filterLabel;
    return confirmDialog({
      title: '此內容包含學員個資', desc: '匯出的 PDF 含有學員個人資料，僅供營隊用途使用。',
      lines: ['請勿轉寄、公開或用於營隊以外的目的', '用畢請妥善保管或刪除檔案', '每頁頁尾會標示「含學員個資，僅供營隊用途」，匯出會記錄在操作紀錄'],
      okLabel: '我了解，匯出'
    }).then(function (agreed) {
    if (!agreed) return;
    busy(true);
    return api('logExport', o.prefix, { columns: fields.map(function (f) { return f.label; }), count: list.length, orientation: v.orientation, scope: scopeText })
      .then(function () { return buildStudentsPdf_({ project: p, fields: fields, list: list, orientation: v.orientation, scopeText: scopeText }); })
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
      var head = '<tr>' + o.fields.map(function (f) { return '<th>' + esc(f.label) + '</th>'; }).join('') + '</tr>';

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
        $('.pdf-foot span', pg).textContent = p.prefix + '　' + stamp + '　·　含學員個資，僅供營隊用途，請勿外流';
        host.appendChild(pg);
        pages.push(pg);
        return pg;
      }

      var avail = H - PAD - FOOT - PAD / 2;
      // 先算好每格內容；內容都很短的欄位（狀態、電話、金額）不換行，長文字欄位才換行
      var rows = o.list.map(function (s, i) { return o.fields.map(function (f) { return String(f.get(s, i) || ''); }); });
      var noWrap = o.fields.map(function (f, c) {
        return rows.every(function (r) { return r[c].length <= 14; });
      });
      // 欄位太多放不下時，自動縮小字級；最小 6px 仍放不下就讓短欄位也換行
      var contentW = W - PAD * 2;
      var font = land ? 11 : 10.5;
      function tableWidth(px, useNw) {
        var t = el('<table class="pdf-table" style="width:auto;font-size:' + px + 'px"><thead>' + head + '</thead><tbody></tbody></table>');
        var tb = t.querySelector('tbody');
        rows.forEach(function (r) {
          var tr = document.createElement('tr');
          r.forEach(function (v, c) { var td = document.createElement('td'); td.textContent = v; if (useNw && noWrap[c]) td.className = 'nw'; tr.appendChild(td); });
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
      o.list.forEach(function (s, i) {
        var tr = document.createElement('tr');
        if (['報名取消', '報名失敗'].indexOf(s.status) >= 0) tr.className = 'gone';
        rows[i].forEach(function (v, c) {
          var td = document.createElement('td');
          td.textContent = v;
          if (noWrap[c]) td.className = 'nw';
          tr.appendChild(td);
        });
        var tb = $('tbody', pg);
        tb.appendChild(tr);
        if ($('.pdf-flow', pg).offsetHeight > avail && tb.children.length > 1) {
          tb.removeChild(tr);
          pg = newPage();
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
