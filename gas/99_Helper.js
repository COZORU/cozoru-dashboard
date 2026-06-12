// 99_Helper.gs — 運用診断・復元・後処理ヘルパー
// 作業完了後も残しておく関数 (手動実行専用)

// 専用ラッパー（GASエディタから引数なしで実行可能）
function deleteCozoru2026_03() { deleteRawRowsByMonthOffice('2026-03', '株式会社cozoru'); }

// ============================================================
// チェーン実行: syncToPL 2026-03 → 2026-04 → applyPlBackgrounds
// 使い方:
//   1. 別タブで syncToPL2026_02 を実行中の状態で
//   2. このタブで startSyncChain() を実行 → 8分後に03開始 → 完了次第04 → 完了次第背景色
// ============================================================
function startSyncChain() {
  _deleteChainTriggers_();
  ScriptApp.newTrigger('runChainSync03').timeBased().after(8 * 60 * 1000).create();
  Logger.log('チェーン予約: 8分後 → syncToPL2026_03 → syncToPL2026_04 → applyPlBackgrounds');
  Logger.log('（必要なら ScriptApp のトリガー一覧で確認可能）');
}

function runChainSync03() {
  _deleteChainTriggers_('runChainSync03');
  Logger.log('[chain] syncToPL2026_03 開始');
  syncToPL('2026-03');
  Logger.log('[chain] syncToPL2026_03 完了。1分後にrunChainSync04を予約');
  ScriptApp.newTrigger('runChainSync04').timeBased().after(60 * 1000).create();
}

function runChainSync04() {
  _deleteChainTriggers_('runChainSync04');
  Logger.log('[chain] syncToPL2026_04 開始');
  syncToPL('2026-04');
  Logger.log('[chain] syncToPL2026_04 完了。1分後にrunChainBackground を予約');
  ScriptApp.newTrigger('runChainBackground').timeBased().after(60 * 1000).create();
}

function runChainBackground() {
  _deleteChainTriggers_('runChainBackground');
  Logger.log('[chain] applyPlBackgrounds 開始');
  applyPlBackgrounds();
  Logger.log('[chain] 全工程完了 ✅');
}

// チェーン関連トリガー削除（指定なしの場合は全て）
function _deleteChainTriggers_(specificHandler) {
  var chain = ['runChainSync03', 'runChainSync04', 'runChainBackground'];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var h = t.getHandlerFunction();
    if (specificHandler ? (h === specificHandler) : (chain.indexOf(h) >= 0)) {
      ScriptApp.deleteTrigger(t);
    }
  });
}

// 緊急停止用: チェーンを止めたい時に実行
function stopSyncChain() {
  _deleteChainTriggers_();
  Logger.log('チェーントリガーを全削除しました');
}

// ============================================================
// 正規表現用エスケープ
function escapeRegex_(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// 数式に AK列フィルタを追加（サブセクション用）
// SUMIFS/COUNTIFS の '!B:B,"officeName"' 直後に ,!AK:AK,"akLabel" を挿入
// SUMPRODUCT の '!B2:B="officeName")' 直後に *(!AK2:AK="akLabel") を挿入
function addAKFilter_(formula, officeName, akLabel) {
  var ofRe = escapeRegex_(officeName);
  formula = formula.replace(
    new RegExp("('RAW_ライバー月次'!B:B,\"" + ofRe + "\")", 'g'),
    "$1,'RAW_ライバー月次'!AK:AK,\"" + akLabel + "\""
  );
  formula = formula.replace(
    new RegExp("('RAW_ライバー月次'!B2:B=\"" + ofRe + "\"\\))", 'g'),
    "$1*('RAW_ライバー月次'!AK2:AK=\"" + akLabel + "\")"
  );
  return formula;
}

// ============================================================
// applyDefFormulasToSection: 定義書の数式を指定セクション全月に適用（汎用版）
// config: { sectionHeader, officeName, defCol, salesLabel, subLabel }
//   sectionHeader: 'cozoru' / 'ライブナウV' / 'Tolance:全社' / 'BUBBLE' 等
//   officeName:    '株式会社cozoru' / 'ライブナウV' / '株式会社Tolance' 等
//   defCol:        3/6/7 (主要3社) → サブセクションも 7 をベース
//   salesLabel:    任意（サブセクションは "売上：BUBBLE" など）
//   subLabel:      設定するとサブセクション扱い → 数式にAK列フィルタ追加
// ============================================================
function applyDefFormulasToSection(config) {
  var DEF_ID = '1e7Lk3ZwcYrcXaFhXQmnnK-xIIrWo8nJAFz_FCgF85Ts';
  var DEF_GID = 257753506;
  var defSs = SpreadsheetApp.openById(DEF_ID);
  var defSh = null;
  defSs.getSheets().forEach(function(s) { if (s.getSheetId() === DEF_GID) defSh = s; });
  if (!defSh) { Logger.log('定義書未検出'); return; }

  // targetSs を指定すれば他スプレッドシートを対象にできる
  var ss = config.targetSs || SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var DEF_COL = config.defCol;

  // セクション開始行
  var plLastRow = plSh.getLastRow();
  var bVals = plSh.getRange(1, 2, plLastRow, 1).getValues();
  var s0 = -1;
  for (var i = 0; i < bVals.length; i++) {
    if (bVals[i][0] === config.sectionHeader) { s0 = i + 2; break; }
  }
  if (s0 < 0) { Logger.log(config.sectionHeader + ' セクション未検出'); return; }
  Logger.log(config.sectionHeader + ' s0 = ' + s0);

  var lblMap = buildLabelMap_(plSh, s0, 100);

  // 月列マップ
  var lastCol = plSh.getLastColumn();
  var row2 = plSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = row2[c];
    if (v instanceof Date || (typeof v === 'string' && /^\d{4}\/\d+/.test(v))) {
      monthCols.push(c + 1);
    }
  }
  Logger.log('対象月列数: ' + monthCols.length);

  // アクティブ数 行を検出（Tier別アクティブ数オフセット算出用）
  var activeCountOff = lblMap['アクティブ数'];

  // カスタム数式（事務所名埋込み）
  var OFFICE = config.officeName;
  var fActiveTotal = '=COUNTIFS(\'RAW_ライバー月次\'!A:A,COL_LETTER$2,\'RAW_ライバー月次\'!B:B,"' + OFFICE + '",\'RAW_ライバー月次\'!AD:AD,TRUE)';
  function fActiveTier(t) {
    return '=COUNTIFS(\'RAW_ライバー月次\'!A:A,COL_LETTER$2,\'RAW_ライバー月次\'!B:B,"' + OFFICE + '",\'RAW_ライバー月次\'!AC:AC,' + t + ',\'RAW_ライバー月次\'!AD:AD,TRUE)';
  }
  // 達成人数（CPN系）: RAWの該当列 > 0 の人数
  // T=C5 / U=A / V=S / X=B2（W=その他報酬）
  function fAchieveCount(rawCol) {
    return '=COUNTIFS(\'RAW_ライバー月次\'!A:A,COL_LETTER$2,\'RAW_ライバー月次\'!B:B,"' + OFFICE + '",\'RAW_ライバー月次\'!' + rawCol + ':' + rawCol + ',">0")';
  }

  var MAPPING = [
    // 売上系
    { defRow: 6,  plLabel: config.salesLabel },   // 売上（税込）
    { defRow: 7,  plOffset: 1 },                  // 売上（税抜）
    { defRow: 8,  plLabel: '総ダイヤ数' },
    { defRow: 9,  plLabel: '獲得pt数' },
    { defRow: 11, plLabel: '投げ銭報酬' },
    // Tier別 獲得pt (offsets +6/+7/+8)
    { defRow: 13, plOffset: 6 },
    { defRow: 14, plOffset: 7 },
    { defRow: 15, plOffset: 8 },
    // Tier別 応援ダイヤ (offsets +10/+11/+12)
    { defRow: 17, plOffset: 10 },
    { defRow: 18, plOffset: 11 },
    { defRow: 19, plOffset: 12 },
    // Tier別 マネジメントフィー (offsets +14/+15/+16)
    { defRow: 21, plOffset: 14 },
    { defRow: 22, plOffset: 15 },
    { defRow: 23, plOffset: 16 },
    // 時間ダイヤ・派生
    { defRow: 24, plLabel: '時間ダイヤ' },
    { defRow: 25, plLabel: 'ダイヤボーナス' },
    { defRow: 26, plLabel: '投げ銭平均額' },
    { defRow: 27, plLabel: 'アクティブ平均金額' },
    { defRow: 28, plLabel: 'Tier1 平均' },
    { defRow: 29, plLabel: 'Tier2 平均' },
    { defRow: 30, plLabel: 'Tier3 平均' },
    // CPN（定義書にない達成人数はカスタム数式で追加）
    { defRow: 32, plLabel: 'C5：イラスト報酬' },
    { customFormula: fAchieveCount('T'), plLabel: 'C5：達成人数' },
    { defRow: 33, plLabel: 'C5：報酬利率' },
    { defRow: 34, plLabel: 'C5：報酬単価' },
    { defRow: 35, plLabel: 'B2：イラスト報酬' },
    { customFormula: fAchieveCount('X'), plLabel: 'B2：達成人数' },
    { defRow: 36, plLabel: 'B2：報酬利率' },
    { defRow: 37, plLabel: 'B2：報酬単価' },
    { defRow: 38, plLabel: 'A：Aランク報酬' },
    { customFormula: fAchieveCount('U'), plLabel: 'A：達成人数' },
    { defRow: 39, plLabel: 'A：報酬利率' },
    { defRow: 40, plLabel: 'A：報酬単価' },
    { defRow: 41, plLabel: 'S：Sランク報酬' },
    { customFormula: fAchieveCount('V'), plLabel: 'S：達成人数' },
    { defRow: 42, plLabel: 'S：報酬利率' },
    { defRow: 43, plLabel: 'S：報酬単価' },
    { defRow: 44, plLabel: 'その他報酬' },
    // レベシェ（合計＋応援＋時間）
    { defRow: 46, plLabel: 'レベシェ30' },                         // 合計
    { defRow: 47, plLabel: 'レベシェ30', plExtraOffset: 1 },      // 応援
    { defRow: 48, plLabel: 'レベシェ30', plExtraOffset: 2 },      // 時間
    // ライバー基盤
    { defRow: 50, plLabel: '登録ライバー数' },
    { defRow: 51, plLabel: 'アクティブライバー数' },
    { defRow: 52, plLabel: 'アクティブ率' },
    { defRow: 53, plLabel: 'デビュー数' },
    { defRow: 54, plLabel: 'C5達成率' },
    { defRow: 55, plLabel: 'C5達成数' },
  ];

  // アクティブ数行が見つかれば Tier別アクティブ数も追加（label="アクティブ数" の直下3行）
  if (activeCountOff !== undefined) {
    MAPPING.push({ customFormula: fActiveTotal,  plOffset: activeCountOff });
    MAPPING.push({ customFormula: fActiveTier(1), plOffset: activeCountOff + 1 });
    MAPPING.push({ customFormula: fActiveTier(2), plOffset: activeCountOff + 2 });
    MAPPING.push({ customFormula: fActiveTier(3), plOffset: activeCountOff + 3 });
  } else {
    Logger.log('警告: アクティブ数 ラベル未検出 → Tier別アクティブ数 スキップ');
  }

  var stats = { written: 0, skipped: 0, errors: 0 };

  MAPPING.forEach(function(m) {
    var srcFormula;
    if (m.customFormula) {
      srcFormula = m.customFormula;
    } else {
      srcFormula = defSh.getRange(m.defRow, DEF_COL).getFormula();
      if (!srcFormula || srcFormula.length === 0) {
        Logger.log('skip: 定義書 row ' + m.defRow + ' 数式なし');
        stats.skipped++;
        return;
      }
    }

    var plOff = -1;
    if (m.plOffset !== undefined) {
      plOff = m.plOffset;
    } else if (m.plLabel !== undefined) {
      for (var lbl in lblMap) {
        if (lbl.indexOf(m.plLabel) === 0 || lbl === m.plLabel) {
          plOff = lblMap[lbl];
          if (m.plExtraOffset) plOff += m.plExtraOffset;
          break;
        }
      }
    }

    if (plOff < 0) {
      Logger.log('skip: 対応行未検出 (label="' + (m.plLabel || '') + '")');
      stats.skipped++;
      return;
    }

    var plRow = s0 + plOff;
    monthCols.forEach(function(col) {
      try {
        var colLetter = colNumToLetter_(col);
        // 定義書数式: $B$2 を置換 / カスタム数式: COL_LETTER を置換
        var newFormula = srcFormula
          .replace(/\$B\$2/g, colLetter + '$2')
          .replace(/COL_LETTER/g, colLetter);
        // サブセクションの場合は AK列フィルタを追加
        if (config.subLabel) {
          newFormula = addAKFilter_(newFormula, config.officeName, config.subLabel);
        }
        plSh.getRange(plRow, col).setFormula(newFormula);
        stats.written++;
      } catch (e) {
        Logger.log('error: row ' + plRow + ' col ' + col + ': ' + e.message);
        stats.errors++;
      }
    });
    Logger.log('  ' + (m.plLabel || ('offset+' + m.plOffset)) + ' → PL row ' + plRow + ' × ' + monthCols.length + '月');
  });

  Logger.log('\n=== 完了 (' + config.sectionHeader + ') ===');
  Logger.log('書込み: ' + stats.written + 'セル / スキップ: ' + stats.skipped + ' / エラー: ' + stats.errors);
  Logger.log('次手順: applyPlBackgrounds() を実行して色味確認');
}

// ============================================================
// 経営指標(1Bn8...) 専用ワンショット精緻化
// 数式適用 → 旧PL手打ち値コピー → 色更新 を一気に実行
// タイムアウト対策: Step4(色更新)はトリガーで別実行
// ============================================================
var KEIEI_PL_ID = '1Bn8f2Gq2rhRluuapMm8r0lOoTy0YnrQC8rdWn6U8csM';

function 経営指標を全自動精緻化() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);

  Logger.log('=== Step 1/4: 3社+cozoru sub 数式適用 (経営指標) ===');
  // cozoru:全社 (defCol=3 = cozoru小計 / D3+株式会社cozoru の合算)
  applyDefFormulasToSection({ sectionHeader: 'cozoru:全社', officeName: '株式会社cozoru',
    defCol: 3, salesLabel: '売上：cozoru', targetSs: ss });
  // cozoruレーベル sub (defCol=5 = ┣ 株式会社cozoru / AKフィルタ自動付与)
  applyDefFormulasToSection({ sectionHeader: 'cozoruレーベル', officeName: '株式会社cozoru',
    defCol: 5, salesLabel: null, subLabel: '株式会社cozoru', targetSs: ss });
  // D3レーベル sub (defCol=4 = ┣ D3 / AKフィルタ自動付与)
  applyDefFormulasToSection({ sectionHeader: 'D3レーベル', officeName: '株式会社cozoru',
    defCol: 4, salesLabel: null, subLabel: 'D3', targetSs: ss });
  applyDefFormulasToSection({ sectionHeader: 'ライブナウV', officeName: 'ライブナウV',
    defCol: 6, salesLabel: '売上：ライブナウV', targetSs: ss });
  applyDefFormulasToSection({ sectionHeader: 'Tolance:全社', officeName: '株式会社Tolance',
    defCol: 7, salesLabel: '売上：Tolance', targetSs: ss });

  Logger.log('\n=== Step 2/4: Tolanceサブ12個 (経営指標) ===');
  var subs = [
    ['Tolance', '売上：Tolance'],
    ['BUBBLE', null], ['Deeper Deeper', null], ['Mofile', null], ['ヴィラプロ', null],
    ['アライアンス：アクトワン', null], ['アライアンス：アドモンド', null],
    ['アライアンス：TOIRO', null], ['アライアンス：PODD', null],
    ['アライアンス：その他', null], ['アライアンス：トビラ', null],
    ['アライアンス：ライブナウV(Tolance)', null]
  ];
  subs.forEach(function(p) {
    applyDefFormulasToSection({
      sectionHeader: p[0], officeName: '株式会社Tolance', defCol: 7,
      salesLabel: p[1], subLabel: p[0], targetSs: ss
    });
  });

  Logger.log('\n=== Step 3 (旧PLコピー) を 1分後にトリガー予約 ===');
  _scheduleKeieiNext_('_経営指標_Step3_', 60);
  Logger.log('=== Step 1-2 完了 / 残りは順次自動実行 ===');
}

function _経営指標_Step3_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === '_経営指標_Step3_') ScriptApp.deleteTrigger(t);
  });
  Logger.log('=== Step 3/4: 経営指標 旧PL手打ち値コピー 開始 ===');
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  copyOldManualToNew(false, ss);
  Logger.log('\n=== Step 4 (色更新) を 1分後にトリガー予約 ===');
  _scheduleKeieiNext_('_経営指標_Step4_', 60);
}

function _経営指標_Step4_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === '_経営指標_Step4_') ScriptApp.deleteTrigger(t);
  });
  Logger.log('=== Step 4/4: 経営指標 色更新 開始 ===');
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  applyPlBackgrounds(ss);
  Logger.log('\n=== 🎉 経営指標 精緻化 全工程完了 ===');
}

function _scheduleKeieiNext_(handlerName, delaySec) {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === handlerName) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(handlerName).timeBased().after(delaySec * 1000).create();
}

// セクション別ラッパー（GASエディタから引数なしで実行可能）
function applyDefFormulasToCozoru() {
  applyDefFormulasToSection({
    sectionHeader: 'cozoru',
    officeName: '株式会社cozoru',
    defCol: 3,
    salesLabel: '売上：cozoru'
  });
}
function applyDefFormulasToLivenowV() {
  applyDefFormulasToSection({
    sectionHeader: 'ライブナウV',
    officeName: 'ライブナウV',
    defCol: 6,
    salesLabel: '売上：ライブナウV'
  });
}
function applyDefFormulasToTolanceAll() {
  applyDefFormulasToSection({
    sectionHeader: 'Tolance:全社',
    officeName: '株式会社Tolance',
    defCol: 7,
    salesLabel: '売上：Tolance'
  });
}
// 3社一括（タイムアウト注意：1社あたり約1分なので30分内に収まるはず）
function applyDefFormulasToAll() {
  applyDefFormulasToCozoru();
  applyDefFormulasToLivenowV();
  applyDefFormulasToTolanceAll();
  Logger.log('\n=== 3社全完了 ===');
}

// Tolance サブセクション用ラッパー（officeName=株式会社Tolance、defCol=7、AK列にサブカテゴリ名でフィルタ）
function _applyTolanceSub_(sectionHeader, salesLabel) {
  applyDefFormulasToSection({
    sectionHeader: sectionHeader,
    officeName: '株式会社Tolance',
    defCol: 7,
    salesLabel: salesLabel,
    subLabel: sectionHeader
  });
}
function applyDefFormulasToTolanceSub()   { _applyTolanceSub_('Tolance', '売上：Tolance'); }
function applyDefFormulasToBubble()       { _applyTolanceSub_('BUBBLE', null); }
function applyDefFormulasToDeeperDeeper() { _applyTolanceSub_('Deeper Deeper', null); }
function applyDefFormulasToMofile()       { _applyTolanceSub_('Mofile', null); }
function applyDefFormulasToVilaPro()      { _applyTolanceSub_('ヴィラプロ', null); }
function applyDefFormulasToActOne()       { _applyTolanceSub_('アライアンス：アクトワン', null); }
function applyDefFormulasToAdmond()       { _applyTolanceSub_('アライアンス：アドモンド', null); }
function applyDefFormulasToToiro()        { _applyTolanceSub_('アライアンス：TOIRO', null); }
function applyDefFormulasToPodd()         { _applyTolanceSub_('アライアンス：PODD', null); }
function applyDefFormulasToOtherAlliance(){ _applyTolanceSub_('アライアンス：その他', null); }
function applyDefFormulasToTobira()       { _applyTolanceSub_('アライアンス：トビラ', null); }
function applyDefFormulasToAllianceLvV()  { _applyTolanceSub_('アライアンス：ライブナウV(Tolance)', null); }

// ============================================================
// runFullPlSync: PL精緻化フル一括（4ステップ、Step 4 はトリガー連鎖で別実行）
// 1. 3社の数式再適用 → 2. Tolanceサブ全12個 → 3. 手打ち補完
// 4. 1分後にトリガーで色更新を自動起動（タイムアウト回避）
// ============================================================
function runFullPlSync() {
  Logger.log('=== Step 1/4: 3社数式再適用 ===');
  applyDefFormulasToAll();
  Logger.log('\n=== Step 2/4: Tolance全サブ数式再適用 ===');
  applyDefFormulasToAllTolanceSubs();
  Logger.log('\n=== Step 3/4: 旧PL手打ち値補完 ===');
  copyOldManualToNew(false);
  Logger.log('\n=== Step 4/4 (色更新) を 1分後に自動実行予約 ===');
  // 既存の Step4 トリガーを掃除してから新規予約
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === '_runFullPlSyncStep4_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('_runFullPlSyncStep4_').timeBased().after(60 * 1000).create();
  Logger.log('=== Step 1-3 完了 / Step 4 は約1分後に自動実行 ===');
}

function _runFullPlSyncStep4_() {
  // 自身のトリガーを削除
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === '_runFullPlSyncStep4_') ScriptApp.deleteTrigger(t);
  });
  Logger.log('=== Step 4/4: 色更新 開始 ===');
  applyPlBackgrounds();
  Logger.log('\n=== 🎉 全工程完了 ===');
}

// Tolanceサブセクション12個を一括処理
function applyDefFormulasToAllTolanceSubs() {
  applyDefFormulasToTolanceSub();
  applyDefFormulasToBubble();
  applyDefFormulasToDeeperDeeper();
  applyDefFormulasToMofile();
  applyDefFormulasToVilaPro();
  applyDefFormulasToActOne();
  applyDefFormulasToAdmond();
  applyDefFormulasToToiro();
  applyDefFormulasToPodd();
  applyDefFormulasToOtherAlliance();
  applyDefFormulasToTobira();
  applyDefFormulasToAllianceLvV();
  Logger.log('\n=== Tolance全サブ完了 ===');
}

// ============================================================
// copyOldManualToNew: 旧PLに値があるが新PLが0のセルを旧PL値で上書き
// 主用途: 旧月のCPN系手打ち値（CSV列がなかった月）を新PLに復元
// dryRun=true で対象一覧のみ、false で実コピー
// ============================================================
function copyOldManualToNew(dryRun, targetSs) {
  if (dryRun === undefined) dryRun = true;
  var OLD_PL_ID = '1x2yF6PEFs7Fv6nlPn_-3AYjba84wiwGLZSQFz8JrLF4';
  var OLD_GID = 1636107553;
  var oldSs = SpreadsheetApp.openById(OLD_PL_ID);
  var oldSh = null;
  oldSs.getSheets().forEach(function(s) { if (s.getSheetId() === OLD_GID) oldSh = s; });
  if (!oldSh) { Logger.log('旧PL未検出'); return; }

  var ss = targetSs || SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('新PL未検出'); return; }

  var months = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04'];
  // 経営指標 PL は cozoru → cozoru:全社 にリネーム済み（2026-05-24）
  // 旧PL検索時は対応マップで 'cozoru' に置換
  var sections = ['cozoru','cozoru:全社','ライブナウV','Tolance:全社'];
  var oldSecMap = { 'cozoru:全社': 'cozoru' }; // 新→旧マッピング

  function buildMonthCol(sh) {
    var row2 = sh.getRange(2, 1, 1, sh.getLastColumn()).getValues()[0];
    var map = {};
    row2.forEach(function(v, i) {
      var ym;
      if (v instanceof Date) ym = Utilities.formatDate(v, 'JST', 'yyyy-MM');
      else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
        var p = v.split('/'); ym = p[0] + '-' + ('0'+p[1]).slice(-2);
      }
      if (ym) map[ym] = i + 1;
    });
    return map;
  }
  var oCol = buildMonthCol(oldSh);
  var nCol = buildMonthCol(plSh);

  function findSec(sh, hdr) {
    var bVals = sh.getRange(1, 2, sh.getLastRow(), 1).getValues();
    for (var i = 0; i < bVals.length; i++) if (bVals[i][0] === hdr) return i + 1;
    return -1;
  }
  function buildLblMap(sh, s0, maxRows) {
    var vals = sh.getRange(s0, 2, maxRows, 2).getValues();
    var m = {};
    for (var i = 0; i < vals.length; i++) {
      var lbl = (vals[i][0] || vals[i][1] || '').toString().trim();
      if (lbl && m[lbl] === undefined) m[lbl] = s0 + i;
    }
    return m;
  }

  var copies = [];
  sections.forEach(function(sec) {
    var oS0 = findSec(oldSh, oldSecMap[sec] || sec);
    var nS0 = findSec(plSh, sec);
    if (oS0 < 0 || nS0 < 0) return;
    var oLbls = buildLblMap(oldSh, oS0, 100);
    var nLbls = buildLblMap(plSh, nS0, 100);

    Object.keys(oLbls).forEach(function(lbl) {
      // 単位がズレる行を除外（旧=人数 / 新=比率 のパターン）
      if (lbl.indexOf('利率') >= 0) return;
      if (lbl.indexOf('％') >= 0 || lbl.indexOf('%') >= 0) return;
      // 平均額系も新PLの数式が違うので除外
      if (lbl.indexOf('平均') >= 0) return;
      if (lbl.indexOf('ダイヤボーナス') >= 0) return;

      var oR = oLbls[lbl], nR = nLbls[lbl];
      if (nR === undefined) return;
      months.forEach(function(ym) {
        var oc = oCol[ym], nc = nCol[ym];
        if (!oc || !nc) return;
        var oCell = oldSh.getRange(oR, oc);
        var nCell = plSh.getRange(nR, nc);
        var oFormula = oCell.getFormula();
        // 旧PL側に数式があるセルは除外（旧PLが計算で出していたもの）
        if (oFormula && oFormula.length > 0) return;
        // 新PL側に数式があっても、結果が0なら旧PL値で上書きする
        // （旧月のCSV列なし項目では数式=0が無意味なので、旧PL値を採用）
        var oVal = Number(oCell.getValue()) || 0;
        var nVal = Number(nCell.getValue()) || 0;
        // 条件: 旧=手打ち かつ 旧>0 かつ 新=0
        if (Math.abs(oVal) < 0.01) return;
        if (Math.abs(nVal) >= 0.01) return;
        // 整数系ラベル（人数・達成数・登録・デビュー等）で小数値（誤入力疑い）を除外
        var intLabels = ['人数', '達成数', '登録', 'デビュー', 'アクティブ数', '流出'];
        var isIntLabel = intLabels.some(function(p) { return lbl.indexOf(p) >= 0; });
        if (isIntLabel && Math.abs(oVal) < 1) {
          Logger.log('[除外] 整数セルに小数値（疑義） [' + sec + '] ' + ym + ' / ' + lbl + ' = ' + oVal);
          return;
        }
        copies.push({ sec: sec, lbl: lbl, ym: ym, oVal: oVal, nR: nR, nc: nc });
      });
    });
  });

  Logger.log('対象セル: ' + copies.length + '件 (dryRun=' + dryRun + ')');
  copies.slice(0, 50).forEach(function(c) {
    Logger.log('[' + c.sec + '] ' + c.ym + ' / ' + c.lbl + ' = ' + c.oVal.toLocaleString());
  });
  if (copies.length > 50) Logger.log('...他 ' + (copies.length - 50) + '件');

  if (!dryRun) {
    var done = 0;
    copies.forEach(function(c) {
      plSh.getRange(c.nR, c.nc).setValue(c.oVal);
      done++;
    });
    Logger.log('実コピー完了: ' + done + 'セル');
  } else {
    Logger.log('※dryRun。実行するには copyOldManualToNew_execute');
  }
}
function copyOldManualToNew_dryrun()  { copyOldManualToNew(true); }
function copyOldManualToNew_execute() { copyOldManualToNew(false); }

// ============================================================
// verifyThreeWay: 新PL × 旧PL × 定義書(DB_サマリ) の3者検算
// - 旧PLに同ラベルあり → 旧PL値と比較
// - 旧PLになし & 定義書/DB_サマリにあり → DB_サマリ値と比較
// - どちらにもなし → 新PL値だけ表示（参考）
// 出力: 差分があるセルのみ
// ============================================================
function verifyThreeWay() {
  var OLD_PL_ID = '1x2yF6PEFs7Fv6nlPn_-3AYjba84wiwGLZSQFz8JrLF4';
  var OLD_GID = 1636107553;
  var oldSs = SpreadsheetApp.openById(OLD_PL_ID);
  var oldSh = null;
  oldSs.getSheets().forEach(function(s) { if (s.getSheetId() === OLD_GID) oldSh = s; });
  if (!oldSh) { Logger.log('旧PL未検出'); return; }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName('PL(個社別)');
  var dbSh = ss.getSheetByName('DB_サマリ');
  if (!plSh) { Logger.log('新PL未検出'); return; }
  if (!dbSh) Logger.log('警告: DB_サマリ未検出（旧PLのみで検算）');

  var months = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04'];
  var sections = ['cozoru','ライブナウV','Tolance:全社'];

  function buildMonthCol(sh) {
    var row2 = sh.getRange(2, 1, 1, sh.getLastColumn()).getValues()[0];
    var map = {};
    row2.forEach(function(v, i) {
      var ym;
      if (v instanceof Date) ym = Utilities.formatDate(v, 'JST', 'yyyy-MM');
      else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
        var p = v.split('/'); ym = p[0] + '-' + ('0'+p[1]).slice(-2);
      }
      if (ym) map[ym] = i + 1;
    });
    return map;
  }
  var oCol = buildMonthCol(oldSh);
  var nCol = buildMonthCol(plSh);

  // DB_サマリ の月列マップ（DB_サマリ の構造に依存）
  var dbCol = {};
  if (dbSh) {
    var dbLastCol = dbSh.getLastColumn();
    // DB_サマリ row 3 or 4 で月が並んでいる想定。複数行を試す
    for (var hr = 1; hr <= 5; hr++) {
      var row = dbSh.getRange(hr, 1, 1, dbLastCol).getValues()[0];
      row.forEach(function(v, i) {
        var ym;
        if (v instanceof Date) ym = Utilities.formatDate(v, 'JST', 'yyyy-MM');
        else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
          var p = v.split('/'); ym = p[0] + '-' + ('0'+p[1]).slice(-2);
        }
        if (ym && !dbCol[ym]) dbCol[ym] = i + 1;
      });
      if (Object.keys(dbCol).length >= 3) break;
    }
  }
  Logger.log('DB_サマリ 月列マップ: ' + JSON.stringify(dbCol));

  function findSec(sh, hdr) {
    var bVals = sh.getRange(1, 2, sh.getLastRow(), 1).getValues();
    for (var i = 0; i < bVals.length; i++) if (bVals[i][0] === hdr) return i + 1;
    return -1;
  }
  function buildLblMap(sh, s0, maxRows) {
    var vals = sh.getRange(s0, 2, maxRows, 2).getValues();
    var m = {};
    for (var i = 0; i < vals.length; i++) {
      var lbl = (vals[i][0] || vals[i][1] || '').toString().trim();
      if (lbl && m[lbl] === undefined) m[lbl] = s0 + i;
    }
    return m;
  }

  var diffs = [];

  sections.forEach(function(sec) {
    var nS0 = findSec(plSh, sec);
    var oS0 = findSec(oldSh, sec);
    if (nS0 < 0) return;
    var nLbls = buildLblMap(plSh, nS0, 100);
    var oLbls = oS0 > 0 ? buildLblMap(oldSh, oS0, 100) : {};

    Logger.log('\n=== ' + sec + ' (新S0=' + nS0 + ' 旧S0=' + oS0 + ') ===');

    Object.keys(nLbls).forEach(function(lbl) {
      var nR = nLbls[lbl];
      var oR = oLbls[lbl];
      months.forEach(function(ym) {
        var nc = nCol[ym], oc = oCol[ym];
        if (!nc) return;
        var nVal = Number(plSh.getRange(nR, nc).getValue()) || 0;
        var oVal = (oR && oc) ? (Number(oldSh.getRange(oR, oc).getValue()) || 0) : null;

        // 旧PLが存在 → 旧PLと比較
        if (oVal !== null) {
          if (Math.abs(nVal - oVal) < 1 && Math.abs(nVal) < 100000) return; // 微差スルー
          if (Math.abs(nVal - oVal) < Math.max(100, Math.abs(oVal) * 0.01)) return; // 1%以内スルー
          diffs.push({ sec: sec, lbl: lbl, ym: ym, src: '旧PL', expected: oVal, actual: nVal });
        }
        // 旧PLなし & DB_サマリあり → DB_サマリと比較
        // （簡略化: 旧PL不在の場合のみDBチェック、構造把握ができてから実装）
      });
    });
  });

  Logger.log('\n--- 差分 ' + diffs.length + '件 ---');
  diffs.slice(0, 200).forEach(function(d) {
    var diff = d.actual - d.expected;
    Logger.log('[' + d.sec + '] ' + d.ym + ' / ' + d.lbl +
               ': ' + d.src + '=' + d.expected.toLocaleString() +
               ' / 新=' + d.actual.toLocaleString() +
               ' / 差=' + diff.toLocaleString());
  });
  if (diffs.length > 200) Logger.log('...他 ' + (diffs.length - 200) + '件');
}

// ============================================================
// verifyTolanceApril: Tolance:全社 2026-04 の差分を一覧（焦点絞り）
// ============================================================
function verifyTolanceApril() {
  var OLD_PL_ID = '1x2yF6PEFs7Fv6nlPn_-3AYjba84wiwGLZSQFz8JrLF4';
  var OLD_GID = 1636107553;
  var oldSs = SpreadsheetApp.openById(OLD_PL_ID);
  var oldSh = null;
  oldSs.getSheets().forEach(function(s) { if (s.getSheetId() === OLD_GID) oldSh = s; });
  if (!oldSh) { Logger.log('旧PL未検出'); return; }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName('PL(個社別)');

  function buildMonthCol(sh) {
    var row2 = sh.getRange(2, 1, 1, sh.getLastColumn()).getValues()[0];
    var map = {};
    row2.forEach(function(v, i) {
      var ym;
      if (v instanceof Date) ym = Utilities.formatDate(v, 'JST', 'yyyy-MM');
      else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
        var p = v.split('/'); ym = p[0] + '-' + ('0'+p[1]).slice(-2);
      }
      if (ym) map[ym] = i + 1;
    });
    return map;
  }
  var oCol = buildMonthCol(oldSh)['2026-04'];
  var nCol = buildMonthCol(plSh)['2026-04'];

  function findSec(sh, hdr) {
    var bVals = sh.getRange(1, 2, sh.getLastRow(), 1).getValues();
    for (var i = 0; i < bVals.length; i++) if (bVals[i][0] === hdr) return i + 1;
    return -1;
  }
  var oS0 = findSec(oldSh, 'Tolance:全社');
  var nS0 = findSec(plSh, 'Tolance:全社');

  Logger.log('=== Tolance:全社 2026-04 比較 (旧row=' + oS0 + '〜 / 新row=' + nS0 + '〜) ===');

  var oRows = oldSh.getRange(oS0, 2, 100, 2).getValues();
  var nLblMap = {};
  var nRows = plSh.getRange(nS0, 2, 100, 2).getValues();
  for (var i = 0; i < nRows.length; i++) {
    var lbl = (nRows[i][0] || nRows[i][1] || '').toString().trim();
    if (lbl && nLblMap[lbl] === undefined) nLblMap[lbl] = nS0 + i;
  }

  for (var i = 0; i < oRows.length; i++) {
    var lbl = (oRows[i][0] || oRows[i][1] || '').toString().trim();
    if (!lbl) continue;
    var oR = oS0 + i;
    var nR = nLblMap[lbl];
    if (nR === undefined) { Logger.log('[新PLに該当行なし] ' + lbl); continue; }
    var oVal = Number(oldSh.getRange(oR, oCol).getValue()) || 0;
    var nVal = Number(plSh.getRange(nR, nCol).getValue()) || 0;
    var diff = nVal - oVal;
    var mark = Math.abs(diff) < 1 ? '✓' : '✗';
    Logger.log(mark + ' ' + lbl + ': 旧=' + oVal.toLocaleString() + ' / 新=' + nVal.toLocaleString() + ' / 差=' + diff.toLocaleString() + ' (旧row=' + oR + ' 新row=' + nR + ')');
  }
}

// ============================================================
// verifyNewPlVsOld: 新PLと旧PLを行単位・月単位で比較
// 主要3セクション (cozoru / ライブナウV / Tolance:全社) を対象に
// 2025-10〜2026-04 の値を比較し、差分が±100または1%以上なら出力
// ============================================================
function verifyNewPlVsOld() {
  var OLD_PL_ID = '1x2yF6PEFs7Fv6nlPn_-3AYjba84wiwGLZSQFz8JrLF4';
  var OLD_GID = 1636107553;
  var oldSs = SpreadsheetApp.openById(OLD_PL_ID);
  var oldSh = null;
  oldSs.getSheets().forEach(function(s) { if (s.getSheetId() === OLD_GID) oldSh = s; });
  if (!oldSh) { Logger.log('旧PL未検出'); return; }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('新PL未検出'); return; }

  var months = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04'];
  var sections = ['cozoru','ライブナウV','Tolance:全社'];

  // 月→列番号マップ（旧/新）
  function buildMonthCol(sh) {
    var maxCol = sh.getLastColumn();
    var row2 = sh.getRange(2, 1, 1, maxCol).getValues()[0];
    var map = {};
    row2.forEach(function(v, i) {
      var ym;
      if (v instanceof Date) ym = Utilities.formatDate(v, 'JST', 'yyyy-MM');
      else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
        var p = v.split('/'); ym = p[0] + '-' + ('0'+p[1]).slice(-2);
      }
      if (ym) map[ym] = i + 1;
    });
    return map;
  }
  var oldCol = buildMonthCol(oldSh);
  var newCol = buildMonthCol(plSh);

  // セクション → 開始行
  function findSectionStart(sh, hdr) {
    var bVals = sh.getRange(1, 2, sh.getLastRow(), 1).getValues();
    for (var i = 0; i < bVals.length; i++) {
      if (bVals[i][0] === hdr) return i + 1;
    }
    return -1;
  }

  // セクション内のラベル→行マップ
  function buildLabelMap(sh, s0, maxRows) {
    var vals = sh.getRange(s0, 2, maxRows, 2).getValues();
    var m = {};
    for (var i = 0; i < vals.length; i++) {
      var lbl = (vals[i][0] || vals[i][1] || '').toString().trim();
      if (lbl && m[lbl] === undefined) m[lbl] = s0 + i;
    }
    return m;
  }

  var diffs = [];
  sections.forEach(function(sec) {
    var oldS0 = findSectionStart(oldSh, sec);
    var newS0 = findSectionStart(plSh, sec);
    if (oldS0 < 0 || newS0 < 0) {
      Logger.log('セクション未検出: ' + sec + ' (old=' + oldS0 + ' new=' + newS0 + ')');
      return;
    }
    var oldLabels = buildLabelMap(oldSh, oldS0, 100);
    var newLabels = buildLabelMap(plSh, newS0, 100);

    Logger.log('\n=== ' + sec + ' (old s0=' + oldS0 + ', new s0=' + newS0 + ') ===');
    Object.keys(oldLabels).forEach(function(lbl) {
      var oldRow = oldLabels[lbl];
      var newRow = newLabels[lbl];
      if (newRow === undefined) return; // 新PLになければスキップ
      months.forEach(function(ym) {
        var oc = oldCol[ym], nc = newCol[ym];
        if (!oc || !nc) return;
        var oVal = Number(oldSh.getRange(oldRow, oc).getValue()) || 0;
        var nVal = Number(plSh.getRange(newRow, nc).getValue()) || 0;
        if (oVal === 0 && nVal === 0) return;
        var diff = nVal - oVal;
        var absDiff = Math.abs(diff);
        // 整数 ±100 以上 or 比率系で ±0.01 以上
        var threshold = (Math.abs(oVal) > 100 || Math.abs(nVal) > 100) ? 100 : 0.01;
        if (absDiff < threshold) return;
        diffs.push({
          sec: sec, lbl: lbl, ym: ym,
          oldVal: oVal, newVal: nVal, diff: diff,
          oldRow: oldRow, newRow: newRow
        });
      });
    });
  });

  Logger.log('\n--- 差分 ' + diffs.length + '件 ---');
  diffs.slice(0, 100).forEach(function(d) {
    Logger.log('[' + d.sec + '] ' + d.ym + ' / ' + d.lbl +
               ': 旧=' + d.oldVal.toLocaleString() +
               ' / 新=' + d.newVal.toLocaleString() +
               ' / 差=' + d.diff.toLocaleString() +
               ' (旧row=' + d.oldRow + ' 新row=' + d.newRow + ')');
  });
  if (diffs.length > 100) Logger.log('...他 ' + (diffs.length - 100) + '件');
}

// ============================================================
// verifyKeieiPlAllCells: 経営指標 PL(個社別) 全セル検算
// 各セル: 形式(F=数式/V=値/0=空), 経営指標値, 旧PL値, 差
// 出力をマークダウン形式で。Claudeが解析できる形に
// ============================================================
function verifyKeieiPlAllCells() {
  var KEIEI_ID = '1Bn8f2Gq2rhRluuapMm8r0lOoTy0YnrQC8rdWn6U8csM';
  var OLD_PL_ID = '1x2yF6PEFs7Fv6nlPn_-3AYjba84wiwGLZSQFz8JrLF4';
  var OLD_GID = 1636107553;

  var keieiSs = SpreadsheetApp.openById(KEIEI_ID);
  var keieiSh = keieiSs.getSheetByName('PL(個社別)');
  if (!keieiSh) { Logger.log('経営指標 PL(個社別) 未検出'); return; }

  var oldSs = SpreadsheetApp.openById(OLD_PL_ID);
  var oldSh = null;
  oldSs.getSheets().forEach(function(s) { if (s.getSheetId() === OLD_GID) oldSh = s; });
  if (!oldSh) { Logger.log('旧PL未検出'); return; }

  var months = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04'];
  // 経営指標 PL は cozoru → cozoru:全社 にリネーム済み（2026-05-24）
  // 旧PL検算には旧PL側の section name 'cozoru' を別途使う
  var sections = ['cozoru:全社', 'ライブナウV', 'Tolance:全社'];
  var oldSecMap = { 'cozoru:全社': 'cozoru', 'ライブナウV': 'ライブナウV', 'Tolance:全社': 'Tolance:全社' };

  function buildMonthCol(sh) {
    var row2 = sh.getRange(2, 1, 1, sh.getLastColumn()).getValues()[0];
    var map = {};
    row2.forEach(function(v, i) {
      var ym;
      if (v instanceof Date) ym = Utilities.formatDate(v, 'JST', 'yyyy-MM');
      else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
        var p = v.split('/'); ym = p[0] + '-' + ('0'+p[1]).slice(-2);
      }
      if (ym && !map[ym]) map[ym] = i + 1;
    });
    return map;
  }
  var kCol = buildMonthCol(keieiSh);
  var oCol = buildMonthCol(oldSh);
  Logger.log('経営指標月列: ' + JSON.stringify(kCol));
  Logger.log('旧PL月列: ' + JSON.stringify(oCol));

  function findSec(sh, hdr) {
    var bVals = sh.getRange(1, 2, sh.getLastRow(), 1).getValues();
    for (var i = 0; i < bVals.length; i++) if (bVals[i][0] === hdr) return i + 1;
    return -1;
  }
  function buildLblMap(sh, s0, maxRows) {
    var vals = sh.getRange(s0, 2, maxRows, 2).getValues();
    var m = {};
    for (var i = 0; i < vals.length; i++) {
      var lbl = (vals[i][0] || vals[i][1] || '').toString().trim();
      if (lbl && m[lbl] === undefined) m[lbl] = s0 + i;
    }
    return m;
  }

  // CSV形式で出力 → Claudeが読みやすい
  Logger.log('=== 経営指標 PL(個社別) 全セル検算 ===');
  Logger.log('section,kRow,oRow,label,month,formatK,kValue,oValue,diff');

  sections.forEach(function(sec) {
    var kS0 = findSec(keieiSh, sec);
    var oS0 = findSec(oldSh, oldSecMap[sec] || sec);
    if (kS0 < 0 || oS0 < 0) {
      Logger.log('[未検出] ' + sec + ' 経=' + kS0 + ' 旧=' + oS0);
      return;
    }
    var kLbls = buildLblMap(keieiSh, kS0, 100);
    var oLbls = buildLblMap(oldSh, oS0, 100);

    Object.keys(kLbls).forEach(function(lbl) {
      var kR = kLbls[lbl];
      var oR = oLbls[lbl];
      months.forEach(function(ym) {
        var kc = kCol[ym], oc = oCol[ym];
        if (!kc) return;
        var kCell = keieiSh.getRange(kR, kc);
        var kF = kCell.getFormula();
        var kV = kCell.getValue();
        var kVNum = Number(kV) || 0;
        var oV = (oR && oc) ? (Number(oldSh.getRange(oR, oc).getValue()) || 0) : null;
        var format = kF ? 'F' : (kV !== '' && kV !== null ? 'V' : '0');
        var diff = oV !== null ? (kVNum - oV) : '';
        var oVStr = oV === null ? '' : oV;
        // CSV行: section,kRow,oRow,label,month,formatK,kValue,oValue,diff
        Logger.log([sec, kR, oR || '', '"' + lbl + '"', ym, format, kVNum, oVStr, diff].join(','));
      });
    });
  });

  Logger.log('=== 検算完了 ===');
}

// ============================================================
// inspectKeieiShihyo: 経営指標シート(1Bn8...) 全タブ構造を一覧
// ============================================================
function inspectKeieiShihyo() {
  var ID = '1Bn8f2Gq2rhRluuapMm8r0lOoTy0YnrQC8rdWn6U8csM';
  var ss = SpreadsheetApp.openById(ID);
  var sheets = ss.getSheets();
  Logger.log('=== 経営指標 (1Bn8...) タブ一覧 ===');
  sheets.forEach(function(sh) {
    Logger.log('  ' + sh.getName() + ' (gid=' + sh.getSheetId() + ', ' + sh.getLastRow() + '行×' + sh.getLastColumn() + '列)');
  });
}

// ============================================================
// inspectKeieiShihyoTab: 指定タブの全ラベル＋数式有無＋背景色を一覧
// 使い方: GASエディタで関数を直接呼び出し、tabName を変えて実行
// ============================================================
function inspectKeieiShihyoTab_FY2025() {
  inspectKeieiShihyoTab('FY2025');
}
function inspectKeieiShihyoTab_FY2026() {
  inspectKeieiShihyoTab('FY2026');
}
function inspectKeieiShihyoTab(tabName) {
  var ID = '1Bn8f2Gq2rhRluuapMm8r0lOoTy0YnrQC8rdWn6U8csM';
  var ss = SpreadsheetApp.openById(ID);
  var sh = ss.getSheetByName(tabName);
  if (!sh) { Logger.log('タブ未検出: ' + tabName); return; }

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  Logger.log('=== ' + tabName + ' (' + lastRow + '行×' + lastCol + '列) ===');

  // B/C列のラベルを全行ダンプ（ラベル付き行のみ）
  var labelCols = sh.getRange(1, 1, lastRow, 4).getValues();
  for (var r = 0; r < lastRow; r++) {
    var lblA = (labelCols[r][0] || '').toString().trim();
    var lblB = (labelCols[r][1] || '').toString().trim();
    var lblC = (labelCols[r][2] || '').toString().trim();
    var lblD = (labelCols[r][3] || '').toString().trim();
    var lbl = lblA || lblB || lblC || lblD;
    if (!lbl) continue;
    if (r + 1 > 200) break; // 最初の200行のみ
    Logger.log('row ' + (r+1) + ': A=' + lblA + ' / B=' + lblB + ' / C=' + lblC + ' / D=' + lblD);
  }
}

// ============================================================
// inspectManualOnlySheet: 手打ち項目シート（関数化不可な項目）の構造を解析
// ============================================================
function inspectManualOnlySheet() {
  var ID = '1Bn8f2Gq2rhRluuapMm8r0lOoTy0YnrQC8rdWn6U8csM';
  var GID = 2146885699;
  var ss = SpreadsheetApp.openById(ID);
  var sh = null;
  ss.getSheets().forEach(function(s) { if (s.getSheetId() === GID) sh = s; });
  if (!sh) { Logger.log('手打ち項目シート未検出'); return; }

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  Logger.log('=== 手打ち項目シート 構造（' + lastRow + '行 × ' + lastCol + '列）===');
  Logger.log('A列=ラベル / B列〜=各社');
  Logger.log('-'.repeat(100));

  for (var r = 1; r <= Math.min(lastRow, 80); r++) {
    var lbl = sh.getRange(r, 1).getValue() || '';
    if (!lbl && r > 5) continue;

    Logger.log('\n--- row ' + r + ': ' + lbl + ' ---');
    for (var c = 2; c <= Math.min(lastCol, 10); c++) {
      var cell = sh.getRange(r, c);
      var f = cell.getFormula();
      var v = cell.getValue();
      var hdr = sh.getRange(4, c).getValue() || ('col' + c);
      if (f && f.length > 0) {
        Logger.log('  [' + hdr + '] 数式: ' + f.substring(0, 90));
      } else if (v !== '' && v !== null) {
        Logger.log('  [' + hdr + '] 値: ' + (typeof v === 'number' ? v.toLocaleString() : v));
      }
    }
  }
}

// ============================================================
// inspectDefinitionSheet: 定義書シート（KPI定義）の構造を解析
// 各行の「ラベル / 数式 or 定義テキスト / cozoru小計の値」を出力
// ============================================================
function inspectDefinitionSheet() {
  var DEF_ID = '1e7Lk3ZwcYrcXaFhXQmnnK-xIIrWo8nJAFz_FCgF85Ts';
  var DEF_GID = 257753506;
  var defSs = SpreadsheetApp.openById(DEF_ID);
  var defSh = null;
  defSs.getSheets().forEach(function(s) { if (s.getSheetId() === DEF_GID) defSh = s; });
  if (!defSh) { Logger.log('定義書未検出'); return; }

  var lastRow = defSh.getLastRow();
  var lastCol = defSh.getLastColumn();
  Logger.log('=== 定義書シート 構造（' + lastRow + '行 × ' + lastCol + '列）===');
  Logger.log('A列=ラベル / B列〜=各社の値・定義');
  Logger.log('-'.repeat(100));

  // 全行ダンプ（ラベル + 各列の数式 or 値）
  for (var r = 1; r <= Math.min(lastRow, 80); r++) {
    var lbl = defSh.getRange(r, 1).getValue() || '';
    if (!lbl && r > 5) continue; // ラベルない行はスキップ（ヘッダ部除く）

    Logger.log('\n--- row ' + r + ': ' + lbl + ' ---');
    for (var c = 2; c <= Math.min(lastCol, 8); c++) {
      var cell = defSh.getRange(r, c);
      var f = cell.getFormula();
      var v = cell.getValue();
      var hdr = defSh.getRange(4, c).getValue() || ('col' + c);
      if (f && f.length > 0) {
        Logger.log('  [' + hdr + '] 数式: ' + f.substring(0, 90));
      } else if (v !== '' && v !== null) {
        Logger.log('  [' + hdr + '] 値: ' + (typeof v === 'number' ? v.toLocaleString() : v));
      }
    }
  }
}

// ============================================================
// inspectOldPlCozoru: 旧PLのcozoruセクションを行単位で分析
// 各行が「RAW参照数式 / シート内数式 / 手打ち / 空」のどれかを判定
// 出力をもとに「数式化すべき行」「手打ちで残す行」を決定する
// ============================================================
function inspectOldPlCozoru() {
  var OLD_PL_ID = '1x2yF6PEFs7Fv6nlPn_-3AYjba84wiwGLZSQFz8JrLF4';
  var OLD_GID = 1636107553;
  var oldSs = SpreadsheetApp.openById(OLD_PL_ID);
  var oldSh = null;
  oldSs.getSheets().forEach(function(s) { if (s.getSheetId() === OLD_GID) oldSh = s; });
  if (!oldSh) { Logger.log('旧PL未検出'); return; }

  // cozoruセクション開始行を特定
  var bVals = oldSh.getRange(1, 2, oldSh.getLastRow(), 1).getValues();
  var s0 = -1;
  for (var i = 0; i < bVals.length; i++) {
    if (bVals[i][0] === 'cozoru') { s0 = i + 1; break; }
  }
  if (s0 < 0) { Logger.log('cozoru section 未検出'); return; }

  // 2026/4 列 (AJ = 36) で評価
  var checkCol = 36;
  Logger.log('=== 旧PL cozoru セクション 構造分析 (col AJ = 2026/4) ===');
  Logger.log('種類記号: 🔍=他シート参照(RAW等) / 🧮=シート内数式 / ✏️=手打ち / ⬜=空');
  Logger.log('-'.repeat(90));

  var counts = { ref: 0, calc: 0, manual: 0, empty: 0 };
  var manualRows = [];
  for (var i = s0; i < Math.min(s0 + 80, oldSh.getLastRow()); i++) {
    var lbl = bVals[i - 1][0] || bVals[i - 1][1] || '';
    var cell = oldSh.getRange(i, checkCol);
    var f = cell.getFormula();
    var v = cell.getValue();
    var hasF = f && f.length > 0;
    var hasV = v !== '' && v !== null;

    var type, content;
    if (hasF) {
      var isRef = f.indexOf('!') >= 0;
      type = isRef ? '🔍RAW参照' : '🧮シート内';
      isRef ? counts.ref++ : counts.calc++;
      content = f.substring(0, 70);
    } else if (hasV) {
      type = '✏️手打ち';
      counts.manual++;
      manualRows.push({ row: i, label: lbl, value: v });
      content = String(v).substring(0, 40);
    } else {
      type = '⬜空';
      counts.empty++;
      content = '';
    }
    Logger.log('row ' + i + ' | ' + (lbl || '(空)') + ' | ' + type + ' | ' + content);
  }

  Logger.log('\n--- 集計 ---');
  Logger.log('🔍RAW参照: ' + counts.ref + '行');
  Logger.log('🧮シート内: ' + counts.calc + '行');
  Logger.log('✏️手打ち: ' + counts.manual + '行');
  Logger.log('⬜空: ' + counts.empty + '行');

  Logger.log('\n--- 手打ち行一覧（数式化候補の検討対象） ---');
  manualRows.forEach(function(r) {
    Logger.log('row ' + r.row + ' [' + r.label + '] = ' + r.value);
  });
}

// トリガー一覧確認（チェーンが動いていない時のデバッグ用）
function listChainTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  Logger.log('全トリガー数: ' + triggers.length);
  triggers.forEach(function(t, i) {
    Logger.log('  #' + i + ' handler=' + t.getHandlerFunction() + ' type=' + t.getEventType());
  });
  Logger.log('--- 実行履歴は左サイドバー「実行数」タブで確認可能 ---');
}

// ============================================================
// deleteRawRowsByMonthOffice: RAW から特定月×事務所の行を全削除
// 重複データのクリーンアップに使用
// 使い方: deleteRawRowsByMonthOffice('2026-03', '株式会社cozoru')
// ============================================================
function deleteRawRowsByMonthOffice(ym, office) {
  if (!ym || !office) { Logger.log('usage: deleteRawRowsByMonthOffice(ym, office)'); return; }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('RAW_ライバー月次');
  if (!sheet) { Logger.log('RAW未検出'); return; }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('RAW空'); return; }
  var lastCol = sheet.getLastColumn();
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var keepRows = [];
  var deleted = 0;
  for (var i = 0; i < data.length; i++) {
    var rowMonth = data[i][0] instanceof Date
      ? Utilities.formatDate(data[i][0], 'JST', 'yyyy-MM')
      : String(data[i][0]).substring(0, 7);
    if (rowMonth === ym && data[i][1] === office) {
      deleted++;
    } else {
      keepRows.push(data[i]);
    }
  }
  sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (keepRows.length > 0) {
    sheet.getRange(2, 1, keepRows.length, lastCol).setValues(keepRows);
  }
  Logger.log('削除: ' + deleted + '件 (' + ym + ' | ' + office + ')');
  Logger.log('残行数: ' + keepRows.length);
}

// ============================================================
// restoreCozoru2026_03: cozoru 2026-03 の月次CSVペアのみ input に戻す
// `(1).csv` 等の重複ファイル・日次CSVは除外
// ============================================================
function restoreCozoru2026_03() {
  var targetMonth = '2026-03';
  var root = getFolderByName_(CONFIG.ARCHIVE_FOLDER);
  if (!root) { Logger.log('archiveフォルダ未検出'); return; }
  var monthIt = root.getFoldersByName(targetMonth);
  if (!monthIt.hasNext()) { Logger.log('archive/' + targetMonth + ' 未検出'); return; }
  var monthFolder = monthIt.next();
  var input = getFolderByName_(CONFIG.INPUT_FOLDER);
  if (!input) { Logger.log('inputフォルダ未検出'); return; }

  // cozoru の月次 streaming / invoice ペアのみマッチ（"(1)" / 日次パターンは除外）
  var REGEX = /^202603_(monthly_invoice_report|streaming_report)_株式会社cozoru\.csv$/i;
  var files = monthFolder.getFiles();
  var moved = 0, skipped = [];
  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    if (REGEX.test(name)) {
      f.moveTo(input);
      Logger.log('移動: ' + name + ' → input');
      moved++;
    } else {
      skipped.push(name);
    }
  }
  Logger.log('完了: ' + moved + '件を input に移動');
  if (skipped.length > 0) {
    Logger.log('スキップ (' + skipped.length + '件):');
    skipped.forEach(function(n) { Logger.log('  - ' + n); });
  }
  Logger.log('次手順: processAll() を実行してください');
}

// ============================================================
// restoreArchivedToInput: アーカイブ済みCSVをinputに戻す
// 引数なしで呼ぶと '2026-03' フォルダの全CSVをinputに移動
// ============================================================
function restoreArchivedToInput() {
  var targetMonth = '2026-03';
  var root = getFolderByName_(CONFIG.ARCHIVE_FOLDER);
  if (!root) { Logger.log('archiveフォルダ未検出'); return; }

  var monthIt = root.getFoldersByName(targetMonth);
  if (!monthIt.hasNext()) { Logger.log('archive/' + targetMonth + ' フォルダ未検出'); return; }
  var monthFolder = monthIt.next();

  var input = getFolderByName_(CONFIG.INPUT_FOLDER);
  if (!input) { Logger.log('inputフォルダ未検出'); return; }

  var files = monthFolder.getFiles();
  var count = 0;
  while (files.hasNext()) {
    var f = files.next();
    f.moveTo(input);
    Logger.log('移動: ' + f.getName() + ' → input');
    count++;
  }
  Logger.log('完了: ' + count + '件を ' + targetMonth + ' アーカイブから input に移動');
  Logger.log('次手順: processAll() を実行して再取込してください');
}

// ============================================================
// checkRawSummary: RAW_ライバー月次の月別×事務所別件数を出力
// Tolance 2026-03 等のデータ欠損確認に使用
// ============================================================
function checkRawSummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('RAW_ライバー月次');
  if (!sh || sh.getLastRow() < 2) { Logger.log('RAW空'); return; }

  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  var summary = {};
  data.forEach(function(r) {
    if (!r[0] || !r[1]) return;
    var ym = r[0] instanceof Date
      ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM')
      : String(r[0]).substring(0, 7);
    var office = String(r[1]);
    var key = ym + ' | ' + office;
    summary[key] = (summary[key] || 0) + 1;
  });

  // 月順・事務所順でソート
  var keys = Object.keys(summary).sort();
  Logger.log('=== RAW 月別×事務所別 件数 ===');
  var lastYm = '';
  keys.forEach(function(k) {
    var ym = k.split(' | ')[0];
    if (ym !== lastYm) { Logger.log(''); lastYm = ym; }
    Logger.log('  ' + k + ' : ' + summary[k] + '件');
  });
  Logger.log('\n合計行数: ' + data.length);
}

// ============================================================
// hideSummarySheet: DB_サマリを非表示化 (Step 5 最終作業)
// 並走確認が取れてから手動で1回だけ実行すること
// ============================================================
function hideSummarySheet() {
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('DB_サマリ').hideSheet();
  Logger.log('DB_サマリ を非表示にしました');
}

// ============================================================
// auditFormulaState: 数式行(売上/総ダイヤ数/獲得pt数/投げ銭報酬/レベシェ)が
// 全社全月で式になっているか確認。V=静的値 が 0 なら正常
// ============================================================
function auditFormulaState() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL(個社別) not found'); return; }

  var months = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04'];
  var FORMULA_EXPECTED = ['売上：','総ダイヤ数','獲得pt数','投げ銭報酬','レベシェ30％手数料'];
  var VALUE_EXPECTED   = ['登録ライバー数','アクティブライバー数','デビュー数','C5：イラスト報酬','A：Aランク報酬','S：Sランク報酬'];
  var sections = ['cozoru','ライブナウV','Tolance:全社'];

  var plMaxCol = plSh.getLastColumn();
  var row2 = plSh.getRange(2, 1, 1, plMaxCol).getValues()[0];
  var monthCol = {};
  row2.forEach(function(v, i) {
    var ym;
    if (v instanceof Date) ym = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ym = p[0] + '-' + ('0'+p[1]).slice(-2);
    }
    if (ym) monthCol[ym] = i + 1;
  });

  var plLastRow = plSh.getLastRow();
  var bVals = plSh.getRange(1, 2, plLastRow, 1).getValues();
  function findRow(labelPrefix, secHeader) {
    var inSec = false;
    for (var i = 0; i < bVals.length; i++) {
      var l = String(bVals[i][0]).trim();
      if (l === secHeader) inSec = true;
      if (!inSec) continue;
      if (l === secHeader) continue;
      if (l.indexOf(labelPrefix) === 0 || l === labelPrefix) return i + 1;
    }
    return -1;
  }

  var formulaErrors = 0, okCount = 0;
  Logger.log('=== formula状態チェック ===  F=数式 V=静的値 0=空');
  Logger.log('-'.repeat(100));

  sections.forEach(function(sec) {
    Logger.log('\n-- ' + sec + ' --');
    FORMULA_EXPECTED.forEach(function(lbl) {
      var row = findRow(lbl, sec);
      if (row < 0) { Logger.log('  [行未検出] ' + lbl); return; }
      var line = '  [F期待] ' + (lbl+'                    ').substring(0,22);
      months.forEach(function(ym) {
        var col = monthCol[ym]; if (!col) return;
        var f = plSh.getRange(row, col).getFormula();
        var v = plSh.getRange(row, col).getValue();
        var st = (f && f.startsWith('=')) ? 'F' : ((v !== '' && v !== 0 && v !== null) ? 'V' : '0');
        if (st === 'V') formulaErrors++; else okCount++;
        line += ' ' + ym.substring(5) + ':' + st;
      });
      Logger.log(line);
    });
    VALUE_EXPECTED.forEach(function(lbl) {
      var row = findRow(lbl, sec);
      if (row < 0) return;
      var line = '  [V期待] ' + (lbl+'                    ').substring(0,22);
      months.forEach(function(ym) {
        var col = monthCol[ym]; if (!col) return;
        var f = plSh.getRange(row, col).getFormula();
        var v = plSh.getRange(row, col).getValue();
        var st = (f && f.startsWith('=')) ? 'F' : (v ? 'V' : '0');
        line += ' ' + ym.substring(5) + ':' + st;
      });
      Logger.log(line);
    });
  });

  Logger.log('\n' + '-'.repeat(100));
  Logger.log('F期待なのにV（静的値で上書き）: ' + formulaErrors + ' セル  /  正常F: ' + okCount + ' セル');
  if (formulaErrors > 0) Logger.log('→ restoreFormulaRows() を実行して復元してください');
  else Logger.log('→ 全formula行が数式で正常');
}

// ============================================================
// restoreFormulaRows: 静的値になった数式セルを復元
// 最右(最新)列に残っている数式を列シフトして全月に適用
// ============================================================
function restoreFormulaRows() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL(個社別) not found'); return; }

  var months = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04'];
  var FORMULA_EXPECTED = ['売上：','総ダイヤ数','獲得pt数','投げ銭報酬','レベシェ30％手数料'];
  var sections = ['cozoru','ライブナウV','Tolance:全社'];

  var plMaxCol = plSh.getLastColumn();
  var row2 = plSh.getRange(2, 1, 1, plMaxCol).getValues()[0];
  var monthCol = {};
  row2.forEach(function(v, i) {
    var ym;
    if (v instanceof Date) ym = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ym = p[0] + '-' + ('0'+p[1]).slice(-2);
    }
    if (ym) monthCol[ym] = i + 1;
  });

  var plLastRow = plSh.getLastRow();
  var bVals = plSh.getRange(1, 2, plLastRow, 1).getValues();
  function findRow(labelPrefix, secHeader) {
    var inSec = false;
    for (var i = 0; i < bVals.length; i++) {
      var l = String(bVals[i][0]).trim();
      if (l === secHeader) inSec = true;
      if (!inSec) continue;
      if (l === secHeader) continue;
      if (l.indexOf(labelPrefix) === 0 || l === labelPrefix) return i + 1;
    }
    return -1;
  }

  function colNumToLetter(n) {
    var s = '';
    while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
    return s;
  }

  var restored = 0, skipped = 0;

  sections.forEach(function(sec) {
    Logger.log('\n-- ' + sec + ' --');
    FORMULA_EXPECTED.forEach(function(lbl) {
      var row = findRow(lbl, sec);
      if (row < 0) { Logger.log('  [行未検出] ' + lbl); return; }

      // 最右列から基準数式を探す
      var templateFormula = null, templateColIdx = -1;
      for (var mi = months.length - 1; mi >= 0; mi--) {
        var c = monthCol[months[mi]]; if (!c) continue;
        var f = plSh.getRange(row, c).getFormula();
        if (f && f.startsWith('=')) { templateFormula = f; templateColIdx = c; break; }
      }

      if (!templateFormula) {
        Logger.log('  [テンプレートなし] ' + lbl + ' - 全月が静的値。手動確認が必要');
        skipped++;
        return;
      }
      Logger.log('  [基準] ' + lbl + ' 列' + templateColIdx + ': ' + templateFormula.substring(0, 80));

      months.forEach(function(ym) {
        var col = monthCol[ym]; if (!col) return;
        var ef = plSh.getRange(row, col).getFormula();
        if (ef && ef.startsWith('=')) return; // 既にformula OK
        var ev = plSh.getRange(row, col).getValue();
        if (!ev && ev !== 0) return; // 空はスキップ

        var delta = col - templateColIdx;
        // 数式内の列参照をdeltaだけシフト（絶対参照 $ は除く）
        var newFormula = templateFormula.replace(/([A-Z]{1,2})(\d+)/g, function(m, cp, rp) {
          var cn = 0;
          for (var ci = 0; ci < cp.length; ci++) cn = cn * 26 + (cp.charCodeAt(ci) - 64);
          return colNumToLetter(cn + delta) + rp;
        });
        plSh.getRange(row, col).setFormula(newFormula);
        Logger.log('    ' + ym + ' -> ' + newFormula.substring(0, 70));
        restored++;
      });
    });
  });

  Logger.log('\n=== 完了: 復元 ' + restored + ' セル / テンプレートなし ' + skipped + ' 件 ===');
}

// ============================================================
// fixLvFormulaRows: ライブナウV の数式行を直接書き込み
// ライブナウVのCSV取込後に数式が静的値になった場合に実行
// ============================================================
function fixLvFormulaRows() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('[fixLvFormulaRows] PL(個社別) not found'); return; }

  var months = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04'];
  var SEC    = 'ライブナウV';

  var plMaxCol  = plSh.getLastColumn();
  var row2vals  = plSh.getRange(2, 1, 1, plMaxCol).getValues()[0];
  var monthCol  = {};
  row2vals.forEach(function(v, i) {
    var ym;
    if (v instanceof Date) ym = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ym = p[0] + '-' + ('0'+p[1]).slice(-2);
    }
    if (ym) monthCol[ym] = i + 1;
  });

  var plLastRow = plSh.getLastRow();
  var bVals     = plSh.getRange(1, 2, plLastRow, 1).getValues();
  function findRowInLv(labelPrefix) {
    var inSec = false;
    for (var i = 0; i < bVals.length; i++) {
      var l = String(bVals[i][0]).trim();
      if (l === SEC) { inSec = true; continue; }
      if (!inSec) continue;
      if (l.indexOf(labelPrefix) === 0 || l === labelPrefix) return i + 1;
    }
    return -1;
  }

  function colNumToLetter(n) {
    var s = '';
    while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
    return s;
  }

  var s0     = findRowInLv('売上：');
  var levRow = findRowInLv('レベシェ30');

  if (s0     < 0) { Logger.log('[fixLvFormulaRows] 売上：行 未検出 (ライブナウV)');  return; }
  if (levRow < 0) { Logger.log('[fixLvFormulaRows] レベシェ30行 未検出 (ライブナウV)'); return; }

  Logger.log('[fixLvFormulaRows] s0=' + s0 + ' / levRow=' + levRow);

  var raw   = "'RAW_ライバー月次'";
  var offLv = '"ライブナウV"';
  var written = 0;

  months.forEach(function(ym) {
    var col = monthCol[ym];
    if (!col) { Logger.log('[fixLvFormulaRows] 月列未検出: ' + ym); return; }
    var colL = colNumToLetter(col);

    plSh.getRange(s0,     col).setFormula('=' + colL + (s0+1) + '*1.1');       // 売上（税込）
    plSh.getRange(s0 + 2, col).setFormula('=' + colL + (s0+9));                // 総ダイヤ数
    plSh.getRange(s0 + 3, col).setFormula('=' + colL + (s0+5));                // 獲得pt数
    plSh.getRange(s0 + 4, col).setFormula('=' + colL + (s0+13));               // 投げ銭報酬
    plSh.getRange(levRow, col).setFormula(                                      // レベシェ30%
      '=SUMIFS(' + raw + '!Y:Y,' + raw + '!A:A,' + colL + '$2,' + raw + '!B:B,' + offLv + ')'
    );
    written += 5;
  });

  Logger.log('[fixLvFormulaRows] 完了: ' + written + 'セル書き込み');
}

// ============================================================
// 2026-05-24: 経営指標 PL(個社別) 再構成
// 18行削除 + リネーム + cozoru階層化（cozoru:全社/cozoruレーベル/D3レーベル）
// 経営指標 (1Bn8...) のみ対象、cozoru_dashboard は触らない
// ============================================================

// 削除対象ラベル
var KEIEI_DELETE_LABELS = [
  '1月','2月','3月','4月','5月','6月',
  '7月','8月','9月','10月','11月','12月',
  '24年分流出数','25年分流出数','26年分流出数','27年分流出数','28年分流出数',
  '単月流出数（登録解除数）'
];

// Step 1-3: 削除 + リネーム + 階層化
function 経営指標_リストラクチャ() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL(個社別) 未検出'); return; }

  Logger.log('=== Step 1: 不要18行を削除 ===');
  var rowsToDelete = [];
  var lastRow = plSh.getLastRow();
  var bcVals = plSh.getRange(1, 2, lastRow, 2).getValues();
  for (var i = 0; i < bcVals.length; i++) {
    var lblB = String(bcVals[i][0] || '').trim();
    var lblC = String(bcVals[i][1] || '').trim();
    if (KEIEI_DELETE_LABELS.indexOf(lblB) >= 0 || KEIEI_DELETE_LABELS.indexOf(lblC) >= 0) {
      rowsToDelete.push(i + 1);
    }
  }
  // 下から削除（行ズレ防止）
  rowsToDelete.sort(function(a, b) { return b - a; }).forEach(function(r) {
    plSh.deleteRow(r);
    Logger.log('  削除 row ' + r);
  });
  Logger.log('  → ' + rowsToDelete.length + '行削除完了');

  Logger.log('\n=== Step 2: ラベルリネーム ===');
  lastRow = plSh.getLastRow();
  bcVals = plSh.getRange(1, 2, lastRow, 2).getValues();
  var renames = 0;
  for (var i = 0; i < bcVals.length; i++) {
    var lblB = String(bcVals[i][0] || '').trim();
    var lblC = String(bcVals[i][1] || '').trim();
    if (lblB === 'D3込') {
      plSh.getRange(i + 1, 2).setValue('税抜売上');
      Logger.log('  row ' + (i + 1) + ' B: D3込 → 税抜売上');
      renames++;
    }
    if (lblC === 'D3込') {
      plSh.getRange(i + 1, 3).setValue('税抜売上');
      Logger.log('  row ' + (i + 1) + ' C: D3込 → 税抜売上');
      renames++;
    }
    if (lblB === 'cozoru') {
      plSh.getRange(i + 1, 2).setValue('cozoru:全社');
      Logger.log('  row ' + (i + 1) + ' B: cozoru → cozoru:全社');
      renames++;
    }
  }
  Logger.log('  → ' + renames + '件リネーム完了');

  Logger.log('\n=== Step 3: cozoru:全社 直下に 2 sub-section 挿入 ===');
  lastRow = plSh.getLastRow();
  var bVals = plSh.getRange(1, 2, lastRow, 1).getValues();
  var cozoruS0 = -1;
  var nextS0 = -1;
  for (var i = 0; i < bVals.length; i++) {
    if (bVals[i][0] === 'cozoru:全社') { cozoruS0 = i + 1; }
    if (cozoruS0 > 0 && bVals[i][0] === 'ライブナウV') { nextS0 = i + 1; break; }
  }
  if (cozoruS0 < 0 || nextS0 < 0) {
    Logger.log('  cozoru:全社 / ライブナウV 検出失敗 (cozoruS0=' + cozoruS0 + ' nextS0=' + nextS0 + ')');
    return;
  }
  var cozoruRows = nextS0 - cozoruS0;
  Logger.log('  cozoru:全社 行数: ' + cozoruRows + ' (row ' + cozoruS0 + '〜' + (nextS0 - 1) + ')');

  // cozoru:全社 セクションの A/B/C 列ラベルを取得
  var labels = plSh.getRange(cozoruS0, 1, cozoruRows, 3).getValues();

  // ライブナウV 直前に cozoruRows × 2 行を挿入
  plSh.insertRowsBefore(nextS0, cozoruRows * 2);

  // cozoruレーベル sub-section（最初の cozoruRows 行）
  plSh.getRange(nextS0, 1, cozoruRows, 3).setValues(labels);
  plSh.getRange(nextS0, 2).setValue('cozoruレーベル'); // セクションヘッダだけ上書き

  // D3レーベル sub-section
  var d3StartRow = nextS0 + cozoruRows;
  plSh.getRange(d3StartRow, 1, cozoruRows, 3).setValues(labels);
  plSh.getRange(d3StartRow, 2).setValue('D3レーベル');

  Logger.log('  → cozoruレーベル: row ' + nextS0 + '〜' + (nextS0 + cozoruRows - 1));
  Logger.log('  → D3レーベル:    row ' + d3StartRow + '〜' + (d3StartRow + cozoruRows - 1));
  Logger.log('\n=== Step 1-3 完了 ===');
  Logger.log('次手順: 経営指標_cozoru_sub_数式適用() を実行');
}

// Step 4: cozoruレーベル / D3レーベル に数式適用
// 定義書 col 5 = ┣ 株式会社cozoru / col 4 = ┣ D3 (AKフィルタ含む)
function 経営指標_cozoru_sub_数式適用() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);

  Logger.log('=== cozoruレーベル 数式適用 (defCol=5) ===');
  applyDefFormulasToSection({
    sectionHeader: 'cozoruレーベル',
    officeName: '株式会社cozoru',
    defCol: 5,
    salesLabel: null,
    subLabel: '株式会社cozoru',
    targetSs: ss
  });

  Logger.log('\n=== D3レーベル 数式適用 (defCol=4) ===');
  applyDefFormulasToSection({
    sectionHeader: 'D3レーベル',
    officeName: '株式会社cozoru',
    defCol: 4,
    salesLabel: null,
    subLabel: 'D3',
    targetSs: ss
  });

  Logger.log('\n=== cozoru sub-section 数式適用完了 ===');
  Logger.log('次手順: applyPlBackgrounds(ss) を実行');
}

// Step 5: 色適用 (経営指標 PL)
function 経営指標_色適用() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  Logger.log('=== 経営指標 PL(個社別) 色適用 ===');
  applyPlBackgrounds(ss);
  Logger.log('=== 完了 ===');
}

// ============================================================
// 2026-05-24 修正: cozoru sub-section の書式統一
// cozoru:全社 の書式（フォント・背景・罫線）を cozoruレーベル / D3レーベル にコピー
// その後 applyPlBackgrounds(ss) を実行して月列の色を再判定する
// ============================================================
function 経営指標_sub_書式統一() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL(個社別) 未検出'); return; }

  var bVals = plSh.getRange(1, 2, plSh.getLastRow(), 1).getValues();
  var cozoruS0 = -1, sub1S0 = -1, sub2S0 = -1, nextS0 = -1;
  for (var i = 0; i < bVals.length; i++) {
    var v = bVals[i][0];
    if (v === 'cozoru:全社') cozoruS0 = i + 1;
    else if (v === 'cozoruレーベル') sub1S0 = i + 1;
    else if (v === 'D3レーベル') sub2S0 = i + 1;
    else if (v === 'ライブナウV') { nextS0 = i + 1; break; }
  }
  if (cozoruS0 < 0 || sub1S0 < 0 || sub2S0 < 0 || nextS0 < 0) {
    Logger.log('セクション未検出 cozoru=' + cozoruS0 + ' sub1=' + sub1S0 + ' sub2=' + sub2S0 + ' next=' + nextS0);
    return;
  }

  var cozoruRows = sub1S0 - cozoruS0;
  Logger.log('cozoru:全社 row ' + cozoruS0 + '〜' + (sub1S0 - 1) + ' (' + cozoruRows + '行)');
  Logger.log('cozoruレーベル row ' + sub1S0 + '〜' + (sub2S0 - 1));
  Logger.log('D3レーベル    row ' + sub2S0 + '〜' + (nextS0 - 1));

  // cozoru:全社 全範囲の書式をコピー (formatOnly=true: 値・数式は触らない)
  var lastCol = plSh.getLastColumn();
  var src = plSh.getRange(cozoruS0, 1, cozoruRows, lastCol);

  Logger.log('書式コピー → cozoruレーベル');
  src.copyTo(plSh.getRange(sub1S0, 1), {formatOnly: true});

  Logger.log('書式コピー → D3レーベル');
  src.copyTo(plSh.getRange(sub2S0, 1), {formatOnly: true});

  // セクションヘッダラベルを保護（書式コピーは値変えないが念のため再セット）
  plSh.getRange(sub1S0, 2).setValue('cozoruレーベル');
  plSh.getRange(sub2S0, 2).setValue('D3レーベル');

  Logger.log('=== 書式統一完了 ===');
  Logger.log('次手順: 経営指標_色適用() を実行（月列の色を再判定）');
}

// 書式統一 + 色再適用を1発で
function 経営指標_sub_書式リフレッシュ() {
  経営指標_sub_書式統一();
  経営指標_色適用();
}

// フル実行（トリガー連鎖でタイムアウト回避）
function 経営指標_リストラクチャフル() {
  Logger.log('=== Step 1/3: 経営指標 リストラクチャ (削除+リネーム+階層化) ===');
  経営指標_リストラクチャ();
  Logger.log('\n=== Step 2/3 (cozoru sub数式) を 1分後にトリガー予約 ===');
  _scheduleKeieiNext_('_経営指標_リストラクチャ_Step2_', 60);
}

function _経営指標_リストラクチャ_Step2_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === '_経営指標_リストラクチャ_Step2_') ScriptApp.deleteTrigger(t);
  });
  Logger.log('=== Step 2/3: cozoru sub-section 数式適用 ===');
  経営指標_cozoru_sub_数式適用();
  Logger.log('\n=== Step 3/3 (色適用) を 1分後にトリガー予約 ===');
  _scheduleKeieiNext_('_経営指標_リストラクチャ_Step3_', 60);
}

function _経営指標_リストラクチャ_Step3_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === '_経営指標_リストラクチャ_Step3_') ScriptApp.deleteTrigger(t);
  });
  Logger.log('=== Step 3/3: 色適用 ===');
  経営指標_色適用();
  Logger.log('\n=== 🎉 経営指標 リストラクチャ 全工程完了 ===');
}

// ============================================================
// 2026-05-24: 経営指標 PL(個社別) 品質監査
// クライアント提出前の最終チェック
// 出力: シート「監査_経営指標」に CSV 形式で全セル状態を書込み + サマリログ
// ============================================================

// 期待色テーブル
var AUDIT_COLORS = {
  ACTUAL_F_DATA:  '#81c784',  // 実績×RAW参照数式（濃緑）
  ACTUAL_F_SHEET: '#a5d6a7',  // 実績×シート内数式（中緑）
  ACTUAL_GAS:     '#c8e6c9',  // 実績×GAS書込み（薄緑）
  ACTUAL_MANUAL:  '#fff9c4',  // 実績×手入力（薄黄）
  FORECAST_F_DATA: '#ba68c8', // 予測×RAW参照（濃紫）
  FORECAST_F_SHEET:'#ce93d8', // 予測×シート内（中紫）
  FORECAST_MANUAL: '#fff59d', // 予測×手入力（中黄）
  GRAY:            '#d0d0d0', // 廃止
  PENDING_EXT:     '#ffe0b2', // 外部連携待ち
  EMPTY:           '#ffffff'
};

// 数式が期待される行のラベル
var AUDIT_FORMULA_EXPECTED_LABELS = [
  '売上：','税抜売上','総ダイヤ数','獲得pt数','投げ銭報酬',
  'Tier1','Tier2','Tier3',
  '時間ダイヤ','ダイヤボーナス','投げ銭平均額','アクティブ平均金額',
  'C5：イラスト報酬','C5：報酬利率','C5：報酬単価','C5：達成人数',
  'B2：イラスト報酬','B2：報酬利率','B2：報酬単価','B2：達成人数',
  'A：Aランク報酬','A：報酬利率','A：報酬単価','A：達成人数',
  'S：Sランク報酬','S：報酬利率','S：報酬単価','S：達成人数',
  'その他報酬','レベシェ30',
  '登録ライバー数','アクティブライバー数','アクティブ率',
  'デビュー数','C5達成率','C5達成数','アクティブ数'
];

// ========== サマリ監査（高速・一括取得） ==========
function 経営指標_品質監査_サマリ() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();

  // 一括取得 → 以降はメモリ操作のみ
  Logger.log('一括取得開始 (' + lastRow + '×' + lastCol + ')...');
  var t0 = new Date().getTime();
  var allRange = plSh.getRange(1, 1, lastRow, lastCol);
  var allValues = allRange.getValues();
  var allFormulas = allRange.getFormulas();
  Logger.log('  取得完了: ' + ((new Date().getTime() - t0) / 1000).toFixed(1) + '秒');

  // 月列マップ
  var monthRow = allValues[1]; // 行2 (0-indexed: 1)
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var ms = null;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
    }
    if (ms) monthCols.push({ col: c, ym: ms }); // 0-indexed
  }

  // RAW から最新実績月
  var rawSh = ss.getSheetByName('RAW_ライバー月次');
  var rawLatest = '';
  if (rawSh && rawSh.getLastRow() > 1) {
    var rawMonths = {};
    rawSh.getRange(2, 1, rawSh.getLastRow() - 1, 1).getValues().forEach(function(r) {
      if (!r[0]) return;
      var ms = r[0] instanceof Date ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM') : String(r[0]).substring(0, 7);
      rawMonths[ms] = true;
    });
    rawLatest = Object.keys(rawMonths).sort().pop() || '';
  }
  Logger.log('=== 経営指標 PL(個社別) 品質監査 サマリ ===');
  Logger.log('対象シート: ' + lastRow + '行 × ' + lastCol + '列');
  Logger.log('月列数: ' + monthCols.length);
  Logger.log('最新実績月 (RAW): ' + rawLatest);

  // セクション構造（B列 = allValues[r][1]）
  var sectionHeaders = [
    'cozoru:全社', 'cozoruレーベル', 'D3レーベル',
    'ライブナウV', 'Tolance:全社',
    'Tolance', 'BUBBLE', 'Deeper Deeper', 'Mofile', 'ヴィラプロ',
    'アライアンス：アクトワン', 'アライアンス：アドモンド', 'アライアンス：TOIRO',
    'アライアンス：PODD', 'アライアンス：その他', 'アライアンス：トビラ',
    'アライアンス：ライブナウV(Tolance)'
  ];
  var sections = [];
  sectionHeaders.forEach(function(h) {
    for (var i = 0; i < lastRow; i++) {
      if (allValues[i][1] === h) { sections.push({ header: h, s0: i + 1 }); break; }
    }
  });
  sections.sort(function(a, b) { return a.s0 - b.s0; });
  for (var i = 0; i < sections.length; i++) {
    sections[i].endRow = (i + 1 < sections.length) ? sections[i + 1].s0 - 1 : lastRow;
  }

  Logger.log('\n=== セクション構造 ===');
  sections.forEach(function(s) {
    Logger.log('  ' + s.header + ' row ' + s.s0 + '〜' + s.endRow + ' (' + (s.endRow - s.s0 + 1) + '行)');
  });

  // 各セクションごとの数式カバレッジ
  Logger.log('\n=== セクション別 数式カバレッジ ===');
  Logger.log('セクション,行数,数式セル,値セル,空セル,期待数式行数,数式OK,カバレッジ率,欠落ラベル');

  sections.forEach(function(sec) {
    var coverage = { formula: 0, value: 0, empty: 0 };
    var expected = { rows: 0, ok: 0, missing: [] };

    for (var r = sec.s0; r <= sec.endRow; r++) {
      var rowIdx = r - 1;
      var lblB = String(allValues[rowIdx][1] || '').trim();
      var lblC = String(allValues[rowIdx][2] || '').trim();
      var label = lblB || lblC;
      if (!label || label === sec.header) continue; // ヘッダ自身は除外
      var isExpected = AUDIT_FORMULA_EXPECTED_LABELS.some(function(p) {
        return label.indexOf(p) === 0 || label === p;
      });
      var rowHasFormula = false;
      for (var mi = 0; mi < monthCols.length; mi++) {
        var c = monthCols[mi].col;
        var f = allFormulas[rowIdx][c];
        var v = allValues[rowIdx][c];
        if (f) { coverage.formula++; rowHasFormula = true; }
        else if (v !== '' && v !== null) coverage.value++;
        else coverage.empty++;
      }
      if (isExpected) {
        expected.rows++;
        if (rowHasFormula) expected.ok++;
        else expected.missing.push(label);
      }
    }
    var rate = expected.rows > 0 ? Math.round(expected.ok / expected.rows * 100) : 100;
    Logger.log([
      sec.header, (sec.endRow - sec.s0 + 1),
      coverage.formula, coverage.value, coverage.empty,
      expected.rows, expected.ok, rate + '%',
      expected.missing.slice(0, 5).join('|')
    ].join(','));
  });

  Logger.log('\n=== サマリ完了 ===');
  Logger.log('詳細監査: 経営指標_品質監査_詳細() を実行（シート出力）');
}

// ========== 詳細監査: 全セル CSV をシート出力 ==========
function 経営指標_品質監査_詳細() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var monthRow = plSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var ms = null;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
    }
    if (ms) monthCols.push({ col: c + 1, ym: ms });
  }

  // RAW 最新月
  var rawSh = ss.getSheetByName('RAW_ライバー月次');
  var rawLatest = '';
  if (rawSh && rawSh.getLastRow() > 1) {
    var rawMonths = {};
    rawSh.getRange(2, 1, rawSh.getLastRow() - 1, 1).getValues().forEach(function(r) {
      if (!r[0]) return;
      var ms = r[0] instanceof Date ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM') : String(r[0]).substring(0, 7);
      rawMonths[ms] = true;
    });
    rawLatest = Object.keys(rawMonths).sort().pop() || '';
  }

  // セクション構造
  var bVals = plSh.getRange(1, 2, lastRow, 1).getValues();
  var sectionHeaders = [
    'cozoru:全社', 'cozoruレーベル', 'D3レーベル',
    'ライブナウV', 'Tolance:全社',
    'Tolance', 'BUBBLE', 'Deeper Deeper', 'Mofile', 'ヴィラプロ',
    'アライアンス：アクトワン', 'アライアンス：アドモンド', 'アライアンス：TOIRO',
    'アライアンス：PODD', 'アライアンス：その他', 'アライアンス：トビラ',
    'アライアンス：ライブナウV(Tolance)'
  ];
  var sectionStart = {};
  var sectionsOrder = [];
  sectionHeaders.forEach(function(h) {
    for (var i = 0; i < bVals.length; i++) {
      if (bVals[i][0] === h) {
        sectionStart[h] = i + 1;
        sectionsOrder.push({ header: h, s0: i + 1 });
        break;
      }
    }
  });
  sectionsOrder.sort(function(a, b) { return a.s0 - b.s0; });
  function rowToSection(rowNum) {
    var current = '';
    for (var i = 0; i < sectionsOrder.length; i++) {
      if (sectionsOrder[i].s0 <= rowNum) current = sectionsOrder[i].header;
      else break;
    }
    return current;
  }

  // 出力シート（既存があれば再作成）
  var auditName = '監査_経営指標';
  var auditSh = ss.getSheetByName(auditName);
  if (auditSh) ss.deleteSheet(auditSh);
  auditSh = ss.insertSheet(auditName);

  // 全セル一括取得（高速化）
  var allRange = plSh.getRange(1, 1, lastRow, lastCol);
  var allValues   = allRange.getValues();
  var allFormulas = allRange.getFormulas();
  var allBgs      = allRange.getBackgrounds();
  var allFontColors = allRange.getFontColors();
  var allFontWeights = allRange.getFontWeights();

  // ヘッダ行
  var output = [['section','row','col','colLetter','labelB','labelC','month','isActual','format','formula','value','bg','fontColor','fontWeight','expected','flag']];

  // セル走査（ラベル行のみ・月列のみ）
  for (var r = 3; r <= lastRow; r++) {
    var rowIdx = r - 1; // 0-based
    var lblB = String(allValues[rowIdx][1] || '').trim();
    var lblC = String(allValues[rowIdx][2] || '').trim();
    var label = lblB || lblC;
    if (!label) continue; // 完全空行はスキップ
    var section = rowToSection(r);
    var isExpected = AUDIT_FORMULA_EXPECTED_LABELS.some(function(p) {
      return label.indexOf(p) === 0 || label === p;
    });

    for (var mi = 0; mi < monthCols.length; mi++) {
      var mc = monthCols[mi];
      var c = mc.col;
      var ym = mc.ym;
      var f = allFormulas[rowIdx][c - 1];
      var v = allValues[rowIdx][c - 1];
      var bg = (allBgs[rowIdx][c - 1] || '').toLowerCase();
      var fc = (allFontColors[rowIdx][c - 1] || '').toLowerCase();
      var fw = allFontWeights[rowIdx][c - 1] || '';

      var format = f ? 'F' : (v !== '' && v !== null ? 'V' : '0');
      var isActual = (rawLatest && ym <= rawLatest) ? 'A' : 'P';

      var flag = '';
      // 異常パターン検出
      if (isExpected && format === 'V') flag = 'EXPECTED_F_BUT_V';
      else if (isExpected && format === '0' && isActual === 'A') flag = 'EXPECTED_F_BUT_EMPTY_ACTUAL';

      // 色チェック (簡易) - 期待色マップ
      var bgExpected = null;
      if (format === 'F') {
        if (isActual === 'A') {
          bgExpected = (f.indexOf("'RAW_ライバー月次'") >= 0) ? AUDIT_COLORS.ACTUAL_F_DATA : AUDIT_COLORS.ACTUAL_F_SHEET;
        } else {
          bgExpected = (f.indexOf("'RAW_ライバー月次'") >= 0) ? AUDIT_COLORS.FORECAST_F_DATA : AUDIT_COLORS.FORECAST_F_SHEET;
        }
      } else if (format === 'V') {
        bgExpected = isActual === 'A' ? AUDIT_COLORS.ACTUAL_MANUAL : AUDIT_COLORS.FORECAST_MANUAL;
      } else {
        bgExpected = AUDIT_COLORS.EMPTY;
      }
      if (bg && bgExpected && bg !== bgExpected.toLowerCase()) {
        flag = flag ? (flag + ';COLOR_MISMATCH') : 'COLOR_MISMATCH';
      }

      output.push([
        section, r, c, colNumToLetter_(c), lblB, lblC, ym, isActual, format,
        f ? f.substring(0, 100) : '',
        typeof v === 'number' ? v : String(v).substring(0, 30),
        bg, fc, fw, isExpected ? 'YES' : '', flag
      ]);
    }
  }

  auditSh.getRange(1, 1, output.length, output[0].length).setValues(output);
  Logger.log('=== 監査詳細を 監査_経営指標 シートに出力 ===');
  Logger.log('全セル数: ' + (output.length - 1));

  // 異常箇所のサマリ
  var flagCounts = {};
  for (var i = 1; i < output.length; i++) {
    var fl = output[i][15];
    if (fl) {
      fl.split(';').forEach(function(ff) {
        flagCounts[ff] = (flagCounts[ff] || 0) + 1;
      });
    }
  }
  Logger.log('\n=== 異常検出サマリ ===');
  if (Object.keys(flagCounts).length === 0) {
    Logger.log('  ✓ 異常なし');
  } else {
    Object.keys(flagCounts).forEach(function(f) {
      Logger.log('  ⚠️ ' + f + ': ' + flagCounts[f] + 'セル');
    });
  }
  Logger.log('\n詳細は「監査_経営指標」シートで確認可');
}

// ========== 異常パターンのみ抽出 (Logger 出力) ==========
function 経営指標_品質監査_異常一覧() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var auditSh = ss.getSheetByName('監査_経営指標');
  if (!auditSh) {
    Logger.log('監査_経営指標 シート未検出。先に 経営指標_品質監査_詳細() を実行してください');
    return;
  }
  var lastRow = auditSh.getLastRow();
  if (lastRow < 2) { Logger.log('監査データなし'); return; }
  var data = auditSh.getRange(2, 1, lastRow - 1, 16).getValues();
  var flagged = data.filter(function(r) { return r[15]; });
  Logger.log('=== 異常セル一覧 (' + flagged.length + '件) ===');
  Logger.log('section,row,col,labelB|labelC,month,format,flag');
  flagged.slice(0, 500).forEach(function(r) {
    var labelStr = r[4] || r[5];
    Logger.log([r[0], r[1], r[3], labelStr, r[6], r[8], r[15]].join(' / '));
  });
  if (flagged.length > 500) Logger.log('...他 ' + (flagged.length - 500) + '件 → 監査シート参照');
}

// ========== 縦横整合性チェック ==========
// 同一ラベル行で隣接月の数式構造が同じか
function 経営指標_品質監査_整合() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var monthRow = plSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var ms = null;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
    }
    if (ms) monthCols.push({ col: c + 1, ym: ms });
  }

  var allRange = plSh.getRange(1, 1, lastRow, lastCol);
  var allValues = allRange.getValues();
  var allFormulas = allRange.getFormulas();

  Logger.log('=== 縦横整合性チェック ===');

  // 各行を走査して、月列で数式パターンを比較
  var inconsistencies = [];
  for (var r = 3; r <= lastRow; r++) {
    var rowIdx = r - 1;
    var lblB = String(allValues[rowIdx][1] || '').trim();
    var lblC = String(allValues[rowIdx][2] || '').trim();
    var label = lblB || lblC;
    if (!label) continue;

    // パターン抽出: 列文字を除いた数式テンプレート
    var patterns = {};
    monthCols.forEach(function(mc) {
      var f = allFormulas[rowIdx][mc.col - 1];
      if (!f) return;
      // 列文字 (A-Z+数字) を「X」に置換してパターン化
      var pattern = f.replace(/\$?[A-Z]{1,2}\$?\d+/g, 'X');
      patterns[pattern] = (patterns[pattern] || 0) + 1;
    });

    var patternKeys = Object.keys(patterns);
    if (patternKeys.length > 1) {
      // 複数の異なる数式パターンがある = 異常の可能性
      // 数式月数の合計
      var totalFormulas = 0;
      patternKeys.forEach(function(p) { totalFormulas += patterns[p]; });
      if (totalFormulas >= 2) { // 数式が2つ以上ある場合のみ報告
        inconsistencies.push({
          row: r, label: label,
          patterns: patternKeys.map(function(p) { return p.substring(0, 60) + ' x' + patterns[p]; })
        });
      }
    }
  }

  Logger.log('検出: ' + inconsistencies.length + '行');
  inconsistencies.slice(0, 100).forEach(function(inc) {
    Logger.log('row ' + inc.row + ' [' + inc.label + ']');
    inc.patterns.forEach(function(p) { Logger.log('  ・ ' + p); });
  });
  if (inconsistencies.length > 100) Logger.log('...他 ' + (inconsistencies.length - 100) + '行');
}

// ========== 監査一発実行（サマリ → 詳細 → 異常一覧 → 整合性） ==========
// 詳細はシート出力、その他はLogger
function 経営指標_品質監査_フル() {
  Logger.log('===== 1/4 サマリ =====');
  経営指標_品質監査_サマリ();
  Logger.log('\n===== 2/4 詳細CSV出力 =====');
  経営指標_品質監査_詳細();
  Logger.log('\n===== 3/4 異常一覧 =====');
  経営指標_品質監査_異常一覧();
  Logger.log('\n===== 4/4 縦横整合性 =====');
  経営指標_品質監査_整合();
  Logger.log('\n===== 監査完了 =====');
}

// ============================================================
// 2026-05-24: 上部「全社合計」エリア row 3-57 の構造調査
// 各行のラベル(A〜E列) + 実績先頭月(2025-10)の数式状態を出力
// ============================================================
function 経営指標_上部エリア_構造() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastCol = plSh.getLastColumn();
  // 全社合計エリア (row 1-57) + cozoru:全社開始 (row 58) を見るため 60行取得
  var topRows = 60;
  var allValues = plSh.getRange(1, 1, topRows, lastCol).getValues();
  var allFormulas = plSh.getRange(1, 1, topRows, lastCol).getFormulas();

  // 月列マップ
  var monthRow = allValues[1];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var ms = null;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
    }
    if (ms) monthCols.push({ col: c, ym: ms });
  }
  // 実績の最初の月列を特定
  var firstMonthCol = monthCols.length > 0 ? monthCols[0] : null;
  var middleMonthCol = monthCols[Math.floor(monthCols.length / 2)] || null;

  Logger.log('=== 経営指標 PL(個社別) 上部エリア (row 1-57) 構造調査 ===');
  Logger.log('対象月列数: ' + monthCols.length + ' / 先頭: ' + (firstMonthCol ? firstMonthCol.ym : 'なし') + ' / 中央: ' + (middleMonthCol ? middleMonthCol.ym : 'なし'));
  Logger.log('row,A,B,C,D,E,先頭月_状態,中央月_状態');

  for (var r = 0; r < topRows; r++) {
    var a = String(allValues[r][0] || '').trim();
    var b = String(allValues[r][1] || '').trim();
    var c = String(allValues[r][2] || '').trim();
    var d = String(allValues[r][3] || '').trim();
    var e = String(allValues[r][4] || '').trim();
    // F〜E 列で何か入っているもののみ出力
    if (!a && !b && !c && !d && !e) {
      // ラベル無しでも数式/値があれば残す
      var hasContent = false;
      monthCols.forEach(function(mc) {
        if (allFormulas[r][mc.col] || allValues[r][mc.col]) hasContent = true;
      });
      if (!hasContent) continue;
    }

    function cellState(mc) {
      if (!mc) return '';
      var f = allFormulas[r][mc.col];
      var v = allValues[r][mc.col];
      if (f && f.length > 0) return 'F:' + f.substring(0, 50);
      if (v !== '' && v !== null && v !== undefined) {
        return 'V:' + (typeof v === 'number' ? v.toLocaleString() : String(v).substring(0, 30));
      }
      return '0';
    }

    var firstState = cellState(firstMonthCol);
    var middleState = cellState(middleMonthCol);
    Logger.log([
      (r + 1), a, b, c, d, e, firstState, middleState
    ].join(' | '));
  }

  Logger.log('\n=== 完了 ===');
}

// ============================================================
// 2026-05-24: 上部「全社合計」エリア row 4-56 に数式を全月展開
// 中央月（最右の有効な数式月）をテンプレートとして使い、列文字を変換して全月に書込み
// dryRun=true で差分プレビュー、false で実書込み
// ============================================================
function 経営指標_上部全社合計_数式付与(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  // 月列マップ
  var lastCol = plSh.getLastColumn();
  var monthRow = plSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    if (v instanceof Date || (typeof v === 'string' && /^\d{4}\/\d+/.test(v))) {
      monthCols.push(c + 1);
    }
  }
  Logger.log('対象月列数: ' + monthCols.length);

  // 上部エリア（row 4-56）
  var topStart = 4, topEnd = 56;
  var numRows = topEnd - topStart + 1;
  var topRange = plSh.getRange(topStart, 1, numRows, lastCol);
  var topFormulas = topRange.getFormulas();
  var topValues = topRange.getValues();

  // 各行のテンプレート数式 (最右の有効な数式列) を取得
  var stats = { processed: 0, written: 0, skipped: 0, manualPreserved: 0 };
  var diff = [];

  // 比率・平均など派生計算行のラベル（数式形式が異なるため別途扱い）
  // また、テンプレートが無い行は手入力扱いでスキップ

  for (var r = 0; r < numRows; r++) {
    var topRow = topStart + r;
    var templateFormula = null;
    var templateCol = -1;
    // 最右から探す（中央月以降に正しい数式が入っている前提）
    for (var ci = monthCols.length - 1; ci >= 0; ci--) {
      var col = monthCols[ci];
      var f = topFormulas[r][col - 1];
      if (f && f.length > 0) { templateFormula = f; templateCol = col; break; }
    }
    if (!templateFormula) {
      stats.skipped++;
      continue;
    }
    // 自己参照（連鎖計算）テンプレートはスキップ
    // 例: row 23 で =AJ23*1.05 → 全月展開すると前月チェーン爆発
    var selfRefPattern = new RegExp('\\$?[A-Z]{1,2}\\$?' + topRow + '(?!\\d)');
    if (selfRefPattern.test(templateFormula)) {
      Logger.log('row ' + topRow + ' 自己参照テンプレート (連鎖計算式) → スキップ: ' + templateFormula.substring(0, 50));
      stats.skipped++;
      continue;
    }
    stats.processed++;
    Logger.log('row ' + topRow + ' template: 列' + colNumToLetter_(templateCol) + ' | ' + templateFormula.substring(0, 70));

    monthCols.forEach(function(col) {
      if (col === templateCol) return; // 元のテンプレート列は触らない
      var delta = col - templateCol;
      var newFormula = templateFormula.replace(/(\$?)([A-Z]{1,2})(\d+)/g, function(m, abs, cp, rp) {
        if (abs === '$') return m; // 絶対参照は固定
        var cn = 0;
        for (var i = 0; i < cp.length; i++) cn = cn * 26 + (cp.charCodeAt(i) - 64);
        cn += delta;
        if (cn < 1) return m;
        var s = '';
        var n = cn;
        while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
        return s + rp;
      });

      // 既存値との差分を記録（dryRun時にプレビュー用）
      var prevVal = topValues[r][col - 1];
      var prevFormula = topFormulas[r][col - 1];

      if (dryRun) {
        if (prevFormula && prevFormula === newFormula) return; // 同じ数式なら無視
        if (diff.length < 30) {
          diff.push({
            row: topRow, col: col, colL: colNumToLetter_(col),
            prevState: prevFormula ? 'F:' + prevFormula.substring(0, 30) : (prevVal ? 'V:' + prevVal : '0'),
            newFormula: newFormula.substring(0, 60)
          });
        }
        stats.written++;
      } else {
        plSh.getRange(topRow, col).setFormula(newFormula);
        stats.written++;
      }
    });
  }

  Logger.log('\n=== 結果 ===');
  Logger.log('テンプレート取得行: ' + stats.processed);
  Logger.log('書込み対象セル: ' + stats.written);
  Logger.log('テンプレートなしスキップ行: ' + stats.skipped);

  if (dryRun) {
    Logger.log('\n--- 差分プレビュー (最大30件) ---');
    diff.forEach(function(d) {
      Logger.log('row ' + d.row + ' ' + d.colL + ' | 旧: ' + d.prevState + ' → 新: ' + d.newFormula);
    });
    Logger.log('\n※ dryRun=true。本実行は 経営指標_上部全社合計_数式付与(false) で');
  } else {
    Logger.log('\n実書込み完了。次手順: 経営指標_色適用() で色再判定');
  }
}

// ラッパー: 実書込み版
function 経営指標_上部全社合計_数式付与_実行() {
  経営指標_上部全社合計_数式付与(false);
}

// ============================================================
// Phase B: cozoruレーベル/D3レーベル 欠落数式追加
// cozoru:全社 の数式をテンプレートとして使い、AKフィルタ追加でサブに書込み
// 対象: 売上：cozoru / 獲得pt数 / Tier1-3 : 平均ダイヤ金額
// ============================================================
function 経営指標_cozoru_sub_欠落数式追加() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  // 全体一括取得
  var allValues = plSh.getRange(1, 1, lastRow, lastCol).getValues();
  var allFormulas = plSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  // セクションS0
  var s = {};
  ['cozoru:全社', 'cozoruレーベル', 'D3レーベル', 'ライブナウV'].forEach(function(h) {
    for (var i = 0; i < lastRow; i++) {
      if (allValues[i][1] === h) { s[h] = i + 1; break; }
    }
  });
  Logger.log('セクションS0: ' + JSON.stringify(s));

  var cS0 = s['cozoru:全社'];
  var cRows = s['cozoruレーベル'] - cS0;

  // 月列
  var monthRow = allValues[1];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    if (v instanceof Date || (typeof v === 'string' && /^\d{4}\/\d+/.test(v))) {
      monthCols.push(c); // 0-indexed
    }
  }
  Logger.log('月列数: ' + monthCols.length);

  // 欠落ラベル → cozoru:全社内のオフセット
  var missingLabels = [
    '売上：cozoru', '獲得pt数',
    'Tier1 : 平均ダイヤ金額', 'Tier2 : 平均ダイヤ金額', 'Tier3 : 平均ダイヤ金額'
  ];
  var labelOffsets = {};
  for (var i = 0; i < cRows; i++) {
    var rowIdx = cS0 - 1 + i; // 0-indexed
    var lblB = String(allValues[rowIdx][1] || '').trim();
    var lblC = String(allValues[rowIdx][2] || '').trim();
    var lbl = lblB || lblC;
    if (missingLabels.indexOf(lbl) >= 0 && labelOffsets[lbl] === undefined) {
      labelOffsets[lbl] = i; // cozoru:全社内のオフセット
    }
  }
  Logger.log('検出オフセット: ' + JSON.stringify(labelOffsets));

  var subs = [
    { name: 'cozoruレーベル', s0: s['cozoruレーベル'], akLabel: '株式会社cozoru' },
    { name: 'D3レーベル', s0: s['D3レーベル'], akLabel: 'D3' }
  ];

  var written = 0;
  Object.keys(labelOffsets).forEach(function(lbl) {
    var off = labelOffsets[lbl];
    var srcRowIdx = cS0 - 1 + off; // 0-indexed
    subs.forEach(function(sub) {
      var subRow = sub.s0 + off;
      var rowCount = 0;
      monthCols.forEach(function(c) {
        var srcF = allFormulas[srcRowIdx][c];
        if (!srcF) return;
        var newF = addAKFilter_(srcF, '株式会社cozoru', sub.akLabel);
        plSh.getRange(subRow, c + 1).setFormula(newF);
        written++;
        rowCount++;
      });
      Logger.log('  ' + sub.name + ' [' + lbl + '] row ' + subRow + ' (' + rowCount + 'セル)');
    });
  });
  Logger.log('=== Phase B 完了: ' + written + 'セル ===');
}

// ============================================================
// Phase C: 古い =sum(X:X) 形式の標準化
// 整合性チェックで検出された行の旧月分を、新月テンプレートに統一
// ============================================================
function 経営指標_古いsum形式_標準化(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var allValues = plSh.getRange(1, 1, lastRow, lastCol).getValues();
  var allFormulas = plSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  // 月列
  var monthRow = allValues[1];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    if (v instanceof Date || (typeof v === 'string' && /^\d{4}\/\d+/.test(v))) {
      monthCols.push(c);
    }
  }

  // 全行をスキャン: 月列で複数の異なる数式パターンがある行を検出
  var fixedCount = 0;
  var processed = 0;
  for (var r = 2; r < lastRow; r++) { // row 3 以降
    var lblB = String(allValues[r][1] || '').trim();
    var lblC = String(allValues[r][2] || '').trim();
    var label = lblB || lblC;
    if (!label) continue;

    // 各月の数式パターン
    var patterns = {};
    monthCols.forEach(function(c) {
      var f = allFormulas[r][c];
      if (!f) return;
      // 列文字+数字 を X に置換
      var pat = f.replace(/\$?[A-Z]{1,2}\$?\d+/g, 'X');
      if (!patterns[pat]) patterns[pat] = [];
      patterns[pat].push(c);
    });

    var keys = Object.keys(patterns);
    if (keys.length < 2) continue; // 1パターンなら統一済み

    // 古いsum形式と新形式が混在 → 新形式を多数派とする
    // 多数派パターンの代表数式（templateCol）を取得
    var maxKey = keys[0];
    keys.forEach(function(k) {
      if (patterns[k].length > patterns[maxKey].length) maxKey = k;
    });
    // 多数派が「合計（X+X+X や SUMIFS）」、少数派が「=sum(X:X)」の場合のみ修正
    // 古いsum形式: =sum(X:X) パターン
    var oldSumPattern = /^=sum\(X:X\)$/i;
    var hasOldSum = keys.some(function(k) { return oldSumPattern.test(k); });
    if (!hasOldSum) continue;
    if (oldSumPattern.test(maxKey)) continue; // 多数派がsum→放置

    processed++;
    var templateCol = patterns[maxKey][patterns[maxKey].length - 1]; // 最右の多数派列
    var templateFormula = allFormulas[r][templateCol];

    Logger.log('row ' + (r + 1) + ' [' + label + '] テンプレ列' + colNumToLetter_(templateCol + 1) + ': ' + templateFormula.substring(0, 60));

    // 古いsum形式の月だけ上書き
    keys.forEach(function(k) {
      if (!oldSumPattern.test(k)) return;
      patterns[k].forEach(function(c) {
        var delta = c - templateCol;
        var newFormula = templateFormula.replace(/(\$?)([A-Z]{1,2})(\$?)(\d+)/g, function(m, abs1, cp, abs2, rp) {
          if (abs1 === '$') return m;
          var cn = 0;
          for (var i = 0; i < cp.length; i++) cn = cn * 26 + (cp.charCodeAt(i) - 64);
          cn += delta;
          if (cn < 1) return m;
          var sStr = '';
          var n = cn;
          while (n > 0) { n--; sStr = String.fromCharCode(65 + (n % 26)) + sStr; n = Math.floor(n / 26); }
          return sStr + (abs2 === '$' ? '$' : '') + rp;
        });

        Logger.log('  ' + colNumToLetter_(c + 1) + ' 旧: ' + allFormulas[r][c] + ' → 新: ' + newFormula.substring(0, 60));
        if (!dryRun) {
          plSh.getRange(r + 1, c + 1).setFormula(newFormula);
        }
        fixedCount++;
      });
    });
  }

  Logger.log('=== Phase C 結果 ===');
  Logger.log('対象行数: ' + processed);
  Logger.log('修正セル数: ' + fixedCount + ' (dryRun=' + dryRun + ')');
  if (dryRun) Logger.log('本実行: 経営指標_古いsum形式_標準化(false)');
}
function 経営指標_古いsum形式_標準化_実行() { 経営指標_古いsum形式_標準化(false); }

// ============================================================
// Phase D: Tier4 売上ゼロ 異常値検査
// 全セクションで「Tier4：売上ゼロ」行を見つけて状態を出力
// 異常値があれば該当セルを 0 で上書き or 数式に統一する
// ============================================================
function 経営指標_Tier4売上ゼロ_検査(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var allValues = plSh.getRange(1, 1, lastRow, lastCol).getValues();
  var allFormulas = plSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  var monthRow = allValues[1];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var ms = null;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
    }
    if (ms) monthCols.push({ col: c, ym: ms });
  }

  Logger.log('=== Phase D: Tier4 売上ゼロ 検査 ===');
  var anomalies = [];

  for (var r = 0; r < lastRow; r++) {
    var lblB = String(allValues[r][1] || '').trim();
    var lblC = String(allValues[r][2] || '').trim();
    var label = lblB || lblC;
    if (label.indexOf('Tier4') < 0) continue;
    if (label.indexOf('売上ゼロ') < 0) continue;

    monthCols.forEach(function(mc) {
      var f = allFormulas[r][mc.col];
      var v = allValues[r][mc.col];
      var n = Number(v) || 0;
      // 異常: 数式無し かつ 値 > 100（明らかな異常値）
      // または、Tier4売上ゼロは「人数」のはずなので大きい値（>1000）は異常
      if (!f && Math.abs(n) > 100) {
        anomalies.push({ row: r + 1, col: mc.col + 1, ym: mc.ym, value: n });
      }
    });
  }

  Logger.log('検出異常: ' + anomalies.length + '件');
  anomalies.forEach(function(a) {
    Logger.log('  row ' + a.row + ' / ' + a.ym + ' / 値=' + a.value);
  });

  if (anomalies.length > 0 && !dryRun) {
    anomalies.forEach(function(a) {
      plSh.getRange(a.row, a.col).setValue(0);
    });
    Logger.log('異常値を 0 で上書き完了');
  } else if (anomalies.length > 0) {
    Logger.log('本実行: 経営指標_Tier4売上ゼロ_検査(false)');
  }
}
function 経営指標_Tier4売上ゼロ_修正実行() { 経営指標_Tier4売上ゼロ_検査(false); }

// ============================================================
// Phase A: row 23 [投げ銭平均額] 上部全社合計 = 投げ銭報酬÷アクティブ数
// 各セクションの同様の行も統一する（オプション）
// 上部 row 23 のみ対応（連鎖計算式の置換）
// ============================================================
function 経営指標_投げ銭平均額_式設定(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastCol = plSh.getLastColumn();
  var monthRow = plSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    if (v instanceof Date || (typeof v === 'string' && /^\d{4}\/\d+/.test(v))) {
      monthCols.push(c + 1);
    }
  }

  // 上部 row 23 = 投げ銭平均額
  // 数式: =投げ銭報酬(row 8) / アクティブ数(row 50)
  // ※全社合計エリアの該当行
  Logger.log('=== Phase A: row 23 投げ銭平均額 数式設定 ===');
  Logger.log('数式: =<col>8 / <col>50 (投げ銭報酬 ÷ アクティブ数)');

  var written = 0;
  monthCols.forEach(function(col) {
    var colL = colNumToLetter_(col);
    var newFormula = '=IFERROR(' + colL + '8/' + colL + '50,0)';
    if (!dryRun) {
      plSh.getRange(23, col).setFormula(newFormula);
    }
    written++;
  });

  Logger.log((dryRun ? '[dryRun] ' : '') + '書込み: ' + written + 'セル');
  if (dryRun) Logger.log('本実行: 経営指標_投げ銭平均額_式設定(false)');
}
function 経営指標_投げ銭平均額_式設定_実行() { 経営指標_投げ銭平均額_式設定(false); }

// ============================================================
// 4 Phase 一括実行（書込み版、トリガー連鎖不要、各5-10秒）
// ============================================================
function 経営指標_残対応4件_全実行() {
  Logger.log('=== Phase B: cozoru sub 欠落数式 ===');
  経営指標_cozoru_sub_欠落数式追加();
  Logger.log('\n=== Phase A: 投げ銭平均額 ===');
  経営指標_投げ銭平均額_式設定(false);
  Logger.log('\n=== Phase C: 古いsum形式 ===');
  経営指標_古いsum形式_標準化(false);
  Logger.log('\n=== Phase D: Tier4売上ゼロ ===');
  経営指標_Tier4売上ゼロ_検査(false);
  Logger.log('\n=== 色再適用 ===');
  経営指標_色適用();
  Logger.log('\n=== 🎉 残対応4件 全実行完了 ===');
}

// ============================================================
// Phase D-2: Tier4 売上ゼロ 全行ダンプ
// 全セクションで「Tier4」「売上ゼロ」を含む行を見つけて、全月の状態を出力
// 旧PL値と比較するため verifyKeieiPlAllCells のロジックを流用
// ============================================================
function 経営指標_Tier4売上ゼロ_全行ダンプ() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var OLD_PL_ID = '1x2yF6PEFs7Fv6nlPn_-3AYjba84wiwGLZSQFz8JrLF4';
  var OLD_GID = 1636107553;
  var oldSs = SpreadsheetApp.openById(OLD_PL_ID);
  var oldSh = null;
  oldSs.getSheets().forEach(function(s) { if (s.getSheetId() === OLD_GID) oldSh = s; });

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var allValues = plSh.getRange(1, 1, lastRow, lastCol).getValues();
  var allFormulas = plSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  var monthRow = allValues[1];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var ms = null;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
    }
    if (ms) monthCols.push({ col: c, ym: ms });
  }

  // 旧PL月列マップ
  var oCol = {};
  if (oldSh) {
    var oRow2 = oldSh.getRange(2, 1, 1, oldSh.getLastColumn()).getValues()[0];
    oRow2.forEach(function(v, i) {
      var ms;
      if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
      else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
        var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
      }
      if (ms) oCol[ms] = i + 1;
    });
  }

  // 現セクションヘッダ
  var sectionHeaders = ['cozoru:全社', 'cozoruレーベル', 'D3レーベル',
    'ライブナウV', 'Tolance:全社',
    'Tolance', 'BUBBLE', 'Deeper Deeper', 'Mofile', 'ヴィラプロ',
    'アライアンス：アクトワン', 'アライアンス：アドモンド', 'アライアンス：TOIRO',
    'アライアンス：PODD', 'アライアンス：その他', 'アライアンス：トビラ',
    'アライアンス：ライブナウV(Tolance)'];
  var sectionsOrder = [];
  sectionHeaders.forEach(function(h) {
    for (var i = 0; i < lastRow; i++) {
      if (allValues[i][1] === h) { sectionsOrder.push({ header: h, s0: i + 1 }); break; }
    }
  });
  sectionsOrder.sort(function(a, b) { return a.s0 - b.s0; });
  function rowToSection(rowNum) {
    var current = '';
    for (var i = 0; i < sectionsOrder.length; i++) {
      if (sectionsOrder[i].s0 <= rowNum) current = sectionsOrder[i].header;
      else break;
    }
    return current;
  }

  Logger.log('=== Tier4 売上ゼロ 全行ダンプ ===');
  // Tier4 売上ゼロ 行を全部探す
  var targetMonths = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04'];
  for (var r = 0; r < lastRow; r++) {
    var lblB = String(allValues[r][1] || '').trim();
    var lblC = String(allValues[r][2] || '').trim();
    var label = lblB || lblC;
    if (label.indexOf('Tier4') < 0 || label.indexOf('売上ゼロ') < 0) continue;

    var sec = rowToSection(r + 1);
    Logger.log('\n[' + sec + '] row ' + (r + 1) + ' / ' + label);

    targetMonths.forEach(function(ym) {
      var mc = monthCols.filter(function(m) { return m.ym === ym; })[0];
      if (!mc) return;
      var f = allFormulas[r][mc.col];
      var v = allValues[r][mc.col];
      var n = Number(v) || 0;

      // 旧PL値（旧PLでは現在の構造とラベル位置が違うので、ラベル+セクションで照合）
      var oVal = null;
      if (oldSh) {
        // 旧PL側の同セクションラベルで検索
        var oSecName = sec === 'cozoru:全社' ? 'cozoru' : sec;
        var oS0 = -1;
        var oBVals = oldSh.getRange(1, 2, oldSh.getLastRow(), 1).getValues();
        for (var i = 0; i < oBVals.length; i++) {
          if (oBVals[i][0] === oSecName) { oS0 = i + 1; break; }
        }
        if (oS0 > 0) {
          // 旧PL同セクション内で Tier4 売上ゼロ 行を探す
          for (var i = oS0; i < Math.min(oS0 + 100, oldSh.getLastRow()); i++) {
            var oLbl = String(oldSh.getRange(i, 2).getValue() || oldSh.getRange(i, 3).getValue()).trim();
            if (oLbl.indexOf('Tier4') >= 0 && oLbl.indexOf('売上ゼロ') >= 0) {
              var oc = oCol[ym];
              if (oc) oVal = Number(oldSh.getRange(i, oc).getValue()) || 0;
              break;
            }
          }
        }
      }

      var diff = oVal !== null ? (n - oVal) : '';
      var flag = '';
      if (oVal !== null && Math.abs(diff) > 50) flag = ' ⚠️異常';
      if (oVal !== null && Math.abs(diff) > 500) flag = ' 🔴重大';
      Logger.log('  ' + ym + ' / 経=' + n + ' / 旧=' + (oVal === null ? 'N/A' : oVal) + ' / 差=' + diff + flag);
    });
  }

  Logger.log('\n=== 完了 ===');
}

// ============================================================
// Phase D-3: Tier4 売上ゼロ 旧PL値で復元
// 各セクションの Tier4 売上ゼロ 行を旧PL値で上書き
// 旧PLで運用されていた手入力値が正しいデータ → 数式は使わず値で復元
// ============================================================
function 経営指標_Tier4売上ゼロ_旧PL値復元(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var OLD_PL_ID = '1x2yF6PEFs7Fv6nlPn_-3AYjba84wiwGLZSQFz8JrLF4';
  var OLD_GID = 1636107553;
  var oldSs = SpreadsheetApp.openById(OLD_PL_ID);
  var oldSh = null;
  oldSs.getSheets().forEach(function(s) { if (s.getSheetId() === OLD_GID) oldSh = s; });
  if (!oldSh) { Logger.log('旧PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var allValues = plSh.getRange(1, 1, lastRow, lastCol).getValues();

  var monthRow = allValues[1];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var ms = null;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
    }
    if (ms) monthCols.push({ col: c, ym: ms });
  }

  // 旧PL月列
  var oCol = {};
  var oRow2 = oldSh.getRange(2, 1, 1, oldSh.getLastColumn()).getValues()[0];
  oRow2.forEach(function(v, i) {
    var ms;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
    }
    if (ms) oCol[ms] = i + 1;
  });

  // セクションマッピング（新→旧）
  var secMap = {
    'cozoru:全社': 'cozoru',
    'ライブナウV': 'ライブナウV',
    'Tolance:全社': 'Tolance:全社',
    'Tolance': 'Tolance',
    'BUBBLE': 'BUBBLE',
    'Deeper Deeper': 'Deeper Deeper',
    'Mofile': 'Mofile',
    'ヴィラプロ': 'ヴィラプロ',
    'アライアンス：アクトワン': 'アライアンス：アクトワン',
    'アライアンス：アドモンド': 'アライアンス：アドモンド',
    'アライアンス：TOIRO': 'アライアンス：TOIRO',
    'アライアンス：PODD': 'アライアンス：PODD',
    'アライアンス：その他': 'アライアンス：その他',
    'アライアンス：トビラ': 'アライアンス：トビラ',
    'アライアンス：ライブナウV(Tolance)': 'アライアンス：ライブナウV(Tolance)'
  };
  // cozoruレーベル/D3レーベル は旧PLに存在しないのでスキップ

  var sectionHeaders = Object.keys(secMap);
  var sectionsOrder = [];
  sectionHeaders.forEach(function(h) {
    for (var i = 0; i < lastRow; i++) {
      if (allValues[i][1] === h) { sectionsOrder.push({ header: h, s0: i + 1, oldName: secMap[h] }); break; }
    }
  });

  // 旧PL側のラベル位置
  var oBVals = oldSh.getRange(1, 2, oldSh.getLastRow(), 1).getValues();
  function findOldTier4Row(oldSecName) {
    var oS0 = -1;
    for (var i = 0; i < oBVals.length; i++) {
      if (oBVals[i][0] === oldSecName) { oS0 = i + 1; break; }
    }
    if (oS0 < 0) return -1;
    for (var i = oS0; i < Math.min(oS0 + 100, oldSh.getLastRow()); i++) {
      var oLbl = String(oldSh.getRange(i, 2).getValue() || oldSh.getRange(i, 3).getValue()).trim();
      if (oLbl.indexOf('Tier4') >= 0 && oLbl.indexOf('売上ゼロ') >= 0) return i;
    }
    return -1;
  }

  // 新PL側で各セクションのTier4売上ゼロ行を特定
  Logger.log('=== Phase D-3: Tier4 売上ゼロ 旧PL値復元 (dryRun=' + dryRun + ') ===');
  var written = 0, skipped = 0;
  sectionsOrder.forEach(function(sec) {
    // 新PL側 Tier4 行検索
    var newRow = -1;
    var nextS0 = lastRow + 1;
    for (var i = 0; i < sectionsOrder.length; i++) {
      if (sectionsOrder[i].s0 > sec.s0 && sectionsOrder[i].s0 < nextS0) nextS0 = sectionsOrder[i].s0;
    }
    for (var i = sec.s0 - 1; i < nextS0 - 1; i++) {
      var lblB = String(allValues[i][1] || '').trim();
      var lblC = String(allValues[i][2] || '').trim();
      var label = lblB || lblC;
      if (label.indexOf('Tier4') >= 0 && label.indexOf('売上ゼロ') >= 0) {
        newRow = i + 1; break;
      }
    }
    if (newRow < 0) { Logger.log('[' + sec.header + '] Tier4 行未検出 → スキップ'); return; }

    var oldRow = findOldTier4Row(sec.oldName);
    if (oldRow < 0) { Logger.log('[' + sec.header + '] 旧PL未検出 (' + sec.oldName + ') → スキップ'); return; }

    Logger.log('[' + sec.header + '] 新row=' + newRow + ' / 旧row=' + oldRow);

    // 過去実績月のみ復元（旧PLの予測月は古い値なので無視）
    var TARGET_MONTHS = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04'];
    monthCols.forEach(function(mc) {
      if (TARGET_MONTHS.indexOf(mc.ym) < 0) return; // 実績月以外スキップ
      var oc = oCol[mc.ym];
      if (!oc) return;
      var oV = Number(oldSh.getRange(oldRow, oc).getValue()) || 0;
      if (oV === 0) { skipped++; return; } // 旧PL値=0はスキップ
      if (!dryRun) {
        plSh.getRange(newRow, mc.col + 1).setValue(oV);
      }
      written++;
      Logger.log('  ' + mc.ym + ' = ' + oV);
    });
  });

  Logger.log('\n=== 結果 ===');
  Logger.log('書込みセル: ' + written + (dryRun ? ' (dryRun)' : ''));
  Logger.log('旧PL=0スキップ: ' + skipped);
  if (dryRun) Logger.log('本実行: 経営指標_Tier4売上ゼロ_旧PL値復元(false)');
}
function 経営指標_Tier4売上ゼロ_旧PL値復元_実行() { 経営指標_Tier4売上ゼロ_旧PL値復元(false); }

// ============================================================
// 100%カバレッジ達成: 全欠落数式を補完
// 戦略:
//   Step 1: cozoru:全社 の各ラベルの数式をテンプレートとし、
//           他セクションの同名ラベル行に「行参照シフト+AKフィルタ追加」で展開
//   Step 2: cozoru:全社にも無いラベル（デビュー数, Tier別アクティブ数）はカスタム数式
// ============================================================

// セクション → office/akLabel 設定
var ALL_SECTIONS_CONFIG = [
  { header: 'cozoru:全社',                   office: '株式会社cozoru',  akLabel: null },
  { header: 'cozoruレーベル',                office: '株式会社cozoru',  akLabel: '株式会社cozoru' },
  { header: 'D3レーベル',                    office: '株式会社cozoru',  akLabel: 'D3' },
  { header: 'ライブナウV',                   office: 'ライブナウV',     akLabel: null },
  { header: 'Tolance:全社',                  office: '株式会社Tolance', akLabel: null },
  { header: 'Tolance',                       office: '株式会社Tolance', akLabel: 'Tolance' },
  { header: 'BUBBLE',                        office: '株式会社Tolance', akLabel: 'BUBBLE' },
  { header: 'Deeper Deeper',                 office: '株式会社Tolance', akLabel: 'Deeper Deeper' },
  { header: 'Mofile',                        office: '株式会社Tolance', akLabel: 'Mofile' },
  { header: 'ヴィラプロ',                    office: '株式会社Tolance', akLabel: 'ヴィラプロ' },
  { header: 'アライアンス：アクトワン',      office: '株式会社Tolance', akLabel: 'アライアンス：アクトワン' },
  { header: 'アライアンス：アドモンド',      office: '株式会社Tolance', akLabel: 'アライアンス：アドモンド' },
  { header: 'アライアンス：TOIRO',           office: '株式会社Tolance', akLabel: 'アライアンス：TOIRO' },
  { header: 'アライアンス：PODD',            office: '株式会社Tolance', akLabel: 'アライアンス：PODD' },
  { header: 'アライアンス：その他',          office: '株式会社Tolance', akLabel: 'アライアンス：その他' },
  { header: 'アライアンス：トビラ',          office: '株式会社Tolance', akLabel: 'アライアンス：トビラ' },
  { header: 'アライアンス：ライブナウV(Tolance)', office: '株式会社Tolance', akLabel: 'アライアンス：ライブナウV(Tolance)' }
];

// Step 1: cozoru:全社 数式を他セクションへ展開
function 経営指標_全社テンプレ展開(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var allValues = plSh.getRange(1, 1, lastRow, lastCol).getValues();
  var allFormulas = plSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  // 月列
  var monthRow = allValues[1];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    if (v instanceof Date || (typeof v === 'string' && /^\d{4}\/\d+/.test(v))) {
      monthCols.push(c);
    }
  }

  // セクション s0 取得 + endRow
  var sections = ALL_SECTIONS_CONFIG.slice();
  sections.forEach(function(sec) {
    for (var i = 0; i < lastRow; i++) {
      if (allValues[i][1] === sec.header) { sec.s0 = i + 1; break; }
    }
  });
  sections = sections.filter(function(s) { return s.s0; });
  sections.sort(function(a, b) { return a.s0 - b.s0; });
  for (var i = 0; i < sections.length; i++) {
    sections[i].endRow = (i + 1 < sections.length) ? sections[i + 1].s0 - 1 : lastRow;
  }

  // ラベルマップ構築（複数出現対応）
  function buildLabelMap(s0, endRow) {
    var m = {};
    for (var r = s0; r <= endRow; r++) {
      var lblB = String(allValues[r - 1][1] || '').trim();
      var lblC = String(allValues[r - 1][2] || '').trim();
      var label = lblB || lblC;
      if (!label) continue;
      if (!m[label]) m[label] = [];
      m[label].push(r);
    }
    return m;
  }
  sections.forEach(function(sec) {
    sec.lblMap = buildLabelMap(sec.s0, sec.endRow);
  });

  // cozoru:全社 を基準テンプレートに
  var cozoruSec = sections.filter(function(s) { return s.header === 'cozoru:全社'; })[0];
  if (!cozoruSec) { Logger.log('cozoru:全社 未検出'); return; }

  Logger.log('=== Step 1: cozoru:全社 テンプレ展開 ===');
  var written = 0;

  // 各セクション（cozoru:全社以外）で欠落行を補完
  sections.forEach(function(sec) {
    if (sec.header === 'cozoru:全社') return;
    Logger.log('[' + sec.header + '] ラベル走査...');

    Object.keys(sec.lblMap).forEach(function(label) {
      var subRows = sec.lblMap[label];
      var srcRows = cozoruSec.lblMap[label];
      if (!srcRows) return; // cozoru:全社に該当ラベル無し → スキップ

      // 同じラベルの出現順で対応付け
      subRows.forEach(function(subRow, idx) {
        var srcRow = srcRows[idx] || srcRows[0]; // 同インデックス、無ければ最初の
        // 行差
        var rowDelta = subRow - srcRow;

        monthCols.forEach(function(c) {
          var existing = allFormulas[subRow - 1][c];
          if (existing) return; // 既に数式ある→上書きしない
          var srcFormula = allFormulas[srcRow - 1][c];
          if (!srcFormula) return; // src にも数式無し

          // 行参照シフト + AKフィルタ追加
          // ただし行参照シフトは「派生式（同セクション内参照）」のみ。
          // SUMIFS式（外部参照）の場合は行シフトしない（officeフィルタはあるので合致行は変わる）
          var isExternalRef = srcFormula.indexOf("'RAW_ライバー月次'") >= 0 ||
                              srcFormula.indexOf("'RAW") >= 0;
          var newFormula = srcFormula;
          if (!isExternalRef && rowDelta !== 0) {
            // 派生式: 行参照を rowDelta シフト
            newFormula = newFormula.replace(/(\$?)([A-Z]{1,2})(\$?)(\d+)/g, function(m, abs1, cp, abs2, rp) {
              if (abs2 === '$') return m; // $行 は固定
              if (rp === '2') return m;   // 月ヘッダ行 ($2) は固定
              return abs1 + cp + abs2 + (parseInt(rp, 10) + rowDelta);
            });
          }
          if (sec.akLabel) {
            newFormula = addAKFilter_(newFormula, sec.office, sec.akLabel);
          }
          if (!dryRun) {
            plSh.getRange(subRow, c + 1).setFormula(newFormula);
          }
          written++;
        });
      });
    });
  });

  Logger.log('=== Step 1 結果: 書込み ' + written + 'セル (dryRun=' + dryRun + ') ===');
  if (dryRun) Logger.log('本実行: 経営指標_全社テンプレ展開(false)');
}

// Step 2 共通ヘルパー: PL構造のロード（メモリにキャッシュ）
function _loadPlStructure_() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) return null;

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var allValues = plSh.getRange(1, 1, lastRow, lastCol).getValues();
  var allFormulas = plSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  var monthRow = allValues[1];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    if (v instanceof Date || (typeof v === 'string' && /^\d{4}\/\d+/.test(v))) {
      monthCols.push(c);
    }
  }

  var sections = ALL_SECTIONS_CONFIG.slice();
  sections.forEach(function(sec) {
    for (var i = 0; i < lastRow; i++) {
      if (allValues[i][1] === sec.header) { sec.s0 = i + 1; break; }
    }
  });
  sections = sections.filter(function(s) { return s.s0; });
  sections.sort(function(a, b) { return a.s0 - b.s0; });
  for (var i = 0; i < sections.length; i++) {
    sections[i].endRow = (i + 1 < sections.length) ? sections[i + 1].s0 - 1 : lastRow;
  }

  function buildLabelMap(s0, endRow) {
    var m = {};
    for (var r = s0; r <= endRow; r++) {
      var lblB = String(allValues[r - 1][1] || '').trim();
      var lblC = String(allValues[r - 1][2] || '').trim();
      var label = lblB || lblC;
      if (!label) continue;
      if (!m[label]) m[label] = [];
      m[label].push(r);
    }
    return m;
  }
  sections.forEach(function(sec) { sec.lblMap = buildLabelMap(sec.s0, sec.endRow); });

  return { ss: ss, plSh: plSh, allFormulas: allFormulas, monthCols: monthCols, sections: sections };
}

// Step 2-A: デビュー数 のみ
function 経営指標_カスタム数式_デビュー数(dryRun) {
  if (dryRun === undefined) dryRun = false;
  var ctx = _loadPlStructure_();
  if (!ctx) { Logger.log('構造ロード失敗'); return; }
  Logger.log('=== Step 2-A: デビュー数 カスタム数式 ===');
  var written = 0;
  ctx.sections.forEach(function(sec) {
    var rows = sec.lblMap['デビュー数'] || [];
    rows.forEach(function(row) {
      ctx.monthCols.forEach(function(c) {
        if (ctx.allFormulas[row - 1][c]) return;
        var colL = colNumToLetter_(c + 1);
        var formula = "=COUNTIFS('RAW_ライバー月次'!A:A," + colL + "$2,'RAW_ライバー月次'!B:B,\"" + sec.office + "\",'RAW_ライバー月次'!AE:AE,TRUE)";
        if (sec.akLabel) formula = addAKFilter_(formula, sec.office, sec.akLabel);
        if (!dryRun) ctx.plSh.getRange(row, c + 1).setFormula(formula);
        written++;
      });
    });
  });
  Logger.log('=== Step 2-A 完了: ' + written + 'セル ===');
}

// Step 2-B: Tier別 アクティブ数 のみ
function 経営指標_カスタム数式_Tier別アクティブ数(dryRun) {
  if (dryRun === undefined) dryRun = false;
  var ctx = _loadPlStructure_();
  if (!ctx) { Logger.log('構造ロード失敗'); return; }
  Logger.log('=== Step 2-B: Tier別アクティブ数 カスタム数式 ===');
  var written = 0;
  ['Tier1', 'Tier2', 'Tier3'].forEach(function(t, idx) {
    var tierNum = idx + 1;
    var label = t + ' : アクティブ数';
    ctx.sections.forEach(function(sec) {
      var rows = sec.lblMap[label] || [];
      rows.forEach(function(row) {
        ctx.monthCols.forEach(function(c) {
          if (ctx.allFormulas[row - 1][c]) return;
          var colL = colNumToLetter_(c + 1);
          var formula = "=COUNTIFS('RAW_ライバー月次'!A:A," + colL + "$2,'RAW_ライバー月次'!B:B,\"" + sec.office + "\",'RAW_ライバー月次'!AC:AC," + tierNum + ",'RAW_ライバー月次'!AD:AD,TRUE)";
          if (sec.akLabel) formula = addAKFilter_(formula, sec.office, sec.akLabel);
          if (!dryRun) ctx.plSh.getRange(row, c + 1).setFormula(formula);
          written++;
        });
      });
    });
  });
  Logger.log('=== Step 2-B 完了: ' + written + 'セル ===');
}

// Step 2-C: Tier別 平均ダイヤ金額 のみ
function 経営指標_カスタム数式_Tier別平均ダイヤ金額(dryRun) {
  if (dryRun === undefined) dryRun = false;
  var ctx = _loadPlStructure_();
  if (!ctx) { Logger.log('構造ロード失敗'); return; }
  Logger.log('=== Step 2-C: Tier別平均ダイヤ金額 カスタム数式 ===');
  var written = 0;
  ctx.sections.forEach(function(sec) {
    ['Tier1', 'Tier2', 'Tier3'].forEach(function(t) {
      var avgLabel = t + ' : 平均ダイヤ金額';
      var avgRows = sec.lblMap[avgLabel] || [];
      if (avgRows.length === 0) return;

      var ouenLabelMap = {
        'Tier1': 'Tier1 : 3万ダイヤ以上',
        'Tier2': 'Tier2 : 1万〜3万ダイヤ未満',
        'Tier3': 'Tier3 : 1万ダイヤ未満'
      };
      var ouenLabel = ouenLabelMap[t];
      var ouenRows = sec.lblMap[ouenLabel] || [];
      var ouenRow = ouenRows[0] || null;
      var actRows = sec.lblMap[t + ' : アクティブ数'] || [];
      var actRow = actRows[0] || null;
      if (!ouenRow || !actRow) return;

      avgRows.forEach(function(row) {
        ctx.monthCols.forEach(function(c) {
          if (ctx.allFormulas[row - 1][c]) return;
          var colL = colNumToLetter_(c + 1);
          var formula = '=IFERROR(' + colL + ouenRow + '/' + colL + actRow + ',0)';
          if (!dryRun) ctx.plSh.getRange(row, c + 1).setFormula(formula);
          written++;
        });
      });
    });
  });
  Logger.log('=== Step 2-C 完了: ' + written + 'セル ===');
}

// Step 2 ラッパー: トリガー連鎖でタイムアウト回避
function 経営指標_Step2_カスタム数式_全実行() {
  Logger.log('=== Step 2 (A/B/C) トリガー連鎖開始 ===');
  経営指標_カスタム数式_デビュー数(false);
  Logger.log('\n--- Step 2-B を 30秒後にトリガー予約 ---');
  _scheduleKeieiNext_('_経営指標_Step2B_', 30);
}
function _経営指標_Step2B_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === '_経営指標_Step2B_') ScriptApp.deleteTrigger(t);
  });
  経営指標_カスタム数式_Tier別アクティブ数(false);
  Logger.log('\n--- Step 2-C を 30秒後にトリガー予約 ---');
  _scheduleKeieiNext_('_経営指標_Step2C_', 30);
}
function _経営指標_Step2C_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === '_経営指標_Step2C_') ScriptApp.deleteTrigger(t);
  });
  経営指標_カスタム数式_Tier別平均ダイヤ金額(false);
  Logger.log('\n--- 色再適用を 30秒後にトリガー予約 ---');
  _scheduleKeieiNext_('_経営指標_Step2_色適用_', 30);
}
function _経営指標_Step2_色適用_() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === '_経営指標_Step2_色適用_') ScriptApp.deleteTrigger(t);
  });
  経営指標_色適用();
  Logger.log('\n=== 🎉 Step 2 全完了 (デビュー数 + Tier別アクティブ数 + 平均ダイヤ金額 + 色) ===');
}

// Step 2: カスタム数式（cozoru:全社にも無いラベル）
// - デビュー数: COUNTIFS AE:AE=TRUE
// - Tier1/2/3 : アクティブ数: COUNTIFS AC:AC=N, AD:AD=TRUE
// - Tier4 : 売上ゼロ: COUNTIFS AC:AC=4, AD:AD=TRUE （または非Tier1-3 でAD=TRUE）
function 経営指標_カスタム数式_補完(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var allValues = plSh.getRange(1, 1, lastRow, lastCol).getValues();
  var allFormulas = plSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  var monthRow = allValues[1];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    if (v instanceof Date || (typeof v === 'string' && /^\d{4}\/\d+/.test(v))) {
      monthCols.push(c);
    }
  }

  var sections = ALL_SECTIONS_CONFIG.slice();
  sections.forEach(function(sec) {
    for (var i = 0; i < lastRow; i++) {
      if (allValues[i][1] === sec.header) { sec.s0 = i + 1; break; }
    }
  });
  sections = sections.filter(function(s) { return s.s0; });
  sections.sort(function(a, b) { return a.s0 - b.s0; });
  for (var i = 0; i < sections.length; i++) {
    sections[i].endRow = (i + 1 < sections.length) ? sections[i + 1].s0 - 1 : lastRow;
  }

  function buildLabelMap(s0, endRow) {
    var m = {};
    for (var r = s0; r <= endRow; r++) {
      var lblB = String(allValues[r - 1][1] || '').trim();
      var lblC = String(allValues[r - 1][2] || '').trim();
      var label = lblB || lblC;
      if (!label) continue;
      if (!m[label]) m[label] = [];
      m[label].push(r);
    }
    return m;
  }
  sections.forEach(function(sec) { sec.lblMap = buildLabelMap(sec.s0, sec.endRow); });

  Logger.log('=== Step 2: カスタム数式 補完 ===');
  var written = 0;

  // ----- デビュー数 -----
  sections.forEach(function(sec) {
    var rows = sec.lblMap['デビュー数'] || [];
    rows.forEach(function(row) {
      monthCols.forEach(function(c) {
        if (allFormulas[row - 1][c]) return;
        var colL = colNumToLetter_(c + 1);
        var formula = "=COUNTIFS('RAW_ライバー月次'!A:A," + colL + "$2,'RAW_ライバー月次'!B:B,\"" + sec.office + "\",'RAW_ライバー月次'!AE:AE,TRUE)";
        if (sec.akLabel) formula = addAKFilter_(formula, sec.office, sec.akLabel);
        if (!dryRun) plSh.getRange(row, c + 1).setFormula(formula);
        written++;
      });
    });
  });
  Logger.log('  デビュー数 完了');

  // ----- Tier別 アクティブ数 (Tier1/Tier2/Tier3) -----
  ['Tier1', 'Tier2', 'Tier3'].forEach(function(t, idx) {
    var tierNum = idx + 1;
    var label = t + ' : アクティブ数';
    sections.forEach(function(sec) {
      var rows = sec.lblMap[label] || [];
      rows.forEach(function(row) {
        monthCols.forEach(function(c) {
          if (allFormulas[row - 1][c]) return;
          var colL = colNumToLetter_(c + 1);
          var formula = "=COUNTIFS('RAW_ライバー月次'!A:A," + colL + "$2,'RAW_ライバー月次'!B:B,\"" + sec.office + "\",'RAW_ライバー月次'!AC:AC," + tierNum + ",'RAW_ライバー月次'!AD:AD,TRUE)";
          if (sec.akLabel) formula = addAKFilter_(formula, sec.office, sec.akLabel);
          if (!dryRun) plSh.getRange(row, c + 1).setFormula(formula);
          written++;
        });
      });
    });
  });
  Logger.log('  Tier別アクティブ数 完了');

  // ----- Tier別 平均ダイヤ金額 (Tier1/Tier2/Tier3) -----
  // 派生計算: 各Tierの応援ダイヤ ÷ 各Tierのアクティブ数
  // ラベル "Tier1 : 平均ダイヤ金額" → 同セクション内の "Tier1 : 3万ダイヤ以上" (応援ダイヤ) / "Tier1 : アクティブ数"
  // ただし「Tier1 : 3万ダイヤ以上」は応援ダイヤ・MF両方にあるため、応援ダイヤ系の最初のラベル位置を使う

  // 各セクションで Tier1-3 応援ダイヤとアクティブ数の行位置を特定
  sections.forEach(function(sec) {
    ['Tier1', 'Tier2', 'Tier3'].forEach(function(t) {
      var avgLabel = t + ' : 平均ダイヤ金額';
      var avgRows = sec.lblMap[avgLabel] || [];
      if (avgRows.length === 0) return;

      // 応援ダイヤ Tier別 行: ラベル "Tier1 : 3万ダイヤ以上" 等の最初の出現（応援ダイヤ系）
      var ouenLabelMap = {
        'Tier1': 'Tier1 : 3万ダイヤ以上',
        'Tier2': 'Tier2 : 1万〜3万ダイヤ未満',
        'Tier3': 'Tier3 : 1万ダイヤ未満'
      };
      var ouenLabel = ouenLabelMap[t];
      var ouenRows = sec.lblMap[ouenLabel] || [];
      // 応援ダイヤ系: 最初の出現を採用（応援ダイヤ → MF → 獲得pt と並ぶ順序の想定）
      var ouenRow = ouenRows[0] || null;
      var actRows = sec.lblMap[t + ' : アクティブ数'] || [];
      var actRow = actRows[0] || null;
      if (!ouenRow || !actRow) return;

      avgRows.forEach(function(row) {
        monthCols.forEach(function(c) {
          if (allFormulas[row - 1][c]) return;
          var colL = colNumToLetter_(c + 1);
          var formula = '=IFERROR(' + colL + ouenRow + '/' + colL + actRow + ',0)';
          if (!dryRun) plSh.getRange(row, c + 1).setFormula(formula);
          written++;
        });
      });
    });
  });
  Logger.log('  Tier別 平均ダイヤ金額 完了');

  Logger.log('\n=== Step 2 結果: 書込み ' + written + 'セル (dryRun=' + dryRun + ') ===');
  if (dryRun) Logger.log('本実行: 経営指標_カスタム数式_補完(false)');
}

// 100%補完 + 色適用 一発実行
function 経営指標_100パーセント補完_実行() {
  Logger.log('=== 100%補完 実行開始 ===');
  Logger.log('\n--- Step 1: cozoru:全社 テンプレ展開 ---');
  経営指標_全社テンプレ展開(false);
  Logger.log('\n--- Step 2: カスタム数式 補完 ---');
  経営指標_カスタム数式_補完(false);
  Logger.log('\n--- Step 3: 色再適用 ---');
  経営指標_色適用();
  Logger.log('\n=== 🎉 100%補完 完了 ===');
}

// ============================================================
// 報酬単価セルの数式統一
// C5/B2/A/S の報酬単価行に旧PL手入力値が残存 → 数式で上書き
// テンプレ: 各セクション・各CPNの最右の有効数式（=長さ20文字以上の式）を採用
// ※B2の廃止月（2026-03〜）は別途 =0 が入っているはずなのでスキップ可能
// ============================================================
function 経営指標_報酬単価_数式統一(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var allValues = plSh.getRange(1, 1, lastRow, lastCol).getValues();
  var allFormulas = plSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  var monthRow = allValues[1];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var ms = null;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
    }
    if (ms) monthCols.push({ col: c, ym: ms });
  }

  // 対象ラベル（C5/B2/A/S の報酬単価）
  var TARGET_PREFIXES = ['C5：報酬単価', 'B2：報酬単価', 'A：報酬単価', 'S：報酬単価'];
  // B2 は 2026-02 で廃止 → 2026-03以降は =0 を維持
  var B2_END_MONTH = '2026-02';

  Logger.log('=== 報酬単価 数式統一 (dryRun=' + dryRun + ') ===');
  var written = 0;
  var processed = 0;

  for (var r = 0; r < lastRow; r++) {
    var lblB = String(allValues[r][1] || '').trim();
    var lblC = String(allValues[r][2] || '').trim();
    var label = lblB || lblC;
    if (!label) continue;
    var matchedPrefix = null;
    TARGET_PREFIXES.forEach(function(p) { if (label.indexOf(p) === 0) matchedPrefix = p; });
    if (!matchedPrefix) continue;

    var isB2 = matchedPrefix === 'B2：報酬単価';

    // 最右の有効テンプレ数式を探す（length>=20 = 単純=0や数値を除外）
    var templateCol = -1, templateFormula = null;
    for (var ci = monthCols.length - 1; ci >= 0; ci--) {
      var mc = monthCols[ci];
      var f = allFormulas[r][mc.col];
      if (f && f.length >= 20) {
        // B2なら 2026-02以前のテンプレを優先
        if (isB2 && mc.ym > B2_END_MONTH) continue;
        templateCol = mc.col; templateFormula = f; break;
      }
    }
    if (!templateFormula) {
      Logger.log('row ' + (r + 1) + ' [' + label + '] テンプレ無し → スキップ');
      continue;
    }

    processed++;
    Logger.log('row ' + (r + 1) + ' [' + label + '] テンプレ列' + colNumToLetter_(templateCol + 1) + ': ' + templateFormula.substring(0, 80));

    monthCols.forEach(function(mc) {
      var c = mc.col;
      // B2 で廃止後の月はスキップ（既存の=0を維持）
      if (isB2 && mc.ym > B2_END_MONTH) return;

      var delta = c - templateCol;
      var newFormula = templateFormula.replace(/(\$?)([A-Z]{1,2})(\$?)(\d+)/g, function(m, abs1, cp, abs2, rp) {
        if (abs1 === '$') return m;
        var cn = 0;
        for (var i = 0; i < cp.length; i++) cn = cn * 26 + (cp.charCodeAt(i) - 64);
        cn += delta;
        if (cn < 1) return m;
        var sStr = '';
        var n = cn;
        while (n > 0) { n--; sStr = String.fromCharCode(65 + (n % 26)) + sStr; n = Math.floor(n / 26); }
        return sStr + (abs2 === '$' ? '$' : '') + rp;
      });

      var existing = allFormulas[r][c];
      // 既存と同じならスキップ
      if (existing === newFormula) return;

      if (!dryRun) plSh.getRange(r + 1, c + 1).setFormula(newFormula);
      written++;
    });
  }

  Logger.log('\n=== 完了 ===');
  Logger.log('処理対象行: ' + processed);
  Logger.log('書込みセル: ' + written + (dryRun ? ' (dryRun)' : ''));
  if (dryRun) Logger.log('本実行: 経営指標_報酬単価_数式統一(false)');
}
function 経営指標_報酬単価_数式統一_実行() { 経営指標_報酬単価_数式統一(false); }

// 上部 row 30/33/36/39 (C5/B2/A/S 報酬単価) に SUM式を追加
// row 30 = cozoru:全社 row 86 + ライブナウV row 290 + Tolance:全社 row 356
// row 33 = cozoru:全社 row 90 + ライブナウV row 293 + Tolance:全社 row 359
// row 36 = cozoru:全社 row 94 + ライブナウV row 297 + Tolance:全社 row 363
// row 39 = cozoru:全社 row 98 + ライブナウV row 301 + Tolance:全社 row 367
function 経営指標_上部報酬単価_数式付与(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var allValues = plSh.getRange(1, 1, lastRow, lastCol).getValues();

  var monthRow = allValues[1];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    if (v instanceof Date || (typeof v === 'string' && /^\d{4}\/\d+/.test(v))) {
      monthCols.push(c + 1);
    }
  }

  // セクション開始行を動的取得
  var sections = {};
  ['cozoru:全社', 'ライブナウV', 'Tolance:全社'].forEach(function(h) {
    for (var i = 0; i < lastRow; i++) {
      if (allValues[i][1] === h) { sections[h] = i + 1; break; }
    }
  });
  var cR = sections['cozoru:全社'];   // 58
  var lvR = sections['ライブナウV'];   // 262
  var tlR = sections['Tolance:全社']; // 328
  if (!cR || !lvR || !tlR) { Logger.log('セクション未検出'); return; }
  Logger.log('セクションS0: cozoru=' + cR + ' lv=' + lvR + ' tl=' + tlR);

  // 上部行 + 各セクション内のオフセット
  // cozoru:全社 内のオフセット: 報酬単価行のラベル位置を検索
  function findLabelOffset(label, s0, maxRows) {
    for (var i = 0; i < maxRows; i++) {
      var r = s0 - 1 + i;
      var lblB = String(allValues[r][1] || '').trim();
      var lblC = String(allValues[r][2] || '').trim();
      if ((lblB || lblC).indexOf(label) === 0) return i;
    }
    return -1;
  }

  var targets = [
    { topRow: 30, label: 'C5：報酬単価' },
    { topRow: 33, label: 'B2：報酬単価' },
    { topRow: 36, label: 'A：報酬単価' },
    { topRow: 39, label: 'S：報酬単価' }
  ];

  Logger.log('=== 上部報酬単価 SUM式付与 (dryRun=' + dryRun + ') ===');
  var written = 0;

  targets.forEach(function(t) {
    var offC = findLabelOffset(t.label, cR, 70);
    var offLv = findLabelOffset(t.label, lvR, 70);
    var offTl = findLabelOffset(t.label, tlR, 70);
    if (offC < 0 || offLv < 0 || offTl < 0) {
      Logger.log('row ' + t.topRow + ' [' + t.label + '] オフセット未検出 cozoru=' + offC + ' lv=' + offLv + ' tl=' + offTl);
      return;
    }
    var cTargetRow = cR + offC;
    var lvTargetRow = lvR + offLv;
    var tlTargetRow = tlR + offTl;
    Logger.log('row ' + t.topRow + ' [' + t.label + '] = ' + cTargetRow + ' + ' + lvTargetRow + ' + ' + tlTargetRow);

    monthCols.forEach(function(col) {
      var colL = colNumToLetter_(col);
      var newFormula = '=' + colL + cTargetRow + '+' + colL + lvTargetRow + '+' + colL + tlTargetRow;
      if (!dryRun) plSh.getRange(t.topRow, col).setFormula(newFormula);
      written++;
    });
  });

  Logger.log('=== 完了: ' + written + 'セル (dryRun=' + dryRun + ') ===');
  if (dryRun) Logger.log('本実行: 経営指標_上部報酬単価_数式付与(false)');
}

// ============================================================
// バグ修正: Step 1テンプレ展開時に officeName を置換せずに他セクションへコピーした
// ライブナウV/Tolance系 セルが "株式会社cozoru" を参照する数式になっている問題
// → セクションのofficeに合わせて置換
// ============================================================
function 経営指標_office名_修正(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var allValues = plSh.getRange(1, 1, lastRow, lastCol).getValues();
  var allFormulas = plSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  // セクションS0
  var sections = ALL_SECTIONS_CONFIG.slice();
  sections.forEach(function(sec) {
    for (var i = 0; i < lastRow; i++) {
      if (allValues[i][1] === sec.header) { sec.s0 = i + 1; break; }
    }
  });
  sections = sections.filter(function(s) { return s.s0; });
  sections.sort(function(a, b) { return a.s0 - b.s0; });
  for (var i = 0; i < sections.length; i++) {
    sections[i].endRow = (i + 1 < sections.length) ? sections[i + 1].s0 - 1 : lastRow;
  }

  Logger.log('=== Office名 修正 (dryRun=' + dryRun + ') ===');
  var fixed = 0;
  var logged = 0;

  sections.forEach(function(sec) {
    if (sec.office === '株式会社cozoru') return; // cozoru系は対象外（合致）
    Logger.log('[' + sec.header + '] (office=' + sec.office + ') スキャン...');
    var secFixed = 0;
    for (var r = sec.s0; r <= sec.endRow; r++) {
      for (var c = 0; c < lastCol; c++) {
        var f = allFormulas[r - 1][c];
        if (!f) continue;
        if (f.indexOf('"株式会社cozoru"') < 0) continue;
        // 数式に "株式会社cozoru" が含まれている → セクション office に置換
        var newFormula = f.replace(/"株式会社cozoru"/g, '"' + sec.office + '"');
        if (newFormula === f) continue;
        if (!dryRun) plSh.getRange(r, c + 1).setFormula(newFormula);
        fixed++;
        secFixed++;
        if (logged < 20) {
          Logger.log('  row ' + r + ' ' + colNumToLetter_(c + 1) + ': ' + newFormula.substring(0, 80));
          logged++;
        }
      }
    }
    Logger.log('  → ' + secFixed + 'セル修正');
  });

  Logger.log('\n=== 完了: ' + fixed + 'セル修正 (dryRun=' + dryRun + ') ===');
  if (dryRun) Logger.log('本実行: 経営指標_office名_修正(false)');
}
function 経営指標_office名_修正_実行() { 経営指標_office名_修正(false); }

// ============================================================
// RAW 月別×事務所別 件数 (経営指標シート内のRAW)
// + Tolance:全社 row 332 [B=獲得pt数] の数式と値 全月
// 0 になっている理由を特定するため
// ============================================================
function 経営指標_RAW_Tolance確認() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var rawSh = ss.getSheetByName('RAW_ライバー月次');
  if (!rawSh || rawSh.getLastRow() < 2) { Logger.log('RAW空'); return; }

  // RAW 月別件数
  Logger.log('=== RAW 月別×事務所別 件数 ===');
  var data = rawSh.getRange(2, 1, rawSh.getLastRow() - 1, 2).getValues();
  var summary = {};
  data.forEach(function(r) {
    if (!r[0] || !r[1]) return;
    var ym = r[0] instanceof Date
      ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM')
      : String(r[0]).substring(0, 7);
    var key = ym + ' | ' + String(r[1]);
    summary[key] = (summary[key] || 0) + 1;
  });
  Object.keys(summary).sort().forEach(function(k) {
    Logger.log('  ' + k + ' : ' + summary[k] + '件');
  });

  // Tolance:全社 row 332 の数式と値
  Logger.log('\n=== Tolance:全社 row 332 [獲得pt数] 全月 ===');
  var plSh = ss.getSheetByName('PL(個社別)');
  var lastCol = plSh.getLastColumn();
  var monthRow = plSh.getRange(2, 1, 1, lastCol).getValues()[0];

  var TARGET = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04'];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var ms;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
    }
    if (TARGET.indexOf(ms) < 0) continue;
    var f = plSh.getRange(332, c + 1).getFormula();
    var vv = plSh.getRange(332, c + 1).getValue();
    Logger.log(ms + ' ' + colNumToLetter_(c + 1) + ': value=' + (typeof vv === 'number' ? vv.toLocaleString() : vv));
    if (f) Logger.log('  formula=' + f.substring(0, 200));
  }

  // 同様に Tolance:全社 row 339-341 (Tier別応援ダイヤ)
  Logger.log('\n=== Tolance:全社 Tier別 応援ダイヤ ===');
  [339, 340, 341].forEach(function(r) {
    var lblC = plSh.getRange(r, 3).getValue();
    Logger.log('\n--- row ' + r + ' [C=' + lblC + '] ---');
    for (var c = 0; c < lastCol; c++) {
      var v = monthRow[c];
      var ms;
      if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
      else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
        var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
      }
      if (TARGET.indexOf(ms) < 0) continue;
      var f = plSh.getRange(r, c + 1).getFormula();
      var vv = plSh.getRange(r, c + 1).getValue();
      Logger.log('  ' + ms + ': value=' + (typeof vv === 'number' ? vv.toLocaleString() : vv));
    }
  });

  Logger.log('\n=== 完了 ===');
}

// ============================================================
// 応援ダイヤ/マネジメントフィー の「派生計算 Tier合計」行を SUMに修正
// row offset +10 [応援ダイヤ] = sum(Tier1+Tier2+Tier3) → row+11/12/13
// row offset +14 [マネジメントフィー] = sum(Tier1+Tier2+Tier3) → row+15/16/17
// row offset +6  [獲得pt数] = 応援ダイヤ × 6 → row+10 (連鎖で正常化)
// ============================================================
function 経営指標_派生計算行_SUM修正(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var allValues = plSh.getRange(1, 1, lastRow, lastCol).getValues();

  var monthRow = allValues[1];
  var monthCols = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    if (v instanceof Date || (typeof v === 'string' && /^\d{4}\/\d+/.test(v))) {
      monthCols.push(c + 1);
    }
  }

  // 全セクション
  var sectionHeaders = [
    'cozoru:全社', 'cozoruレーベル', 'D3レーベル',
    'ライブナウV', 'Tolance:全社',
    'Tolance', 'BUBBLE', 'Deeper Deeper', 'Mofile', 'ヴィラプロ',
    'アライアンス：アクトワン', 'アライアンス：アドモンド', 'アライアンス：TOIRO',
    'アライアンス：PODD', 'アライアンス：その他', 'アライアンス：トビラ',
    'アライアンス：ライブナウV(Tolance)'
  ];
  var sections = [];
  sectionHeaders.forEach(function(h) {
    for (var i = 0; i < lastRow; i++) {
      if (allValues[i][1] === h) { sections.push({ header: h, s0: i + 1 }); break; }
    }
  });

  Logger.log('=== 派生計算行 SUM修正 (dryRun=' + dryRun + ') ===');
  var written = 0;

  // 各セクションの行マッピング（cozoru:全社の構造を基準）
  // s0+6  獲得pt数 (C列ラベル) → =応援ダイヤ × 6
  // s0+7  Tier1獲得pt
  // s0+8  Tier2獲得pt
  // s0+9  Tier3獲得pt
  // s0+10 応援ダイヤ (C列ラベル) → =Tier1+2+3
  // s0+11 Tier1応援ダイヤ
  // s0+12 Tier2応援ダイヤ
  // s0+13 Tier3応援ダイヤ
  // s0+14 マネジメントフィー (C列ラベル) → =Tier1+2+3
  // s0+15 Tier1MF
  // s0+16 Tier2MF
  // s0+17 Tier3MF

  var rules = [
    { offset: 6,  label: '獲得pt数',         formula: function(col) { return '=' + col + '$ROW10*6'; } },
    { offset: 10, label: '応援ダイヤ',       formula: function(col, s0) { return '=' + col + (s0 + 11) + '+' + col + (s0 + 12) + '+' + col + (s0 + 13); } },
    { offset: 14, label: 'マネジメントフィー', formula: function(col, s0) { return '=' + col + (s0 + 15) + '+' + col + (s0 + 16) + '+' + col + (s0 + 17); } }
  ];

  sections.forEach(function(sec) {
    Logger.log('[' + sec.header + '] s0=' + sec.s0);
    rules.forEach(function(rule) {
      var targetRow = sec.s0 + rule.offset;
      // ラベル確認
      var lblB = String(allValues[targetRow - 1][1] || '').trim();
      var lblC = String(allValues[targetRow - 1][2] || '').trim();
      var label = lblB || lblC;
      if (label.indexOf(rule.label) !== 0) {
        Logger.log('  ⚠ row ' + targetRow + ' label="' + label + '" ≠ ' + rule.label + ' → スキップ');
        return;
      }
      monthCols.forEach(function(col) {
        var colL = colNumToLetter_(col);
        var formula;
        if (rule.offset === 6) {
          // 獲得pt数 = 応援ダイヤ × 6
          formula = '=' + colL + (sec.s0 + 10) + '*6';
        } else {
          formula = rule.formula(colL, sec.s0);
        }
        if (!dryRun) plSh.getRange(targetRow, col).setFormula(formula);
        written++;
      });
      Logger.log('  row ' + targetRow + ' [' + label + '] → ' + monthCols.length + 'セル書込み');
    });
  });

  Logger.log('\n=== 完了: ' + written + 'セル ===');
  if (dryRun) Logger.log('本実行: 経営指標_派生計算行_SUM修正(false)');
}
function 経営指標_派生計算行_SUM修正_実行() { 経営指標_派生計算行_SUM修正(false); }

// ============================================================
// Tolanceサブセクション内で AKフィルタが抜けている数式を修正
// 対象: 数式に "株式会社Tolance" を含むが、AKフィルタ部分が無い場合
// → セクション固有の AKラベルでフィルタ追加
// ============================================================
function 経営指標_Tolanceサブ_AKフィルタ修正(dryRun) {
  if (dryRun === undefined) dryRun = true;
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastRow = plSh.getLastRow();
  var lastCol = plSh.getLastColumn();
  var allValues = plSh.getRange(1, 1, lastRow, lastCol).getValues();
  var allFormulas = plSh.getRange(1, 1, lastRow, lastCol).getFormulas();

  // Tolanceサブセクション一覧 (sectionHeader = AKラベル)
  var tolanceSubs = [
    'Tolance', 'BUBBLE', 'Deeper Deeper', 'Mofile', 'ヴィラプロ',
    'アライアンス：アクトワン', 'アライアンス：アドモンド', 'アライアンス：TOIRO',
    'アライアンス：PODD', 'アライアンス：その他', 'アライアンス：トビラ',
    'アライアンス：ライブナウV(Tolance)'
  ];

  // 各サブセクションの S0/endRow
  var sections = [];
  tolanceSubs.forEach(function(h) {
    for (var i = 0; i < lastRow; i++) {
      if (allValues[i][1] === h) { sections.push({ header: h, s0: i + 1 }); break; }
    }
  });
  sections.sort(function(a, b) { return a.s0 - b.s0; });
  for (var i = 0; i < sections.length; i++) {
    sections[i].endRow = (i + 1 < sections.length) ? sections[i + 1].s0 - 1 : lastRow;
  }

  Logger.log('=== Tolanceサブセクション AKフィルタ修正 (dryRun=' + dryRun + ') ===');
  var fixed = 0;
  var loggedSamples = 0;

  sections.forEach(function(sec) {
    var akLabel = sec.header;

    var secFixed = 0;
    for (var r = sec.s0; r <= sec.endRow; r++) {
      for (var c = 0; c < lastCol; c++) {
        var f = allFormulas[r - 1][c];
        if (!f) continue;
        // "株式会社Tolance" を含むかチェック
        if (f.indexOf('"株式会社Tolance"') < 0) continue;
        // 既に何らかの AKフィルタが入っていればスキップ（安全側：二重追加防止）
        if (f.indexOf("'RAW_ライバー月次'!AK:AK,") >= 0) continue;
        if (f.indexOf("'RAW_ライバー月次'!AK2:AK=") >= 0) continue;
        // 既に E:Eフィルタ (CSVレーベル名フィルタ) が入っていればスキップ（古い設計、別ロジック）
        if (f.indexOf("'RAW_ライバー月次'!E:E,") >= 0) continue;
        if (f.indexOf("'RAW_ライバー月次'!E2:E=") >= 0) continue;
        // AKフィルタ追加
        var newFormula = addAKFilter_(f, '株式会社Tolance', akLabel);
        if (newFormula === f) continue; // 置換されなかった
        if (!dryRun) plSh.getRange(r, c + 1).setFormula(newFormula);
        fixed++;
        secFixed++;
        if (loggedSamples < 6) {
          Logger.log('  row ' + r + ' ' + colNumToLetter_(c + 1) + ' [' + sec.header + ']');
          Logger.log('    旧: ' + f);
          Logger.log('    新: ' + newFormula);
          loggedSamples++;
        }
      }
    }
    Logger.log('[' + sec.header + '] → ' + secFixed + 'セル修正');
  });

  Logger.log('\n=== 完了: ' + fixed + 'セル修正 (dryRun=' + dryRun + ') ===');
  if (dryRun) Logger.log('本実行: 経営指標_Tolanceサブ_AKフィルタ修正(false)');
}
function 経営指標_Tolanceサブ_AKフィルタ修正_実行() { 経営指標_Tolanceサブ_AKフィルタ修正(false); }

// Tolance:全社 セクション 主要KPI 数式と値の確認
function 経営指標_Tolance全社_確認() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastCol = plSh.getLastColumn();
  var monthRow = plSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var months = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var ms;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
    }
    if (ms) months.push({ col: c + 1, ym: ms });
  }

  // Tolance:全社 セクション開始行
  var bVals = plSh.getRange(1, 2, plSh.getLastRow(), 1).getValues();
  var s0 = -1;
  for (var i = 0; i < bVals.length; i++) {
    if (bVals[i][0] === 'Tolance:全社') { s0 = i + 1; break; }
  }
  if (s0 < 0) { Logger.log('Tolance:全社 未検出'); return; }
  Logger.log('Tolance:全社 開始行: ' + s0);

  var KEY_LABELS = ['獲得pt数','応援ダイヤ','マネジメントフィー','時間ダイヤ','投げ銭報酬','売上：','税抜売上','総ダイヤ数'];
  var TIER_LABELS = ['Tier1 : 3万ダイヤ以上','Tier2 : 1万〜3万ダイヤ未満','Tier3 : 1万ダイヤ未満'];

  var targetMonths = ['2025-12','2026-03'];

  Logger.log('=== Tolance:全社 主要KPI 数式と値 ===');
  for (var r = s0; r <= s0 + 75; r++) {
    var lblB = String(plSh.getRange(r, 2).getValue() || '').trim();
    var lblC = String(plSh.getRange(r, 3).getValue() || '').trim();
    var label = lblB || lblC;
    if (!label) continue;
    var isKey = KEY_LABELS.some(function(p) { return label.indexOf(p) === 0; }) ||
                TIER_LABELS.some(function(p) { return label === p; });
    if (!isKey) continue;

    Logger.log('\n--- row ' + r + ' [B=' + lblB + ' / C=' + lblC + '] ---');
    targetMonths.forEach(function(ym) {
      var mc = months.filter(function(m) { return m.ym === ym; })[0];
      if (!mc) return;
      var f = plSh.getRange(r, mc.col).getFormula();
      var v = plSh.getRange(r, mc.col).getValue();
      Logger.log('  ' + ym + ' ' + colNumToLetter_(mc.col) + ': value=' + (typeof v === 'number' ? v.toLocaleString() : v));
      if (f) Logger.log('    formula=' + f);
    });
  }

  Logger.log('\n=== 完了 ===');
}

// 問題行 (row 1092, 1133, 1134 等) の数式を詳細表示
function 経営指標_LVT_問題行_数式詳細() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  if (!plSh) { Logger.log('PL未検出'); return; }

  var lastCol = plSh.getLastColumn();
  var monthRow = plSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var months = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var ms;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
    }
    if (ms) months.push({ col: c + 1, ym: ms });
  }

  var targetRows = [1091, 1092, 1101, 1109, 1133, 1134];
  var targetMonths = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04'];

  Logger.log('=== 問題行の数式詳細 ===');
  targetRows.forEach(function(r) {
    var lblB = String(plSh.getRange(r, 2).getValue() || '').trim();
    var lblC = String(plSh.getRange(r, 3).getValue() || '').trim();
    Logger.log('\n--- row ' + r + ' [B=' + lblB + ' / C=' + lblC + '] ---');
    targetMonths.forEach(function(ym) {
      var mc = months.filter(function(m) { return m.ym === ym; })[0];
      if (!mc) return;
      var f = plSh.getRange(r, mc.col).getFormula();
      var v = plSh.getRange(r, mc.col).getValue();
      Logger.log('  ' + ym + ' ' + colNumToLetter_(mc.col) + ': value=' + v);
      if (f) Logger.log('    formula=' + f);
    });
  });

  Logger.log('\n=== 完了 ===');
}

// ============================================================
// ライブナウV(Tolance) サブセクション 反映確認
// 1. RAWで 株式会社Tolance × AK=「アライアンス：ライブナウV(Tolance)」 の件数を月別に
// 2. PL(個社別) row 1091〜 の主要KPIの値を表示
// ============================================================
function 経営指標_ライブナウVTolance_確認() {
  var ss = SpreadsheetApp.openById(KEIEI_PL_ID);
  var plSh = ss.getSheetByName('PL(個社別)');
  var rawSh = ss.getSheetByName('RAW_ライバー月次');
  if (!plSh || !rawSh) { Logger.log('シート未検出'); return; }

  Logger.log('=== 1. RAW: 株式会社Tolance × アライアンス：ライブナウV(Tolance) 件数 ===');
  var rawLast = rawSh.getLastRow();
  if (rawLast < 2) { Logger.log('RAW空'); return; }
  // RAW列: A=月, B=事務所, AK=レーベル正規化
  var rawData = rawSh.getRange(2, 1, rawLast - 1, 37).getValues();
  var monthCount = {};
  var akSet = {};
  rawData.forEach(function(r) {
    if (r[1] !== '株式会社Tolance') return;
    var ak = String(r[36] || '').trim(); // AK列 = index 36
    akSet[ak] = (akSet[ak] || 0) + 1;
    if (ak === 'アライアンス：ライブナウV(Tolance)') {
      var ym = r[0] instanceof Date
        ? Utilities.formatDate(r[0], 'JST', 'yyyy-MM')
        : String(r[0]).substring(0, 7);
      monthCount[ym] = (monthCount[ym] || 0) + 1;
    }
  });
  Logger.log('Tolance内 AKラベル別件数:');
  Object.keys(akSet).sort().forEach(function(k) {
    Logger.log('  [' + (k || '(空)') + '] : ' + akSet[k] + '件');
  });
  Logger.log('\n「アライアンス：ライブナウV(Tolance)」 月別件数:');
  Object.keys(monthCount).sort().forEach(function(k) {
    Logger.log('  ' + k + ' : ' + monthCount[k] + '件');
  });

  Logger.log('\n=== 2. PL row 1091〜 (アライアンス：ライブナウV(Tolance)) の主要KPI ===');
  // セクション開始行を確認
  var bVals = plSh.getRange(1, 2, plSh.getLastRow(), 1).getValues();
  var s0 = -1;
  for (var i = 0; i < bVals.length; i++) {
    if (bVals[i][0] === 'アライアンス：ライブナウV(Tolance)') { s0 = i + 1; break; }
  }
  if (s0 < 0) { Logger.log('アライアンス：ライブナウV(Tolance) セクション未検出'); return; }
  Logger.log('セクション開始行: ' + s0);

  // 月列マップ
  var lastCol = plSh.getLastColumn();
  var monthRow = plSh.getRange(2, 1, 1, lastCol).getValues()[0];
  var months = [];
  for (var c = 0; c < lastCol; c++) {
    var v = monthRow[c];
    var ms;
    if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
    else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
      var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
    }
    if (ms) months.push({ col: c + 1, ym: ms });
  }

  // 過去実績7月 + 直近の予測月だけ表示
  var targetMonths = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04'];

  // 主要KPI行のラベル一覧
  var KEY_LABELS = [
    '売上：', '税抜売上', '総ダイヤ数', '獲得pt数', '投げ銭報酬',
    '応援ダイヤ', 'マネジメントフィー', '時間ダイヤ',
    '登録ライバー数', 'アクティブライバー数', 'デビュー数'
  ];

  var endRow = plSh.getLastRow();
  for (var r = s0; r <= endRow; r++) {
    var lblB = String(plSh.getRange(r, 2).getValue() || '').trim();
    var lblC = String(plSh.getRange(r, 3).getValue() || '').trim();
    var label = lblB || lblC;
    if (!label) continue;
    var isKey = KEY_LABELS.some(function(p) { return label.indexOf(p) === 0; });
    if (!isKey) continue;

    var line = 'row ' + r + ' [' + label + ']: ';
    var vals = [];
    targetMonths.forEach(function(ym) {
      var mc = months.filter(function(m) { return m.ym === ym; })[0];
      if (!mc) return;
      var v = plSh.getRange(r, mc.col).getValue();
      var f = plSh.getRange(r, mc.col).getFormula();
      var format = f ? 'F' : (v !== '' && v !== null ? 'V' : '0');
      vals.push(ym + '=' + (typeof v === 'number' ? v.toLocaleString() : v) + '(' + format + ')');
    });
    Logger.log(line + vals.join(' / '));
  }

  Logger.log('\n=== 完了 ===');
}

// 報酬単価 全部一発実行（各セクション + 上部全社合計）
function 経営指標_報酬単価_数式統一フル_実行() {
  Logger.log('=== 1/3: 各セクション 報酬単価数式統一 ===');
  経営指標_報酬単価_数式統一(false);
  Logger.log('\n=== 2/3: 上部全社合計 報酬単価 SUM式付与 ===');
  経営指標_上部報酬単価_数式付与(false);
  Logger.log('\n=== 3/3: 色再適用 ===');
  経営指標_色適用();
  Logger.log('\n=== 🎉 報酬単価 数式統一フル 完了 ===');
}

// ============================================================
// 数式セル検算: 経営指標の数式セル の値を 旧PL の同ラベル・同月値と比較
// 出力: 「検算_数式セル」シートに CSV 形式で結果を書込み + Logger サマリ
// ============================================================
function 経営指標_数式セル_検算() {
  var keieiSs = SpreadsheetApp.openById(KEIEI_PL_ID);
  var keieiSh = keieiSs.getSheetByName('PL(個社別)');
  if (!keieiSh) { Logger.log('PL未検出'); return; }

  // 旧PL
  var OLD_PL_ID = '1x2yF6PEFs7Fv6nlPn_-3AYjba84wiwGLZSQFz8JrLF4';
  var OLD_GID = 1636107553;
  var oldSs = SpreadsheetApp.openById(OLD_PL_ID);
  var oldSh = null;
  oldSs.getSheets().forEach(function(s) { if (s.getSheetId() === OLD_GID) oldSh = s; });
  if (!oldSh) { Logger.log('旧PL未検出'); return; }

  Logger.log('=== 数式セル検算 開始 ===');
  var t0 = new Date().getTime();

  // 経営指標 一括取得
  var kLastRow = keieiSh.getLastRow();
  var kLastCol = keieiSh.getLastColumn();
  var kValues = keieiSh.getRange(1, 1, kLastRow, kLastCol).getValues();
  var kFormulas = keieiSh.getRange(1, 1, kLastRow, kLastCol).getFormulas();
  Logger.log('経営指標 取得: ' + ((new Date().getTime() - t0) / 1000).toFixed(1) + '秒');

  // 旧PL 一括取得
  var oLastRow = oldSh.getLastRow();
  var oLastCol = oldSh.getLastColumn();
  var oValues = oldSh.getRange(1, 1, oLastRow, oLastCol).getValues();
  Logger.log('旧PL 取得: ' + ((new Date().getTime() - t0) / 1000).toFixed(1) + '秒');

  // 月列マップ
  function buildMonthMap(values) {
    var row2 = values[1];
    var m = {};
    for (var c = 0; c < row2.length; c++) {
      var v = row2[c];
      var ms = null;
      if (v instanceof Date) ms = Utilities.formatDate(v, 'JST', 'yyyy-MM');
      else if (typeof v === 'string' && /^\d{4}\/\d+/.test(v)) {
        var p = v.split('/'); ms = p[0] + '-' + ('0' + p[1]).slice(-2);
      }
      if (ms && !m[ms]) m[ms] = c; // 0-indexed
    }
    return m;
  }
  var kMonthMap = buildMonthMap(kValues);
  var oMonthMap = buildMonthMap(oValues);

  // セクション S0（経営指標）
  var keieiSections = [
    'cozoru:全社', 'cozoruレーベル', 'D3レーベル',
    'ライブナウV', 'Tolance:全社',
    'Tolance', 'BUBBLE', 'Deeper Deeper', 'Mofile', 'ヴィラプロ',
    'アライアンス：アクトワン', 'アライアンス：アドモンド', 'アライアンス：TOIRO',
    'アライアンス：PODD', 'アライアンス：その他', 'アライアンス：トビラ',
    'アライアンス：ライブナウV(Tolance)'
  ];

  // 新→旧セクション名マップ
  var secMap = {
    'cozoru:全社': 'cozoru',
    'cozoruレーベル': null,  // 旧PLに無い
    'D3レーベル': null,       // 旧PLに無い
    'ライブナウV': 'ライブナウV',
    'Tolance:全社': 'Tolance:全社',
    'Tolance': 'Tolance',
    'BUBBLE': 'BUBBLE',
    'Deeper Deeper': 'Deeper Deeper',
    'Mofile': 'Mofile',
    'ヴィラプロ': 'ヴィラプロ',
    'アライアンス：アクトワン': 'アライアンス：アクトワン',
    'アライアンス：アドモンド': 'アライアンス：アドモンド',
    'アライアンス：TOIRO': 'アライアンス：TOIRO',
    'アライアンス：PODD': 'アライアンス：PODD',
    'アライアンス：その他': 'アライアンス：その他',
    'アライアンス：トビラ': 'アライアンス：トビラ',
    'アライアンス：ライブナウV(Tolance)': 'アライアンス：ライブナウV(Tolance)'
  };

  // セクションS0 + endRow を構築
  function buildSectionRanges(values, headers) {
    var sections = [];
    headers.forEach(function(h) {
      for (var i = 0; i < values.length; i++) {
        if (values[i][1] === h) { sections.push({ header: h, s0: i + 1 }); break; }
      }
    });
    sections.sort(function(a, b) { return a.s0 - b.s0; });
    for (var i = 0; i < sections.length; i++) {
      sections[i].endRow = (i + 1 < sections.length) ? sections[i + 1].s0 - 1 : values.length;
    }
    return sections;
  }
  var kSections = buildSectionRanges(kValues, keieiSections);
  var oldSecHeaders = [];
  Object.keys(secMap).forEach(function(k) { if (secMap[k]) oldSecHeaders.push(secMap[k]); });
  var oSections = buildSectionRanges(oValues, oldSecHeaders);

  // ラベル → 行マップ（複数出現対応）
  function buildLabelMap(values, s0, endRow) {
    var m = {};
    for (var r = s0; r <= endRow; r++) {
      var lblB = String(values[r - 1][1] || '').trim();
      var lblC = String(values[r - 1][2] || '').trim();
      var label = lblB || lblC;
      if (!label) continue;
      if (!m[label]) m[label] = [];
      m[label].push(r);
    }
    return m;
  }
  kSections.forEach(function(sec) { sec.lblMap = buildLabelMap(kValues, sec.s0, sec.endRow); });
  oSections.forEach(function(sec) { sec.lblMap = buildLabelMap(oValues, sec.s0, sec.endRow); });

  // 検算実行
  Logger.log('検算開始...');
  var TARGET_MONTHS = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04'];

  // 結果格納
  var results = [['section','row','label','month','formula_state','kVal','oVal','diff','rel_diff','flag']];
  var summary = { total: 0, withOld: 0, match: 0, smallDiff: 0, bigDiff: 0, noOld: 0 };

  kSections.forEach(function(kSec) {
    var oldHeader = secMap[kSec.header];
    var oSec = oldHeader ? oSections.filter(function(s) { return s.header === oldHeader; })[0] : null;

    for (var r = kSec.s0; r <= kSec.endRow; r++) {
      var lblB = String(kValues[r - 1][1] || '').trim();
      var lblC = String(kValues[r - 1][2] || '').trim();
      var label = lblB || lblC;
      if (!label) continue;
      if (label === kSec.header) continue; // セクションヘッダ自身

      TARGET_MONTHS.forEach(function(ym) {
        var kc = kMonthMap[ym];
        if (kc === undefined) return;
        var f = kFormulas[r - 1][kc];
        if (!f) return; // 数式無し（手入力）はスキップ
        summary.total++;

        var kV = Number(kValues[r - 1][kc]) || 0;

        // 旧PL の値
        var oV = null;
        if (oSec && oSec.lblMap[label]) {
          var oRows = oSec.lblMap[label];
          // 同一ラベル複数出現の場合、kSec内での出現順 で対応付け
          var kRows = kSec.lblMap[label] || [];
          var idx = kRows.indexOf(r);
          var oRow = oRows[idx] !== undefined ? oRows[idx] : oRows[0];
          var oc = oMonthMap[ym];
          if (oc !== undefined && oRow) {
            oV = Number(oValues[oRow - 1][oc]) || 0;
          }
        }

        var diff = '', relDiff = '', flag = '';
        if (oV !== null) {
          summary.withOld++;
          diff = kV - oV;
          if (Math.abs(oV) > 0.01) relDiff = (diff / Math.abs(oV));
          else relDiff = (Math.abs(diff) < 0.01 ? 0 : '∞');

          var absDiff = Math.abs(diff);
          if (absDiff < 0.5) {
            summary.match++;
            flag = 'OK';
          } else if (absDiff < Math.max(100, Math.abs(oV) * 0.01)) {
            summary.smallDiff++;
            flag = '微差';
          } else {
            summary.bigDiff++;
            flag = '⚠️大差';
          }
        } else {
          summary.noOld++;
          flag = '(旧PL無し)';
        }

        results.push([
          kSec.header, r, label, ym, 'F',
          kV, oV === null ? '' : oV,
          diff, relDiff, flag
        ]);
      });
    }
  });

  // シート出力
  var outName = '検算_数式セル';
  var outSh = keieiSs.getSheetByName(outName);
  if (outSh) keieiSs.deleteSheet(outSh);
  outSh = keieiSs.insertSheet(outName);
  outSh.getRange(1, 1, results.length, results[0].length).setValues(results);

  Logger.log('=== サマリ ===');
  Logger.log('対象数式セル: ' + summary.total);
  Logger.log('旧PL比較可: ' + summary.withOld);
  Logger.log('  ✓ 一致 (差<0.5): ' + summary.match);
  Logger.log('  微差 (差<1% or <100): ' + summary.smallDiff);
  Logger.log('  ⚠️ 大差: ' + summary.bigDiff);
  Logger.log('旧PL比較不可 (旧PLに該当無し): ' + summary.noOld);
  Logger.log('\n詳細: 「検算_数式セル」シート参照（' + (results.length - 1) + '行）');
  Logger.log('処理時間: ' + ((new Date().getTime() - t0) / 1000).toFixed(1) + '秒');

  // 大差の上位30件をログに
  if (summary.bigDiff > 0) {
    Logger.log('\n--- 大差セル 上位30件 ---');
    var bigDiffs = results.slice(1).filter(function(r) { return r[9] === '⚠️大差'; });
    bigDiffs.sort(function(a, b) { return Math.abs(b[7]) - Math.abs(a[7]); });
    bigDiffs.slice(0, 30).forEach(function(r) {
      Logger.log('[' + r[0] + '] ' + r[2] + ' ' + r[3] +
                 ': 経=' + (typeof r[5] === 'number' ? r[5].toLocaleString() : r[5]) +
                 ' / 旧=' + (typeof r[6] === 'number' ? r[6].toLocaleString() : r[6]) +
                 ' / 差=' + (typeof r[7] === 'number' ? r[7].toLocaleString() : r[7]));
    });
  }
}
