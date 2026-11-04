/* auto-generated classic bundle — no ES modules */
(function () {
"use strict";
/** Pure helpers (no app state) */
const CONFC = {'高':'#16a34a','中':'#d97706','低':'#dc2626'};
const STAGE_NONE = '未标注阶段';
const fmt = n => Number(n).toLocaleString('en-US');
const pct = (x, d=0) => (x*100).toFixed(d) + '%';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = s => document.querySelector(s);
const short = (s, n) => s.length > n ? s.slice(0, n) + '…' : s;
function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),1800); }
function chartOf(el){ return echarts.getInstanceByDom(el) || echarts.init(el, null, {renderer:'canvas'}); }
const yearOf = p => { const m = /(\d{4})/.exec(p.d||''); return m ? m[1] : '未知'; };
const md = s => { const h = marked.parse(s || ''); return h.replace(/<a href=/g, '<a target="_blank" rel="noopener" href='); };

/**
 * Application core + all views (modular entry splits views below).
 * State lives here; view files re-export render* for clarity.
 */
let D, P, SRC, TH, hasTitles, srcKeys;
let G, OV, GP, dirty, active, rendered;
let themeView = 'theme', themeMode = 'n', selTheme = null, selScene = null;
let gapSel = null, gapRuleSel = null;
let HM = { mode: 'count', row: 'scene', intro: null };
let TY = { view: 'n', top: null };
let E;

const tlabel = c => short(TH[c].name, 18);

/** Stable color per theme code (same theme → same color across charts). */
const THEME_PALETTE = [
  '#2563eb','#0ea5e9','#10b981','#f59e0b','#ef4444','#6366f1','#ec4899','#14b8a6',
  '#f97316','#84cc16','#a855f7','#06b6d4','#eab308','#f43f5e','#0d9488','#c026d3',
  '#b45309','#64748b','#7c3aed','#059669','#dc2626','#0284c7','#ca8a04','#db2777',
  '#4f46e5','#16a34a','#ea580c','#0891b2','#9333ea','#be123c','#15803d','#1d4ed8',
  '#a16207','#9f1239',
];
const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
const themeColor = code => {
  const i = D.themes.findIndex(t => t.code === code);
  return THEME_PALETTE[(i >= 0 ? i : Math.abs(hashStr(code))) % THEME_PALETTE.length];
};
const sceneColor = idx => THEME_PALETTE[Math.abs(idx) % THEME_PALETTE.length];

function initCore(data) {
  D = data; P = D.posts; SRC = D.sources;
  TH = {}; D.themes.forEach(t => TH[t.code] = t);
  hasTitles = P.some(p => p.k === 'title');
  srcKeys = Object.keys(SRC).filter(s => P.some(p => p.s === s));
  G = { src: new Set(srcKeys), stage: '', type: '', titles: true, themed: false };
  OV = { view: 'main' };
  GP = []; dirty = new Set(); active = 'overview'; rendered = new Set();
  window.addEventListener('resize', () => document.querySelectorAll('.chart').forEach(el => {
    const c = echarts.getInstanceByDom(el); if (c) c.resize();
  }));
}

const isTB = s => SRC[s].kind === 'title';
const isV2 = s => s === 'v2ex';
const hasSupp = () => [...G.src].some(isV2);
const hasTB = () => [...G.src].some(isTB);
const defSrc = () => new Set(srcKeys);

function gpass(p){ return gbase(p) && (!G.themed || !!p.th); }
function gnosrc(p){
  if (p.k === 'title' && !G.titles) return false;
  if (G.stage !== '') { if (G.stage === '-1') { if (p.st.length) return false; } else if (!p.st.includes(+G.stage)) return false; }
  if (G.type !== '' && !p.ty.includes(+G.type)) return false;
  return true;
}
function gbase(p){
  if (!G.src.has(p.s)) return false;
  if (p.k === 'title' && !G.titles) return false;
  if (G.stage !== '') { if (G.stage === '-1') { if (p.st.length) return false; } else if (!p.st.includes(+G.stage)) return false; }
  if (G.type !== '' && !p.ty.includes(+G.type)) return false;
  return true;
}
function initGlobal(){
  const box = $('#gSources');
  box.innerHTML = srcKeys.map(s => `<span class="chip on" data-s="${s}"><span class="dot" style="background:${SRC[s].color}"></span>${esc(SRC[s].label)}</span>`).join('');
  box.querySelectorAll('.chip').forEach(ch => ch.onclick = () => {
    const s = ch.dataset.s; if (G.src.has(s)) { if (G.src.size === 1) return toast('至少保留一个来源'); G.src.delete(s); } else G.src.add(s);
    syncChips(); changed();
  });
  const openInfo = (e, v) => { e.preventDefault(); e.stopPropagation(); OV.view = v; dirty.add('overview'); showTab('overview'); };
  $('#gV2Info').onclick = e => openInfo(e, 'v2ex'); if (hasTitles) $('#gTitlesInfo').onclick = e => openInfo(e, 'tieba');
  $('#gV2').onchange = e => { srcKeys.filter(isV2).forEach(s => e.target.checked ? G.src.add(s) : G.src.delete(s)); syncChips(); changed(); };
  $('#gStage').innerHTML = `<option value="">全部阶段</option>` + D.stages.map((s,i)=>`<option value="${i}">${esc(s)}</option>`).join('') + `<option value="-1">${STAGE_NONE}</option>`;
  $('#gType').innerHTML = `<option value="">全部学生类型</option>` + D.stypes.map((s,i)=>`<option value="${i}">${esc(s)}</option>`).join('');
  $('#gStage').onchange = e => { G.stage = e.target.value; changed(); };
  $('#gType').onchange = e => { G.type = e.target.value; changed(); };
  if (hasTitles) $('#gTitles').onchange = e => { srcKeys.filter(isTB).forEach(s => e.target.checked ? G.src.add(s) : G.src.delete(s)); syncChips(); changed(); };
  else $('#gTitlesWrap').classList.add('hidden');
  $('#gReset').onclick = () => { G.src = defSrc(); G.themed = false; OV.view = 'main'; G.stage=''; G.type=''; G.titles=true; $('#gStage').value=''; $('#gType').value=''; syncChips(); changed(); };
  syncChips();
}
function syncChips(){ document.querySelectorAll('#gSources .chip').forEach(ch => { const on = G.src.has(ch.dataset.s); ch.classList.toggle('on', on); ch.classList.toggle('off', !on); }); $('#gV2').checked = hasSupp(); G.titles = hasTB(); if (hasTitles) $('#gTitles').checked = hasTB(); }
// (per-source description strip under the filter bar removed; every fact it carried lives in the overview's 数据局限 list and the V2EX/贴吧 说明 panels)
function recompute(){
  GP = P.filter(gpass);
  // 大数字 = 当前筛选下全部条目（正文帖 + 贴吧标题），不再单独拆「含 V2EX / +贴吧」副行
  let html = `<div class="n">${fmt(GP.length)}</div><div class="l">当前样本 / 主口径（全渠道）${fmt(D.meta.n_final)}</div>`;
  if (G.themed) html += `<span class="fchip" title="只统计被归入某个痛点主题的帖子；未归入主题的帖子在所有页面中都被排除">仅含进入主题的帖子 <button id="gThemedX" title="清除这个筛选">×</button></span>`;
  $('#gCount').innerHTML = html;
  const x = $('#gThemedX'); if (x) x.onclick = () => { G.themed = false; changed(); };
}
function changed(){ recompute(); Object.keys(RENDER).forEach(k => dirty.add(k)); dirty.delete('report'); render(active); }
function render(tab){ if (dirty.has(tab) || !rendered.has(tab)) { RENDER[tab](); dirty.delete(tab); rendered.add(tab); } else { document.querySelectorAll('#tab-'+tab+' .chart').forEach(el=>{const c=echarts.getInstanceByDom(el); if(c) c.resize();}); } }
function showTab(tab){
  active = tab;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
  $('#gbar').classList.toggle('hidden', tab === 'report' || tab === 'framework');
  render(tab);
  window.scrollTo({top: 0});
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));


function hl(text, terms){
  let s = esc(text);
  terms.forEach(t => { if (!t) return; const re = new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); s = s.replace(re, m => `<mark>${m}</mark>`); });
  return s;
}
function postHTML(p, terms=[]){
  const s = SRC[p.s] || {label:p.s, color:'#64748b'};
  const emo = '●'.repeat(p.e) + '<span style="color:#e5e7eb">' + '●'.repeat(3-p.e) + '</span>';
  const tags = [];
  if (p.th) tags.push(`<span class="badge th" data-th="${p.th}" title="${esc(TH[p.th].full)}">${esc(tlabel(p.th))}</span>`);
  p.st.forEach(i => tags.push(`<span class="badge">${esc(D.stages[i])}${p.si?'(推断)':''}</span>`));
  p.ty.forEach(i => tags.push(`<span class="badge">${esc(D.stypes[i])}</span>`));
  if (p.tr >= 0) tags.push(`<span class="badge" title="牛客公开卡片">卡片:${esc(D.tiers[p.tr])}</span>`);
  p.sc.forEach(i => tags.push(`<span class="badge" style="background:#f8fafc;color:#64748b">${esc(D.scenes[i])}</span>`));
  p.gr.forEach(i => tags.push(`<span class="badge gap" title="gap 规则标签">gap:${esc(D.gapRules[i])}</span>`));
  p.gm.forEach(i => tags.push(`<span class="badge gm" title="gap 人工编码">人工:${esc(D.gapManualLabels[i])}</span>`));
  return `<div class="post">
    <div class="meta"><span class="badge src" style="background:${s.color}">${esc(s.label)}</span>${p.k==='title'?`<span class="badge tonly" title="${esc(D.via[p.s]||'')}；只有标题，没有正文">仅标题（无正文）</span>`:SRC[p.s]&&SRC[p.s].supp?`<span class="badge prov" title="${esc(D.via[p.s]||'')}">经 sov2ex 获取</span>`:''}<span>${esc(p.d||(p.k==='title'?'无发帖日期':'日期未知'))}</span>${oldBadge(p)}
      <span class="emo" title="情绪强度 ${p.e}/3">${emo}</span>${p.v>=0?`<span>${esc(D.voices[p.v])}</span>`:''}${p.lk!=null?`<span>赞 ${fmt(p.lk)} · 浏览 ${fmt(p.vw??0)}</span>`:''}
      <a href="${esc(p.u)}" target="_blank" rel="noopener">原帖 ↗</a><span class="small">${esc(p.i)}</span></div>
    <div class="txt">${p.k==='title'?'<span class="tlab">标题：</span>':''}${hl(p.t, terms)}</div>
    ${p.c ? `<div class="ctx">${esc(s.ctx||'')}${esc(p.c)}</div>` : ''}
    <div class="tags">${tags.join('')}</div></div>`;
}
function bindThemeBadges(root){ root.querySelectorAll('.badge.th').forEach(b => b.onclick = () => { selTheme = b.dataset.th; themeView = 'theme'; showTab('themes'); dirty.add('themes'); render('themes'); }); }
// paginated mini list
function miniList(el, posts, title, explorerPatch, per=15){
  let page = 1;
  const draw = () => {
    const pages = Math.max(1, Math.ceil(posts.length / per));
    const slice = posts.slice((page-1)*per, page*per);
    el.innerHTML = `<div class="ctrl"><b>${title}</b><span class="small">共 ${fmt(posts.length)} 条</span>
      ${explorerPatch ? '<button class="btn pri" data-x="1">在「原帖浏览」中打开 →</button>' : ''}</div>
      ${slice.length ? slice.map(p => postHTML(p)).join('') : '<div class="empty">没有符合条件的帖子</div>'}
      ${pages > 1 ? `<div class="pager"><button class="btn" data-p="-1" ${page<=1?'disabled':''}>上一页</button> 第 ${page} / ${pages} 页 <button class="btn" data-p="1" ${page>=pages?'disabled':''}>下一页</button></div>` : ''}`;
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { page += +b.dataset.p; draw(); });
    const x = el.querySelector('[data-x]'); if (x) x.onclick = () => openExplorer(explorerPatch);
    bindThemeBadges(el);
  };
  draw();
}
const oldBadge = p => { const m = /(\d{4})/.exec(p.d||''); return m && +m[1] < 2020 ? ` <span class="badge old" title="发布于 2020 年以前，所述规则和情况可能已变化">旧帖 · ${m[1]}</span>` : ''; };
const sortByDate = arr => arr.slice().sort((a,b) => (b.d||'').replace('≈','').localeCompare((a.d||'').replace('≈','')));




// 不做「学校/专业」这类笼统词云，而是统计「大家在问什么」话题短语（帖子级去重）
const WC_TOPICS = [
  { name: '秋招/春招 0 offer', cat: '求职就业', q: '秋招 0offer', re: /0\s*offer|秋招|春招|校招|投递.{0,10}(没|无|0)|笔试没过|面试挂/i },
  { name: '找不到实习/没实习经历', cat: '求职就业', q: '实习', re: /找不到实习|没有实习|没实习|实习经历|第一份实习|暑期实习/ },
  { name: '找工作/就业焦虑', cat: '求职就业', q: '找工作', re: /找不到工作|找工作|就业焦虑|毕业.*(工作|就业)|工作不好找/ },
  { name: 'offer/去向怎么选', cat: '求职就业', q: 'offer 选择', re: /offer|去向|签哪|选哪家|大厂还是|薪资|毁约|三方/i },
  { name: '考研还是就业', cat: '升学岔路', q: '考研 就业', re: /考研还是|保研还是|读研还是|升学还是|考研.*就业|就业.*考研/ },
  { name: '考研失利/二战还是工作', cat: '升学岔路', q: '二战 考研', re: /考研失败|考研失利|二战|调剂|一志愿|上岸/ },
  { name: '保研/夏令营/预推免', cat: '升学岔路', q: '保研', re: /保研|夏令营|预推免|九推|推免|保研边缘/ },
  { name: '不知道学什么/方向迷茫', cat: '方向迷茫', q: '迷茫 方向', re: /不知道学什么|不知道做什么|不知道适合|方向迷茫|职业规划|选什么方向|学什么好/ },
  { name: '专业不喜欢/转专业', cat: '方向迷茫', q: '转专业', re: /转专业|选错专业|不喜欢.*专业|专业不对口|跨专业|转码/ },
  { name: '双非/第一学历被筛', cat: '学历出身', q: '双非', re: /双非|第一学历|隐性歧视|学历歧视|被筛|学历不行/ },
  { name: '专科/专升本出路', cat: '学历出身', q: '专升本', re: /专升本|专科生|专科|升本/ },
  { name: '导师/论文/延毕卡住', cat: '学业制度', q: '导师 论文', re: /导师不放|导师|延毕|毕业论文|论文没过|导师不管/ },
  { name: '挂科/补考/重修', cat: '学业制度', q: '挂科', re: /挂科|补考|重修|学业预警/ },
  { name: '室友矛盾/被孤立', cat: '关系心理', q: '室友', re: /室友|宿舍矛盾|寝室矛盾|被孤立|舍友|相处不来/ },
  { name: '宿舍条件/学校管理吐槽', cat: '校园生活', q: '宿舍 食堂', re: /宿舍(?!矛盾)|早八|签到|查寝|宿管|学校管理|形式主义|军训|食堂|教务|澡堂|断网|停电/ },
  { name: '焦虑/抑郁/心理健康', cat: '关系心理', q: '焦虑 抑郁', re: /抑郁|焦虑症|确诊|心理咨询|自杀|躯体化|休学|复学|崩了|崩溃|内耗|失眠/ },
  { name: '孤独/意义感缺失', cat: '关系心理', q: '孤独 意义', re: /孤独|没意思|没有意义|后悔读|空虚|无助/ },
  { name: '迷茫（情绪表达）', cat: '方向迷茫', q: '迷茫', re: /很迷茫|好迷茫|有点迷茫|迷茫期|好焦虑|很焦虑|好慌/ },
  { name: '考公考编/求稳', cat: '求职就业', q: '考公', re: /考公|考编|体制内|事业单位|公务员|求稳/ },
  { name: '父母期待/家庭压力', cat: '关系心理', q: '父母', re: /父母|家里|家庭期待|家境|催我|逼我/ },
  { name: '大厂/互联网/外包', cat: '求职就业', q: '大厂', re: /大厂|互联网|外包|裁员|35岁|内卷/ },
  { name: '研究生压力', cat: '学业制度', q: '研究生', re: /研究生|读研|课题组|老板不放|硕/ },
];

function buildQuestionCloudData(posts, limit = 36){
  const items = posts.filter(p => p.t);
  if (!items.length) return [];
  const scored = WC_TOPICS.map(topic => {
    let n = 0;
    const samples = [];
    for (const p of items) {
      const t = String(p.t);
      if (!topic.re.test(t)) continue;
      n++;
      if (samples.length < 2) samples.push(t.length > 60 ? t.slice(0, 60) + '…' : t);
    }
    return { name: topic.name, value: n, cat: topic.cat, q: topic.q, samples };
  }).filter(d => d.value >= 5)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
  return scored;
}

function renderWordCloud(el, posts){
  const data = buildQuestionCloudData(posts, 36);
  const c = chartOf(el);
  if (!data.length) {
    c.clear();
    c.setOption({title:{text:'当前筛选下暂无足够文本生成问题词云',left:'center',top:'middle',textStyle:{color:'#94a3b8',fontSize:14,fontWeight:400}}});
    return c;
  }
  // 顶部分类汇总：最多被问到的方向
  const byCat = new Map();
  data.forEach(d => byCat.set(d.cat, (byCat.get(d.cat) || 0) + d.value));
  const catTop = [...byCat.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 4).map(([k,v]) => `${k} ${fmt(v)}`);
  const hint = el.parentElement && el.parentElement.querySelector('.wc-summary');
  if (hint) hint.textContent = '最多被问到的方向：' + catTop.join(' · ') + '（字号=相关帖数；点击某话题可去原帖浏览）';

  const catColor = {
    '求职就业':'#2563eb', '升学岔路':'#7c3aed', '方向迷茫':'#d97706',
    '学历出身':'#ea580c', '学业制度':'#0891b2', '关系心理':'#db2777', '校园生活':'#059669'
  };
  c.setOption({
    tooltip: {
      show: true,
      formatter: p => {
        const d = data.find(x => x.name === p.name) || p.data;
        const ex = (d.samples || []).map(s => '「' + s + '」').join('<br>');
        return `<b>${p.name}</b><br/>${d.cat || ''} · ${fmt(p.value)} 条帖子在讨论`
          + (ex ? '<br/><span style="color:#94a3b8">' + ex + '</span>' : '')
          + '<br/><span style="color:#64748b">点击查看原帖</span>';
      }
    },
    series: [{
      type: 'wordCloud',
      shape: 'circle',
      left: 'center', top: 'center',
      width: '98%', height: '92%',
      sizeRange: [16, 52],
      rotationRange: [0, 0],
      gridSize: 12,
      drawOutOfBound: false,
      textStyle: {
        fontFamily: 'ui-sans-serif, system-ui, "PingFang SC", "Noto Sans SC", sans-serif',
        fontWeight: 650,
        color: p => catColor[(data.find(x => x.name === p.name)||{}).cat] || '#334155'
      },
      emphasis: { focus: 'self', textStyle: { shadowBlur: 8, shadowColor: 'rgba(15,23,42,.25)' } },
      data: data.map(d => ({ name: d.name, value: d.value, cat: d.cat, q: d.q, samples: d.samples }))
    }]
  }, true);
  c.off('click');
  c.on('click', e => {
    if (!e || !e.name) return;
    const d = data.find(x => x.name === e.name);
    if (!d) return;
    E.q = d.q; E.page = 1; E.themes = []; E.theme = '';
    showTab('explorer');
    toast('已按「' + d.name + '」相关关键词打开原帖浏览');
  });
  return c;
}



// ---------------- Overview ----------------
function renderOverview(){
  const el = $('#tab-overview'); const F = D.funnel, TT = D.totals, SH = D.share;
  const posts = GP.filter(p=>p.k==='post');
  const sum = (arr,k) => arr.reduce((s,f)=>s+f[k],0);
  const FH = F; // 全渠道主口径
  const bindK = () => { const b = el.querySelector('#ovBack'); if (b) b.onclick = () => { OV.view = 'main'; renderOverview(); }; };
  if (['v2ex','tieba'].includes(OV.view)) {
    el.innerHTML = `<div class="ovback"><button class="btn" id="ovBack">← 返回概览</button></div><div id="ovAlt"></div>`; bindK();
    ({v2ex: renderOvV2, tieba: renderOvTB})[OV.view]($('#ovAlt')); return;
  }
  const lead = G.themed ? themedBox() : '';
  el.innerHTML = lead + `
  <div class="card md conclusion">${md(D.sections.conclusion)}</div>
  <div class="grid g2 ov-split" style="margin-top:14px">
    <div class="card funnel-table-card">
      <h3>各来源处理漏斗</h3>
      <p class="hint">清洗后 = 去重、去表情码/链接、去广告后；降噪保留 = 通过噪声过滤 + 学生身份闸门（好心情/壹心理/B站专栏的最终数以全量人工判定为准）${hasTitles?'；百度贴吧（仅标题）：清洗后 = 去置顶/重复/空标题，规则相关 = 短文本规则保留，降噪保留 = 逐条人工通读后保留':''}</p>
      <div class="table-wrap">
        <table class="t" id="funnelT"><tr><th>来源</th><th class="num">原始</th><th class="num">清洗后</th><th class="num">规则相关</th><th class="num">降噪保留</th><th class="num">最终痛点集</th><th class="num">占比（主口径）</th></tr>
        ${F.map(f=>`<tr><td><span class="badge src" style="background:${SRC[f.src].color}">${SRC[f.src].label}</span></td><td class="num">${fmt(f.raw)}</td><td class="num">${fmt(f.cleaned)}</td><td class="num">${fmt(f.relevant)}</td><td class="num">${fmt(f.kept)}</td><td class="num"><b>${fmt(f.final)}</b></td><td class="num">${(SH.headline[f.src]!=null?SH.headline[f.src]+'%':'—')}</td></tr>`).join('')}
        <tr><td><b>合计（全渠道主口径）</b></td>${['raw','cleaned','relevant','kept','final'].map(k=>`<td class="num"><b>${fmt(sum(FH,k))}</b></td>`).join('')}<td class="num">100%</td></tr></table>
      </div>
    </div>
    <div class="card funnel-charts-card">
      <h3>来源分布（当前筛选）</h3>
      <p class="hint">完整占比见右侧图例；悬停扇区看名称，点击可打开原帖浏览</p>
      <div id="ovSrc" class="chart"></div>
      <h3 class="subchart">大家在问什么（问题话题云）</h3>
      <p class="hint wc-summary" style="color:var(--pri);font-weight:600"></p>
      <div id="ovFunnel" class="chart sm"></div>
    </div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>帖子年份 × 来源（当前筛选）</h3><p class="hint">X 以 2025–2026 为主（最早 2023）；保研论坛以 2017–2019 年旧帖为主；厅长信箱以 2011–2015 年旧信为主；大学生活质量指北为 2023–2026（问卷开始填写时间）；V2EX 以 2020 年前旧帖为主（打开 V2EX 可见）；"未知"多为豆瓣</p><div id="ovYear" class="chart"></div></div>
    <div class="card"><h3>情绪强度 & 语态（当前筛选）</h3><p class="hint">情绪强度 1–3 为规则判定；强度 3 建议"情绪先行"。X/心理站的强度 3 占比明显高于其他来源</p><div id="ovEmo" class="chart"></div></div>
  </div>
  <div class="card" style="margin-top:14px"><h3>各主题人工抽检精度</h3>
    <p class="hint">柱 = 清洗后精度估计（按条目来源分别估计再加权，算法见报告 1.4；括号为抽检样本 n），菱形 = 清洗前抽检精度；颜色 = 置信度。点击柱子 → 查看该主题</p>
    <div id="ovPrec" class="chart mid"></div></div>
    <div class="warn" style="margin-top:14px"><h3>⚠️ 数据局限</h3><ul>
    <li><b>来源偏差：</b>${SH.headline.collegeschat!=null?`主口径中最大来源是大学生活质量指北（${SH.headline.collegeschat}%），几乎全是对本校宿舍、食堂、管理、教学的吐槽，抬高了学校管理/生活条件类内容的比重（可在顶部关掉这个来源）；`:''}牛客占 ${SH.headline.nowcoder}%，偏求职与毕业季。人际、心理类主要来自 X、B站、虎扑和心理站，样本较少。好心情/壹心理/B站专栏量小，已全部人工判定。保研论坛占 ${SH.headline.eeban}%，几乎全是保研内容；厅长信箱占 ${SH.headline.sxjyt}%，多是行政投诉。</li>
    <li><b>X 的偏差：</b>${esc(SRC.x.note.replace(/^X：/,''))}</li>
    <li><b>保研论坛（eeban）：</b>${esc(SRC.eeban.note.replace(/^[^：]+：/,''))}</li>
    ${SRC.collegeschat?`<li><b>大学生活质量指北（CollegesChat）：</b>${esc(SRC.collegeschat.note.replace(/^[^：]+：/,''))}</li>`:''}
    ${SRC.sxjyt?`<li><b>厅长信箱（山西教育厅）：</b>${esc(SRC.sxjyt.note.replace(/^[^：]+：/,''))}</li>`:''}
    <li><b>V2EX（已计入主口径）：</b>${esc(SRC.v2ex.note.replace(/^V2EX（补充材料，默认不计入）：/,''))} 已并入主口径；可用顶部开关临时排除。</li>
    ${hasTitles?`<li><b>百度贴吧只有标题：</b>${esc(SRC.tieba.note.replace(/^[^：]+：/,''))} 共保留 ${fmt(D.totals.tieba)} 条（原始 ${fmt(D.tiebaStats.raw)} 条），人工抽检（分层随机）：最终保留的 ${D.tiebaStats.spot.final_kept[1]} 条中 ${D.tiebaStats.spot.final_kept[0]} 条确是学生本人的问题/痛点，被剔除的 ${D.tiebaStats.spot.final_dropped_ok[1]} 条中 ${D.tiebaStats.spot.final_dropped_ok[0]} 条剔除正确。默认不计入；顶部勾选"含百度贴吧标题（仅标题）"可加入。</li>`:''}
    <li><b>未覆盖平台：</b>小红书、抖音、微博未覆盖；知乎已纳入新抓取样本（见漏斗）；百度贴吧正文被拦${hasTitles?'，只用了标题（见上一条）':'，按约定<b>未纳入</b>'}。</li>
    <li><b>自动分类经人工抽检：</b>噪声抽检精度：X 关键词检索 ${D.precSrc.x}（随机抽检），X 定向检索 ${D.precSrc.x2}（全部 ${D.precSrc.x2_n} 条逐条通读），保研论坛 ${D.precSrc.eeban}（相关帖全部逐条通读，另有 ${D.precSrc.eeban_rest} 条被学生身份闸门误拦、已人工放回），厅长信箱 ${D.precSrc.sxjyt}（相关来信 ${D.precSrc.sxjyt_n} 封全部逐条通读，另有 ${D.precSrc.sxjyt_rest} 封被规则误拦、已人工放回），大学生活质量指北规则通过的随机抽检 ${D.precSrc.cc}（开头有吐槽用语的 ${D.precSrc.cc_head}；开头没有吐槽用语的 ${D.precSrc.cc_read} 条全部逐条通读，开头有吐槽用语的 ${fmt(D.precSrc.cc_unread)} 条未逐条通读；自动主题只保留抽检可用的 T27、T10、T23、T24），V2EX 闸门后 ${D.precSrc.v2ex}；每个主题都做了人工抽检（见下方精度图和"痛点主题"详情）。场景已按 23 类产品分类表重标（可多选）；阶段/类型/gap 仍为规则标签，召回有限、可多选。</li>
  </ul></div>`;
  // word cloud (under pie on the right) — 当前筛选正文/标题高频词
  const fc = renderWordCloud($('#ovFunnel'), GP);
  requestAnimationFrame(() => { fc.resize(); const sc0 = echarts.getInstanceByDom($('#ovSrc')); if (sc0) sc0.resize(); });
  // source donut — legend on right to avoid label pile-up on small slices
  const bySrc = {}; GP.forEach(p => bySrc[p.s] = (bySrc[p.s]||0)+1);
  const srcTotal = Object.values(bySrc).reduce((a,b)=>a+b,0) || 1;
  const srcData = Object.keys(bySrc)
    .map(s => ({name:SRC[s].label, value:bySrc[s], src:s, itemStyle:{color:SRC[s].color}}))
    .sort((a,b) => b.value - a.value);
  const sc = chartOf($('#ovSrc'));
  sc.setOption({
    tooltip:{trigger:'item', formatter:p=>`${p.name}：${fmt(p.value)} 条（${p.percent}%）`},
    legend:{
      type:'scroll', orient:'vertical', right:8, top:'middle',
      height:'90%', itemWidth:10, itemHeight:10, itemGap:10,
      textStyle:{fontSize:12, color:'#2d3433', lineHeight:18},
      pageIconSize:10, pageTextStyle:{fontSize:11},
      formatter: name => {
        const d = srcData.find(x => x.name === name);
        if (!d) return name;
        const pct = (d.value / srcTotal * 100).toFixed(1);
        const short = name.length > 12 ? name.slice(0, 11) + '…' : name;
        return short + '  ' + fmt(d.value) + ' · ' + pct + '%';
      }
    },
    series:[{
      type:'pie', radius:['44%','70%'], center:['32%','50%'],
      label:{show:false},
      labelLine:{show:false},
      emphasis:{
        scale:true, scaleSize:6,
        label:{show:true, formatter:'{b}\n{d}%', fontSize:13, fontWeight:600, color:'#0f172a', lineHeight:18}
      },
      data:srcData
    }]
  }, true);
  sc.off('click'); sc.on('click', e => { if (e && e.data && e.data.src) openExplorer({src:e.data.src}); });
  // year
  const years = [...new Set(GP.map(yearOf))].sort((a,b)=> a==='未知'?1:b==='未知'?-1:a.localeCompare(b));
  const yc = chartOf($('#ovYear'));
  yc.setOption({tooltip:{trigger:'axis',axisPointer:{type:'shadow'}}, legend:{top:0}, grid:{left:44,right:10,top:34,bottom:28},
    xAxis:{type:'category',data:years}, yAxis:{type:'value'},
    series:Object.keys(bySrc).map(s=>({name:SRC[s].label,type:'bar',stack:'a',itemStyle:{color:SRC[s].color},data:years.map(y=>GP.filter(p=>p.s===s&&yearOf(p)===y).length)}))}, true);
  // emotion + voice
  const ec = chartOf($('#ovEmo'));
  const emoN = [1,2,3].map(e=>GP.filter(p=>p.e===e).length);
  const vN = D.voices.map((v,i)=>posts.filter(p=>p.v===i).length);
  ec.setOption({tooltip:{trigger:'item'}, grid:[{left:70,right:'55%',top:30,bottom:30},{left:'58%',right:20,top:30,bottom:30}],
    title:[{text:'情绪强度',left:'18%',top:0,textStyle:{fontSize:13}},{text:'语态',left:'72%',top:0,textStyle:{fontSize:13}}],
    xAxis:[{type:'value',gridIndex:0},{type:'value',gridIndex:1}],
    yAxis:[{type:'category',data:['1 平静','2 中等','3 强烈'],gridIndex:0},{type:'category',data:D.voices,gridIndex:1,axisLabel:{fontSize:11}}],
    series:[{type:'bar',data:emoN.map((v,i)=>({value:v,itemStyle:{color:['#fca5a5','#f87171','#dc2626'][i]}})),label:{show:true,position:'right',formatter:p=>`${fmt(p.value)} (${pct(p.value/Math.max(1,GP.length))})`},xAxisIndex:0,yAxisIndex:0},
            {type:'bar',data:vN,itemStyle:{color:'#2563eb'},label:{show:true,position:'right'},xAxisIndex:1,yAxisIndex:1}]});
  // precision
  const ths = D.themes.slice().sort((a,b)=>b.est-a.est);
  const pc = chartOf($('#ovPrec'));
  pc.setOption({tooltip:{trigger:'axis',axisPointer:{type:'shadow'},formatter:ps=>{const t=TH[ths[ps[0].dataIndex].code];return `<b>${esc(t.full)}</b><br>清洗前抽检精度 ${t.pb!=null?pct(t.pb):'—'}；清洗后精度估计 ${pct(t.prec)}（抽检 n=${t.nchk}）<br>主口径 ${t.n} 条 · 估计有效 ≈${Math.round(t.est)} · 置信：${t.conf}`;}},
    grid:{left:40,right:20,top:20,bottom:110}, xAxis:{type:'category',data:ths.map(t=>t.code+' '+short(t.name,8)),axisLabel:{rotate:50,fontSize:11,interval:0}},
    yAxis:{type:'value',max:1,axisLabel:{formatter:v=>pct(v)}},
    series:[{name:'清洗后精度',type:'bar',data:ths.map(t=>({value:t.prec,itemStyle:{color:CONFC[t.conf]||'#999'}})),label:{show:true,position:'top',fontSize:10,formatter:p=>`${pct(p.value)}\n(n=${ths[p.dataIndex].nchk})`}},
      {name:'清洗前精度',type:'scatter',symbol:'diamond',symbolSize:9,itemStyle:{color:'#111827'},data:ths.map(t=>t.pb)}]});
  pc.off('click'); pc.on('click', e => { selTheme = ths[e.dataIndex].code; dirty.add('themes'); showTab('themes'); });
  bindK();
}
// ---- overview: V2EX / 贴吧 说明 panels (opened from the 说明 buttons next to the toggles) ----
function themedBox(){
  const base = P.filter(p => gbase(p) && p.k === 'post'); const th = base.filter(p => p.th), un = base.filter(p => !p.th);
  const rs = D.unthemedReasons.map((l,i) => [l, un.filter(p => p.ur === i).length]).filter(r => r[1]).sort((a,b) => b[1]-a[1]);
  const bs = {}; base.forEach(p => { const o = bs[p.s] = bs[p.s] || {n:0, u:0}; o.n++; if (!p.th) o.u++; });
  const top = Object.entries(bs).filter(([s,o]) => o.n >= 20).sort((a,b) => b[1].u/b[1].n - a[1].u/a[1].n).slice(0,2);
  return `<div class="card ovnote"><h3>当前视图：只看进入主题的痛点帖</h3>
    <p>当前筛选下共有 <b>${fmt(base.length)}</b> 条痛点帖，其中 <b>${fmt(th.length)}</b> 条（${pct(th.length/Math.max(1,base.length))}）被归入 ${D.themes.length} 个痛点主题之一。这个视图把其余 <b>${fmt(un.length)}</b> 条没有归入主题的帖子排除，<b>所有页面</b>（热力图、学生类型、原帖浏览等）都只统计这 ${fmt(th.length)} 条。点顶部筛选条里的 × 可以恢复。</p>
    <p><b>为什么有帖子没进主题：</b></p><ul>${rs.map(([l,n]) => `<li>${esc(l)}：${fmt(n)} 条</li>`).join('')}</ul>
    <p class="small">这些帖子仍然是学生痛点，只是没有落到某个主题里。按主题看问题时这个视图更干净，但各来源未进主题的比例不同${top.length ? `（当前比例最高：${top.map(([s,o]) => `${esc(SRC[s].label)} ${pct(o.u/o.n)}`).join('、')}）` : ''}，所以来源占比会和主口径不同。</p></div>`;
}
function renderOvV2(box){
  const V = P.filter(p => p.s === 'v2ex' && gnosrc(p) && (!G.themed || p.th));
  const M = P.filter(p => !SRC[p.s].supp && gnosrc(p) && (!G.themed || p.th));  // 主口径对照
  const f = D.funnel.find(x => x.src === 'v2ex') || {};
  const cs = D.stypes.indexOf('计算机/理工科');
  const shareCS = a => a.filter(p => p.ty.includes(cs)).length / Math.max(1, a.length);
  const old = a => a.filter(p => { const y = yearOf(p); return y !== '未知' && +y < 2020; }).length / Math.max(1, a.length);
  box.innerHTML = `<div class="grid g2">
    <div class="card"><h3>V2EX 补充材料是什么</h3>
      <p>${esc(SRC.v2ex.note.replace(/^[^：]+：/,''))}</p>
      <p class="small"><b>获取方式：</b>${esc(D.via.v2ex || '')}</p>
      <p class="small"><b>筛选过程：</b>原始 ${fmt(f.raw)} 条 → 清洗后 ${fmt(f.cleaned)} → 规则相关 ${fmt(f.relevant)} → 降噪 + 学生身份闸门后 ${fmt(f.kept)} → 最终 ${fmt(f.final)} 条；闸门后人工抽检精度 ${esc(D.precSrc.v2ex)}。</p>
      <p class="small"><b>是否计入：</b>默认<b>不计入</b>主口径和任何图表；${hasSupp() ? '<b>目前已勾选"含 V2EX 补充材料"</b>，其他页面也包含这些帖子。' : '勾选顶部"含 V2EX 补充材料"才会加入其他页面。'}本页下面的数字只看 V2EX（仍按阶段/学生类型筛选）。</p>
      <p class="small"><b>偏差（当前筛选，实时计算）：</b>带"计算机/理工科"标签的占 ${pct(shareCS(V))}（主口径 ${pct(shareCS(M))}）；2020 年以前的帖子占 ${pct(old(V))}（主口径 ${pct(old(M))}）。</p></div>
    <div class="card"><h3>V2EX 帖子的主题分布（当前筛选 ${fmt(V.length)} 条）</h3><div id="v2Th" class="chart"></div></div></div>
  <div class="grid g3" style="margin-top:14px">
    <div class="card"><h3>阶段（多选）</h3><div id="v2St" class="chart sm"></div></div>
    <div class="card"><h3>学生类型（多选，前 8）</h3><div id="v2Ty" class="chart sm"></div></div>
    <div class="card"><h3>发帖年份</h3><div id="v2Yr" class="chart sm"></div></div></div>
  <div class="card" id="v2Posts" style="margin-top:14px"></div>`;
  const bar = (el, labels, vals, color, horiz) => chartOf(el).setOption({tooltip:{trigger:'axis',axisPointer:{type:'shadow'}}, grid:{left:10,right:40,top:10,bottom:10,containLabel:true},
    xAxis: horiz ? {type:'value'} : {type:'category',data:labels,axisLabel:{fontSize:10,interval:0,rotate:labels.length>7?40:0}},
    yAxis: horiz ? {type:'category',data:labels,axisLabel:{fontSize:11,interval:0}} : {type:'value'},
    series:[{type:'bar',data:vals,itemStyle:{color},label:{show:true,position:horiz?'right':'top',fontSize:10}}]}, true);
  const tc = {}; V.forEach(p => { const k = p.th || '__none'; tc[k] = (tc[k]||0)+1; });
  const te = Object.entries(tc).sort((a,b) => a[1]-b[1]);
  bar($('#v2Th'), te.map(([k]) => k === '__none' ? '未归入主题' : tlabel(k)), te.map(e => e[1]), SRC.v2ex.color, true);
  bar($('#v2St'), D.stages.concat([STAGE_NONE]).map(s=>s.replace('/准大学生','').replace('/毕业季','').replace('阶段','')), D.stages.map((s,i)=>V.filter(p=>p.st.includes(i)).length).concat([V.filter(p=>!p.st.length).length]), '#2563eb');
  const ty = D.stypes.map((s,i)=>[s, V.filter(p=>p.ty.includes(i)).length]).filter(e=>e[1]).sort((a,b)=>b[1]-a[1]).slice(0,8).reverse();
  bar($('#v2Ty'), ty.map(e=>e[0]), ty.map(e=>e[1]), '#0ea5e9', true);
  const ys = [...new Set(V.map(yearOf))].sort((a,b)=> a==='未知'?1:b==='未知'?-1:a.localeCompare(b));
  bar($('#v2Yr'), ys, ys.map(y=>V.filter(p=>yearOf(p)===y).length), '#64748b');
  miniList($('#v2Posts'), sortByDate(V), 'V2EX 补充材料的帖子（当前阶段/类型筛选，按日期倒序）', null);
}
function renderOvTB(box){
  const T = D.tiebaStats, f = D.funnel.find(x => x.src === 'tieba') || {};
  const st = p => { if (G.stage !== '') { if (G.stage === '-1') { if (p.st.length) return false; } else if (!p.st.includes(+G.stage)) return false; } return G.type === '' || p.ty.includes(+G.type); };
  const V = P.filter(p => p.s === 'tieba' && st(p) && (!G.themed || p.th));
  const sp = T.spot, fr = a => `${a[0]}/${a[1]}（${pct(a[0]/a[1])}）`;
  const nTh = V.filter(p => p.th).length;
  box.innerHTML = `<div class="grid g2">
    <div class="card"><h3>百度贴吧标题补充是什么</h3>
      <p>${esc(SRC.tieba.note.replace(/^[^：]+：/,''))}</p>
      <p class="small"><b>获取方式：</b>${esc(D.via.tieba || '')}。每条只有<b>标题 + 原帖链接</b>，没有正文、没有发帖日期、没有回复。</p>
      <p class="small"><b>筛选过程：</b>原始 ${fmt(T.raw)} 条 → 去掉置顶/公告、重复链接、空标题和重复标题后 ${fmt(T.cleaned)} → 短文本规则保留 ${fmt(T.rule_keep)}（去广告/代写/卖课/招聘、资料资讯帖、水帖闲聊、高考志愿，并要求标题里有学生本人的问题或痛点信号） → <b>逐条人工通读后保留 ${fmt(T.final)} 条</b>。</p>
      <p class="small"><b>人工抽检：</b>规则单独用精度不够：规则留下的 ${fmt(T.rule_keep)} 条逐条通读后只保留 ${fmt(T.final)} 条（${pct(T.final/T.rule_keep)}）。通读标准：专业类吧要能看出是学生，室友吐槽要能看出是宿舍/学校情境（合租、职场室友不收），复读吧里的高考复读按高考志愿剔除。最终集合分层随机抽 ${sp.final_kept[1]} 条：${fr(sp.final_kept)} 合格。被剔除的标题分层随机抽 ${sp.final_dropped_ok[1]} 条：${fr(sp.final_dropped_ok)} 剔除正确（漏掉的是没有明显痛点词的真实求助，说明召回有限）。</p>
      <p class="small"><b>是否计入：</b>默认<b>不计入</b>主口径和任何图表；${hasTB() ? '<b>目前已勾选"含百度贴吧标题（仅标题）"</b>，其他页面也包含这些标题。' : '勾选顶部"含百度贴吧标题（仅标题）"才会加入其他页面。'}本页下面的数字只看贴吧标题（仍按阶段/学生类型筛选）。</p>
      <p class="small"><b>只有标题意味着：</b>主题、阶段、场景、学生类型只按标题本身能看出的内容标注，看不出就留空（当前 ${fmt(V.length)} 条中 ${fmt(nTh)} 条能归入主题）；没有日期，所以不进年份图；标题<b>不当作原话引用</b>，"痛点主题"页的代表原话和场景代表帖都不会选用贴吧标题。</p></div>
    <div class="card"><h3>贴吧标题的主题分布（当前筛选 ${fmt(V.length)} 条）</h3><div id="tbTh" class="chart"></div></div></div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>各吧条数</h3><p class="hint">吧的质量评级来自贴吧清单的人工评估；大学生心理吧评为"水吧"，规则 + 人工后没有一条保留；四级、广东专插本、双学位、英语专业、汉语言文学、跨考等吧多是资料/流程帖，保留很少</p>
      <table class="t" id="tbBars"><tr><th>吧</th><th class="num">原始标题</th><th class="num">规则保留</th><th class="num">人工通读后保留</th><th class="num">当前筛选</th></tr>
      ${T.bars.map(b => `<tr><td>${esc(b.bar)}吧</td><td class="num">${fmt(b.raw)}</td><td class="num">${fmt(b.rule)}</td><td class="num"><b>${fmt(b.final)}</b></td><td class="num">${fmt(V.filter(p => p.c === b.bar + '吧').length)}</td></tr>`).join('')}
      <tr><td><b>合计</b></td><td class="num"><b>${fmt(T.raw)}</b></td><td class="num"><b>${fmt(T.rule_keep)}</b></td><td class="num"><b>${fmt(T.final)}</b></td><td class="num"><b>${fmt(V.length)}</b></td></tr></table></div>
    <div class="card"><h3>被剔除标题的原因（全部 ${fmt(T.raw - T.final)} 条）</h3>
      <table class="t" id="tbDrop"><tr><th>原因</th><th class="num">条数</th></tr>${T.reasons.map(r => `<tr><td>${esc(r.reason)}</td><td class="num">${fmt(r.n)}</td></tr>`).join('')}</table>
      <p class="small">逐条原因见 Excel"百度贴吧标题_剔除"页。</p></div></div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>阶段（按标题，多选）</h3><div id="tbSt" class="chart sm"></div></div>
    <div class="card"><h3>学生类型（按标题，多选，前 8）</h3><div id="tbTy" class="chart sm"></div></div></div>
  <div class="card" id="tbPosts" style="margin-top:14px"></div>`;
  const bar = (el, labels, vals, color, horiz) => chartOf(el).setOption({tooltip:{trigger:'axis',axisPointer:{type:'shadow'}}, grid:{left:10,right:40,top:10,bottom:10,containLabel:true},
    xAxis: horiz ? {type:'value'} : {type:'category',data:labels,axisLabel:{fontSize:10,interval:0,rotate:labels.length>7?40:0}},
    yAxis: horiz ? {type:'category',data:labels,axisLabel:{fontSize:11,interval:0}} : {type:'value'},
    series:[{type:'bar',data:vals,itemStyle:{color},label:{show:true,position:horiz?'right':'top',fontSize:10}}]}, true);
  const tc = {}; V.forEach(p => { const k = p.th || '__none'; tc[k] = (tc[k]||0)+1; });
  const te = Object.entries(tc).sort((a,b) => a[1]-b[1]);
  bar($('#tbTh'), te.map(([k]) => k === '__none' ? '标题看不出主题' : tlabel(k)), te.map(e => e[1]), SRC.tieba.color, true);
  bar($('#tbSt'), D.stages.concat([STAGE_NONE]).map(s=>s.replace('/准大学生','').replace('/毕业季','').replace('阶段','')), D.stages.map((s,i)=>V.filter(p=>p.st.includes(i)).length).concat([V.filter(p=>!p.st.length).length]), '#2563eb');
  const ty = D.stypes.map((s,i)=>[s, V.filter(p=>p.ty.includes(i)).length]).filter(e=>e[1]).sort((a,b)=>b[1]-a[1]).slice(0,8).reverse();
  bar($('#tbTy'), ty.map(e=>e[0]), ty.map(e=>e[1]), '#0ea5e9', true);
  miniList($('#tbPosts'), V, '百度贴吧标题（仅标题，没有正文；当前阶段/类型筛选，按吧排列）', null);
}
function renderOvThemes(box){
  const cnt = {}; GP.forEach(p => { if (p.th) cnt[p.th] = (cnt[p.th]||0)+1; });
  const rows = D.themes.slice().sort((a,b) => (cnt[b.code]||0) - (cnt[a.code]||0)); const mx = Math.max(1, ...rows.map(t => cnt[t.code]||0));
  const one = t => { const d = (t.desc||'').split('痛在哪')[0].trim().replace(/[。；，\s]+$/,''); return short(d, 64); };
  box.innerHTML = `<div class="card"><h3>${D.themes.length} 个痛点主题（当前筛选条数）</h3><p class="hint">情境取自报告第 4 节每个主题的"情境"文字（截取第一句）；颜色 = 置信度。点击任一行 → 跳到"痛点主题"页查看该主题</p>
    <div class="ovlist">${rows.map(t => `<div class="ovrow" data-th="${t.code}" title="${esc(t.full)}">
      <div class="nm"><b>${esc(t.code)}</b> ${esc(t.name)}</div>
      <div class="bar"><span style="width:${(cnt[t.code]||0)/mx*100}%;background:${CONFC[t.conf]||'#999'}"></span><em>${fmt(cnt[t.code]||0)}</em></div>
      <div class="ds small">${esc(one(t))}</div></div>`).join('')}</div></div>`;
  box.querySelectorAll('[data-th]').forEach(r => r.onclick = () => { themeView = 'theme'; selTheme = r.dataset.th; dirty.add('themes'); showTab('themes'); });
}
function renderOvSit(box){
  const M = globalThis.__SIT_MATRIX__;
  if (!M || !(M.situations || []).length) {
    box.innerHTML = `<div class="card"><h3>「此刻的我」</h3><p class="hint">未加载成长全景矩阵</p></div>`;
    return;
  }
  const S = M.situations;
  box.innerHTML = `<div class="card"><h3>${S.length} 个「此刻的我」情境</h3>
    <p class="hint">按 6 成长主题 × 7 阶段重划（卡片格式同前）。点击一行 → 打开对应情境。</p>
    <div class="ovlist">${S.slice(0, 12).map(s => {
      const n = GP.filter(p => p.th && (s.themes || []).includes(p.th)).length;
      return `<div class="ovrow sit" data-sid="${s.id}">
        <div class="nm"><b>${esc(s.id)}</b> ${esc(s.name)} <span class="small">· ${esc(s.themeName)} / ${esc((s.stageName || '').replace(/^\d+\s*/, ''))} · 筛选 ${fmt(n)}</span></div>
        <div class="ds small">${esc(s.trigger)}</div>
      </div>`;
    }).join('')}${S.length > 12 ? `<p class="small">…共 ${S.length} 个，完整列表见「此刻的我」</p>` : ''}</div></div>`;
  box.querySelectorAll('[data-sid]').forEach(r => {
    r.onclick = () => {
      const s = S.find(x => x.id === r.dataset.sid);
      if (s) { SIT.theme = s.themeId; SIT.stage = s.stageId; }
      showTab('sit');
      requestAnimationFrame(() => {
        const c = document.getElementById('sit-' + r.dataset.sid);
        if (c) {
          window.scrollTo({ top: c.getBoundingClientRect().top + window.scrollY - 120 });
          c.classList.add('flash');
          setTimeout(() => c.classList.remove('flash'), 2200);
        }
      });
    };
  });
}




// ---------------- Themes ----------------
function renderThemes(){
  if (themeView === 'scene') return renderScenes();
  const el = $('#tab-themes');
  const cnt = {}; GP.forEach(p => { if (p.th) cnt[p.th] = (cnt[p.th]||0)+1; });
  const rows = D.themes.map(t => ({code:t.code, n:cnt[t.code]||0, est:(cnt[t.code]||0)*t.prec})).sort((a,b)=> themeMode==='n'? b.n-a.n : b.est-a.est);
  if (!selTheme || !TH[selTheme]) selTheme = rows[0].code;
  const nNo = GP.filter(p=>p.k==='post'&&!p.th).length;
  el.innerHTML = `<div class="grid g32">
    <div class="card"><h3>${D.themes.length} 个痛点主题（当前筛选）</h3>
      <div class="ctrl">${viewSeg()}<span class="seg"><button data-m="n" class="${themeMode==='n'?'on':''}">按条数</button><button data-m="est" class="${themeMode==='est'?'on':''}">按估计有效条数</button></span>
      <span class="small">估计有效 = 条数 × 清洗后精度；颜色 = 置信 <span style="color:#16a34a">■高</span> <span style="color:#d97706">■中</span> <span style="color:#dc2626">■低</span>；另有 ${fmt(nNo)} 条痛点帖未归入任何主题。点击柱子查看详情</span></div>
      <div id="thBar" class="chart tall"></div></div>
    <div class="card" id="thDetail"></div>
  </div>
  <div class="card" id="thPosts" style="margin-top:14px"></div>`;
  el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { themeMode = b.dataset.m; renderThemes(); }); bindViewSeg(el);
  const c = chartOf($('#thBar'));
  const r2 = rows.slice().reverse();
  c.setOption({tooltip:{trigger:'axis',axisPointer:{type:'shadow'},formatter:ps=>{const r=r2[ps[0].dataIndex],t=TH[r.code];return `<b>${esc(t.full)}</b><br>当前筛选：${fmt(r.n)} 条（主口径 ${t.n}，含 V2EX ${t.n_all}）<br>估计有效：≈${Math.round(r.est)} 条<br>精度 ${pct(t.prec)}（抽检 n=${t.nchk}）· 置信 ${t.conf}`;}},
    grid:{left:10,right:72,top:8,bottom:16,containLabel:true}, xAxis:{type:'value'},
    yAxis:{type:'category',data:r2.map(r=>tlabel(r.code)),axisLabel:{fontSize:14,interval:0,lineHeight:18}},
    series:[{type:'bar',barWidth:'78%',barCategoryGap:'18%',data:r2.map(r=>({value:themeMode==='n'?r.n:Math.round(r.est),itemStyle:{color:CONFC[TH[r.code].conf]||'#999',opacity:r.code===selTheme?1:.55,borderColor:r.code===selTheme?'#111827':'transparent',borderWidth:1.5}})),
      label:{show:true,position:'right',fontSize:13,fontWeight:600}}]}, true);
  c.off('click'); c.on('click', e => { selTheme = r2[e.dataIndex].code; renderThemes(); });
  // detail
  const t = TH[selTheme]; const tp = GP.filter(p=>p.th===selTheme);
  const bySrc = {}; tp.forEach(p=>bySrc[p.s]=(bySrc[p.s]||0)+1);
  $('#thDetail').innerHTML = `<h3>${esc(t.name)} <span class="badge c${t.conf}">置信：${t.conf}</span></h3>
    <div class="statrow">
      <div class="stat"><div class="n">${fmt(tp.length)}</div><div class="l">当前筛选条数</div></div>
      <div class="stat"><div class="n">${fmt(t.n)}</div><div class="l">主口径条数</div></div>
      <div class="stat"><div class="n">+${t.nv}</div><div class="l">V2EX（含则 ${t.n_all}）</div></div>
      ${hasTitles?`<div class="stat"><div class="n">+${P.filter(p=>p.k==='title'&&p.th===t.code).length}</div><div class="l">百度贴吧标题（仅标题，默认不计入）</div></div>`:''}
      <div class="stat"><div class="n">${pct(t.prec)}</div><div class="l">清洗后精度估计 (抽检 n=${t.nchk})</div></div>
      <div class="stat"><div class="n">${t.pb!=null?pct(t.pb):'—'}</div><div class="l">清洗前抽检精度</div></div>
      <div class="stat"><div class="n">≈${Math.round(t.est)}</div><div class="l">估计有效（主口径）</div></div></div>
    <div class="small">来源：${Object.entries(bySrc).sort((a,b)=>b[1]-a[1]).map(([s,n])=>`${SRC[s].label} ${n}`).join(' / ')||'—'}</div>
    ${t.desc?`<p><b>情境：</b>${esc(t.desc)}</p>`:''}
    <div id="thStage" class="chart sm"></div>
    <h4 style="margin:8px 0 2px">报告中的代表性原文</h4>
    ${t.quotes.length? t.quotes.map(q=>`<div class="quote">「${esc(q.t)}」<div class="by">—— ${esc(q.s)}，${esc(q.d)}，<a href="${esc(q.u)}" target="_blank" rel="noopener">原帖 ↗</a></div></div>`).join('') : '<div class="small">报告未为该主题单列原文。下方列表为该主题的全部帖子。</div>'}`;
  const stc = chartOf($('#thStage'));
  const stN = D.stages.map((s,i)=>tp.filter(p=>p.st.includes(i)).length).concat([tp.filter(p=>!p.st.length).length]);
  stc.setOption({title:{text:'该主题的阶段分布（多选）',textStyle:{fontSize:12},left:0}, tooltip:{trigger:'axis'}, grid:{left:36,right:10,top:30,bottom:40},
    xAxis:{type:'category',data:D.stages.concat([STAGE_NONE]).map(s=>s.replace('/准大学生','').replace('/毕业季','').replace('阶段','')),axisLabel:{fontSize:10,interval:0}}, yAxis:{type:'value'},
    series:[{type:'bar',data:stN,itemStyle:{color:'#2563eb'},label:{show:true,position:'top',fontSize:10}}]});
  miniList($('#thPosts'), sortByDate(tp), `「${esc(t.full)}」的帖子（当前筛选，按日期倒序）`, {themes:[selTheme]});
}



// ---------------- Themes tab: scene view ----------------
const viewSeg = () => `<span class="seg" id="thView"><button data-view="theme" class="${themeView==='theme'?'on':''}">痛点主题（${D.themes.length} 个）</button><button data-view="scene" class="${themeView==='scene'?'on':''}">场景（${D.scenes.length} 类）</button></span>`;
function bindViewSeg(el){ el.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { themeView = b.dataset.view; renderThemes(); }); }
// representative posts: 30–220 字、情绪强度≥2, newest first, taken round-robin across sources (rule-based, not hand-picked)
function repPosts(ps, k=5){
  const pool = sortByDate(ps.filter(p => p.k === 'post' && p.tl >= 30 && p.tl <= 220 && p.e >= 2));  // 贴吧标题（仅标题）不作代表帖
  const bySrc = {}; pool.forEach(p => (bySrc[p.s] = bySrc[p.s] || []).push(p));
  const order = Object.keys(bySrc).sort((a,b) => bySrc[b].length - bySrc[a].length); const out = [];
  for (let i = 0; out.length < k && order.some(s => bySrc[s].length > i); i++) order.forEach(s => { if (out.length < k && bySrc[s][i]) out.push(bySrc[s][i]); });
  return out;
}
function renderScenes(){
  const el = $('#tab-themes');
  const cnt = D.scenes.map((s,i) => ({i, l:s, n:GP.filter(p=>p.sc.includes(i)).length})).sort((a,b)=>b.n-a.n);
  if (selScene == null || !D.scenes[selScene]) selScene = cnt[0].i;
  const nNo = GP.filter(p=>!p.sc.length).length;
  el.innerHTML = `<div class="grid g32">
    <div class="card"><h3>${D.scenes.length} 类场景（当前筛选）</h3>
      <div class="ctrl">${viewSeg()}
      <span class="small">场景按统一分类表标注（可多选，如求职、宿舍、心理、方向迷茫等），<b>一条帖子可以有多个场景</b>，条数有重叠；另有 ${fmt(nNo)} 条帖子没有场景。点击柱子查看详情</span></div>
      <div id="scBar" class="chart tall"></div></div>
    <div class="card" id="scDetail"></div>
  </div>
  <div class="card" id="scPosts" style="margin-top:14px"></div>`;
  bindViewSeg(el);
  const c = chartOf($('#scBar')); const r2 = cnt.slice().reverse();
  c.setOption({tooltip:{trigger:'axis',axisPointer:{type:'shadow'},formatter:ps=>{const r=r2[ps[0].dataIndex];return `<b>${esc(r.l)}</b><br>当前筛选：${fmt(r.n)} 条（占当前样本 ${pct(r.n/Math.max(1,GP.length),1)}）`;}},
    grid:{left:10,right:72,top:8,bottom:16,containLabel:true}, xAxis:{type:'value'},
    yAxis:{type:'category',data:r2.map(r=>r.l),axisLabel:{fontSize:14,interval:0,lineHeight:18}},
    series:[{type:'bar',barWidth:'78%',barCategoryGap:'18%',data:r2.map(r=>({value:r.n,itemStyle:{color:'#0ea5e9',opacity:r.i===selScene?1:.5,borderColor:r.i===selScene?'#111827':'transparent',borderWidth:1.5}})),label:{show:true,position:'right',fontSize:13,fontWeight:600}}]}, true);
  c.off('click'); c.on('click', e => { selScene = r2[e.dataIndex].i; renderThemes(); });
  const name = D.scenes[selScene]; const sp = GP.filter(p=>p.sc.includes(selScene));
  const tally = f => { const m = {}; sp.forEach(p => f(p).forEach(k => m[k] = (m[k]||0)+1)); return Object.entries(m).sort((a,b)=>b[1]-a[1]); };
  const src = tally(p=>[p.s]), typ = tally(p=>p.ty).slice(0,6), ths = tally(p=>p.th?[p.th]:[]).slice(0,5);
  const desc = D.sceneDesc && D.sceneDesc[name];
  const rp = repPosts(sp);
  $('#scDetail').innerHTML = `<h3>${esc(name)} <span class="badge">可多选</span></h3>
    <div class="statrow">
      <div class="stat"><div class="n">${fmt(sp.length)}</div><div class="l">当前筛选条数</div></div>
      <div class="stat"><div class="n">${pct(sp.length/Math.max(1,GP.length),1)}</div><div class="l">占当前样本</div></div>
      <div class="stat"><div class="n">${fmt(sp.filter(p=>p.sc.length>1).length)}</div><div class="l">同时带其他场景</div></div></div>
    ${desc?`<p><b>情境：</b>${esc(desc)}</p>`:''}
    <div class="small"><b>来源：</b>${src.map(([s,n])=>`${SRC[s].label} ${n}`).join(' / ')||'—'}</div>
    <div class="small"><b>学生类型（正文自述，规则标签；前 6）：</b>${typ.map(([t,n])=>`${esc(D.stypes[+t])} ${n}`).join(' / ')||'—'}</div>
    <div class="small"><b>重叠最多的痛点主题：</b>${ths.length?ths.map(([t,n])=>`<span class="badge th" data-th="${t}" title="${esc(TH[t].full)}">${esc(tlabel(t))}</span> ${n} 条（${pct(n/Math.max(1,sp.length))}）`).join('；'):'—'}</div>
    <div id="scStage" class="chart sm"></div>
    <h4 style="margin:8px 0 2px">代表性原文 <span class="small">（选取规则：当前筛选下该场景中 30–220 字、情绪强度≥2 的帖子，按来源轮流取最新的一条，最多 5 条；自动选取，不是人工精选；不选用只有标题的百度贴吧条目）</span></h4>
    ${rp.length? rp.map(p=>`<div class="quote">「${esc(p.t)}」<div class="by">—— ${esc(SRC[p.s].label)}，${esc(p.d||'日期未知')}${oldBadge(p)}，<a href="${esc(p.u)}" target="_blank" rel="noopener">原帖 ↗</a></div></div>`).join('') : '<div class="small">当前筛选下没有符合选取规则的帖子。</div>'}`;
  bindThemeBadges($('#scDetail'));
  const stc = chartOf($('#scStage'));
  const stN = D.stages.map((s,i)=>sp.filter(p=>p.st.includes(i)).length).concat([sp.filter(p=>!p.st.length).length]);
  stc.setOption({title:{text:'该场景的阶段分布（多选）',textStyle:{fontSize:12},left:0}, tooltip:{trigger:'axis'}, grid:{left:36,right:10,top:30,bottom:40},
    xAxis:{type:'category',data:D.stages.concat([STAGE_NONE]).map(s=>s.replace('/准大学生','').replace('/毕业季','').replace('阶段','')),axisLabel:{fontSize:10,interval:0}}, yAxis:{type:'value'},
    series:[{type:'bar',data:stN,itemStyle:{color:'#0ea5e9'},label:{show:true,position:'top',fontSize:10}}]}, true);
  miniList($('#scPosts'), sortByDate(sp), `场景「${esc(name)}」的帖子（当前筛选，按日期倒序）`, {scene:String(selScene)});
}



// ---------------- Heatmap ----------------
HM = {row:'scene', val:'n', none:false, sel:null, intro:null};
function renderHeat(){
  const el = $('#tab-heat');
  const cols = D.stages.map((s,i)=>({k:i,l:s})); if (HM.none) cols.push({k:-1,l:STAGE_NONE});
  const rowsDef = HM.row==='scene' ? D.scenes.map((s,i)=>({k:i,l:s})) : D.themes.map(t=>({k:t.code,l:tlabel(t.code),full:t.full}));
  const rowOf = p => HM.row==='scene' ? p.sc : (p.th ? [p.th] : []);
  const colOf = p => p.st.length ? p.st : [-1];
  const M = {}; const rowTot = {}, colTot = {};
  GP.forEach(p => { const rs = rowOf(p), cs = colOf(p); cs.forEach(c => colTot[c] = (colTot[c]||0)+1); rs.forEach(r => { rowTot[r] = (rowTot[r]||0)+1; cs.forEach(c => { const k=r+'|'+c; M[k]=(M[k]||0)+1; }); }); });
  const rows = rowsDef.filter(r => rowTot[r.k]).sort((a,b)=> (rowTot[a.k]||0)-(rowTot[b.k]||0));
  const rowStageSum = r => cols.reduce((s,c)=>s+(M[r.k+'|'+c.k]||0),0);
  const data = []; let vmax = 0;
  rows.forEach((r,yi) => cols.forEach((c,xi) => { const n = M[r.k+'|'+c.k]||0; let v = n;
    if (HM.val==='col') v = colTot[c.k] ? n/colTot[c.k] : 0; else if (HM.val==='row') { const s=rowStageSum(r); v = s? n/s : 0; }
    vmax = Math.max(vmax, v); data.push([xi, yi, v, n]); }));
  // ---- short explanation for the selected metric (approved wording; numbers computed live from the current filters) ----
  function heatExplain(){
    const p1 = x => (x*100).toFixed(1) + '%';
    const isScene = HM.row === 'scene', rw = isScene ? '场景' : '主题';
    const sl = l => String(l).split('/')[0];   // 大四/毕业季 -> 大四, 入学前/准大学生 -> 入学前
    const staged = cols.filter(c => c.k !== -1 && colTot[c.k]);
    const findCol = re => staged.find(c => re.test(c.l));
    let cA = findCol(/^大一/), cB = findCol(/^大四/);
    if (!cA || !cB || cA === cB) { const s = staged.slice().sort((a,b)=>colTot[a.k]-colTot[b.k]); cA = s[0]; cB = s[s.length-1]; }
    const R = rows[rows.length-1], ok = !!(R && cA && cB && cA !== cB);
    const cell = (r, c) => M[r.k+'|'+c.k] || 0;
    const rn = !R ? '' : (isScene ? esc(sl(R.l).replace(/[:：]/g,'')) : `「${esc(R.full || R.l)}」`);   // 求职/秋招/offer -> 求职, 心理:焦虑/抑郁 -> 心理焦虑
    const rn2 = isScene ? rn : '这个主题';   // second mention
    let label, t;
    if (HM.val === 'n') {
      label = '条数';
      const [cBig, cSmall] = ok && colTot[cA.k] > colTot[cB.k] ? [cA, cB] : [cB, cA];   // larger stage first ("有"), smaller second ("只有")
      t = `每个格子是同时说到这个阶段和这个${rw}的帖子数，适合看哪些组合讨论得最多、点进去能读到多少原文。各年级的样本量差别很大，${ok ? `${esc(cBig.l)}有 ${fmt(colTot[cBig.k])} 条，${esc(cSmall.l)}只有 ${fmt(colTot[cSmall.k])} 条，` : ''}所以不能直接用条数比较哪个年级更痛。`;
    } else if (HM.val === 'col') {
      label = '占该阶段帖子比例';
      const pA = ok ? cell(R,cA)/colTot[cA.k] : 0, pB = ok ? cell(R,cB)/colTot[cB.k] : 0;
      // interpretive clause only for the 求职 scene row, 大一 vs 大四, same shape as the approved example:
      // already substantial in 大一 (>=20%), the top row of the 大四 column, and >=50% there.
      const topInB = ok && rows.every(r => cell(r,cB) <= cell(R,cB));
      const clause = ok && isScene && /^求职/.test(R.l) && /^大一/.test(cA.l) && /^大四/.test(cB.l) && pA >= 0.2 && pB >= 0.5 && pB > pA && topInB
        ? '，说明求职焦虑从大一就已经开始，到大四成了主要话题' : '';
      const small = staged.slice().sort((a,b)=>colTot[a.k]-colTot[b.k])[0];
      t = `这个年级的帖子里，有百分之多少在说这件事，适合横向比较各年级分别最关心什么。${ok ? `比如${esc(sl(cA.l))}有 ${p1(pA)} 的帖子在说${rn}，到${esc(sl(cB.l))}是 ${p1(pB)}${clause}。` : ''}样本很小的列${small ? `（比如${esc(sl(small.l))}只有 ${fmt(colTot[small.k])} 条）` : ''}比例容易大起大落，要结合条数一起看。`;
    } else {
      label = '行内阶段分布';
      const S = ok ? rowStageSum(R) : 0, tot = cols.reduce((s,c)=>s+(colTot[c.k]||0),0);
      const share = ok && S ? cell(R,cB)/S : 0, base = ok && tot ? colTot[cB.k]/tot : 0, b = ok ? esc(sl(cB.l)) : '';
      const ex = !ok ? '' : (share > base
        ? `比如${rn}这一行里${b}占 ${p1(share)}，高于${b}在全部帖子里的 ${p1(base)}，才说明${rn2}确实比较集中在${b}。`
        : `比如${rn}这一行里${b}占 ${p1(share)}，不高于整体（${b}在全部帖子里占 ${p1(base)}），说明它并不特别集中在${b}。`);
      t = `说这件事的帖子主要来自哪个年级，每一行加起来是 100%，适合看某个痛点集中在哪个阶段。读的时候要和这个阶段的整体占比对照。${ex}`;
    }
    return `<div class="hmExplain" id="hmExplain" data-val="${HM.val}" data-row="${HM.row}"><b>${label}：</b><span id="hmExample">${t}</span></div>`;
  }
  el.innerHTML = `<div class="card"><h3>年级（阶段）× ${HM.row==='scene'?'场景':'痛点主题'} 热力图（当前筛选）</h3>
    <div class="ctrl">行：<span class="seg"><button data-r="scene" class="${HM.row==='scene'?'on':''}">场景（${D.scenes.length} 类，可多选）</button><button data-r="theme" class="${HM.row==='theme'?'on':''}">痛点主题（${D.themes.length} 个）</button></span>
      数值：<span class="seg"><button data-v="n" class="${HM.val==='n'?'on':''}">条数</button><button data-v="col" class="${HM.val==='col'?'on':''}">占该阶段帖子比例</button><button data-v="row" class="${HM.val==='row'?'on':''}">行内阶段分布</button></span>
      <label class="toggle"><input type="checkbox" id="hmNone" ${HM.none?'checked':''}> 显示"${STAGE_NONE}"列</label></div>
    ${heatExplain()}
    <p class="hint">点击格子 → 下方列出对应帖子；鼠标悬停可见条数与比例的分子/分母。</p>
    <div id="hmWrap" style="position:relative"><div id="hmChart" class="chart" style="height:${Math.max(420, rows.length*26+90)}px"></div></div></div>
    <div class="card" id="hmPosts" style="margin-top:14px"><div class="empty">点击上方任意格子查看对应原帖</div></div>`;
  el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { HM.row=b.dataset.r; HM.sel=null; HM.intro=null; renderHeat(); });
  el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { HM.val=b.dataset.v; renderHeat(); });
  $('#hmNone').onchange = e => { HM.none = e.target.checked; renderHeat(); };
  const c = chartOf($('#hmChart'));
  const f = v => HM.val==='n' ? fmt(v) : pct(v, v<0.1?1:0);
  const den = (r, c) => HM.val==='col' ? `${esc(c.l)} 共 ${fmt(colTot[c.k]||0)} 条` : `该行阶段格子之和 ${fmt(rowStageSum(r))}`;
  c.setOption({tooltip:{formatter:p=>{const r=rows[p.data[1]], cc=cols[p.data[0]]; return `${esc(r.l)} × ${esc(cc.l)}<br>条数：<b>${fmt(p.data[3])}</b>${HM.val!=='n'?`<br>比例：${fmt(p.data[3])} / ${den(r,cc)} = <b>${(p.data[2]*100).toFixed(1)}%</b>`:''}`;}},
    grid:{left:10,right:80,top:10,bottom:50,containLabel:true},
    xAxis:{type:'category',data:cols.map(c=>c.l),position:'top',splitArea:{show:true},axisLabel:{interval:0}},
    yAxis:{type:'category',data:rows.map(r=>r.l),splitArea:{show:true},triggerEvent:true,axisLabel:{interval:0,fontSize:12}},
    visualMap:{dimension:2,min:0,max:vmax||1,calculable:true,orient:'vertical',right:0,top:'middle',inRange:{color:['#f8fafc','#93c5fd','#2563eb','#1e3a8a']},formatter:v=>f(v)},
    series:[{type:'heatmap',data,label:{show:true,fontSize:11,formatter:p=>p.data[3]?f(p.data[2]):''},emphasis:{itemStyle:{borderColor:'#111',borderWidth:1.5}}}]});
  c.off('click'); c.on('click', e => {
    if (e.componentType === 'yAxis') { const r = rows.find(x => x.l === e.value); if (!r) return;
      HM.intro = (HM.intro && HM.intro.row === HM.row && String(HM.intro.k) === String(r.k)) ? null : {row:HM.row, k:r.k, y:e.event.offsetY}; drawIntro(); return; }
    if (!e.data) return;
    HM.intro = null; drawIntro();
    const r = rows[e.data[1]], col = cols[e.data[0]]; HM.sel = {r, col}; showHeatPosts(); });
  // ---- row-label hover / click popover (theme rows: theme intro; scene rows: scene name + count, plus description once approved) ----
  const wrap = $('#hmWrap');
  const rowByLabel = v => rows.find(r => r.l === v);
  const tip = document.createElement('div'); tip.className = 'hmLabTip'; tip.style.display = 'none'; wrap.appendChild(tip);
  c.off('mouseover'); c.off('mouseout');
  c.on('mouseover', e => { if (e.componentType !== 'yAxis') return; const r = rowByLabel(e.value); if (!r) return;
    tip.textContent = (HM.row==='theme' ? TH[r.k].full : r.l) + '（点击查看说明）'; tip.style.left = (e.event.offsetX + 12) + 'px'; tip.style.top = (e.event.offsetY + 10) + 'px'; tip.style.display = 'block'; });
  c.on('mouseout', e => { if (e.componentType === 'yAxis') tip.style.display = 'none'; });
  function drawIntro(){
    const old = $('#hmIntro'); if (old) old.remove();
    if (!HM.intro || HM.intro.row !== HM.row) { HM.intro = null; return; }
    const r = rows.find(x => String(x.k) === String(HM.intro.k)); if (!r) { HM.intro = null; return; }
    const box = document.createElement('div'); box.className = 'hmIntro'; box.id = 'hmIntro';
    box.style.top = Math.max(0, HM.intro.y + 14) + 'px';
    if (HM.row === 'theme') {
      const t = TH[r.k];
      box.innerHTML = `<button class="x" id="hmIntroX" title="关闭 (Esc)">×</button><h4>${esc(t.full)}</h4>
        <div class="small">当前筛选下 <b>${fmt(rowTot[r.k]||0)}</b> 条 · 置信：${esc(t.conf)}</div>
        ${t.desc?`<p><b>情境：</b>${esc(t.desc)}</p>`:'<p class="small">该主题没有情境说明。</p>'}
        <button class="btn pri" id="hmIntroGo">在痛点主题页查看详情 →</button>`;
    } else {
      const desc = D.sceneDesc && D.sceneDesc[r.l];
      box.innerHTML = `<button class="x" id="hmIntroX" title="关闭 (Esc)">×</button><h4>场景：${esc(r.l)}</h4>
        <div class="small">当前筛选下 <b>${fmt(rowTot[r.k]||0)}</b> 条 · 可多选</div>
        ${desc?`<p><b>情境：</b>${esc(desc)}</p>`:''}
        <button class="btn pri" id="hmIntroGo">在痛点主题页查看该场景 →</button>`;
    }
    wrap.appendChild(box);
    $('#hmIntroX').onclick = ev => { ev.stopPropagation(); HM.intro = null; drawIntro(); };
    $('#hmIntroGo').onclick = () => { if (HM.row === 'theme') { themeView = 'theme'; selTheme = r.k; } else { themeView = 'scene'; selScene = r.k; } HM.intro = null; dirty.add('themes'); showTab('themes'); };
  }
  drawIntro();

  if (HM.sel) showHeatPosts(true);
  function showHeatPosts(quiet){
    const {r, col} = HM.sel;
    const ps = GP.filter(p => rowOf(p).includes(r.k) && colOf(p).includes(col.k));
    const patch = {stage: String(col.k)}; if (HM.row==='scene') patch.scene = String(r.k); else patch.themes = [r.k];
    miniList($('#hmPosts'), sortByDate(ps), `${esc(r.l)} × ${esc(col.l)}`, patch);
    if (!quiet) $('#hmPosts').scrollIntoView({behavior:'smooth', block:'start'});
  }
}



// ---------------- Student types ----------------
TY = { dim: 'type', mode: 'theme', view: 'pct', sel: null, topByType: null, top: null };
function renderTypes(){
  const el = $('#tab-types');
  if (!TY.mode) TY.mode = 'theme';
  if (TY.mode === 'theme' && TY.view === 'lift') TY.view = 'pct';
  const cats = TY.dim === 'type' ? D.stypes.map((s, i) => ({ k: i, l: s })) : D.tiers.map((s, i) => ({ k: i, l: s }));
  const has = (p, k) => TY.dim === 'type' ? p.ty.includes(k) : p.tr === k;
  const posts = GP.filter(p => p.k === 'post');
  const N = {}; cats.forEach(c => N[c.k] = posts.filter(p => has(p, c.k)).length);
  const cl = cats.filter(c => N[c.k] > 0).sort((a, b) => N[a.k] - N[b.k]);
  const unknown = posts.filter(p => TY.dim === 'type' ? !p.ty.length : p.tr < 0).length;
  const isScene = TY.mode === 'scene';
  const mainTitle = TY.view === 'lift' ? '类型 × 场景 提升度'
    : (isScene ? '各类型学生的场景构成' : '各类型学生的痛点构成');
  const viewBtns = isScene
    ? `<button data-w="pct" class="${TY.view==='pct'?'on':''}">场景构成 · 占比</button><button data-w="n" class="${TY.view==='n'?'on':''}">场景构成 · 条数</button><button data-w="lift" class="${TY.view==='lift'?'on':''}">场景提升度</button>`
    : `<button data-w="pct" class="${TY.view==='pct'?'on':''}">痛点构成 · 占比</button><button data-w="n" class="${TY.view==='n'?'on':''}">痛点构成 · 条数</button>`;
  const hint = TY.dim === 'type'
    ? '学生类型来自正文自述关键词，牛客另用公开卡片的学校层次；一条可属多个类型。'
    : '学校层次只来自牛客公开用户卡片（不含校名）。';
  const modeHint = isScene
    ? (TY.view === 'lift'
      ? '提升度 = 该类型提到某场景的比例 ÷ 全体比例，格子 n&lt;5 不着色。'
      : '场景可多选，一条帖可计入多个场景，故占比之和可超过 100%。每种场景固定颜色；每一行展开<strong>该类型</strong>命中最多的前 12 个场景，灰色为其余场景。')
    : '每种痛点主题固定一种颜色；每一行只展开<strong>该类型</strong>条数最多的前 12 个主题，灰色为该类型其余已归类主题（不是没分类）。';

  el.innerHTML = `<div class="card"><h3>学生类型差异（当前筛选）</h3>
    <div class="ctrl">维度：<span class="seg"><button data-d="type" class="${TY.dim==='type'?'on':''}">学生类型（正文自述 + 牛客卡片，可多选）</button><button data-d="tier" class="${TY.dim==='tier'?'on':''}">学校层次（仅牛客公开卡片）</button></span>
    分析：<span class="seg"><button data-m="theme" class="${!isScene?'on':''}">痛点主题（${D.themes.length} 个）</button><button data-m="scene" class="${isScene?'on':''}">场景（${D.scenes.length} 类）</button></span>
    视图：<span class="seg">${viewBtns}</span></div>
    <p class="hint">${hint}未能识别类型的痛点帖 ${fmt(unknown)} 条未计入。${modeHint}样本少（&lt;80 条）的类型只作方向参考。点击柱子/格子查看原帖。</p></div>
    <div class="grid g23" style="margin-top:14px">
      <div class="card"><h3>各类型条数</h3><div id="tyBar" class="chart" style="height:${Math.max(360, cl.length*28+60)}px"></div></div>
      <div class="card"><h3>${mainTitle}</h3><div id="tyMain" class="chart" style="height:${Math.max(460, cl.length*30+(TY.view==='lift'?160:120))}px"></div></div></div>
    <div class="card" id="tyPosts" style="margin-top:14px"><div class="empty">点击图中的类型查看对应原帖</div></div>`;

  el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { TY.dim = b.dataset.d; TY.sel = null; renderTypes(); });
  el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    TY.mode = b.dataset.m;
    if (TY.mode === 'theme' && TY.view === 'lift') TY.view = 'pct';
    TY.sel = null;
    renderTypes();
  });
  el.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { TY.view = b.dataset.w; renderTypes(); });

  const bc = chartOf($('#tyBar'));
  bc.setOption({tooltip:{trigger:'axis',axisPointer:{type:'shadow'}}, grid:{left:10,right:50,top:10,bottom:20,containLabel:true}, xAxis:{type:'value'},
    yAxis:{type:'category',data:cl.map(c=>c.l),axisLabel:{interval:0}}, series:[{type:'bar',data:cl.map(c=>N[c.k]),itemStyle:{color:'#0ea5e9'},label:{show:true,position:'right'}}]});
  bc.off('click'); bc.on('click', e => sel(cl[e.dataIndex]));

  const mc = chartOf($('#tyMain'));
  if (TY.view === 'lift') {
    const total = posts.length; const scN = D.scenes.map((s,i)=>posts.filter(p=>p.sc.includes(i)).length);
    const data = []; cl.forEach((c,yi) => { const ps = posts.filter(p=>has(p,c.k)); D.scenes.forEach((s,xi) => { const n = ps.filter(p=>p.sc.includes(xi)).length; const lift = (N[c.k] && scN[xi]) ? (n/N[c.k])/(scN[xi]/total) : 0; data.push([xi,yi, n>=5?+lift.toFixed(2):'-', n]); }); });
    mc.setOption({tooltip:{formatter:p=>`${esc(cl[p.data[1]].l)} × ${esc(D.scenes[p.data[0]])}<br>条数 ${p.data[3]} · 提升度 ${p.data[2]==='-'?'（n<5）':'×'+p.data[2]}`},
      grid:{left:10,right:70,top:10,bottom:10,containLabel:true},
      xAxis:{type:'category',data:D.scenes,axisLabel:{rotate:55,interval:0,fontSize:11}}, yAxis:{type:'category',data:cl.map(c=>c.l),axisLabel:{interval:0}},
      visualMap:{type:'piecewise',dimension:2,right:0,top:'middle',outOfRange:{color:'#ffffff'},pieces:[{lt:0.8,color:'#e0f2fe',label:'<0.8'},{gte:0.8,lt:1.2,color:'#f1f5f9',label:'0.8–1.2'},{gte:1.2,lt:2,color:'#fcd34d',label:'1.2–2'},{gte:2,lt:4,color:'#fb923c',label:'2–4'},{gte:4,color:'#dc2626',label:'≥4'}]},
      series:[{type:'heatmap',data,itemStyle:{borderColor:'#fff',borderWidth:1},label:{show:true,fontSize:10,formatter:p=>p.data[2]==='-'?'':Number(p.data[2]).toFixed(1)}}]}, true);
    mc.off('click'); mc.on('click', e => sel(cl[e.data[1]], null, e.data[0]));
  } else if (isScene) {
    // 场景构成：每类型各自 Top 12 场景；场景可多选
    const TOP_N = 12;
    const topByType = {};
    const globalCount = {};
    cl.forEach(c => {
      const cnt = {};
      posts.filter(p => has(p, c.k)).forEach(p => {
        (p.sc || []).forEach(i => {
          const key = String(i);
          cnt[key] = (cnt[key] || 0) + 1;
          globalCount[key] = (globalCount[key] || 0) + 1;
        });
      });
      topByType[c.k] = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, TOP_N);
    });
    TY.topByType = topByType;
    const union = Object.keys(globalCount).filter(k => cl.some(c => (topByType[c.k] || []).includes(k)))
      .sort((a, b) => (globalCount[b] || 0) - (globalCount[a] || 0));
    TY.top = union;
    const series = union.map(k => {
      const i = +k;
      return { code: k, name: short(D.scenes[i], 14), color: sceneColor(i), sceneIdx: i };
    }).concat([
      { code: '__other', name: '该类型其余场景', color: '#9ca3af' },
      { code: '__none', name: '未标场景', color: '#e5e7eb' },
    ]);
    const inTop = (c, key) => (topByType[c.k] || []).includes(key);
    const val = (c, s) => {
      const ps = posts.filter(p => has(p, c.k));
      let n = 0;
      if (s.code === '__none') n = ps.filter(p => !(p.sc || []).length).length;
      else if (s.code === '__other') n = ps.filter(p => (p.sc || []).length && (p.sc || []).every(i => !inTop(c, String(i)))).length;
      else if (inTop(c, s.code)) n = ps.filter(p => (p.sc || []).includes(s.sceneIdx)).length;
      return TY.view === 'pct' ? (N[c.k] ? n / N[c.k] : 0) : n;
    };
    const otherBreakdown = (c) => {
      const cnt = {};
      posts.filter(p => has(p, c.k)).forEach(p => {
        (p.sc || []).forEach(i => {
          if (!inTop(c, String(i))) cnt[i] = (cnt[i] || 0) + 1;
        });
      });
      const items = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([i, n]) => `${esc(short(D.scenes[+i], 12))} ${TY.view === 'pct' ? pct(n / Math.max(1, N[c.k]), 1) : fmt(n)}`);
      if (!items.length) return '';
      const mid = Math.ceil(items.length / 2);
      return items.slice(0, mid).join('；') + '<br>' + items.slice(mid).join('；');
    };
    const rowSums = cl.map(c => series.reduce((a, s) => a + (typeof val(c, s) === 'number' ? val(c, s) : 0), 0));
    const xMax = TY.view === 'pct' ? Math.max(1, Math.ceil(Math.max(...rowSums, 1) * 10) / 10) : null;
    mc.setOption({tooltip:{trigger:'axis',axisPointer:{type:'shadow'},confine:true,formatter:ps=>{
        const c = cl[ps[0].dataIndex];
        let html = `<b>${esc(ps[0].name)}</b>（${fmt(N[c.k])} 条 · 本行展开 Top ${TOP_N} 场景）<br>`;
        html += ps.filter(p => p.value > 0).map(p => `${p.marker}${esc(p.seriesName)}：${TY.view==='pct'?pct(p.value,1):fmt(p.value)}`).join('<br>');
        const ob = otherBreakdown(c);
        if (ob) html += `<br><span style="color:#6b7280;font-size:11px">灰色段相关：<br>${ob}</span>`;
        return html;
      }},
      legend:{top:0,type:'scroll',textStyle:{fontSize:11}}, grid:{left:10,right:20,top:60,bottom:20,containLabel:true},
      xAxis:{type:'value',max:xMax,axisLabel:{formatter:v=>TY.view==='pct'?pct(v):v}}, yAxis:{type:'category',data:cl.map(c=>c.l),axisLabel:{interval:0}},
      series:series.map(s=>({name:s.name,type:'bar',stack:'a',itemStyle:{color:s.color},data:cl.map(c=>val(c,s))}))}, true);
    mc.off('click'); mc.on('click', e => sel(cl[e.dataIndex], series[e.seriesIndex]));
  } else {
    // 痛点主题构成
    const TOP_N = 12;
    const topByType = {};
    const globalCount = {};
    cl.forEach(c => {
      const cnt = {};
      posts.filter(p => has(p, c.k) && p.th).forEach(p => {
        cnt[p.th] = (cnt[p.th] || 0) + 1;
        globalCount[p.th] = (globalCount[p.th] || 0) + 1;
      });
      topByType[c.k] = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, TOP_N);
    });
    TY.topByType = topByType;
    const union = Object.keys(globalCount).filter(code => cl.some(c => (topByType[c.k] || []).includes(code)))
      .sort((a, b) => (globalCount[b] || 0) - (globalCount[a] || 0));
    TY.top = union;
    const series = union.map(code => ({ code, name: tlabel(code), color: themeColor(code) }))
      .concat([
        { code: '__other', name: '该类型其余已归类主题', color: '#9ca3af' },
        { code: '__none', name: '未归入主题', color: '#e5e7eb' },
      ]);
    const inTop = (c, code) => (topByType[c.k] || []).includes(code);
    const val = (c, s) => {
      const ps = posts.filter(p => has(p, c.k));
      let n = 0;
      if (s.code === '__none') n = ps.filter(p => !p.th).length;
      else if (s.code === '__other') n = ps.filter(p => p.th && !inTop(c, p.th)).length;
      else n = inTop(c, s.code) ? ps.filter(p => p.th === s.code).length : 0;
      return TY.view === 'pct' ? (N[c.k] ? n / N[c.k] : 0) : n;
    };
    const otherBreakdown = (c) => {
      const cnt = {};
      posts.filter(p => has(p, c.k) && p.th && !inTop(c, p.th)).forEach(p => { cnt[p.th] = (cnt[p.th] || 0) + 1; });
      const items = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([code, n]) => `${esc(tlabel(code))} ${TY.view === 'pct' ? pct(n / Math.max(1, N[c.k]), 1) : fmt(n)}`);
      if (!items.length) return '';
      const mid = Math.ceil(items.length / 2);
      return items.slice(0, mid).join('；') + '<br>' + items.slice(mid).join('；');
    };
    mc.setOption({tooltip:{trigger:'axis',axisPointer:{type:'shadow'},confine:true,formatter:ps=>{
        const c = cl[ps[0].dataIndex];
        let html = `<b>${esc(ps[0].name)}</b>（${fmt(N[c.k])} 条 · 本行展开 Top ${TOP_N}）<br>`;
        html += ps.filter(p => p.value > 0).map(p => `${p.marker}${esc(p.seriesName)}：${TY.view==='pct'?pct(p.value,1):fmt(p.value)}`).join('<br>');
        const ob = otherBreakdown(c);
        if (ob) html += `<br><span style="color:#6b7280;font-size:11px">灰色段含：<br>${ob}</span>`;
        return html;
      }},
      legend:{top:0,type:'scroll',textStyle:{fontSize:11}}, grid:{left:10,right:20,top:60,bottom:20,containLabel:true},
      xAxis:{type:'value',max:TY.view==='pct'?1:null,axisLabel:{formatter:v=>TY.view==='pct'?pct(v):v}}, yAxis:{type:'category',data:cl.map(c=>c.l),axisLabel:{interval:0}},
      series:series.map(s=>({name:s.name,type:'bar',stack:'a',itemStyle:{color:s.color},data:cl.map(c=>val(c,s))}))}, true);
    mc.off('click'); mc.on('click', e => sel(cl[e.dataIndex], series[e.seriesIndex]));
  }

  if (TY.sel) sel(TY.sel.c, TY.sel.s, TY.sel.sc, true);
  function sel(c, s, scIdx, quiet){
    TY.sel = { c, s, sc: scIdx };
    let ps = posts.filter(p => has(p, c.k));
    let title = c.l;
    const patch = TY.dim === 'type' ? { type: String(c.k) } : { tier: String(c.k) };
    if (s) {
      const rowTop = (TY.topByType && TY.topByType[c.k]) || TY.top || [];
      if (TY.mode === 'scene') {
        if (s.code === '__none') ps = ps.filter(p => !(p.sc || []).length);
        else if (s.code === '__other') ps = ps.filter(p => (p.sc || []).length && (p.sc || []).every(i => !rowTop.includes(String(i))));
        else { ps = ps.filter(p => (p.sc || []).includes(s.sceneIdx)); patch.scene = String(s.sceneIdx); }
      } else {
        if (s.code === '__none') ps = ps.filter(p => !p.th);
        else if (s.code === '__other') ps = ps.filter(p => p.th && !rowTop.includes(p.th));
        else { ps = ps.filter(p => p.th === s.code); patch.themes = [s.code]; }
      }
      title += ' × ' + s.name;
    }
    if (scIdx != null) { ps = ps.filter(p => p.sc.includes(scIdx)); patch.scene = String(scIdx); title += ' × ' + D.scenes[scIdx]; }
    miniList($('#tyPosts'), sortByDate(ps), esc(title), patch);
    if (!quiet) $('#tyPosts').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}



// ---------------- Situations（旧卡片格式 × 矩阵维度重划） ----------------
let SIT = { theme: null, stage: null };

function renderSit(){
  const el = $('#tab-sit');
  const M = globalThis.__SIT_MATRIX__;
  if (!M || !(M.situations || []).length) {
    el.innerHTML = `<div class="card"><p class="hint">未加载 sit-matrix.js</p></div>`;
    return;
  }
  const themes = M.themes || [];
  const stages = M.stages || [];
  const all = M.situations || [];
  if (SIT.theme && !themes.some(t => t.id === SIT.theme)) SIT.theme = null;
  if (SIT.stage && !stages.some(s => s.id === SIT.stage)) SIT.stage = null;

  const list = all.filter(s =>
    (!SIT.theme || s.themeId === SIT.theme) &&
    (!SIT.stage || s.stageId === SIT.stage)
  );

  const themeChips = themes.map(t =>
    `<button type="button" class="sit-chip${SIT.theme === t.id ? ' on' : ''}" data-sit-theme="${t.id}">${esc(t.name)}</button>`
  ).join('');
  const stageChips = stages.map(s =>
    `<button type="button" class="sit-chip stage${SIT.stage === s.id ? ' on' : ''}" data-sit-stage="${s.id}" title="${esc(s.blurb || '')}"><b>${esc(s.name)}</b>${s.blurb ? `<i>${esc(s.blurb)}</i>` : ''}</button>`
  ).join('');

  const byTheme = themes
    .filter(t => !SIT.theme || t.id === SIT.theme)
    .map(t => {
      const items = list.filter(s => s.themeId === t.id);
      if (!items.length) return '';
      const cards = items.map(s => {
        const ths = (s.themes || []).filter(c => TH[c]);
        const n = GP.filter(p => p.th && ths.includes(p.th)).length;
        return `<div class="scard" id="sit-${s.id}">
          <h4><span class="sid">${esc(s.id)}</span>${esc(s.name)}</h4>
          <div class="sit-dims">
            <span class="sit-dim theme">${esc(s.themeName)}</span>
            <span class="sit-dim stage">${esc(s.stageName)}${s.stageBlurb ? ` · ${esc(s.stageBlurb)}` : ''}</span>
          </div>
          <div class="nums"><span>当前筛选 <b>${fmt(n)}</b></span></div>
          <div class="row"><b>触发时刻：</b>${esc(s.trigger)}</div>
          <div class="row"><b>他/她需要什么：</b>${esc(s.needs)}</div>
          <div class="row"><b>对应主题：</b>${ths.map(c => `<span class="badge th" data-sx="${c}" title="${esc(TH[c].full)}">${esc(tlabel(c))}</span>`).join('')}</div>
          <div><button class="btn" data-sall="${s.id}">查看相关帖子 →</button></div>
        </div>`;
      }).join('');
      return `<section class="sit-theme-block">
        <h3 class="sit-theme-h">${esc(t.name)}<span class="small"> · ${items.length} 个情境</span></h3>
        <div class="scards">${cards}</div>
      </section>`;
    }).join('');

  el.innerHTML = `<div class="card sit-intro">
    <h3 style="margin:0 0 8px">「此刻的我」情境（按成长全景矩阵重划）</h3>
    <p class="hint" style="margin:0">卡片格式与原先一致（触发时刻 / 需要什么 / 对应主题）。划分维度改为：<b>6 个成长主题</b> × <b>7 个需要回答的问题</b>（起点接受 → 过渡重估）。不是把旧 14 条映射上去，而是按新维度重新生成情境。</p>
  </div>
  <div class="sit-filters">
    <div class="sit-filter-row">
      <span class="sit-filter-label">成长主题</span>
      <div class="sit-chips">
        <button type="button" class="sit-chip${SIT.theme ? '' : ' on'}" data-sit-theme="">全部</button>
        ${themeChips}
      </div>
    </div>
    <div class="sit-filter-row">
      <span class="sit-filter-label">走到哪一步</span>
      <div class="sit-chips stages">
        <button type="button" class="sit-chip${SIT.stage ? '' : ' on'}" data-sit-stage="">全部</button>
        ${stageChips}
      </div>
    </div>
  </div>
  <p class="small sit-count">当前 <b>${list.length}</b> 个情境（共 ${all.length}）</p>
  ${byTheme || '<p class="hint">没有匹配情境，请放宽筛选。</p>'}
  <div class="card md" style="margin-top:14px">
    <p><b>横切提醒：</b>情绪吞没可作为各情境的调节变量；若心理问题本身是主诉（确诊、休学/复学、自伤风险），走安全转介。</p>
  </div>`;

  el.querySelectorAll('[data-sit-theme]').forEach(b => {
    b.onclick = () => { SIT.theme = b.dataset.sitTheme || null; renderSit(); };
  });
  el.querySelectorAll('[data-sit-stage]').forEach(b => {
    b.onclick = () => { SIT.stage = b.dataset.sitStage || null; renderSit(); };
  });
  el.querySelectorAll('[data-sx]').forEach(b => b.onclick = () => openExplorer({ themes: [b.dataset.sx] }));
  el.querySelectorAll('[data-sall]').forEach(b => {
    b.onclick = () => {
      const s = all.find(x => x.id === b.dataset.sall);
      if (s) openExplorer({ themes: s.themes || [] });
    };
  });
}



// ---------------- Report ----------------
function renderReport(){
  const el = $('#tab-report');
  el.innerHTML = `<div class="reportwrap"><div class="card toc" id="toc"></div><div class="card md" id="rep"></div></div>`;
  $('#rep').innerHTML = md(D.report);
  const hs = [...$('#rep').querySelectorAll('h1,h2,h3')];
  hs.forEach((h,i)=>h.id='sec-'+i);
  $('#toc').innerHTML = '<b>目录</b>' + hs.filter(h=>h.tagName!=='H1').map(h=>`<a href="#${h.id}" class="${h.tagName==='H3'?'l3':''}">${esc(h.textContent)}</a>`).join('');
  $('#toc').querySelectorAll('a').forEach(a => a.onclick = e => { e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); window.scrollTo({top: t.getBoundingClientRect().top + window.scrollY - 110, behavior:'smooth'}); });
}



// ---------------- Explorer ----------------
const E0 = () => ({src:'', themes:[], stage:'', scene:'', type:'', tier:'', gap:'', emo:'', voice:'', kind:'', q:'', sort:'date', page:1});
E = E0();
const PER = 30;
function openExplorer(patch){ E = Object.assign(E0(), patch); dirty.add('explorer'); showTab('explorer'); }
function epass(p){
  if (E.src && p.s !== E.src) return false;
  if (E.themes.length) { if (E.themes[0]==='__none') { if (p.th) return false; } else if (!E.themes.includes(p.th)) return false; }
  if (E.stage !== '') { if (E.stage==='-1') { if (p.st.length) return false; } else if (!p.st.includes(+E.stage)) return false; }
  if (E.scene !== '' && !p.sc.includes(+E.scene)) return false;
  if (E.type !== '' && !p.ty.includes(+E.type)) return false;
  if (E.tier !== '' && p.tr !== +E.tier) return false;
  if (E.gap) { const i = +E.gap.slice(1); if (E.gap[0]==='r' ? !p.gr.includes(i) : !p.gm.includes(i)) return false; }
  if (E.emo && p.e !== +E.emo) return false;
  if (E.voice !== '' && p.v !== +E.voice) return false;
  if (E.kind && p.k !== E.kind) return false;
  return true;
}
function renderExplorer(){
  const el = $('#tab-explorer');
  const opt = (arr, cur, all) => `<option value="">${all}</option>` + arr.map(([v,l])=>`<option value="${v}" ${String(cur)===String(v)?'selected':''}>${esc(l)}</option>`).join('');
  const themeSel = E.themes.length===1 ? E.themes[0] : (E.themes.length>1 ? '__multi' : '');
  el.innerHTML = `<div class="card"><h3>原帖浏览</h3><p class="hint">在全局筛选（顶部）的基础上再叠加以下条件（V2EX 需先在顶部勾选"含 V2EX 补充材料"${hasTitles?'，百度贴吧标题需先勾选"含百度贴吧标题（仅标题）"':''}）。正文超过 ${D.meta.text_max} 字已截断（"…"），点"原帖 ↗"看全文。多选标签按"包含"匹配。</p>
    <div class="efilters">
      <label>来源<select id="eSrc">${opt(srcKeys.map(s=>[s,SRC[s].label]), E.src, '全部来源')}</select></label>
      <label>痛点主题<select id="eTheme"><option value="">全部主题</option>${E.themes.length>1?`<option value="__multi" selected>多个：${E.themes.join(', ')}</option>`:''}<option value="__none" ${themeSel==='__none'?'selected':''}>未归入主题</option>${D.themes.map(t=>`<option value="${t.code}" ${themeSel===t.code?'selected':''}>${esc(t.full)}</option>`).join('')}</select></label>
      <label>阶段<select id="eStage">${opt(D.stages.map((s,i)=>[i,s]).concat([[-1,STAGE_NONE]]), E.stage, '全部阶段')}</select></label>
      <label>场景<select id="eScene">${opt(D.scenes.map((s,i)=>[i,s]), E.scene, '全部场景')}</select></label>
      <label>学生类型<select id="eType">${opt(D.stypes.map((s,i)=>[i,s]), E.type, '全部类型')}</select></label>
      <label>学校层次（牛客卡片）<select id="eTier">${opt(D.tiers.map((s,i)=>[i,s]), E.tier, '全部')}</select></label>
      <label>Gap<select id="eGap"><option value="">全部</option><optgroup label="规则标签">${D.gapRules.map((g,i)=>`<option value="r${i}" ${E.gap==='r'+i?'selected':''}>${esc(g)}</option>`).join('')}</optgroup><optgroup label="人工编码（仅样本）">${D.gapManualLabels.map((g,i)=>`<option value="m${i}" ${E.gap==='m'+i?'selected':''}>${esc(g)}</option>`).join('')}</optgroup></select></label>
      <label>情绪强度<select id="eEmo">${opt([[1,'1 平静'],[2,'2 中等'],[3,'3 强烈']], E.emo, '全部')}</select></label>
      <label>语态<select id="eVoice">${opt(D.voices.map((v,i)=>[i,v]), E.voice, '全部')}</select></label>
      ${hasTitles?`<label>内容类型<select id="eKind">${opt([['post','帖子/评论正文'],['title','仅标题（贴吧）']], E.kind, '全部')}</select></label>`:''}
      <label>关键词（空格分隔=且）<input type="text" id="eQ" value="${esc(E.q)}" placeholder="如：导师 实习"></label>
      <label>排序<select id="eSort">${[['date','日期：新→旧'],['date_asc','日期：旧→新'],['emo','情绪强度：高→低'],['len','原文长度：长→短']].map(([v,l])=>`<option value="${v}" ${E.sort===v?'selected':''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="ctrl"><button class="btn" id="eClear">清空条件</button><button class="btn" id="eCsv">导出当前结果 CSV</button><span id="eInfo" class="small"></span></div></div>
    <div class="card" style="margin-top:12px" id="eList"></div>`;
  const bind = (id, key, fn) => { const x = $(id); if (!x) return; x.addEventListener(x.tagName==='INPUT'?'input':'change', e => { fn ? fn(e.target.value) : (E[key] = e.target.value); E.page = 1; drawList(); }); };
  bind('#eSrc','src'); bind('#eStage','stage'); bind('#eScene','scene'); bind('#eType','type'); bind('#eTier','tier'); bind('#eGap','gap'); bind('#eEmo','emo'); bind('#eVoice','voice'); bind('#eKind','kind'); bind('#eSort','sort');
  bind('#eTheme', null, v => { if (v==='__multi') return; E.themes = v ? [v] : []; });
  let qt; $('#eQ').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { E.q = e.target.value.trim(); E.page = 1; drawList(); }, 200); });
  $('#eClear').onclick = () => { E = E0(); renderExplorer(); };
  $('#eCsv').onclick = exportCsv;
  drawList();
}
let lastRes = [];
function drawList(){
  const terms = E.q.split(/\s+/).filter(Boolean);
  let res = GP.filter(epass);
  if (terms.length) res = res.filter(p => { const s = (p.t + ' ' + p.c).toLowerCase(); return terms.every(t => s.includes(t.toLowerCase())); });
  const key = p => (p.d||'').replace('≈','');
  if (E.sort==='date') res.sort((a,b)=>key(b).localeCompare(key(a))); else if (E.sort==='date_asc') res.sort((a,b)=>(key(a)||'9').localeCompare(key(b)||'9'));
  else if (E.sort==='emo') res.sort((a,b)=>b.e-a.e || key(b).localeCompare(key(a))); else if (E.sort==='len') res.sort((a,b)=>b.tl-a.tl);
  lastRes = res;
  const pages = Math.max(1, Math.ceil(res.length/PER)); E.page = Math.min(E.page, pages);
  const bySrc = {}; res.forEach(p=>bySrc[p.s]=(bySrc[p.s]||0)+1);
  $('#eInfo').innerHTML = `共 <b>${fmt(res.length)}</b> 条（${Object.entries(bySrc).map(([s,n])=>`${SRC[s].label} ${n}`).join(' / ')||'—'}）`;
  const slice = res.slice((E.page-1)*PER, E.page*PER);
  const pager = pages>1 ? `<div class="pager"><button class="btn" data-pg="1" ${E.page<=1?'disabled':''}>« 首页</button><button class="btn" data-pg="${E.page-1}" ${E.page<=1?'disabled':''}>上一页</button> 第 <input type="text" id="pgIn" value="${E.page}" style="width:48px;text-align:center"> / ${pages} 页 <button class="btn" data-pg="${E.page+1}" ${E.page>=pages?'disabled':''}>下一页</button><button class="btn" data-pg="${pages}" ${E.page>=pages?'disabled':''}>末页 »</button></div>` : '';
  $('#eList').innerHTML = pager + (slice.length ? slice.map(p=>postHTML(p, terms)).join('') : '<div class="empty">没有符合条件的帖子，试试放宽条件</div>') + pager;
  $('#eList').querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { E.page = +b.dataset.pg; drawList(); $('#eList').scrollIntoView({block:'start'}); });
  $('#eList').querySelectorAll('#pgIn').forEach(i => i.onchange = () => { const v = parseInt(i.value); if (v>=1 && v<=pages) { E.page = v; drawList(); } });
  bindThemeBadges($('#eList'));
}
function exportCsv(){
  const cols = ['id','source','via','content_type','date','theme','stage','scene','student_type','school_tier','gap_rule','gap_manual','emotion','voice','url','text'];
  const q = v => '"' + String(v??'').replace(/"/g,'""') + '"';
  const lines = [cols.join(',')].concat(lastRes.map(p => [p.i, SRC[p.s].label, D.via[p.s]||'', p.k==='title'?'仅标题（无正文）':'正文', p.d, p.th?TH[p.th].full:'', p.st.map(i=>D.stages[i]).join(';'), p.sc.map(i=>D.scenes[i]).join(';'), p.ty.map(i=>D.stypes[i]).join(';'), p.tr>=0?D.tiers[p.tr]:'', p.gr.map(i=>D.gapRules[i]).join(';'), p.gm.map(i=>D.gapManualLabels[i]).join(';'), p.e, p.v>=0?D.voices[p.v]:'', p.u, p.t].map(q).join(',')));
  const blob = new Blob(['\ufeff' + lines.join('\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `大学生痛点_筛选结果_${lastRes.length}条.csv`; a.click();
  toast(`已导出 ${lastRes.length} 条`);
}

document.addEventListener('click', ev => { if (!HM.intro) return; if (ev.target.closest && (ev.target.closest('#hmIntro') || ev.target.closest('#hmChart'))) return; HM.intro = null; const b = $('#hmIntro'); if (b) b.remove(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && HM.intro) { HM.intro = null; const b = $('#hmIntro'); if (b) b.remove(); } });

// ---------------- Gap (full-corpus primary, manual sample secondary) ----------------
function renderGap(){
  const el = $('#tab-gap');
  const GM = D.gapManual;
  const GF = D.gapFull || null;
  const GS = D.gapSummary || null;
  if (!gapSel) gapSel = (GS && GS.top_manual[0] && GS.top_manual[0].name) || GM.cats[0].name;

  const grN = D.gapRules.map((g,i)=>({i, l:g, n:GP.filter(p=>p.gr.includes(i)).length})).sort((a,b)=>a.n-b.n);
  const anyGap = GP.filter(p=>p.gr.length).length;
  const manN = (GM.n && (GM.n.all || GM.n.main)) || 0;

  const topRuleLine = GF ? GF.rules_sorted.slice(0,5).map(r => `${esc(r.name)} ${fmt(r.n)}`).join(' · ') : '';
  const topManLine = GS ? GS.top_manual.slice(0,5).map(r => `${esc(r.name)} ${r.pct}%`).join(' · ') : '';

  el.innerHTML = `<div class="kpis">
    <div class="kpi main"><div class="n">${fmt(D.meta.n_final)}</div><div class="l">主口径全渠道样本量</div></div>
    <div class="kpi"><div class="n">${fmt(anyGap)}</div><div class="l">当前筛选命中≥1 个规则 gap</div></div>
    <div class="kpi"><div class="n">${fmt(GF ? GF.n_with_gap : anyGap)}</div><div class="l">全库命中规则 gap 条数</div></div>
    <div class="kpi"><div class="n">${fmt(manN)}</div><div class="l">人工深读有效样本（已含 V2EX）</div></div>
    <div class="kpi"><div class="n">${fmt(GM.noise||0)}</div><div class="l">人工样本中判为噪声</div></div>
  </div>
  <div class="card" style="margin-bottom:14px">
    <h3>Gap 重算说明（全渠道主口径）</h3>
    <p class="hint">${esc(GM.note || 'V2EX 与贴吧等已并入主口径。')} 下方「全量规则」随全局筛选联动；「人工深读」样本固定，用于解释 gap 类型结构。</p>
    ${topRuleLine ? `<p class="small"><b>全库规则 Top：</b>${topRuleLine}</p>` : ''}
    ${topManLine ? `<p class="small"><b>人工样本结构：</b>${topManLine}</p>` : ''}
  </div>
  <div class="card"><h3>全量规则 gap（当前筛选 · 主分析）</h3>
    <p class="hint">对主口径全部帖子/标题按关键词规则打标，一条可多选。召回偏低，看相对结构。点击柱子 → 下方列表。</p>
    <div id="gapR" class="chart mid"></div>
  </div>
  <div class="card" id="gapRPosts" style="margin-top:14px"><div class="empty">点击上方规则 gap 柱子查看帖子</div></div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>人工深读 gap 类型（辅助 · 样本 ${fmt(manN)}）</h3>
      <p class="hint">来源分层抽样后人工编码；V2EX 已合并进主口径分母。点击柱子 → 右侧原文。</p>
      <div id="gapM" class="chart mid"></div></div>
    <div class="card" id="gapMPosts" style="max-height:560px;overflow:auto"></div>
  </div>
  <div class="card md" style="margin-top:14px"><h3>读法</h3>${md(D.sections.gap51read || '')}</div>
  <div class="card md" style="margin-top:14px">${md(D.sections.gap52 || '')}</div>`;

  // full rule chart first
  const rc = chartOf($('#gapR'));
  rc.setOption({tooltip:{trigger:'axis',axisPointer:{type:'shadow'},formatter:ps=>{const g=grN[ps[0].dataIndex];return `${esc(g.l)}：${fmt(g.n)} 条（占当前命中 ${pct(g.n/Math.max(1,anyGap))}）`;}},
    grid:{left:10,right:70,top:10,bottom:20,containLabel:true}, xAxis:{type:'value'},
    yAxis:{type:'category',data:grN.map(x=>x.l),axisLabel:{interval:0,fontSize:12}},
    series:[{type:'bar',barWidth:'70%',data:grN.map(x=>({value:x.n,itemStyle:{color:x.i===((gapRuleSel&&gapRuleSel.i))?'#0891b2':'#67e8f9'}})),
      label:{show:true,position:'right',fontSize:12,fontWeight:600}}]}, true);
  rc.off('click'); rc.on('click', e => { const g = grN[e.dataIndex]; gapRuleSel = g; miniList($('#gapRPosts'), sortByDate(GP.filter(p=>p.gr.includes(g.i))), `gap 规则：${esc(g.l)}（当前筛选 ${fmt(g.n)} 条）`, {gap:'r'+g.i}); $('#gapRPosts').scrollIntoView({behavior:'smooth'}); });

  // manual merged
  const cats = GM.cats.slice().sort((a,b)=>a.main-b.main);
  const c = chartOf($('#gapM'));
  c.setOption({tooltip:{trigger:'axis',axisPointer:{type:'shadow'},formatter:ps=>{const x=cats[ps[0].dataIndex];return `${esc(x.name)}：${fmt(x.main)} 条（${pct(x.main/Math.max(1,manN))}）`;}},
    grid:{left:10,right:70,top:10,bottom:20,containLabel:true},
    xAxis:{type:'value',max:1,axisLabel:{formatter:v=>pct(v)}},
    yAxis:{type:'category',data:cats.map(x=>x.name),axisLabel:{interval:0,fontSize:11}},
    series:[{type:'bar',barWidth:'68%',data:cats.map(x=>({value:x.main/Math.max(1,manN),itemStyle:{color:x.name===gapSel?'#2563eb':'#93c5fd'}})),
      label:{show:true,position:'right',fontSize:11,formatter:p=>`${cats[p.dataIndex].main}（${pct(p.value)}）`}}]}, true);
  c.off('click'); c.on('click', e => { gapSel = cats[e.dataIndex].name; renderGap(); });
  const gp = GM.posts.filter(p=>p.g.includes(gapSel));
  $('#gapMPosts').innerHTML = `<h3>「${esc(gapSel)}」· ${gp.length} 条人工样本</h3>` + gp.map(p=>`<div class="post"><div class="meta"><span class="badge src" style="background:${SRC[p.s].color}">${SRC[p.s].label}</span>${p.g.map(g=>`<span class="badge gm">${esc(g)}</span>`).join('')}${p.inFinal?'':'<span class="badge">不在最终集</span>'}<a href="${esc(p.u)}" target="_blank" rel="noopener">原帖 ↗</a></div><div class="txt">${esc(p.t)}</div></div>`).join('');
}



// ---------------- 大学生框架分析（对齐参考流程图） ----------------
let FW = { stage: 'y1', scene: 'y1-major', type: null };

function fwCaseListHtml(cases){
  const list = (cases || []).slice(0, 2);
  if (!list.length) return '';
  return `<ul class="fw-cases">${list.map(c => {
    const text = typeof c === 'string' ? c : (c.text || '');
    const url = typeof c === 'object' ? (c.url || '') : '';
    const src = typeof c === 'object' ? (c.source || '') : '';
    const inner = `${src ? `<span class="fw-case-src">${esc(src)}</span>` : ''}${esc(text)}`;
    return url
      ? `<li><a class="fw-case-link" href="${esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${inner}</a></li>`
      : `<li>${inner}</li>`;
  }).join('')}</ul>`;
}

/** 类型下拆法：优先 pains（同场景下切面痛点差异）；否则用特别痛的六动作 */
function fwActionsHtml(ty){
  const byPain = Array.isArray(ty.pains) && ty.pains.length;
  const items = (byPain ? ty.pains : (ty.actions || []))
    .filter(a => a && (a.primary !== false) && ((a.cases || []).length || a.pain || a.name));
  if (!items.length) return '';
  const rows = items.map(a =>
    `<li class="fw-act primary">
      <div class="fw-act-head">
        <span class="fw-act-name">${esc(a.name)}</span>
        ${a.pain ? `<span class="fw-act-pain">${byPain ? esc(a.pain) : `痛点：${esc(a.pain)}`}</span>` : ''}
      </div>
      ${fwCaseListHtml(a.cases)}
    </li>`
  ).join('');
  return `<div class="fw-acts">
    <div class="fw-acts-cap">${byPain ? '该切面在本场景的痛点差异' : '该类型特别痛的动作'}</div>
    <ul class="fw-act-list">${rows}</ul>
  </div>`;
}

function fwForkHtml(itemsHtml, n){
  return `<div class="fw-fork" style="--fw-n:${Math.max(n, 1)}">
    <div class="fw-fork-stem" aria-hidden="true"></div>
    <div class="fw-fork-pane">
      <div class="fw-fork-bus" aria-hidden="true"></div>
      <div class="fw-fork-kids">${itemsHtml}</div>
    </div>
  </div>`;
}

function renderFramework(){
  const el = $('#tab-framework');
  const F = globalThis.__FRAMEWORK__;
  if (!F) {
    el.innerHTML = `<div class="fw-page"><p class="hint">未加载 framework-analysis.js</p></div>`;
    return;
  }

  const stage = FW.stage ? F.stages[FW.stage] : null;
  const scenes = stage ? (stage.scenes || []) : [];
  if (stage && FW.scene && !scenes.some(s => s.id === FW.scene)) {
    const hi = scenes.find(s => s.highlight) || scenes[0];
    FW.scene = hi ? hi.id : null;
  }
  const scene = scenes.find(s => s.id === FW.scene) || null;
  const stageIdx = F.trunk.findIndex(t => t.id === FW.stage);

  // 主干：仅年级横排；分叉整层全宽挂在主干下方（避免挤进窄列竖排）
  const colsHtml = F.trunk.map((t, i) => {
    const on = t.id === FW.stage;
    const col = `<div class="fw-col${on ? ' on' : ''}" data-col="${t.id}">
      <button type="button" class="fw-node stage${on ? ' on' : ''}" data-stage="${t.id}">
        <span class="fw-node-main">${esc(t.label)}</span>
      </button>
      ${on ? `<div class="fw-col-drop" aria-hidden="true"></div>` : ''}
    </div>`;
    return i < F.trunk.length - 1
      ? col + `<span class="fw-arrow" aria-hidden="true"></span>`
      : col;
  }).join('');

  let treeHtml = '';
  if (stage && scenes.length) {
    const scKids = scenes.map(s =>
      `<div class="fw-fork-kid${s.id === FW.scene ? ' on' : ''}">
        <span class="fw-fork-tick" aria-hidden="true"></span>
        <button type="button" class="fw-node scene${s.id === FW.scene ? ' on' : ''}" data-scene="${s.id}">
          <span class="fw-node-main">${esc(s.name)}</span>
        </button>
      </div>`
    ).join('');

    let typeFork = '';
    const tyList = scene ? (scene.types || []) : [];
    if (scene && tyList.length) {
      const tyKids = tyList.map((ty, ti) => {
        const open = FW.type === ti;
        return `<div class="fw-fork-kid">
          <span class="fw-fork-tick" aria-hidden="true"></span>
          <button type="button" class="fw-card${open ? ' on' : ''}" data-type="${ti}">
            <div class="fw-card-title">${ty.dim ? `<span class="fw-dim">${esc(ty.dim)}</span>` : ''}${esc(ty.type)}</div>
            <div class="fw-card-body">${esc(ty.situation)}<br>
              <span class="fw-card-pain">痛点：${esc(ty.pain)}</span>
            </div>
            ${fwActionsHtml(ty)}
          </button>
        </div>`;
      }).join('');
      typeFork = `<div class="fw-tree-level">
        <div class="fw-tree-cap sub">按多维切面分叉；切面下按痛点差异（或特别痛的动作）展开 ↓</div>
        ${fwForkHtml(tyKids, tyList.length)}
      </div>`;
    }

    const actBar = (F.meta.actions || []).map(a =>
      `<span class="fw-act-pill" title="${esc(a.blurb || '')}"><b>${esc(a.name)}</b>${a.blurb ? `<i>${esc(a.blurb)}</i>` : ''}</span>`
    ).join('');

    treeHtml = `<div class="fw-tree" data-from="${esc(FW.stage)}" style="--fw-stage-i:${Math.max(stageIdx, 0)}; --fw-stage-n:${F.trunk.length}">
      <div class="fw-tree-cap">${esc(F.branchNote || '同一个场景往下，按多维学生切面分叉 ↓')}</div>
      <div class="fw-tree-level">
        ${fwForkHtml(scKids, scenes.length)}
      </div>
      ${actBar ? `<div class="fw-act-legend"><span class="fw-act-legend-label">六个动作（跨场景通用）</span><div class="fw-act-pills">${actBar}</div></div>` : ''}
      ${typeFork}
    </div>`;
  }

  const ex = F.explain || {};
  const explainHtml = `<div class="fw-explain">
    <div class="fw-explain-lead">${esc(ex.lead || '场景是发生了什么；动作是他怎么做、卡在哪。')}</div>
    <div class="fw-explain-body">${esc(ex.body || '')}</div>
    <div class="fw-explain-tip">${esc(ex.tip || '')}${ex.formula ? ` <b>${esc(ex.formula)}</b>` : ''}</div>
  </div>`;

  const demoHtml = `<aside class="fw-demo" aria-label="同一场景卡在不同动作示意">
    <div class="fw-demo-title">同一个场景，卡在不同的动作</div>
    <div class="fw-demo-sub">以「保研还是考研」为例 · 示意</div>
    <div class="fw-demo-shell">
      <div class="fw-demo-shell-t">场景（壳）：保研还是考研 —— 所有学生都会遇到</div>
      <div class="fw-demo-shell-d">只记录「他考了考研」，看不出任何人的痛苦</div>
    </div>
    <div class="fw-demo-acts">
      <div class="fw-demo-act">探索</div>
      <div class="fw-demo-act">选择</div>
      <div class="fw-demo-act">开始</div>
      <div class="fw-demo-act">学习</div>
      <div class="fw-demo-act">求助</div>
      <div class="fw-demo-act">调整</div>
    </div>
    <div class="fw-demo-acts-cap">动作（核）：人人都会做的六件事 —— 成长发生在这些动作里</div>
    <div class="fw-demo-students">
      <div class="fw-demo-stu">
        <div class="fw-demo-stu-t">学生 A → 卡在「选择」</div>
        <div class="fw-demo-stu-d">爸妈说保研好，学长说考研好——不知道怎么选</div>
      </div>
      <div class="fw-demo-stu">
        <div class="fw-demo-stu-t">学生 B → 卡在「开始」</div>
        <div class="fw-demo-stu-d">决定了考研，拖一个月不敢复习——怕考不上</div>
      </div>
      <div class="fw-demo-stu">
        <div class="fw-demo-stu-t">学生 C → 卡在「求助」</div>
        <div class="fw-demo-stu-d">复习遇瓶颈，不知道问谁、也不敢问</div>
      </div>
      <div class="fw-demo-stu">
        <div class="fw-demo-stu-t">学生 D → 卡在「调整」</div>
        <div class="fw-demo-stu-d">计划全乱了，不知道怎么改</div>
      </div>
    </div>
    <div class="fw-demo-so"><b>所以：</b>同一个场景（考研），四个人痛的地方完全不同。只记场景看不出差别，追问「卡在哪个动作」才能看见每个人真正的问题。</div>
  </aside>`;

  el.innerHTML = `<div class="fw-page${stage ? ' has-tree' : ''}">
    <div class="fw-title">主干：所有大学生都要走的主线（人人一样）</div>
    ${explainHtml}
    ${demoHtml}
    <div class="fw-trunk">${colsHtml}</div>
    ${treeHtml}
  </div>`;

  el.querySelectorAll('.fw-node[data-stage]').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.stage;
      if (FW.stage === id) {
        FW.stage = null; FW.scene = null; FW.type = null;
      } else {
        FW.stage = id; FW.type = null;
        const st = F.stages[id];
        const hi = (st.scenes || []).find(s => s.highlight) || (st.scenes || [])[0];
        FW.scene = hi ? hi.id : null;
      }
      renderFramework();
    };
  });
  el.querySelectorAll('.fw-node[data-scene]').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.scene;
      if (FW.scene === id) {
        FW.scene = null; FW.type = null;
      } else {
        FW.scene = id; FW.type = null;
      }
      renderFramework();
    };
  });
  el.querySelectorAll('.fw-card[data-type]').forEach(b => {
    b.onclick = () => {
      const i = +b.dataset.type;
      FW.type = FW.type === i ? null : i;
      renderFramework();
    };
  });
}

const RENDER = {
  overview: renderOverview,
  framework: renderFramework,
  themes: renderThemes,
  heat: renderHeat,
  types: renderTypes,
  gap: renderGap,
  sit: renderSit,
  report: renderReport,
  explorer: renderExplorer
};



function bootApp() {
  var status = document.getElementById('bootStatus');
  try {
    if (!globalThis.__DASHBOARD__) {
      throw new Error('数据未加载（dashboard-data.js）');
    }
    if (status) status.textContent = '数据已加载，正在渲染…';
    initCore(globalThis.__DASHBOARD__);
    initGlobal();
    recompute();
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.onclick = function () { showTab(b.dataset.tab); };
    });
    Object.keys(RENDER).forEach(function (k) { dirty.add(k); });
    showTab('overview');
    if (status) { status.dataset.done = '1'; status.remove(); }
  } catch (err) {
    console.error(err);
    if (status) {
      status.dataset.err = '1';
      status.style.color = '#b91c1c';
      status.innerHTML = '加载失败：' + (err && err.message ? err.message : err);
    }
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}

})();
