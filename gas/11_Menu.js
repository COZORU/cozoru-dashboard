// カスタムメニュー: スプレッドシートを開いた時にメニューバーに追加される
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 ダッシュボード')
    .addItem('📥 ① CSV取込 & ダッシュボード更新', 'runMonthlyProcess')
    .addItem('🔄 ② ダッシュボードのみ再構築（最新月のみ）', 'rebuildAll')
    .addItem('💰 ② -2 全月一括 売上再同期（M_月次ボーナス変更時）', 'runSyncToPLAllMonths')
    .addItem('🌙 ② -3 全月自動同期＋色付け（6分かかる・寝る前用）', 'runAutoSyncAllMonths')
    .addItem('📈 ③ 成長ボーナス予測を更新', 'runGrowthForecast')
    .addItem('📊 ④ 成長進捗を更新', 'runProgressDashboard')
    .addItem('🔍 ⑤ セグメント分析を更新', 'runSegmentChart')
    .addItem('👥 ⑥ ライバー月次を更新（エラー表示あり）', 'runLiverMonthlyDirect')
    .addItem('🎯 ⑦ デビュー管理を更新', 'runDebutManagement')
    .addSeparator()
    .addItem('🔒 シートを保護する（移管時に一度実行）', 'protectSheets')
    .addItem('📋 使い方ガイドを更新する', 'buildGuideSheet')
    .addToUi();
}

// ②-2 全月一括 売上再同期（M_月次ボーナス D列を修正した時に実行）
// 過去月含めて全月の売上をiriam実額（D列）で再書込み、色も自動適用
function runSyncToPLAllMonths() {
  var ui = SpreadsheetApp.getUi();
  try {
    syncToPLAllMonths();
    ui.alert('✅ 全月の売上を再同期しました。\n色分けも自動適用済みです。');
  } catch (e) {
    ui.alert('❌ エラー:\n' + e.message);
  }
}

// ②-3 全月自動同期（1分間隔のトリガー連鎖で順次実行、6分制限回避）
// 寝る前に押して放置すると、約6分後に全工程完了
function runAutoSyncAllMonths() {
  var ui = SpreadsheetApp.getUi();
  try {
    autoSyncAllMonths();
    ui.alert('✅ 自動同期を開始しました。\n約6分後に完了します。安心してお休みください。\n\n（取込ログタブで進行状況確認可能。最後に「SUCCESS 自動同期 全工程完了」が記録されます）');
  } catch (e) {
    ui.alert('❌ エラー:\n' + e.message);
  }
}

// ① 月次運用のワンクリック実行: CSV取込 → RAW更新 → ダッシュボード再構築
function runMonthlyProcess() {
  var ui = SpreadsheetApp.getUi();
  try {
    processAll();
    ui.alert('✅ 取込＆ダッシュボード更新が完了しました。\n「取込ログ」タブで結果をご確認ください。');
  } catch (e) {
    ui.alert('❌ エラーが発生しました:\n' + e.message);
  }
}

// ② ダッシュボードのみ再構築（マスタ変更後の再反映用）
function rebuildAll() {
  var ui = SpreadsheetApp.getUi();
  try {
    rebuildDashboards_();
    ui.alert('✅ ダッシュボードを再構築しました。');
  } catch (e) {
    ui.alert('❌ エラーが発生しました:\n' + e.message);
  }
}

// ③ 成長ボーナス予測シートのみ更新（月中の区分別売上インパクト試算）
function runGrowthForecast() {
  var ui = SpreadsheetApp.getUi();
  try {
    rebuildGrowthForecast();
    ui.alert('✅ 成長ボーナス予測を更新しました。\n「DB_成長予測」タブをご確認ください。');
  } catch (e) {
    ui.alert('❌ エラーが発生しました:\n' + e.message);
  }
}

// ⑤ セグメント分析シート更新
function runSegmentChart() {
  var ui = SpreadsheetApp.getUi();
  try {
    rebuildSegmentChart();
    ui.alert('✅ セグメント分析を更新しました。\n「DB_セグメント」タブをご確認ください。\n\nB1セルで月、D1セルで事務所を変更するとリアルタイムで更新されます。');
  } catch (e) {
    ui.alert('❌ エラーが発生しました:\n' + e.message);
  }
}

// ⑦ DB_デビュー管理を単独実行
function runDebutManagement() {
  var ui = SpreadsheetApp.getUi();
  try {
    rebuildDebutManagement();
    ui.alert('✅ DB_デビュー管理を更新しました。');
  } catch (e) {
    ui.alert('❌ エラー:\n' + e.message + '\n\n' + String(e.stack || '').substring(0, 300));
  }
}

// ⑥ DB_ライバー月次を単独実行（エラーを直接表示 → デバッグ用）
function runLiverMonthlyDirect() {
  var ui = SpreadsheetApp.getUi();
  try {
    rebuildLiverMonthly();
    ui.alert('✅ DB_ライバー月次を更新しました。');
  } catch (e) {
    ui.alert('❌ エラー:\n' + e.message + '\n\n' + String(e.stack || '').substring(0, 300));
  }
}

// ④ 日次CSV取込 & 成長進捗シート更新
function runProgressDashboard() {
  var ui = SpreadsheetApp.getUi();
  try {
    processDailyCsvs();
    rebuildProgressDashboard();
    ui.alert('✅ 成長進捗を更新しました。\n「DB_成長進捗」タブをご確認ください。');
  } catch (e) {
    ui.alert('❌ エラーが発生しました:\n' + e.message);
  }
}
