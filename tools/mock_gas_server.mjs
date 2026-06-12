// 月次UIローカル検証用の擬似GASサーバー（テスト済み mjs 集計を使用）
// 使い方: node tmp/mock_gas_server.mjs → cozoru-dashboard/.env.local の GAS_API_URL を http://localhost:3999 に
import http from 'node:http';
import { aggregateBanners, aggregateBannersMonthly } from './banner_aggregate.mjs';

function row(org, label, liver, week, rank, pt, win, eventId = week, block = '') {
  const r = new Array(18).fill('');
  r[2] = org; r[3] = week; r[4] = eventId; r[11] = 'IRIAM-' + liver; r[12] = liver;
  r[13] = label; r[14] = block; r[15] = rank; r[16] = pt; r[17] = win ? 'TRUE' : 'FALSE';
  return r;
}

// 合成データ: 2025-12〜2026-06 の7ヶ月・3社・週次（火曜開始）
const ORGS = [
  { org: '株式会社cozoru', labels: ['cozoru', 'D3'] },
  { org: '株式会社ライブナウV', labels: ['ライブナウV'] },
  { org: '株式会社Tolance', labels: ['BUBBLE', 'Mofile'] },
];
const TUESDAYS = [
  '20251202','20251209','20251216','20251223',
  '20260106','20260113','20260120','20260127',
  '20260203','20260210','20260217','20260224',
  '20260303','20260310','20260317','20260324',
  '20260407','20260414','20260421','20260428',
  '20260505','20260512','20260519','20260526',
  '20260602',
];
const values = [];
let seed = 1;
const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
TUESDAYS.forEach((tue, wi) => {
  ORGS.forEach((o, oi) => {
    o.labels.forEach((lbl, li) => {
      const n = 3 + Math.floor(rand() * 3); // レーベルごと3-5人参加
      for (let k = 0; k < n; k++) {
        const rank = 1 + Math.floor(rand() * 200);            // 1〜200位
        const pt = Math.floor(5000 + rand() * 95000 + wi * 800); // 月が進むほど微増
        values.push(row(o.org, lbl, `${lbl}_liver${k + 1}`, tue, rank, pt, rank <= 100, tue + '0' + (oi + 1) + li, String(li + 1)));
      }
    });
  });
});

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const base = (u.searchParams.get('base') || '').replace(/[^0-9]/g, '').substring(0, 8);
  const basem = (u.searchParams.get('basem') || '').replace(/[^0-9]/g, '').substring(0, 6);
  const banners = aggregateBanners(values, base);
  banners.monthly = aggregateBannersMonthly(values, basem);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', data: { banners } }));
});
server.listen(3999, () => console.log('mock GAS on http://localhost:3999'));
