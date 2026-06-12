// 列インデックス（0-based）: 個社C=2 ID L=11 ライバーM=12 レーベルN=13 順位P=15 pt Q=16
export function parseBannerRows(values) {
  const C_ORG=2, C_ID=11, C_LIV=12, C_LBL=13, C_RANK=15, C_PT=16, C_EVT=4, C_EVTNAME=5, C_START=6, C_END=7, C_BLOCK=14;
  function fmtMD(v){
    if (v && typeof v.getMonth === 'function') return (v.getMonth()+1)+'/'+v.getDate();
    const s=String(v==null?'':v);
    const m=s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if(m) return parseInt(m[2],10)+'/'+parseInt(m[3],10);
    const d=s.match(/^(\d{4})(\d{2})(\d{2})/);
    if(d) return parseInt(d[2],10)+'/'+parseInt(d[3],10);
    return s.substring(0,10);
  }
  const rows=[];
  for (let i=0;i<values.length;i++){
    const r=values[i];
    const id=String(r[C_ID]==null?'':r[C_ID]).trim();
    if(!id) continue;
    const eid=String(r[C_EVT]==null?'':r[C_EVT]).trim();
    const hasEid=/^\d{8}/.test(eid);
    const rank=Number(r[C_RANK])||0;
    rows.push({
      org:String(r[C_ORG]||'').trim(),
      label:String(r[C_LBL]||'').trim(),
      liver:String(r[C_LIV]||'').trim(),
      week:(hasEid?eid.substring(0,8):''),
      noEvent:!hasEid,
      rank:rank,
      pt:Number(r[C_PT])||0,
      win:(rank>=1 && rank<=100)?1:0,
      eventId:eid,
      eventName:String(r[C_EVTNAME]||'').trim(),
      start:fmtMD(r[C_START]),
      end:fmtMD(r[C_END]),
      block:String(r[C_BLOCK]==null?'':r[C_BLOCK]).trim()
    });
  }
  return rows;
}

export function aggregateBanners(values, baseDate) {
  const METRICS = ['ptSum','avgPt','winCount','joinCount'];
  const rows = parseBannerRows(values);

  const weekSet={}; rows.forEach(r=>{ if(r.week) weekSet[r.week]=true; });
  const allWeeks=Object.keys(weekSet).sort();
  const base = (baseDate && weekSet[baseDate]) ? baseDate : allWeeks[allWeeks.length-1] || '';
  const weeks = allWeeks.filter(w=>w<=base).slice(-4).reverse();
  const weekIdx={}; weeks.forEach((w,i)=>{weekIdx[w]=i;});
  const latestWk = weeks[0]||'';
  rows.forEach(r=>{ if(!r.week && r.noEvent && latestWk) r.week=latestWk; });   // EventId無し→最新回に表示
  const inWin = rows.filter(r=>weekIdx[r.week]!==undefined);
  let noEventInWin=0; inWin.forEach(r=>{ if(r.noEvent) noEventInWin++; });

  function buildEntity(keyFn){
    const map={};
    inWin.forEach(r=>{
      const k=keyFn(r); if(!k) return;
      if(!map[k]) map[k]={ name:k, weekly:weeks.map(w=>({week:w,ptSum:0,avgPt:null,winCount:0,joinCount:0})), totalPt:0 };
      const c=map[k].weekly[weekIdx[r.week]];
      c.ptSum+=r.pt; c.winCount+=r.win; c.joinCount+=1;
      map[k].totalPt+=r.pt;
    });
    const arr=Object.keys(map).map(k=>{
      const e=map[k];
      e.weekly.forEach(c=>{ c.avgPt = c.joinCount>0 ? Math.round(c.ptSum/c.joinCount) : null; });
      return e;
    });
    arr.sort((a,b)=>b.totalPt-a.totalPt);
    return arr;
  }

  const byOrg=buildEntity(r=>r.org);
  const byLabel=buildEntity(r=>r.label);

  const lmap={};
  inWin.forEach(r=>{
    const k=r.liver; if(!k) return;
    if(!lmap[k]) lmap[k]={ name:k, office:r.org, label:r.label, weekly:weeks.map(w=>({week:w,rank:0,pt:0,win:false,joined:false})) };
    const c=lmap[k].weekly[weekIdx[r.week]];
    c.rank=r.rank; c.pt=r.pt; c.win=r.win===1; c.joined=true; if(r.noEvent) c.noEvent=true;
  });
  const byLiver=Object.keys(lmap).map(k=>lmap[k]);
  byLiver.sort((a,b)=>{
    const aw=a.weekly[0].win?1:0, bw=b.weekly[0].win?1:0;
    return (bw-aw) || (b.weekly[0].pt - a.weekly[0].pt);
  });

  function weekTotals(idx){
    if(idx<0||idx>=weeks.length) return null;
    const w=weeks[idx]; let pt=0,win=0,join=0;
    inWin.forEach(r=>{ if(r.week===w){ pt+=r.pt; win+=r.win; join+=1; } });
    return { week:w, joinCount:join, winCount:win, winRate: join>0?Math.round(win/join*100):0, avgPt: join>0?Math.round(pt/join):0 };
  }
  const s0=weekTotals(0), s1=weekTotals(1);
  const summary = s0 ? {
    week:s0.week, joinCount:s0.joinCount, winCount:s0.winCount, winRate:s0.winRate, avgPt:s0.avgPt,
    prev: s1 ? { joinCount:s1.joinCount, winCount:s1.winCount, winRate:s1.winRate, avgPt:s1.avgPt } : null
  } : null;

  const evMap={};
  inWin.forEach(r=>{
    const key=r.week+'|'+r.eventId+'|'+r.block;
    if(!evMap[key]) evMap[key]={ week:r.week, eventId:r.eventId, blockId:r.block, eventName:r.eventName, office:r.org, start:r.start, end:r.end, participants:[] };
    evMap[key].participants.push({ name:r.liver, office:r.org, label:r.label, rank:r.rank, pt:r.pt, win:r.win===1 });
  });
  const events=Object.keys(evMap).map(k=>{
    const e=evMap[k];
    e.participants.sort((a,b)=>{ const ar=a.rank>0?a.rank:999999, br=b.rank>0?b.rank:999999; return (ar-br)||(b.pt-a.pt); });
    e.count=e.participants.length;
    e.winCount=e.participants.filter(p=>p.win).length;
    return e;
  });
  events.sort((a,b)=>{ if(a.week!==b.week) return a.week<b.week?1:-1; return b.count-a.count; });

  return { baseDate: base, weeks, metrics: METRICS, byOrg, byLabel, byLiver, events, summary, noEventCount: noEventInWin };
}

// 月次集計: 期間キー＝EventId先頭8桁のYYYYMM（バナイベ開始日の月）
export function aggregateBannersMonthly(values, baseMonth) {
  const empty = { baseMonth:'', months:[], allMonths:[], byOrg:[], byLabel:[], byLiver:[], summary:null, trend:[], noEventCount:0 };
  const rows = parseBannerRows(values);
  if (!rows.length) return empty;

  // noEvent 行は最新週=最新月に帰属（回別と同じ規則）
  const weekSet={}; rows.forEach(r=>{ if(r.week) weekSet[r.week]=true; });
  const allWeeks=Object.keys(weekSet).sort();
  if (!allWeeks.length) return empty;
  const latestWk=allWeeks[allWeeks.length-1];
  rows.forEach(r=>{ if(!r.week && r.noEvent) r.week=latestWk; });
  rows.forEach(r=>{ r.month=r.week.substring(0,6); });

  const monthSet={}; rows.forEach(r=>{ monthSet[r.month]=true; });
  const allMonths=Object.keys(monthSet).sort();
  const base=(baseMonth && monthSet[baseMonth]) ? baseMonth : allMonths[allMonths.length-1];
  const months=allMonths.filter(m=>m<=base).slice(-6).reverse();
  const monthIdx={}; months.forEach((m,i)=>{monthIdx[m]=i;});
  const inWin=rows.filter(r=>monthIdx[r.month]!==undefined);
  let noEventInWin=0; inWin.forEach(r=>{ if(r.noEvent) noEventInWin++; });

  function buildEntity(keyFn){
    const map={};
    inWin.forEach(r=>{
      const k=keyFn(r); if(!k) return;
      if(!map[k]) map[k]={ name:k, monthly:months.map(m=>({month:m,ptSum:0,avgPt:null,winCount:0,joinCount:0})), totalPt:0 };
      const c=map[k].monthly[monthIdx[r.month]];
      c.ptSum+=r.pt; c.winCount+=r.win; c.joinCount+=1;
      map[k].totalPt+=r.pt;
    });
    const arr=Object.keys(map).map(k=>{
      const e=map[k];
      e.monthly.forEach(c=>{ c.avgPt = c.joinCount>0 ? Math.round(c.ptSum/c.joinCount) : null; });
      return e;
    });
    arr.sort((a,b)=>b.totalPt-a.totalPt);
    return arr;
  }
  const byOrg=buildEntity(r=>r.org);
  const byLabel=buildEntity(r=>r.label);

  const lmap={};
  inWin.forEach(r=>{
    const k=r.liver; if(!k) return;
    if(!lmap[k]) lmap[k]={ name:k, office:r.org, label:r.label, monthly:months.map(m=>({month:m,joinCount:0,winCount:0,ptSum:0,bestRank:0})) };
    const c=lmap[k].monthly[monthIdx[r.month]];
    c.joinCount+=1; c.winCount+=r.win; c.ptSum+=r.pt;
    if(r.rank>0 && (c.bestRank===0 || r.rank<c.bestRank)) c.bestRank=r.rank;
  });
  const byLiver=Object.keys(lmap).map(k=>lmap[k]);
  byLiver.sort((a,b)=>(b.monthly[0].winCount-a.monthly[0].winCount)||(b.monthly[0].ptSum-a.monthly[0].ptSum));

  // 全期間 trend（昇順）。summary もここから引く
  const tmap={};
  rows.forEach(r=>{
    if(!tmap[r.month]) tmap[r.month]={ ptSum:0, joinCount:0, winCount:0, evKeys:{} };
    const t=tmap[r.month];
    t.ptSum+=r.pt; t.joinCount+=1; t.winCount+=r.win;
    t.evKeys[r.eventId+'|'+r.block]=true;
  });
  const trend=allMonths.map(m=>{
    const t=tmap[m];
    return { month:m, ptSum:t.ptSum, joinCount:t.joinCount, winCount:t.winCount,
      winRate: t.joinCount>0?Math.round(t.winCount/t.joinCount*100):0,
      avgPt: t.joinCount>0?Math.round(t.ptSum/t.joinCount):0,
      eventCount: Object.keys(t.evKeys).length };
  });
  function monthStats(m){
    for (let i=0;i<trend.length;i++){
      if(trend[i].month===m) return { joinCount:trend[i].joinCount, winCount:trend[i].winCount, winRate:trend[i].winRate, avgPt:trend[i].avgPt, eventCount:trend[i].eventCount };
    }
    return null;
  }
  const cur=monthStats(months[0]);
  const prevM=allMonths[allMonths.indexOf(months[0])-1];
  const prev=prevM?monthStats(prevM):null;
  const summary=cur?{ month:months[0], joinCount:cur.joinCount, winCount:cur.winCount, winRate:cur.winRate, avgPt:cur.avgPt, eventCount:cur.eventCount, prev:prev }:null;

  return { baseMonth:base, months, allMonths, byOrg, byLabel, byLiver, summary, trend, noEventCount:noEventInWin };
}
