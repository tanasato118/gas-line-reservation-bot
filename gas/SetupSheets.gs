/**
 * Sample LINE Bot - スプレッドシート初期化 & 見た目整備
 *
 * 【関数の使い分け】
 * - setupSheets()        … 初回のみ。空のシートを作ってヘッダーを入れる
 * - beautifySheets()     … 何度でも実行OK。データは消えない。見た目だけ綺麗にする
 * - rebuildReadmeOnly()  … 「使い方」シートだけ作り直す
 * - migrateToJapanese()  … 既存の英語名シート・英語ステータスを日本語に一括移行
 */

/** シート名（日本語） - 全ファイルがここを参照 */
const SHEETS = {
  reservations: '予約一覧',
  slots:        '予約枠',
  inquiries:    '修理相談',
  recruit:      '採用応募',
  sessions:     '会話中データ',
  customers:    '顧客リスト',
  config:       '設定',
  logs:         'ログ',
  readme:       '使い方'
};

/** 旧シート名（英語） → 新シート名（日本語） の対応表。migrateToJapanese() で使用 */
const LEGACY_SHEET_NAMES = {
  'Reservations': SHEETS.reservations,
  'Slots':        SHEETS.slots,
  'Inquiries':    SHEETS.inquiries,
  'Sessions':     SHEETS.sessions,
  'Customers':    SHEETS.customers,
  'Config':       SHEETS.config,
  'Logs':         SHEETS.logs
};

/** ステータス値（日本語） */
const STATUS = {
  // 予約一覧
  confirmed: '確定',
  cancelled: 'キャンセル',
  completed: '完了',
  // 修理相談
  new:        '新着',
  inProgress: '対応中',
  done:       '対応済み'
};

/** 旧ステータス（英語） → 新ステータス（日本語） */
const LEGACY_STATUS = {
  'confirmed':   STATUS.confirmed,
  'cancelled':   STATUS.cancelled,
  'completed':   STATUS.completed,
  'new':         STATUS.new,
  'in_progress': STATUS.inProgress,
  'done':        STATUS.done
};

/** 列定義 - ここを中央管理。labelが画面に出る日本語ヘッダー */
const SHEET_SCHEMA = {
  [SHEETS.reservations]: {
    tabColor: '#2e7d32',       // 緑：予約
    summary: '車検・修理の予約が1件ずつ記録されます。お客様情報・予約日時・状態を確認できます。',
    columns: [
      { label: '予約ID',            width:  90, note: '自動で振られる8文字の予約番号' },
      { label: '登録日時',          width: 150, note: 'お客様が予約ボタンを押した日時', format: 'yyyy/MM/dd HH:mm' },
      { label: 'LINE ユーザーID',   width: 260, note: 'LINEの内部ID。編集しないでください' },
      { label: 'お名前',            width: 140 },
      { label: '電話番号',          width: 130 },
      { label: 'メーカー',          width:  90, note: '例：トヨタ、ホンダ' },
      { label: '車種',              width: 110 },
      { label: 'ナンバー',          width: 130 },
      { label: '初年度登録年',      width: 100 },
      { label: '予約日',            width: 110, format: 'yyyy/MM/dd' },
      { label: '予約時間',          width:  90 },
      { label: 'サービス',          width: 110, note: '車検／修理／板金／見積もり' },
      { label: '状態',              width: 110, note: '確定 / キャンセル / 完了' },
      { label: '備考',              width: 240 },
      { label: 'リマインド送信日時', width: 150, format: 'yyyy/MM/dd HH:mm' }
    ],
    statusCol: 13,
    validations: {
      12: ['車検', '修理', '板金', '見積もり', 'その他'],
      13: [STATUS.confirmed, STATUS.cancelled, STATUS.completed]
    }
  },

  [SHEETS.slots]: {
    tabColor: '#1565c0',       // 青：予約枠
    summary: '日時ごとの予約可能数。自動で管理されます。通常は直接編集不要です。',
    columns: [
      { label: '日付',       width: 110, format: 'yyyy/MM/dd' },
      { label: '時間',       width:  80 },
      { label: '定員',       width:  70, note: '受付可能な上限（通常1）' },
      { label: '予約済み',   width:  90, note: '現在入っている予約数' },
      { label: '空き',       width:  70, note: '定員 − 予約済み' }
    ]
  },

  [SHEETS.inquiries]: {
    tabColor: '#ef6c00',       // 橙：問い合わせ
    summary: '修理相談フローで送られてきた症状・写真・連絡希望日などが記録されます。',
    columns: [
      { label: '問い合わせID', width: 110 },
      { label: '登録日時',     width: 150, format: 'yyyy/MM/dd HH:mm' },
      { label: 'LINE ユーザーID', width: 260, note: 'LINEの内部ID。編集しないでください' },
      { label: '種類',         width: 100, note: '修理 / 板金 など' },
      { label: '内容（症状）', width: 320 },
      { label: '写真URL',      width: 260, note: 'お客様が送った写真（LINE内URL）' },
      { label: '希望日',       width: 120 },
      { label: '電話番号',     width: 130 },
      { label: '対応状況',     width: 110, note: '新着 → 対応中 → 対応済み の順で更新' },
      { label: '備考',         width: 240 }
    ],
    statusCol: 9,
    validations: {
      9: [STATUS.new, STATUS.inProgress, STATUS.done]
    }
  },

  [SHEETS.recruit]: {
    tabColor: '#00695c',       // ティール：採用
    summary: '採用応募フローで受け付けた応募者情報。対応したら「対応状況」を更新してください。',
    columns: [
      { label: '応募ID',           width:  90 },
      { label: '登録日時',         width: 150, format: 'yyyy/MM/dd HH:mm' },
      { label: 'LINE ユーザーID',  width: 260, note: 'LINEの内部ID。編集しないでください' },
      { label: 'お名前',           width: 140 },
      { label: '電話番号',         width: 130 },
      { label: '希望職種',         width: 110 },
      { label: '経験年数',         width: 100 },
      { label: '志望動機',         width: 350 },
      { label: '対応状況',         width: 110, note: '新着 → 対応中 → 対応済み の順で更新' },
      { label: '備考',             width: 240 }
    ],
    statusCol: 9,
    validations: {
      9: [STATUS.new, STATUS.inProgress, STATUS.done]
    }
  },

  [SHEETS.sessions]: {
    tabColor: '#9e9e9e',       // 灰：裏方
    summary: '⚠️ 触らないでください。お客様が入力途中のデータです。30分で自動削除されます。',
    columns: [
      { label: 'LINE ユーザーID', width: 260 },
      { label: 'フロー種別',     width: 120, note: 'shaken=車検 / repair=修理 / estimate=見積' },
      { label: '現在のステップ', width: 120 },
      { label: '収集済みデータ', width: 400, note: 'JSON形式の一時データ' },
      { label: '開始日時',       width: 150, format: 'yyyy/MM/dd HH:mm' },
      { label: '最終操作日時',   width: 150, format: 'yyyy/MM/dd HH:mm' }
    ]
  },

  [SHEETS.customers]: {
    tabColor: '#6a1b9a',       // 紫：顧客
    summary: '問い合わせ・予約をしたお客様の情報が自動で蓄積されます。来店履歴・車両情報を確認できます。',
    columns: [
      { label: 'LINE ユーザーID', width: 260 },
      { label: 'LINE表示名',      width: 160 },
      { label: 'お名前',          width: 140 },
      { label: '電話番号',        width: 130 },
      { label: 'メーカー',        width:  90 },
      { label: '車種',            width: 110 },
      { label: 'ナンバー',        width: 130 },
      { label: 'フリガナ',        width: 140, note: 'カタカナで自動入力されます' },
      { label: '初回利用日',      width: 120, format: 'yyyy/MM/dd' },
      { label: '最終利用日',      width: 120, format: 'yyyy/MM/dd' },
      { label: '合計件数',        width:  90 }
    ]
  },

  [SHEETS.config]: {
    tabColor: '#c62828',       // 赤：設定
    summary: 'ボットの動作設定。⚠️ 値を変えると挙動が変わります。「キー」列は編集しないでください。',
    columns: [
      { label: 'キー',       width: 180, note: '設定名（編集不可）' },
      { label: '値',         width: 160, note: 'ここを書き換えて保存すれば反映されます' },
      { label: '説明',       width: 420, note: 'この設定が何を意味するか' }
    ],
    initialRows: [
      ['openTime',          '09:00', '営業開始時刻（この時刻から予約枠を作る）'],
      ['closeTime',         '18:00', '営業終了時刻'],
      ['closedDays',        '日,祝', '定休日。カンマ区切りで曜日または「祝」を指定'],
      ['reminderTime',      '20:00', '前日リマインドを送る時刻'],
      ['slotInterval',      '60',    '予約枠の間隔（分）。60=1時間おき'],
      ['defaultCapacity',   '1',     '1枠あたりの受付可能数'],
      ['sessionTtlMinutes', '30',    '会話の途中データを保持する分数（過ぎると自動削除）'],
      ['holidays',          '1/1,1/2,1/3,8/13,8/14,8/15,12/29,12/30,12/31', '固定休業日。月/日のカンマ区切り（例: 1/1,8/13）']
    ]
  },

  [SHEETS.logs]: {
    tabColor: '#455a64',       // 暗灰：ログ
    summary: 'エラーや重要イベントが記録されます。不具合調査の時だけ見ればOK。',
    columns: [
      { label: '日時',     width: 150, format: 'yyyy/MM/dd HH:mm:ss' },
      { label: 'レベル',   width:  80, note: 'INFO=情報 / WARN=警告 / ERROR=エラー' },
      { label: 'メッセージ', width: 360 },
      { label: '詳細',     width: 500, note: 'エラー時の追加情報（JSON）' }
    ],
    statusCol: 2,
    validations: {}
  }
};

/** 表示順（使い方を先頭に） */
const SHEET_ORDER = [
  SHEETS.readme,
  SHEETS.reservations,
  SHEETS.slots,
  SHEETS.inquiries,
  SHEETS.recruit,
  SHEETS.customers,
  SHEETS.config,
  SHEETS.sessions,
  SHEETS.logs
];


/* =========================================================
 * 1) 初回セットアップ：シートを作って整える
 * =======================================================*/
function setupSheets() {
  const ss = SpreadsheetApp.openById(Config.spreadsheetId());

  // 既存データがある場合はガード
  const existing = ss.getSheetByName(SHEETS.reservations) || ss.getSheetByName('Reservations');
  if (existing && existing.getLastRow() > 1) {
    throw new Error('setupSheets: データが既に存在します。移行は migrateToJapanese()、見た目だけなら beautifySheets() を使ってください（データは消えません）。');
  }

  for (const name of Object.keys(SHEET_SCHEMA)) {
    let sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    sheet.clear();
  }

  // 設定 の初期行を投入
  const configSheet = ss.getSheetByName(SHEETS.config);
  const cfg = SHEET_SCHEMA[SHEETS.config];
  configSheet.getRange(2, 1, cfg.initialRows.length, 3).setValues(cfg.initialRows);

  // 見た目整備 & README
  beautifySheets();

  LoggerService.info('setupSheets completed', { sheetsCreated: Object.keys(SHEET_SCHEMA).length });
  safeToast_(ss, '✅ 全シート作成完了！「使い方」タブをご確認ください', 5);
  console.log('✅ セットアップ完了');
}


/* =========================================================
 * 2) 見た目だけ整える：データは消えない。何度でも実行OK
 * =======================================================*/
function beautifySheets() {
  const ss = SpreadsheetApp.openById(Config.spreadsheetId());

  // 旧英語名があれば日本語へリネーム（古いシートからの自動追従）
  renameLegacySheets_(ss);

  // README シート
  rebuildReadmeOnly();

  // 各シートにスタイル適用
  for (const [name, def] of Object.entries(SHEET_SCHEMA)) {
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    applySheetStyle_(sheet, def);
  }

  // タブの並び順
  reorderTabs_(ss);

  safeToast_(ss, '✨ 見た目を整えました', 3);
  console.log('✨ beautifySheets 完了');
}

/** 旧英語名シート → 日本語名へ変更（データは保持） */
function renameLegacySheets_(ss) {
  for (const [oldName, newName] of Object.entries(LEGACY_SHEET_NAMES)) {
    const s = ss.getSheetByName(oldName);
    if (s && !ss.getSheetByName(newName)) {
      s.setName(newName);
      console.log('renamed:', oldName, '→', newName);
    }
  }
}

/* =========================================================
 * 4) 一括日本語化：旧データ（英語ステータス）も日本語に変換
 *    何度実行しても安全（冪等）
 * =======================================================*/
function migrateToJapanese() {
  const ss = SpreadsheetApp.openById(Config.spreadsheetId());
  renameLegacySheets_(ss);

  const migrations = [
    { sheet: SHEETS.reservations, col: 13 }, // 予約一覧の「状態」
    { sheet: SHEETS.inquiries,    col:  9 }  // 修理相談の「対応状況」
  ];

  let totalChanged = 0;
  migrations.forEach(m => {
    const sh = ss.getSheetByName(m.sheet);
    if (!sh || sh.getLastRow() < 2) return;
    const range = sh.getRange(2, m.col, sh.getLastRow() - 1, 1);
    const values = range.getValues();
    let changed = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i][0];
      if (typeof v === 'string' && LEGACY_STATUS[v]) {
        values[i][0] = LEGACY_STATUS[v];
        changed++;
      }
    }
    if (changed > 0) {
      range.setValues(values);
      totalChanged += changed;
      console.log(m.sheet + ': ' + changed + '件を日本語化');
    }
  });

  // 設定シートの説明列（C列）を初期値で埋める（既に値があれば尊重）
  const configSh = ss.getSheetByName(SHEETS.config);
  if (configSh && configSh.getLastRow() >= 2) {
    const lookup = {};
    SHEET_SCHEMA[SHEETS.config].initialRows.forEach(r => { lookup[r[0]] = r[2]; });
    const lastRow = configSh.getLastRow();
    const keyVals = configSh.getRange(2, 1, lastRow - 1, 1).getValues();
    const descVals = configSh.getRange(2, 3, lastRow - 1, 1).getValues();
    let descChanged = 0;
    for (let i = 0; i < keyVals.length; i++) {
      const k = keyVals[i][0];
      if (k && lookup[k] && !descVals[i][0]) {
        descVals[i][0] = lookup[k];
        descChanged++;
      }
    }
    if (descChanged > 0) {
      configSh.getRange(2, 3, lastRow - 1, 1).setValues(descVals);
      console.log('設定: 説明列を ' + descChanged + '件補完');
    }
  }

  beautifySheets();

  const msg = '✅ 日本語化完了：' + totalChanged + '件のステータスを変換しました';
  safeToast_(ss, msg, 5);
  console.log(msg);
}

/** getActive() が null になる環境（スクリプトエディタ直実行）でも落ちない toast */
function safeToast_(ss, msg, sec) {
  try {
    if (ss && typeof ss.toast === 'function') {
      ss.toast(msg, 'Sample LINE Bot', sec || 3);
    }
  } catch (_) { /* noop */ }
}

/** 1シートにヘッダー・色・列幅・バリデーション・条件付き書式を適用 */
function applySheetStyle_(sheet, def) {
  const labels = def.columns.map(c => c.label);
  const ncol = labels.length;

  // ヘッダー行
  const header = sheet.getRange(1, 1, 1, ncol);
  header.setValues([labels])
        .setFontWeight('bold')
        .setFontColor('#ffffff')
        .setBackground('#1a237e')
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);

  // 2行目：シートの説明（灰色の注釈バナー）
  if (sheet.getLastRow() < 2 || sheet.getRange(2, 1).getValue() === '') {
    // 空なので説明バナーを入れる余地があるが、データ位置がずれるので「notes」で表現
  }

  // 列幅・ノート（ホバーで出る説明）・数値書式
  def.columns.forEach((c, i) => {
    const col = i + 1;
    if (c.width) sheet.setColumnWidth(col, c.width);
    const cell = sheet.getRange(1, col);
    if (c.note) cell.setNote(c.note); else cell.clearNote();
    if (c.format) {
      sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1)
           .setNumberFormat(c.format);
    }
  });

  // タブ色
  if (def.tabColor) sheet.setTabColor(def.tabColor);

  // シート名の下に「このシートの役割」メモ（タブのホバーには出ないのでA1にnoteでも）
  sheet.getRange(1, 1).setNote((def.jpName ? '【' + def.jpName + '】\n' : '') + (def.summary || ''));

  // データバリデーション（プルダウン）
  if (def.validations) {
    for (const [colStr, options] of Object.entries(def.validations)) {
      const col = parseInt(colStr, 10);
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(options, true)
        .setAllowInvalid(true)
        .build();
      sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(rule);
    }
  }

  // 条件付き書式：状態列を色分け
  if (def.statusCol) applyStatusColoring_(sheet, def.statusCol);

  // 全体の見やすさ
  sheet.getRange(1, 1, sheet.getMaxRows(), ncol).setVerticalAlignment('middle');
}

/** 状態列の色分け（緑＝確定／赤＝取消／青＝完了／橙＝対応中 など） */
function applyStatusColoring_(sheet, col) {
  const range = sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1);
  const rules = sheet.getConditionalFormatRules().filter(r => {
    const rng = r.getRanges()[0];
    return !(rng.getColumn() === col && rng.getRow() === 2);
  });
  const add = (text, bg, fg) =>
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(text)
      .setBackground(bg)
      .setFontColor(fg || '#000000')
      .setRanges([range])
      .build();

  // 日本語ステータス（新）
  rules.push(add(STATUS.confirmed,  '#c8e6c9'));  // 確定 = 緑
  rules.push(add(STATUS.completed,  '#bbdefb'));  // 完了 = 青
  rules.push(add(STATUS.cancelled,  '#ffcdd2'));  // キャンセル = 赤
  rules.push(add(STATUS.new,        '#fff9c4'));  // 新着 = 黄
  rules.push(add(STATUS.inProgress, '#ffe0b2'));  // 対応中 = 橙
  rules.push(add(STATUS.done,       '#bbdefb'));  // 対応済み = 青
  // ログレベル
  rules.push(add('ERROR', '#ffcdd2'));
  rules.push(add('WARN',  '#fff9c4'));
  rules.push(add('INFO',  '#e0e0e0'));
  // 英語ステータス（旧データ互換：移行し損ねた行にも色を付ける）
  rules.push(add('confirmed',   '#c8e6c9'));
  rules.push(add('completed',   '#bbdefb'));
  rules.push(add('cancelled',   '#ffcdd2'));
  rules.push(add('new',         '#fff9c4'));
  rules.push(add('in_progress', '#ffe0b2'));
  rules.push(add('done',        '#bbdefb'));

  sheet.setConditionalFormatRules(rules);
}

/** タブの並び順を整える */
function reorderTabs_(ss) {
  try {
    SHEET_ORDER.forEach((name, idx) => {
      const s = ss.getSheetByName(name);
      if (s) {
        ss.setActiveSheet(s);
        ss.moveActiveSheet(idx + 1);
      }
    });
    const readme = ss.getSheetByName('使い方');
    if (readme) ss.setActiveSheet(readme);
  } catch (err) {
    console.warn('reorderTabs_ skipped:', err.message);
  }
}


/* =========================================================
 * 3) 「使い方」シートだけ作り直す
 * =======================================================*/
function rebuildReadmeOnly() {
  const ss = SpreadsheetApp.openById(Config.spreadsheetId());
  let sh = ss.getSheetByName(SHEETS.readme);
  if (!sh) sh = ss.insertSheet(SHEETS.readme, 0);
  sh.clear();
  sh.clearNotes();
  sh.clearConditionalFormatRules();
  sh.setTabColor('#fbc02d'); // 黄

  // 列幅
  sh.setColumnWidth(1, 180);
  sh.setColumnWidth(2, 280);
  sh.setColumnWidth(3, 460);

  let row = 1;
  const put = (text, opts) => {
    const rng = sh.getRange(row, 1, 1, 3).merge();
    rng.setValue(text);
    if (opts) {
      if (opts.bg) rng.setBackground(opts.bg);
      if (opts.fg) rng.setFontColor(opts.fg);
      if (opts.size) rng.setFontSize(opts.size);
      if (opts.bold) rng.setFontWeight('bold');
      if (opts.height) sh.setRowHeight(row, opts.height);
      if (opts.align) rng.setHorizontalAlignment(opts.align);
    }
    rng.setVerticalAlignment('middle').setWrap(true);
    row++;
  };
  const putRow3 = (a, b, c, opts) => {
    sh.getRange(row, 1).setValue(a);
    sh.getRange(row, 2).setValue(b);
    sh.getRange(row, 3).setValue(c);
    const rng = sh.getRange(row, 1, 1, 3);
    if (opts) {
      if (opts.bg) rng.setBackground(opts.bg);
      if (opts.bold) rng.setFontWeight('bold');
      if (opts.fg) rng.setFontColor(opts.fg);
      if (opts.height) sh.setRowHeight(row, opts.height);
    }
    rng.setVerticalAlignment('middle').setWrap(true);
    row++;
  };
  const blank = () => { sh.setRowHeight(row, 10); row++; };

  // タイトル
  put('📘 Sample LINE Bot - スプレッドシートの使い方',
      { bg: '#1a237e', fg: '#ffffff', size: 20, bold: true, align: 'center', height: 60 });
  blank();

  // サマリー
  put('このファイルは、LINE公式アカウント「Sample」に届いた予約・問い合わせ・お客様情報を自動で記録するデータベースです。',
      { size: 12, height: 50 });
  put('下のタブ（緑の 予約一覧 など）をクリックして中身を切り替えます。',
      { size: 12, height: 30 });
  blank();

  // シート一覧（ヘッダー）
  put('📋 シート（タブ）一覧', { bg: '#e8eaf6', bold: true, size: 14, height: 34 });
  putRow3('タブ色', 'シート名', '何が入っているか / いつ見るか',
          { bg: '#e0e4ef', bold: true, height: 28 });

  const tabList = [
    ['🟨 黄',   '使い方',          '今見ているシート。操作の入口です。'],
    ['🟩 緑',   '予約一覧',        '★一番よく見る★ 車検・修理の予約。毎朝ここを開いて今日の予定を確認。'],
    ['🟦 青',   '予約枠',          '日時ごとの空き状況。自動で管理されるので通常は触らなくてOK。'],
    ['🟧 橙',   '修理相談',        '症状や写真が届いた問い合わせ。対応したら「対応状況」を更新。'],
    ['🩵 ティール', '採用応募',    '採用応募フローの応募者データ。希望職種・経験・志望動機を確認。'],
    ['🟪 紫',   '顧客リスト',      'お客様の台帳。電話番号・車両情報が自動で溜まっていきます。'],
    ['🟥 赤',   '設定',            '営業時間・定休日などの設定値。⚠️ 慣れるまでは触らないで。'],
    ['⬜ 灰',   '会話中データ',    'お客様が入力中の一時データ。30分で自動消去。⚠️ 絶対に編集しない。'],
    ['⬛ 濃灰', 'ログ',            'エラー記録。不具合が出た時だけ見ればOK。']
  ];
  tabList.forEach(t => putRow3(t[0], t[1], t[2], { height: 34 }));
  blank();

  // 毎日のルーティン
  put('🌅 毎日の基本オペレーション', { bg: '#e8eaf6', bold: true, size: 14, height: 34 });
  const daily = [
    ['朝（開店前）', '予約一覧',   '今日の「予約日」の行をチェック。お客様の連絡先もここに揃っています。'],
    ['来店時',      '予約一覧',   '対応が終わったら「状態」列を「完了」に変更（プルダウンで選ぶだけ）。'],
    ['昼休み前後',  '修理相談',   '「新着」の問い合わせがないか確認。対応したら 新着 → 対応中 → 対応済み と更新。'],
    ['閉店後',      '特になし',   '翌日の前日リマインドは20時にボットが自動送信します。']
  ];
  putRow3('タイミング', 'どのタブ', 'やること', { bg: '#e0e4ef', bold: true, height: 28 });
  daily.forEach(d => putRow3(d[0], d[1], d[2], { height: 42 }));
  blank();

  // 状態の色
  put('🎨 「状態」列の色の意味', { bg: '#e8eaf6', bold: true, size: 14, height: 34 });
  putRow3('色', '値', '意味', { bg: '#e0e4ef', bold: true, height: 28 });
  const colors = [
    ['#c8e6c9', '確定',       '予約確定（これから来店予定）'],
    ['#bbdefb', '完了',       '対応完了'],
    ['#ffcdd2', 'キャンセル', 'お客様都合・店都合でのキャンセル'],
    ['#fff9c4', '新着',       '新しい問い合わせ・まだ対応していない'],
    ['#ffe0b2', '対応中',     '現在お客様とやり取り中'],
    ['#bbdefb', '対応済み',   '問い合わせ対応が完了']
  ];
  colors.forEach(c => {
    sh.getRange(row, 1).setValue('').setBackground(c[0]);
    sh.getRange(row, 2).setValue(c[1]);
    sh.getRange(row, 3).setValue(c[2]);
    sh.setRowHeight(row, 28);
    sh.getRange(row, 1, 1, 3).setVerticalAlignment('middle');
    row++;
  });
  blank();

  // やってはいけないこと
  put('⚠️ やってはいけないこと', { bg: '#ffebee', fg: '#b71c1c', bold: true, size: 14, height: 34 });
  const ng = [
    '❌ 1行目（ヘッダー）を書き換えない … システムが列の順番で読むため',
    '❌「会話中データ」タブを編集しない … お客様の入力途中が壊れます',
    '❌「LINE ユーザーID」列を編集しない … 自動送信先がズレます',
    '❌「設定」タブの左列（キー）を書き換えない … 真ん中の値は変更OK',
    '❌ 行を手動で削除しない … 記録が消えます。キャンセル時は「状態」を「キャンセル」に変更'
  ];
  ng.forEach(t => put(t, { size: 11, height: 28 }));
  blank();

  // OK な操作
  put('✅ やってOKな操作', { bg: '#e8f5e9', fg: '#1b5e20', bold: true, size: 14, height: 34 });
  const ok = [
    '✅「状態」列のプルダウンで 確定 → 完了 / キャンセル に変更',
    '✅「備考」列に手書きメモを追加（お客様との電話メモなど）',
    '✅「設定」タブの「値」列を更新（営業時間変更など）',
    '✅「予約一覧」を日付でフィルタ・並べ替え',
    '✅ シート全体を印刷・PDF出力'
  ];
  ok.forEach(t => put(t, { size: 11, height: 28 }));
  blank();

  // 困ったら
  put('🆘 困ったら', { bg: '#e8eaf6', bold: true, size: 14, height: 34 });
  put('• 見た目が崩れた → メニュー「拡張機能 > Apps Script」を開いて、関数「beautifySheets」を実行（データは消えません）', { size: 11, height: 40 });
  put('• 使い方シートだけ直したい → 関数「rebuildReadmeOnly」を実行', { size: 11, height: 28 });
  put('• 英語名のまま表示が残っている → 関数「migrateToJapanese」を実行（旧データも日本語へ一括変換）', { size: 11, height: 32 });
  put('• ボットが反応しない →「ログ」タブを見て「ERROR」の行がないか確認', { size: 11, height: 28 });
  blank();

  // フッター
  put('最終更新日：' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm') + ' / Sample LINE Bot',
      { fg: '#9e9e9e', size: 10, align: 'center', height: 24 });

  sh.setHiddenGridlines(true);
  try { sh.getRange('A1').activate(); } catch (_) { /* noop */ }
}
