/* 營隊報名管理系統　© 2026 Daniel GUO. All rights reserved. */
/**
 * 專案設定表單：「開始新專案」第 2 步與「報名與學員管理 → 專案設定」共用同一份欄位、分區與名稱。
 * 每一區標示「已設定／尚未設定」；開始新專案時選填的區塊可以先收起來跳過，建立完成頁列出還沒設定的區塊。
 *
 * 用法：
 *   var sf = SettingsForm.build(box, p, { isNew, ro, fieldKeys, activeCount, onSquadStaff, onRefresh });
 *   sf.collect()  → 全部的值（檢查不過就丟出 Error，訊息直接給使用者看）
 *   sf.patch()    → 跟 p 比對後有變動的欄位（專案設定用；順序不同但內容一樣的不算變動）
 *   sf.focus(key) → 捲到某一區並標示
 *   SettingsForm.status(values) → [{key, title, set, text}]
 * 需要 app.js（el、$、$$、esc、chipEditor、formatToolbar、hexField、bindHexField、guardDates、bankError…）。
 */
var SettingsForm = (function () {
  var SECTIONS = [
    { key: 'quota', title: '名額與遞補' },
    { key: 'fees', title: '費用與匯款' },
    { key: 'refund', title: '退款規定', optional: true },
    { key: 'info', title: '營隊資訊' },
    { key: 'hotel', title: '飯店資訊', optional: true },
    { key: 'contacts', title: '聯絡人員', optional: true },
    { key: 'footer', title: '信件附註', optional: true },
    { key: 'squads', title: '小隊與資料檢查', optional: true },
    { key: 'mapping', title: '表單欄位對應' },
    { key: 'display', title: '名單顯示欄位' },
    { key: 'echo', title: '報名結果信附上的回覆內容', optional: true }
  ];
  var SIMPLE = ['capacity', 'holdHours', 'promoteMode', 'waitOrder', 'price', 'groupPrice', 'earlyPrice', 'earlyGroupPrice', 'earlyDeadline', 'lowIncomePrice', 'payDays', 'name', 'signature', 'regStart', 'regEnd', 'start', 'end', 'squads', 'emailDomains', 'groupMax', 'replyTo', 'refundFee'];
  var HOTEL_KEYS = ['name', 'address', 'phone', 'checkin', 'checkout', 'url', 'note'];
  var BANK_KEYS = ['bank', 'code', 'branch', 'name', 'no'];
  var DEFAULT_KEYS = ['name', 'parentPhone', 'studentPhone', 'idNumber', 'birth', 'diet', 'specialDiet', 'allergy'];

  (function css() {
    if (document.getElementById('sf-css')) return;
    var s = document.createElement('style');
    s.id = 'sf-css';
    s.textContent = '.sf-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}.sf-head h3{margin:0}.sf-head .grow{flex:1 1 auto}' +
      '.sf-state{font-size:12px;padding:1px 10px;border-radius:999px;background:var(--mute-soft);color:var(--text-2);white-space:nowrap}.sf-state.set{background:var(--ok-soft,#e4efe6);color:var(--ok,#2f6a45)}.sf-state.need{background:var(--bad-soft,#fdecea);color:var(--bad,#b3261e)}' +
      '.sf-opt{font-size:12px;color:var(--text-3)}.sf-sec.sf-closed .sf-body{display:none}.sf-sec.sf-closed .sf-head{margin-bottom:0}.sf-sec.sf-hit{box-shadow:0 0 0 3px var(--brand,#2f5d62)}' +
      '.sf-fold{height:26px;padding:0 10px;font-size:12px}';
    document.head.appendChild(s);
  })();

  /** 新專案的預設值（與後端建立專案時的預設相同） */
  function blank(o) {
    return {
      capacity: '', holdHours: 72, promoteMode: '手動', waitOrder: '報名時間', price: '', groupPrice: '', earlyPrice: '', earlyGroupPrice: '', earlyDeadline: '', lowIncomePrice: '',
      payDays: 1, remind: { on: false, hours: 24 }, bank: null, account: '', refund: { tiers: [], note: '' }, name: o.name || '', signature: '', regStart: '', regEnd: '', start: '', end: '',
      headerColor: '', hotel: {}, contacts: [], contactsInMail: true, footer: '', footerEffective: o.footerSystem || '', footerSystem: o.footerSystem || '',
      squads: 0, emailDomains: '', groupMax: 5, replyTo: '', refundFee: 0, mapping: o.mapping || {}, display: o.display || [], echo: [], echoMask: false, questions: o.questions || []
    };
  }

  function build(box, p, o) {
    o = o || {};
    if (o.isNew) p = Object.assign(blank(o), p || {});
    var ro = !!o.ro, dis = ro ? ' disabled' : '';
    var fk = o.fieldKeys || [];
    var questions = p.questions || [];
    var hideEcho = [].concat((p.mapping || {}).lowIncome || []);   // 低收／中低收身分那題不放進信裡，以示尊重
    function f(name, label, type, value, hint) {
      return '<label class="field"><span>' + label + '</span><input class="input" name="' + name + '" type="' + type + '" value="' + esc(value === undefined || value === null ? '' : value) + '"' + dis + '>' + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</label>';
    }
    function sel(name, label, options, value) {
      return '<label class="field"><span>' + esc(label) + '</span><select class="input" name="' + name + '"' + dis + '>' +
        options.map(function (x) { return '<option' + (x === value ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></label>';
    }
    function qOpts(cur) {
      return '<option value="">（未對應）</option>' + questions.map(function (q) { return '<option value="' + esc(q) + '"' + (q === cur ? ' selected' : '') + '>' + esc(q) + '</option>'; }).join('');
    }
    function sec(key, extraHead, inner) {
      var s = SECTIONS.filter(function (x) { return x.key === key; })[0];
      return '<div class="drawer-section sf-sec" data-sec="' + key + '"><div class="sf-head"><h3>' + esc(s.title) + '</h3><span class="sf-state"></span>' +
        (o.isNew && s.optional ? '<span class="sf-opt">選填，可以之後在專案設定填</span>' : '') + '<span class="grow"></span>' + (extraHead || '') +
        (o.isNew ? '<button class="btn sm ghost sf-fold" type="button">收起</button>' : '') + '</div><div class="sf-body">' + inner + '</div></div>';
    }
    var req = o.isNew ? '<em>*</em>' : '';
    var hasBank = !!p.bank;
    box.innerHTML =
      sec('quota', '', '<div class="grid-2">' +
        f('capacity', '招生人數上限' + req, 'number', p.capacity, o.isNew ? '' : '目前已錄取 ' + (o.activeCount || 0) + ' 人，只能設為 ' + (o.activeCount || 0) + ' 以上；要更低請先取消特定學員報名') +
        f('holdHours', '團報預留名額保留時數', 'number', p.holdHours) +
        sel('promoteMode', '遞補模式', ['手動', '自動'], p.promoteMode) +
        sel('waitOrder', '候補順序', ['報名時間', '人工'], p.waitOrder) +
        f('groupMax', '團報人數上限', 'number', p.groupMax || 5, '一團最多幾人（含填表的人）；超過的團不保留名額，列入警示請你確認') + '</div>') +
      sec('fees', '', '<div class="grid-2">' +
        f('price', '原價' + req, 'number', p.price) + f('groupPrice', '團報價（選填）', 'number', p.groupPrice) +
        f('earlyPrice', '早鳥價（選填）', 'number', p.earlyPrice) + f('earlyGroupPrice', '早鳥團報價（選填）', 'number', p.earlyGroupPrice, '早鳥期限內的團報；沒填就在早鳥價與團報價中取較低的') +
        f('earlyDeadline', '早鳥期限（有早鳥價才需要）', 'date', p.earlyDeadline) +
        f('lowIncomePrice', '低收報名費（選填，可填 0）', 'number', p.lowIncomePrice === undefined || p.lowIncomePrice === null ? '' : p.lowIncomePrice, '低收／中低收資格審核通過時預設的應繳金額；0 = 全額補助（審核通過直接程序完成）；留空 = 照報名時的價格') +
        f('payDays', '匯款期限（報名後幾天）', 'number', p.payDays, '1 = 報名隔天 23:59') +
        '<div class="field"><span>匯款期限鄰近通知</span><label class="check" style="min-height:38px"><input type="checkbox" name="remindOn"' + (p.remind && p.remind.on ? ' checked' : '') + dis + '><span>自動寄給還沒匯款的人</span></label></div>' +
        '<div class="field"><span>期限前幾小時寄</span><input class="input" name="remindHours" type="number" min="1" max="336" value="' + esc(p.remind ? p.remind.hours : 24) + '"' + dis + '><span class="hint">例如 24 是期限前一天、72 是前三天；每人每個期限只寄一次</span></div>' +
        '</div><div class="field bank-fields" style="margin-top:10px"><span>匯款帳號' + req + '</span><div class="bank-grid">' +
        [['bank', '銀行（例如 台灣銀行）'], ['code', '銀行代碼（例如 004）'], ['branch', '分行（例如 新竹分行）'], ['name', '戶名'], ['no', '帳號']].map(function (x) {
          return '<input class="input" name="bank_' + x[0] + '" placeholder="' + esc(x[1]) + '" aria-label="' + esc(x[1]) + '" value="' + esc(hasBank ? p.bank[x[0]] || '' : '') + '"' + dis + '>';
        }).join('') + '</div><span class="hint">' + (o.isNew ? '銀行、分行、戶名、帳號必填；銀行代碼方便學員用 ATM 轉帳' : hasBank ? '信件裡的 {{匯款帳號}} 會顯示：' + esc(p.account) : '目前是舊格式：「' + esc(p.account) + '」，請改填銀行、分行、戶名、帳號') + '</span></div>' +
        '<div class="hint" style="margin-top:8px">' + (o.isNew ? '價格之後可以在專案設定修改，' : '') + '價格變更只影響之後的報名；已報名學員的金額請用「報名費用異動通知」。</div>') +
      sec('refund', ro ? '' : '<button class="btn sm" type="button" data-a="rf-add">＋ 新增時間段</button>',
        '<p class="hint" style="margin-top:0">每一段是「這天（含）前取消，退還幾 %」，日期可以設到營隊開始前一天；最後一段之後取消不退費。信件放 {{退款規定}} 會變成表格，取消報名表單也會顯示；已繳費的人取消時會看到依今天日期估算的退款金額。</p>' +
        '<div class="rf-list"></div>' +
        '<label class="field" style="margin-top:10px"><span>其他說明</span><textarea class="input" name="refundNote" rows="2" maxlength="1000" placeholder="例如：自行取消報名者，需自行負擔衍生費用（郵匯費、手續費等）"' + dis + '></textarea><span class="hint">可以用信件的格式（粗體、顏色…）</span></label>' +
        '<div class="grid-2" style="margin-top:10px">' + f('refundFee', '退款郵匯費（元）', 'number', p.refundFee || 0, '取消報名表單試算退款時先扣掉；取消報名視窗的「郵匯費」也自動帶入。0 = 不扣') + '</div>') +
      sec('info', '', '<div class="grid-2">' +
        f('name', '營隊名稱' + req, 'text', p.name) +
        '<div class="field set-sig" style="grid-column:1 / -1"><span>信件署名（每封信最後置中顯示）</span><input class="input" name="signature" placeholder="' + esc((p.name || '營隊名稱') + ' 籌辦團隊 敬上') + '"' + dis + '><span class="hint">留空時用「' + esc(p.name || '營隊名稱') + ' 籌辦團隊 敬上」；選取文字後按上方按鈕加粗體、顏色、螢光、字級</span></div>' +
        f('regStart', '開始招生日期' + req, 'date', p.regStart, '這天 00:00 起受理報名') + f('regEnd', '預計結束招生日期', 'date', p.regEnd, '這天 23:59 後的報名會先記為「招生期外」') +
        f('start', '營期開始' + req, 'date', p.start) + f('end', '營期結束' + req, 'date', p.end, '超過營期後不再收報名、學員表單關閉，仍可寄信與處理學員；封存後才完全唯讀') +
        f('replyTo', '回覆信箱（選填）', 'email', p.replyTo || '', '學員按「回覆」時寄到這個信箱；留空 = 不指定') +
        '<div class="field"><span>信件標頭預設顏色</span>' + hexField('set-head', p.headerColor || '#2f5d62') + '<span class="hint">沒自訂顏色的信都用這個（原本是墨綠 #2f5d62）；每種信可在「信件範本」各自改顏色來區分</span></div>' +
        '</div>') +
      sec('hotel', '', '<p class="hint" style="margin-top:0">有住宿時填寫，名稱、地址、電話必填；不需要住宿就全部留空。信件可用 {{飯店資訊}}（整張卡片）、{{飯店名稱}}、{{飯店地址}}、{{飯店電話}}，學員專區會自動顯示（含地圖）。分房請用「分房」按鈕，信件可用 {{房號}}。</p><div class="grid-2">' +
        f('h_name', '飯店名稱 *', 'text', (p.hotel || {}).name) + f('h_phone', '電話 *', 'text', (p.hotel || {}).phone) +
        '<div style="grid-column:1 / -1">' + f('h_address', '地址 *', 'text', (p.hotel || {}).address) + '</div>' +
        f('h_checkin', '入住時間（選填）', 'text', (p.hotel || {}).checkin, '例如 7/1 15:00 後') + f('h_checkout', '退房時間（選填）', 'text', (p.hotel || {}).checkout, '例如 7/3 11:00 前') +
        '<div style="grid-column:1 / -1">' + f('h_url', '飯店網站（選填）', 'text', (p.hotel || {}).url, 'https:// 開頭') + '</div>' +
        '<label class="field" style="grid-column:1 / -1"><span>其他說明（選填）</span><textarea class="input" name="h_note" rows="3" maxlength="2000" placeholder="例如：停車資訊、早餐時間、需自備盥洗用品"' + dis + '></textarea></label>' +
        '</div>') +
      sec('contacts', ro ? '' : '<button class="btn sm" type="button" data-a="ct-add">＋ 新增聯絡人</button>',
        '<p class="hint" style="margin-top:0">報名者有疑問時的聯絡窗口。第一格填職稱（總召）或官方帳號名稱（例如 醫工營 IG），官方帳號可以不填姓名；電話、信箱、IG、LINE、連結至少填一項。範本或附註可放 {{聯絡人員}} 指定位置。</p>' +
        '<div class="ct-list"></div>' +
        '<label class="check" style="margin-top:10px"><input type="checkbox" name="contactsInMail"' + (p.contactsInMail !== false ? ' checked' : '') + dis + '><span>每封信結尾自動附上聯絡人員（附註上方）</span></label>') +
      sec('footer', ro ? '' : '<button class="btn sm ghost" type="button" data-a="foot-reset">恢復系統預設</button>',
        '<p class="hint" style="margin-top:0">每封信內容之後、署名之前，以分隔線隔開的灰色小字。<span class="sf-foot-state"></span>清空表示這個專案不加附註。</p>' +
        '<div class="field"><textarea class="input" name="footer" rows="5"' + dis + '></textarea></div>') +
      sec('squads', '', '<div class="grid-2">' +
        f('squads', '預設小隊數', 'number', p.squads || 0, '0 = 不分隊；設定後可用「分小隊」安排，匯出時可依小隊排序') +
        f('emailDomains', '限定報名信箱網域', 'text', p.emailDomains || '', '例如 gmail.com，多個用逗號分開；留空只檢查格式與常見打錯（gmial.com 等）') +
        '</div>' + (o.onSquadStaff ? '<div class="row wrap" style="gap:8px;margin-top:10px"><button class="btn sm" type="button" data-a="squad-staff">小隊專輔與隨輔…</button><span class="small muted">每個小隊預設 2 位專輔、2 位隨輔，可增減；學員專區會顯示自己的小隊與專隨輔</span></div>' : '') +
        '<div class="hint" style="margin-top:8px">電話一律檢查是否為 0 開頭的 10 碼；身分證檢查檢查碼。有誤的人會標示並列入警示。</div>') +
      sec('mapping', '', '<p class="hint" style="margin-top:0">系統用關鍵字找欄位，' + (o.isNew ? '已依題目文字自動猜測，請確認或修正。「學員姓名」與「Email」必須指定。' : '找錯或找不到時請手動指定。') + '</p><div class="grid-2">' +
        fk.map(function (k) {
          var cur = (p.mapping || {})[k.key];
          if (k.multi) {
            var curList = [].concat(cur || []);
            return '<div class="field multi-map"><span>' + esc(k.label) + '（可複選）</span><div class="multi-q">' + questions.map(function (q) {
              return '<label class="check"><input type="checkbox" name="map_' + k.key + '" value="' + esc(q) + '"' + (curList.indexOf(q) >= 0 ? ' checked' : '') + dis + '><span>' + esc(q) + '</span></label>';
            }).join('') + '</div><span class="hint">表單把每位同伴分成不同題目時，全部勾起來。</span></div>';
          }
          return '<label class="field"><span>' + esc(k.label) + (o.isNew && (k.key === 'name' || k.key === 'email') ? '<em>*</em>' : '') + '</span><select class="input" name="map_' + k.key + '"' + dis + '>' + qOpts(cur) + '</select>' +
            (k.key === 'lowIncome' ? '<span class="hint">指定後，答「低收／中低收」的報名者先列為「資格審核中」，只寄「報名資訊核對」（信中不提身分、不含匯款），審核通過再寄繳費通知。這題不會出現在任何寄出的信裡。</span>' : '') + '</label>';
        }).join('') + '</div>') +
      sec('display', o.onRefresh ? '<button class="btn sm" type="button" data-a="refresh"' + dis + '>重新讀取表單題目</button>' : '',
        '<div style="display:flex;flex-direction:column;gap:8px">' + questions.map(function (q) {
          return '<label class="check"><input type="checkbox" name="disp" value="' + esc(q) + '"' + ((p.display || []).indexOf(q) >= 0 ? ' checked' : '') + dis + '><span>' + esc(q) + '</span></label>';
        }).join('') + '</div>') +
      sec('echo', '', '<p class="hint" style="margin-top:0">勾選的題目會以表格附在報名成功、候補、遞補錄取通知最後，讓報名者確認自己的資料。其他範本可放 {{回覆內容}} 指定位置。</p>' +
        '<p class="hint">身分證字號一律部分遮蔽（例如 A12****789）。</p>' +
        '<div class="multi-q">' + questions.filter(function (q) { return hideEcho.indexOf(q) < 0; }).map(function (q) {
          return '<label class="check"><input type="checkbox" name="echo" value="' + esc(q) + '"' + ((p.echo || []).indexOf(q) >= 0 ? ' checked' : '') + dis + '><span>' + esc(q) + '</span></label>';
        }).join('') + '</div>');

    var form = box.tagName === 'FORM' ? box : box.closest('form');
    function E(name) { return $('[name="' + name + '"]', box); }
    function A(name) { return $('[data-a="' + name + '"]', box); }
    bindHexField($('.set-head', box));

    // 退款規定：時間段列表
    var rfList = $('.rf-list', box);
    function rfRow(t) {
      t = t || {};
      var row = el('<div class="rf-row"><input class="input" type="date" aria-label="這天（含）前取消"><span class="small muted">前取消，退還</span><input class="input" type="number" min="0" max="100" step="1" aria-label="退還比例"><span class="small muted">%</span>' +
        (ro ? '' : '<button class="btn sm ghost" type="button" aria-label="刪除這個時間段">刪除</button>') + '</div>');
      var ins = $$('input', row);
      ins[0].value = t.until || ''; ins[1].value = t.pct === undefined ? '' : t.pct;
      ins.forEach(function (i) { i.disabled = ro; });
      if (!ro) $('button', row).addEventListener('click', function () { row.remove(); rfEmpty(); refresh(); });
      rfList.appendChild(row);
    }
    function rfEmpty() {
      var e = $('.rf-empty', rfList);
      if (!$('.rf-row', rfList) && !e) rfList.appendChild(el('<div class="small muted rf-empty">還沒有時間段（不設定時信裡與表單不顯示退款比例）</div>'));
      if ($('.rf-row', rfList) && e) e.remove();
    }
    ((p.refund && p.refund.tiers) || []).forEach(rfRow);
    rfEmpty();
    E('refundNote').value = (p.refund && p.refund.note) || '';
    E('h_note').value = (p.hotel && p.hotel.note) || '';
    if (A('rf-add')) A('rf-add').addEventListener('click', function () {
      var rows = $$('.rf-row', rfList), last = rows.length ? $$('input', rows[rows.length - 1]) : null;
      rfRow({ pct: last && last[1].value !== '' ? Math.max(0, Number(last[1].value) - 50) : 100 });
      rfEmpty(); refresh();
    });

    // 聯絡人員
    var ctList = $('.ct-list', box);
    function ctRow(c) {
      c = c || {};
      var r = el('<div class="ct-row">' +
        '<input class="input" data-k="title" placeholder="職稱或名稱" title="職稱（例如 總召）或官方帳號名稱（例如 醫工營 IG）" maxlength="40"' + dis + '>' +
        '<input class="input" data-k="name" placeholder="姓名（官方帳號可不填）" maxlength="40"' + dis + '>' +
        '<input class="input" data-k="phone" placeholder="電話" maxlength="40" inputmode="tel"' + dis + '>' +
        '<input class="input" data-k="email" placeholder="信箱" maxlength="120" type="email"' + dis + '>' +
        '<input class="input" data-k="ig" placeholder="IG 帳號（@帳號 或網址）" maxlength="200"' + dis + '>' +
        '<input class="input" data-k="line" placeholder="LINE ID 或加好友連結" maxlength="200"' + dis + '>' +
        '<input class="input" data-k="link" placeholder="其他連結 https://…（粉專、官網）" maxlength="300"' + dis + '>' +
        (ro ? '' : '<button class="btn sm ghost" type="button" title="移除" aria-label="移除">✕</button>') + '</div>');
      $$('input', r).forEach(function (i) { i.value = c[i.dataset.k] || ''; });
      if (!ro) $('button', r).addEventListener('click', function () { r.remove(); if (!ctList.children.length) ctList.appendChild(ctEmpty()); refresh(); });
      return r;
    }
    function ctEmpty() { return el('<div class="small muted ct-empty">尚未設定聯絡人員</div>'); }
    (p.contacts || []).forEach(function (c) { ctList.appendChild(ctRow(c)); });
    if (!ctList.children.length) ctList.appendChild(ctEmpty());
    if (A('ct-add')) A('ct-add').addEventListener('click', function () {
      if ($$('.ct-row', ctList).length >= 20) { toast('聯絡人員最多 20 位', true); return; }
      var e0 = $('.ct-empty', ctList); if (e0) e0.remove();
      var r = ctRow(); ctList.appendChild(r); $('input', r).focus(); refresh();
    });

    // 署名、附註用信件格式編輯器
    var sigIn = E('signature');
    sigIn.value = p.signature || '';
    var sigEd = chipEditor(sigIn);
    if (!ro) sigIn.parentNode.insertBefore(formatToolbar(sigEd, { vars: true }), sigIn);
    var footTa = E('footer');
    footTa.value = p.footerEffective || '';
    var footEd = chipEditor(footTa);
    footTa.parentNode.insertBefore(formatToolbar(footEd, { vars: true }), footTa);
    $('.sf-foot-state', box).textContent = o.isNew ? '預先填好系統預設；' : p.footer === '' ? '目前使用系統預設。' : p.footer === '-' ? '目前這個專案不加附註。' : '目前是這個專案自訂的內容。';
    if (A('foot-reset')) A('foot-reset').addEventListener('click', function () { footEd.value = p.footerSystem || ''; footTa.dispatchEvent(new Event('input', { bubbles: true })); toast(o.isNew ? '已填入系統預設' : '已填入系統預設，按「儲存設定」生效'); });

    if (A('squad-staff')) A('squad-staff').addEventListener('click', function () {
      var n = Number(E('squads').value) || 0;
      if (n !== (p.squads || 0)) { toast('小隊數改了還沒儲存，請先按「儲存設定」', true); return; }
      o.onSquadStaff();
    });
    if (A('refresh')) A('refresh').addEventListener('click', function () { o.onRefresh(); });

    // 開始新專案：改了欄位對應，預設顯示欄位跟著勾
    if (o.isNew) {
      DEFAULT_KEYS.forEach(function (k) {
        var s = E('map_' + k);
        if (s) s.addEventListener('change', function () { $$('input[name=disp]', box).forEach(function (i) { if (i.value === s.value) i.checked = true; }); });
      });
      $$('.sf-fold', box).forEach(function (b) {
        b.addEventListener('click', function () { var s = b.closest('.sf-sec'); s.classList.toggle('sf-closed'); b.textContent = s.classList.contains('sf-closed') ? '填寫' : '收起'; });
      });
    }
    if (form) guardDates(form);

    /** 讀出畫面上的值（不檢查） */
    function read() {
      var v = {};
      SIMPLE.forEach(function (k) { v[k] = E(k).value.trim(); });
      v.signature = E('signature').value.trim();
      v.remind = { on: E('remindOn').checked, hours: Math.round(Number(E('remindHours').value)) };
      v.bank = {};
      BANK_KEYS.forEach(function (k) { v.bank[k] = E('bank_' + k).value.trim(); });
      v.refund = {
        tiers: $$('.rf-row', box).map(function (r) { var i = $$('input', r); return { until: i[0].value, pct: i[1].value }; }).filter(function (t) { return t.until || t.pct !== ''; }),
        note: E('refundNote').value.replace(/\r\n/g, '\n').trim()
      };
      v.hotel = {};
      HOTEL_KEYS.forEach(function (k) { v.hotel[k] = E('h_' + k).value.replace(/\r\n/g, '\n').trim(); });
      v.contacts = $$('.ct-row', box).map(function (r) {
        var c = {}; $$('input', r).forEach(function (i) { c[i.dataset.k] = i.value.trim(); }); return c;
      }).filter(function (c) { return c.title || c.name || c.phone || c.email || c.ig || c.line || c.link; });
      v.contactsInMail = E('contactsInMail').checked;
      v.headerColor = $('.set-head .fmt-hexin', box).value;
      v.footer = E('footer').value.replace(/\r\n/g, '\n').trim();
      v.mapping = {};
      fk.forEach(function (k) {
        if (k.multi) { var arr = $$('input[name=map_' + k.key + ']:checked', box).map(function (i) { return i.value; }); if (arr.length) v.mapping[k.key] = arr; return; }
        var mv = E('map_' + k.key).value; if (mv) v.mapping[k.key] = mv;
      });
      v.display = $$('input[name=disp]:checked', box).map(function (i) { return i.value; });
      v.echo = $$('input[name=echo]:checked', box).map(function (i) { return i.value; });
      v.footerSystem = p.footerSystem || '';   // 只給狀態標示用
      return v;
    }

    /** 讀出並檢查（規則與後端相同）；有錯丟出 Error，並把那一區打開、捲過去 */
    function collect() {
      var v = read();
      function bad(key, msg) { focus(key); throw new Error(msg); }
      if (o.isNew) {
        var need = [['name', '營隊名稱', 'info'], ['regStart', '開始招生日期', 'info'], ['start', '營期開始', 'info'], ['end', '營期結束', 'info'], ['capacity', '招生人數上限', 'quota'], ['price', '原價', 'fees']];
        for (var i = 0; i < need.length; i++) if (!v[need[i][0]]) bad(need[i][2], '請填寫「' + need[i][1] + '」');
      }
      var dateErr = dateOrderError(v);
      if (dateErr) bad('info', dateErr);
      if ((Number(v.earlyPrice) > 0 || Number(v.earlyGroupPrice) > 0) && !v.earlyDeadline) bad('fees', '有填早鳥價時，請填早鳥期限');
      if (!(v.remind.hours >= 1 && v.remind.hours <= 336)) bad('fees', '匯款期限提醒請填 1 到 336 小時');
      var be = bankError(v.bank), bankChanged = BANK_KEYS.some(function (k) { return v.bank[k] !== (p.bank ? p.bank[k] || '' : ''); });
      if (be && (o.isNew || bankChanged || p.bank)) bad('fees', be);
      if (be) v.bank = null;   // 舊格式的專案沒改匯款帳號：維持舊格式
      var rs = v.regStart, re = '', seen = {};
      if (v.start) { var cd = new Date(v.start + 'T00:00:00Z'); cd.setUTCDate(cd.getUTCDate() - 1); re = cd.toISOString().slice(0, 10); }   // 營隊開始前一天
      v.refund.tiers.forEach(function (t) {
        if (!t.until) bad('refund', '退款規定的日期請填完整');
        if (t.pct === '' || !(Number(t.pct) >= 0 && Number(t.pct) <= 100)) bad('refund', '退還比例請填 0 到 100');
        if (rs && t.until < rs) bad('refund', '退款規定的日期（' + t.until.replace(/-/g, '/') + '）早於開始招生日期');
        if (re && t.until > re) bad('refund', '退款規定的日期（' + t.until.replace(/-/g, '/') + '）要在營隊開始前一天（' + re.replace(/-/g, '/') + '）以前');
        if (seen[t.until]) bad('refund', '退款規定有重複的日期');
        seen[t.until] = true;
      });
      v.refund.tiers = v.refund.tiers.map(function (t) { return { until: t.until, pct: Math.round(Number(t.pct)) }; }).sort(function (a, b) { return a.until < b.until ? -1 : 1; });
      var h = v.hotel;
      if (HOTEL_KEYS.some(function (k) { return h[k]; })) {
        var hMiss = [['name', '名稱'], ['address', '地址'], ['phone', '電話']].filter(function (x) { return !h[x[0]]; }).map(function (x) { return x[1]; });
        if (hMiss.length) bad('hotel', '飯店資訊請填' + hMiss.join('、') + '（不需要住宿就全部留空）');
        if (h.url && !/^https?:\/\/[^\s"'<>]+$/i.test(h.url)) bad('hotel', '飯店網站需以 https:// 開頭');
      }
      v.contacts.forEach(function (c, i) {
        var who = c.name || c.title;
        if (!who) bad('contacts', '第 ' + (i + 1) + ' 位聯絡人員請填職稱、名稱或姓名');
        if (!c.phone && !c.email && !c.ig && !c.line && !c.link) bad('contacts', '聯絡人員「' + who + '」請至少填一種聯絡方式（電話、信箱、IG、LINE 或連結）');
        if (c.ig && !igLink(c.ig)) bad('contacts', '聯絡人員「' + who + '」的 IG 請填帳號（例如 @camp_2027）或 instagram.com 網址');
        if (c.line && !lineLink(c.line)) bad('contacts', '聯絡人員「' + who + '」的 LINE 請填 LINE ID 或 https:// 開頭的加好友連結');
        if (c.link && !/^https?:\/\/[^\s"'<>]+$/i.test(c.link)) bad('contacts', '聯絡人員「' + who + '」的連結需以 https:// 開頭');
        if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) bad('contacts', '聯絡人員「' + who + '」的信箱格式不正確');
        c.email = c.email.toLowerCase();
      });
      var hc = normHex(v.headerColor);
      if (!hc) bad('info', '信件標頭顏色格式不正確，請用 # 加 6 碼（例如 #2f5d62）');
      v.headerColor = hc;
      if (!v.mapping.name) bad('mapping', '請指定「學員姓名」對應的題目');
      if (o.isNew && !v.mapping.email && questions.indexOf('電子郵件地址') < 0) bad('mapping', '請指定「Email」對應的題目');
      return v;
    }

    /** 跟原本的設定比對：順序不同、內容一樣的不算變動（第 19 項） */
    function patch() {
      var v = collect(), out = {};
      SIMPLE.forEach(function (k) { if (String(v[k]) !== String(p[k] === undefined || p[k] === null ? '' : p[k])) out[k] = v[k]; });
      if (!p.remind || v.remind.on !== p.remind.on || v.remind.hours !== p.remind.hours) out.remind = v.remind;
      if (v.bank && (!p.bank || BANK_KEYS.some(function (k) { return v.bank[k] !== (p.bank[k] || ''); }))) out.bank = v.bank;
      if (!same(v.refund, p.refund || { tiers: [], note: '' })) out.refund = v.refund;
      var oldH = p.hotel || {};
      if (HOTEL_KEYS.some(function (k) { return v.hotel[k] !== (oldH[k] || ''); })) out.hotel = v.hotel;
      var oldC = (p.contacts || []).map(function (c) { var x = {}; ['title', 'name', 'phone', 'email', 'ig', 'line', 'link'].forEach(function (k) { x[k] = c[k] || ''; }); return x; });
      if (!same(v.contacts, oldC)) out.contacts = v.contacts;
      if (v.contactsInMail !== (p.contactsInMail !== false)) out.contactsInMail = v.contactsInMail;
      if (v.headerColor !== normHex(p.headerColor || '#2f5d62')) out.headerColor = v.headerColor;
      if (v.footer !== String(p.footerEffective || '').trim()) out.footer = v.footer;
      if (!same(normMap(v.mapping), normMap(p.mapping))) out.mapping = v.mapping;
      if (!sameSet(v.display, (p.display || []).filter(inQ))) out.display = v.display;
      if (!sameSet(v.echo, (p.echo || []).filter(inQ))) out.echo = v.echo;
      return out;
    }
    function inQ(q) { return questions.indexOf(q) >= 0; }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function sameSet(a, b) { return same(a.slice().sort(), b.slice().sort()); }
    /** 欄位對應整理成固定順序：只留表單上有的題目，空的不算 */
    function normMap(m) {
      var out = {};
      Object.keys(m || {}).sort().forEach(function (k) {
        var x = [].concat(m[k] || []).filter(function (q) { return q && inQ(q); });
        if (!x.length) return;
        out[k] = Array.isArray(m[k]) ? x.slice().sort() : x[0];
      });
      return out;
    }

    function focus(key) {
      var s = $('[data-sec="' + key + '"]', box);
      if (!s) return;
      s.classList.remove('sf-closed');
      var fb = $('.sf-fold', s); if (fb) fb.textContent = '收起';
      s.scrollIntoView({ behavior: 'smooth', block: 'start' });
      s.classList.add('sf-hit');
      setTimeout(function () { s.classList.remove('sf-hit'); }, 2400);
    }

    /** 每一區的「已設定／尚未設定」跟著畫面更新 */
    function refresh() {
      var st = status(read());
      st.forEach(function (x) {
        var s = $('[data-sec="' + x.key + '"] .sf-state', box);
        if (!s) return;
        s.textContent = x.text;
        s.className = 'sf-state' + (x.set ? ' set' : x.required ? ' need' : '');
      });
    }
    box.addEventListener('input', refresh);
    box.addEventListener('change', refresh);
    refresh();
    // 開始新專案：還沒設定的選填區塊先收起來
    if (o.isNew) status(read()).forEach(function (x) {
      var s = $('[data-sec="' + x.key + '"]', box), meta = SECTIONS.filter(function (y) { return y.key === x.key; })[0];
      if (meta.optional && !x.set && x.key !== 'footer') { s.classList.add('sf-closed'); $('.sf-fold', s).textContent = '填寫'; }
    });

    return { read: read, collect: collect, patch: patch, focus: focus, refresh: refresh };
  }

  /** 各區是否已設定（值是 read() 或 collect() 的結果） */
  function status(v) {
    var bankOk = v.bank && !bankError(v.bank);
    var map = {
      quota: Number(v.capacity) > 0 ? [true, '上限 ' + v.capacity + ' 人'] : [false, '尚未設定', true],
      fees: Number(v.price) > 0 && bankOk ? [true, '已設定'] : [false, !(Number(v.price) > 0) ? '尚未填原價' : '尚未填匯款帳號', true],
      refund: v.refund.tiers.length || v.refund.note ? [true, '已設定'] : [false, '尚未設定'],
      info: v.name && v.regStart && v.start && v.end ? [true, '已設定'] : [false, '尚未設定', true],
      hotel: v.hotel.name ? [true, '已設定'] : [false, '尚未設定'],
      contacts: v.contacts.length ? [true, v.contacts.length + ' 位'] : [false, '尚未設定'],
      footer: v.footer ? [true, v.footer === String(v.footerSystem || '').trim() ? '系統預設' : '已設定'] : [true, '不加附註'],
      squads: Number(v.squads) > 0 ? [true, '分 ' + Number(v.squads) + ' 隊'] : [false, '尚未設定（不分隊）'],
      mapping: v.mapping.name ? [true, '已設定'] : [false, '尚未指定學員姓名', true],
      display: v.display.length ? [true, v.display.length + ' 個欄位'] : [false, '尚未設定'],
      echo: v.echo.length ? [true, v.echo.length + ' 題'] : [false, '尚未設定']
    };
    return SECTIONS.map(function (s) { var m = map[s.key]; return { key: s.key, title: s.title, optional: !!s.optional, set: m[0], text: m[1], required: !!m[2] }; });
  }

  return { SECTIONS: SECTIONS, build: build, status: status };
})();
