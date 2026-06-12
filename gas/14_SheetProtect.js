// 14_SheetProtect.gs
// シート保護と使い方ガイドの管理
// 移管時に一度実行すれば、クライアントが誤って自動管理シートを壊しにくくなる

// ── シート保護 ──────────────────────────────────────────────
// 自動管理シートに「警告のみ」保護をかける。
// GASは引き続き書き込める。クライアントが手動編集しようとすると警告が出る。
function protectSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 警告のみ保護（絶対に手動編集しないシート）
  [
    CONFIG.SHEET_RAW,
    CONFIG.SHEET_RAW_DAILY,
    CONFIG.SHEET_DB_SUMMARY,
    CONFIG.SHEET_DB_BY_OFFICE,
    CONFIG.SHEET_DB_GROWTH_FORECAST,
    CONFIG.SHEET_DB_PROGRESS,
    CONFIG.SHEET_DB_LIVER_MONTHLY,
    CONFIG.SHEET_DB_SEGMENT,
    CONFIG.SHEET_LOG,
    CONFIG.SHEET_M_TIER,
    CONFIG.SHEET_M_CPN,
    CONFIG.SHEET_M_TAX,
    CONFIG.SHEET_M_DIA_RATE,
    CONFIG.SHEET_M_COLMAP,
    CONFIG.SHEET_M_LABEL,
    CONFIG.SHEET_GUIDE,
  ].forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)
      .forEach(function(p) { p.remove(); });
    sh.protect()
      .setDescription('自動管理シート - 手動編集不要')
      .setWarningOnly(true);
  });

  // M_事務所: 警告のみ（事務所追加・アクティブ切替は問題なし）
  var officeSh = ss.getSheetByName(CONFIG.SHEET_M_OFFICE);
  if (officeSh) {
    officeSh.getProtections(SpreadsheetApp.ProtectionType.SHEET)
      .forEach(function(p) { p.remove(); });
    officeSh.protect()
      .setDescription('事務所マスタ - 1行目のヘッダーは変更しないこと')
      .setWarningOnly(true);
  }

  // M_月次ボーナス: 保護なし（クライアントが毎月区分を入力するシート）
  var bonusSh = ss.getSheetByName(CONFIG.SHEET_M_MONTHLY_BONUS);
  if (bonusSh) {
    bonusSh.getProtections(SpreadsheetApp.ProtectionType.SHEET)
      .forEach(function(p) { p.remove(); });
  }

  SpreadsheetApp.getUi().alert(
    '✅ シート保護を設定しました。\n\n'
    + '・自動管理シートを誤って編集しようとすると警告が出ます\n'
    + '・M_月次ボーナス は引き続き自由に入力できます\n'
    + '・M_事務所 は事務所の追加・アクティブ切替が可能です'
  );
  Logger.log('protectSheets(): 完了');
}

// ── 使い方ガイドシート ──────────────────────────────────────
function buildGuideSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEET_GUIDE);
  if (sh) {
    sh.clear();
    sh.clearConditionalFormatRules();
  } else {
    sh = ss.insertSheet(CONFIG.SHEET_GUIDE);
  }

  sh.setColumnWidth(1, 20);
  sh.setColumnWidth(2, 180);
  sh.setColumnWidth(3, 460);

  var NAVY  = '#1C4E80';
  var LTBLU = '#D6E4F0';
  var YLLOW = '#FFF9C4';
  var WHT   = '#FFFFFF';
  var FG_W  = '#FFFFFF';
  var FG_D  = '#212529';
  var FG_GY = '#6C757D';

  var r = 1;

  function applyRow(rowNum, cells) {
    cells.forEach(function(c) {
      var range = sh.getRange(rowNum, c.col, 1, c.colspan || 1);
      if (c.colspan > 1) range.merge();
      if (c.value !== undefined) range.setValue(c.value);
      if (c.bg)      range.setBackground(c.bg);
      if (c.fg)      range.setFontColor(c.fg);
      if (c.bold)    range.setFontWeight('bold');
      if (c.size)    range.setFontSize(c.size);
      if (c.align)   range.setHorizontalAlignment(c.align);
      if (c.italic)  range.setFontStyle('italic');
    });
  }

  function sectionHdr(text) {
    applyRow(r, [{ col: 1, colspan: 3, value: text, bg: NAVY, fg: FG_W, bold: true, size: 11, align: 'LEFT' }]);
    sh.setRowHeight(r, 30);
    r++;
  }

  function dataRow(label, detail, bg) {
    applyRow(r, [
      { col: 2, value: label, bold: true, bg: bg || WHT, fg: FG_D },
      { col: 3, value: detail, bg: bg || WHT, fg: FG_D },
    ]);
    r++;
  }

  function textRow(text) {
    applyRow(r, [{ col: 2, colspan: 2, value: text, fg: FG_D }]);
    r++;
  }

  function noteRow(text) {
    applyRow(r, [{ col: 2, colspan: 2, value: text, fg: FG_GY, italic: true }]);
    r++;
  }

  function blank() { r++; }

  // ── タイトル ──
  applyRow(r, [{ col: 1, colspan: 3, value: 'uyet ダッシュボード  使い方ガイド', bg: NAVY, fg: FG_W, bold: true, size: 15, align: 'CENTER' }]);
  sh.setRowHeight(r, 46); r++;
  applyRow(r, [{ col: 1, colspan: 3, value: '最終更新: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd'), bg: LTBLU, fg: FG_GY, align: 'RIGHT', italic: true }]);
  r += 2;

  // ── 毎月の作業手順（月末〆後） ──
  sectionHdr('📥  毎月の作業手順（月末締め後）');
  dataRow('STEP 1', 'iriam 管理画面から月次CSVを2種ダウンロード');
  noteRow('    ・配信実績CSV（streaming_report）');
  noteRow('    ・請求書CSV（monthly_invoice_report）');
  noteRow('    ※ 事務所ごとに2ファイル。ファイル名は変更しないこと。');
  blank();
  dataRow('STEP 2', 'Google Drive の所定フォルダにファイルを置く');
  noteRow('    場所: cozoru_sales management → dashboard_input');
  blank();
  dataRow('STEP 3', 'メニュー「📥 ① CSV取込 & ダッシュボード更新」を実行');
  noteRow('    完了メッセージが出たら成功。取込済みファイルは archive に自動移動されます。');
  blank();
  dataRow('STEP 4', '結果を確認');
  noteRow('    「取込ログ」タブ → SUCCESS が出ていれば正常');
  noteRow('    「DB_サマリ」タブ → 当月データが反映されていることを確認');
  blank();

  // ── 月中の作業手順（進捗確認） ──
  sectionHdr('📊  月中の作業手順（進捗確認・任意）');
  dataRow('STEP 1', 'iriam 管理画面から日次CSVをダウンロード');
  noteRow('    ファイル名形式: YYYYMMDD_YYYYMMDD_streaming_report_事務所名.csv');
  noteRow('    ※ このCSVは「月初から集計終了日までの累積データ」です（1日分ではありません）');
  blank();
  dataRow('STEP 2', 'Google Drive の dashboard_input フォルダに置く');
  blank();
  dataRow('STEP 3', 'メニュー「📊 ④ 成長進捗を更新」を実行');
  noteRow('    RAW_日次 に累積データが保存され、DB_成長進捗 が更新されます。');
  blank();

  // ── セグメント分析の使い方 ──
  sectionHdr('🔍  セグメント分析の使い方（任意）');
  dataRow('STEP 1', 'メニュー「🔍 ⑤ セグメント分析を更新」を実行');
  noteRow('    当月の全ライバーを「配信時間 × 応援ダイヤ」で4分類します。');
  blank();
  dataRow('STEP 2', 'B1セルで対象月を変更（例: 2026-04）、D1セルで事務所を絞り込む');
  noteRow('    変更後は「⑤ セグメント分析を更新」を再実行してください。');
  blank();
  dataRow('セグメント分類', '');
  noteRow('    ◎ 配信時間多い × 応援ダイヤ多い  → 優先的に伸ばす');
  noteRow('    ○ 配信時間多い × 応援ダイヤ少ない → 視聴者獲得・ファン化の施策を');
  noteRow('    △ 配信時間少ない × 応援ダイヤ多い → 配信頻度を増やせると伸びしろあり');
  noteRow('    ✗ 配信時間少ない × 応援ダイヤ少ない → 活動継続の確認・サポートが必要');
  noteRow('    ※ 閾値は当月全ライバーの平均値（毎月変動）');
  blank();

  // ── 各シートの役割 ──
  sectionHdr('📋  各シートの役割');
  textRow('✏️  触っていいシート（入力・編集OK）');
  dataRow('M_事務所', '事務所の登録・アクティブ切替（C列を TRUE / FALSE で切り替え）', YLLOW);
  dataRow('M_月次ボーナス', 'iriam成長ボーナスの判定区分（最高/基本/最低）を毎月入力', YLLOW);
  blank();
  textRow('🤖  自動更新シート（手動編集不要）');
  dataRow('DB_サマリ', 'メインダッシュボード。月次CSV取込時に自動更新。');
  dataRow('DB_成長予測', '事務所別の成長ボーナス判定予測。将来12ヶ月先まで表示。');
  dataRow('DB_成長進捗', '今月の累積ダイヤと月末予測。日次CSV取込後に更新。');
  dataRow('DB_ライバー月次', 'ライバー個人×月別の応援ダイヤ・CPN一覧。フィルター絞り込み可。');
  dataRow('DB_セグメント', 'ライバーを「配信時間 × 応援ダイヤ」で4象限に分類。⑤を実行して更新。');
  dataRow('RAW_ライバー月次', '月次CSVの蓄積データ。削除・編集は厳禁。');
  dataRow('RAW_日次', '日次CSVの累積スナップショット。削除・編集は厳禁。');
  dataRow('取込ログ', '処理履歴。エラー確認に使う。');
  blank();
  textRow('📋  マスタシート（変更は担当者に相談）');
  dataRow('M_Tier / M_CPN / M_税率', '計算パラメータ。誤変更するとダッシュボードの金額がずれます。');
  blank();

  // ── 仕組みを理解する ──
  sectionHdr('🔍  仕組みを理解する');

  dataRow('成長予測の将来月はいつ更新されるか', '');
  noteRow('    自動では増えません。「📈 ③ 成長ボーナス予測を更新」を実行したタイミングで');
  noteRow('    「直近実績月 + 将来12ヶ月」の範囲でシートが毎回作り直されます。');
  noteRow('    例: 2026年5月データが入った状態で実行 → 2027年5月まで表示。');
  noteRow('    翌月の月次CSVを取り込んで再実行すると、表示範囲が1ヶ月ずれます。');
  blank();

  dataRow('今月の月次ダイヤ予測の計算方法', '');
  noteRow('    ① 月次CSVが取り込まれた月 → その確定値をそのまま表示');
  noteRow('    ② 今月 × 日次CSVが取り込まれている → 累積 ÷ 経過日数 × 月日数 で月末予測');
  noteRow('    ③ 今月 × 日次CSVなし → 直近3ヶ月の平均値（フォールバック）');
  noteRow('    将来月はすべて ③ の直近3ヶ月平均で予測します。');
  blank();

  dataRow('成長判定 ◎ ○ ✖ の意味', '');
  noteRow('    ◎ 最高: 月次ダイヤ ≥ 単月基準（過去最高月）または 3か月合計が過去最高を更新');
  noteRow('    ○ 基準: それ以外（通常状態）');
  noteRow('    ✖ 最低: 月次ダイヤ < 最低ライン（直近6ヶ月の最小値）');
  blank();

  dataRow('3ヶ月基準（DB_成長進捗の目標）の計算方法', '');
  noteRow('    過去の3ヶ月合計ダイヤの最大値 から 前月・前々月ダイヤを引いた値。');
  noteRow('    「今月これだけ取れば、過去最高の3ヶ月合計を維持できる」というラインです。');
  blank();

  dataRow('日次CSVはなぜ「累積」なのか', '');
  noteRow('    iriam の日次レポートは「月初〜集計終了日までの合計」として出力されます。');
  noteRow('    1日分のデータではないため、同じ月に複数回取り込んでも正しく上書きされます。');
  blank();

  // ── よくある質問 ──
  sectionHdr('❓  よくある質問');
  dataRow('Q', '「処理対象なし」と表示された');
  noteRow('    dashboard_input フォルダにCSVが入っているか確認してください。');
  noteRow('    取込済みファイルは archive に移動されるため、再実行しても取込されません。');
  blank();
  dataRow('Q', '成長判定の ◎○✖ がおかしい');
  noteRow('    月次CSVが正しく取り込まれていれば自動で計算されます。');
  noteRow('    「📈 ③ 成長ボーナス予測を更新」でシートを再構築してみてください。');
  blank();
  dataRow('Q', '成長予測の今月の数字が実態とズレている');
  noteRow('    日次CSVを取り込んでいない場合、直近3ヶ月平均で予測します。');
  noteRow('    より正確にしたい場合は月中に日次CSVを取り込んでください。');
  blank();
  dataRow('Q', '事務所を追加したい');
  noteRow('    M_事務所 シートに1行追加し、アクティブ列を TRUE にしてください。');
  noteRow('    次回のダッシュボード更新から自動で含まれます。');
  blank();
  dataRow('Q', 'エラーが出た');
  noteRow('    「取込ログ」タブの ERROR 行をスクリーンショットして担当者に共有してください。');
  blank();

  // 最終行に更新日
  applyRow(r, [{ col: 1, colspan: 3, value: '自動生成: ' + Utilities.formatDate(new Date(), 'JST', 'yyyy-MM-dd HH:mm'), fg: FG_GY, italic: true, align: 'RIGHT' }]);

  // シート自体を警告のみ保護
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)
    .forEach(function(p) { p.remove(); });
  sh.protect().setDescription('使い方ガイド - 自動生成').setWarningOnly(true);

  Logger.log('buildGuideSheet(): ' + (r - 1) + '行生成');
}
