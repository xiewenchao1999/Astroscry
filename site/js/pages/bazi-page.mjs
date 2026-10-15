// bazi-page.mjs — 八字页胶水：出生信息卡（共享）→ castBazi + 分析层 → 渲染
import { renderLayout, loadData, showError, bootPage } from '../ui/layout.mjs';
import { mountBirthCard } from '../ui/birth-profile.mjs';
import { castBazi } from '../core/bazi.mjs';
import { analyzeStrength, detectGeju, analyzeRelations, castChenggu, buildCaseLibrary, readMarriage, analyzeShensha } from '../core/bazi-analysis.mjs';
import { revealCards, withBusy, animateMeters, announce, reducedMotion } from '../ui/motion.mjs';
import { setAISource } from '../ui/ai-panel.mjs';

renderLayout();

const els = { form: document.getElementById('form'), result: document.getElementById('result'), btn: document.getElementById('cast'), solar: document.getElementById('solarTime') };
// O08：数据加载迁入 bootPage——失败显示错误卡并终止模块（不再静默白屏）；数据经模块级变量供下方渲染函数取用
let interp, weights, chengguData, caseLibrary;
let lastRendered = false;
let card;

await bootPage(els.result, async () => {
  [interp, weights, chengguData] = await Promise.all([
    loadData('../data/interpret-bazi.json'),
    loadData('../data/wuxing-weights.json'),
    loadData('../data/chenggu.json'),
  ]);
  const celebData = await loadData('../data/celebrity-cases.json');
  caseLibrary = buildCaseLibrary(celebData.cases, castBazi);
  card = mountBirthCard(els.form, { onChange: () => { if (lastRendered) cast(); } });
});

function wuxingBar(five) {
  const total = Object.values(five).reduce((a, b) => a + b, 0) || 1;
  const colors = { 金: '#cbd5e1', 木: '#86efac', 水: '#7dd3fc', 火: '#fca5a5', 土: '#f0c86d' };
  return Object.entries(five).map(([k, v]) => `
    <div style="margin:6px 0;"><span style="font-size:13px;">${k} · ${v}（${Math.round(v / total * 100)}%）</span>
    <div class="meter" style="background:rgba(255,255,255,0.06);border-radius:6px;height:8px;margin-top:3px;">
      <i style="width:0;background:${colors[k]}" data-w="${(v / total * 100).toFixed(1)}"></i></div></div>`).join('');
}

function pillarTable(b) {
  const cols = [['年柱', b.pillars.year, '祖上'], ['月柱', b.pillars.month, '父母/事业'], ['日柱', b.pillars.day, '自身/配偶'], ['时柱', b.pillars.time, '子女/晚景']];
  return `<table class="plain"><tr><th></th>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr>
    <tr><th>干支</th>${cols.map((c) => `<td><b style="font-size:17px;">${c[1].ganZhi}</b></td>`).join('')}</tr>
    <tr><th>十神(干)</th>${cols.map((c) => `<td>${c[1].ganShiShen}</td>`).join('')}</tr>
    <tr><th>藏干</th>${cols.map((c) => `<td>${c[1].hideGans.map((h) => `${h.gan}<small>(${h.shiShen})</small>`).join('<br>')}</td>`).join('')}</tr>
    <tr><th>纳音</th>${cols.map((c) => `<td>${c[1].naYin}</td>`).join('')}</tr>
    <tr><th>五行</th>${cols.map((c) => `<td>${c[1].ganWuXing}/${c[1].zhiWuXing}</td>`).join('')}</tr>
    <tr><th>宫位</th>${cols.map((c) => `<td style="color:var(--muted)">${c[2]}</td>`).join('')}</tr></table>`;
}

function strengthCard(b) {
  const s = analyzeStrength(b, weights);
  const geju = detectGeju(b, interp);
  const total = s.support + s.drain || 1;
  const rows = s.contributions
    .slice()
    .sort((a, b2) => Math.abs(b2.value) - Math.abs(a.value))
    .slice(0, 10)
    .map((c) => `<tr><td>${c.source}</td><td style="color:var(--muted)">${c.shiShen}</td><td style="color:${c.value > 0 ? 'var(--good)' : 'var(--bad)'}">${c.value > 0 ? '+' : ''}${c.value}</td></tr>`)
    .join('');
  return `
    <div class="card"><h3>日主强弱量化 <span class="src-tag">释义</span></h3>
      <div class="kv">
        <div><span>日主</span><b>${b.dayGan}（${b.dayGanWuXing}）</b></div>
        <div><span>生扶合计</span><b style="color:var(--good)">${s.support}</b></div>
        <div><span>克耗合计</span><b style="color:var(--bad)">${s.drain}</b></div>
        <div><span>净值</span><b>${s.net}</b></div>
        <div><span>判档</span><b style="color:var(--accent)">${s.band.cn}</b></div>
      </div>
      <div class="meter" style="background:rgba(255,255,255,0.06);border-radius:6px;height:10px;margin:12px 0;display:flex;overflow:hidden;">
        <i style="width:0;background:linear-gradient(90deg,#86efac,#4ade80)" data-w="${(s.support / total * 100).toFixed(1)}"></i>
        <i style="width:0;background:linear-gradient(90deg,#fca5a5,#f87171)" data-w="${(s.drain / total * 100).toFixed(1)}"></i>
      </div>
      <p>${interp.strengthAdvice.result.replace('{support}', s.support).replace('{drain}', s.drain).replace('{net}', s.net)}</p>
      <p><b>${s.band.cn}</b>：${s.band.advice}</p>
      <p><b>月令取格 · ${geju.shiShen || '—'}</b>：${geju.name}${geju.reason ? `<span style="color:var(--muted)">（${geju.reason}）</span>` : ''}</p>
      <table class="plain" style="margin-top:10px;"><tr><th>分项</th><th>十神</th><th>分值</th></tr>${rows}</table>
      <p class="note">${interp.strengthAdvice.intro}</p>
      <p class="note">${interp.strengthAdvice.note} ${interp.geju.note}</p>
    </div>`;
}

/** 姻缘视角卡：配偶宫（日支）+ 配偶星（按性别）+ 日支合冲刑害提示（readMarriage 规则引擎） */
function marriageCard(b) {
  const m = readMarriage(b, interp, analyzeRelations(b, weights));
  return `
    <div class="card"><h3>姻缘视角 <span class="src-tag">规则引擎</span></h3>
      <p><b>配偶宫（日支${b.pillars.day.zhi}）：</b>${m.palaceLine}</p>
      <p><b>配偶星：</b>${m.starLine}</p>
      ${m.tips.length ? `<p><b>婚姻互动提示：</b></p>${m.tips.map((t) => `<p style="color:${t.typeCn.includes('合') ? 'var(--good)' : 'var(--bad)'}">▸ ${t.typeCn}（${t.pair}）：${t.tip}</p>`).join('')}` : '<p style="color:var(--muted)">配偶宫未逢合冲刑害，婚姻互动整体平顺。</p>'}
      <p class="note">${interp.spouse.intro}</p>
    </div>`;
}

function relationCard(b) {
  const r = analyzeRelations(b, weights);
  const typeColor = { he: 'good', chong: 'bad', xing: 'bad', hai: 'bad' };
  const typeText = { he: interp.relations.he, chong: interp.relations.chong, xing: interp.relations.xing, hai: interp.relations.hai };
  return `
    <div class="card"><h3>四柱关系 · 合冲刑害</h3>
      ${r.hasAny
      ? `<table class="plain"><tr><th>关系</th><th>组合</th><th>位置</th><th>说明</th></tr>
         ${r.items.map((x) => `<tr><td><span class="pill ${typeColor[x.type]}">${x.typeCn}</span></td>
           <td><b>${x.pair}</b>${x.element ? `<span style="color:var(--muted)">化${x.element}</span>` : ''}${x.cn ? `<span style="color:var(--muted)">·${x.cn}</span>` : ''}</td>
           <td style="color:var(--muted)">${x.positions.join(' + ')}</td>
           <td style="color:var(--muted);font-size:12.5px">${typeText[x.type]}</td></tr>`).join('')}
         </table>`
      : `<p style="color:var(--muted)">${interp.relations.none}</p>`}
      <p class="note">${interp.relations.heNote}</p>
    </div>`;
}

/** 神煞卡：只报「见 / 未见」与落柱（判定在 core/analyzeShensha，口径在语料 shensha.rulesNote） */
function shenshaCard(items) {
  const cfg = interp.shensha;
  const found = items.filter((x) => x.hits.length);
  const none = items.filter((x) => !x.hits.length);
  return `
    <div class="card"><h3>${cfg.title} <span class="src-tag">标记</span></h3>
      <p>${found.length ? found.map((x) => `<span class="pill gold">${x.name}</span>`).join('') : '<span class="pill">四柱未见本站收录的常用神煞</span>'}</p>
      ${found.map((x) => `<p><b>${x.name}</b>（${x.value} · ${cfg.hitLabel}${x.hits.join('、')}）：${x.text}</p>`).join('')}
      ${none.length ? `<details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--accent2);">未见的神煞（${none.length}）</summary>
        <p class="hint">${none.map((x) => x.name).join('、')}——「未见」只表示本命四柱中未落位，不代表不存在或不好。</p></details>` : ''}
      <p class="hint">${cfg.scopeNote}</p>
      <p class="note">${cfg.rulesNote}</p>
      <p class="note">${cfg.note}</p>
    </div>`;
}

function chengguCard(b) {
  let cg;
  try { cg = castChenggu(b, weights, chengguData); } catch (e) { return `<div class="card"><h3>称骨</h3><p class="note">${e.message}</p></div>`; }
  const t = cg.tier;
  return `
    <div class="card"><h3>袁天罡称骨 <span class="src-tag">古籍</span></h3>
      <p>${interp.chenggu.detailLine.replace('{year}', cg.parts.year.qian).replace('{month}', cg.parts.month.qian).replace('{day}', cg.parts.day.qian).replace('{hour}', cg.parts.hour.qian).replace('{total}', cg.totalQian).replace('{label}', t.label)}</p>
      <p style="font-size:17px;color:var(--accent);letter-spacing:1px;">${t.verse}</p>
      <div style="margin:10px 0;">
        <span class="pill gold">${t.label}</span>
        <span class="pill ${t.grade === '高' ? 'good' : t.grade === '低' ? 'bad' : 'gold'}">${t.grade}</span>
        ${t.career ? `<span class="pill">事业 ${t.career}</span>` : ''}
        ${t.wealth ? `<span class="pill">财运 ${t.wealth}</span>` : ''}
        ${t.marriage ? `<span class="pill">婚姻 ${t.marriage}</span>` : ''}
        ${(t.tags || []).map((x) => `<span class="pill">${x}</span>`).join('')}
      </div>
      <table class="plain"><tr><th>项</th><th>取值</th><th>骨重</th></tr>
        <tr><td>年（干支）</td><td>${cg.parts.year.ganzhi}</td><td>${cg.parts.year.qian} 钱</td></tr>
        <tr><td>月（农历）</td><td>${cg.parts.month.lunarMonth} 月</td><td>${cg.parts.month.qian} 钱</td></tr>
        <tr><td>日（农历）</td><td>${cg.parts.day.lunarDay} 日</td><td>${cg.parts.day.qian} 钱</td></tr>
        <tr><td>时（时辰）</td><td>${cg.parts.hour.zhi} 时</td><td>${cg.parts.hour.qian} 钱</td></tr></table>
      ${cg.notes.length ? `<p class="note">口径：${cg.notes.join('；')}</p>` : ''}
      <p class="note">${interp.chenggu.note} ${interp.chenggu.gradeNote}</p>
    </div>`;
}

function caseLibraryCard() {
  const groups = new Map();
  for (const c of caseLibrary) {
    if (!groups.has(c.category)) groups.set(c.category, []);
    groups.get(c.category).push(c);
  }
  return `
    <div class="card"><h3>名人命盘参照 <span class="src-tag">案例库</span></h3>
      <p class="hint">按出生日期计算的年/月/日三柱（不含时柱——史料时辰与异地时区不可靠），仅作参照，非命理比对结论。</p>
      ${[...groups.entries()].map(([cat, list]) => `
        <details style="margin-top:10px;"><summary style="cursor:pointer;color:var(--accent2)">${cat}（${list.length}）</summary>
          <table class="plain" style="margin-top:8px;"><tr><th>人物</th><th>年柱</th><th>月柱</th><th>日柱</th><th>日主</th></tr>
          ${list.map((c) => `<tr><td>${c.name}</td><td>${c.pillars[0]}</td><td>${c.pillars[1]}</td><td>${c.pillars[2]}</td><td>${c.dayGan}（${c.dayGanWuXing}）</td></tr>`).join('')}
          </table>
          ${list.map((c) => `<p class="note">▸ <b>${c.name}</b>：${c.note}</p>`).join('')}
        </details>`).join('')}
      <p class="note">素材来源：life-kline celebrity_cases（自用）；描述为原案例库的复盘笔记，不代表本项目的推断。</p>
    </div>`;
}

function render(b) {
  const shensha = analyzeShensha(b, interp);
  setAISource('bazi', {
    ...b,
    shensha: shensha.filter((x) => x.hits.length).map((x) => ({ name: x.name, value: x.value, hit: x.hits })),
  }, `日主${b.dayGan ?? ''}`);
  const fiveEntries = Object.entries(b.fiveElements);
  const strongest = fiveEntries.reduce((a, x) => (x[1] > a[1] ? x : a));
  const weakest = fiveEntries.reduce((a, x) => (x[1] < a[1] ? x : a));
  const nowYear = new Date().getFullYear();
  const shiShenItems = ['year', 'month', 'time'].map((k) => {
    const p = b.pillars[k];
    if (p.ganShiShen === '日主') return '';
    return `<span class="pill">${p.ganShiShen}（${k === 'year' ? '年干' : k === 'month' ? '月干' : '时干'}）</span>`;
  }).join('');

  els.result.innerHTML = `
    <div class="card"><h3>命盘总览</h3>
      <div class="kv">
        <div><span>公历</span><b>${b.solar.date} ${b.solar.time}</b></div>
        <div><span>农历</span><b>${b.lunar.text}${b.input.gender === 'male' ? '' : ' · 女命'}</b></div>
        <div><span>生肖</span><b>${b.animal}</b></div>
        <div><span>日主</span><b>${b.dayGan}（${b.dayGanWuXing}）</b></div>
        <div><span>胎元</span><b>${b.taiYuan}</b></div>
        <div><span>命宫</span><b>${b.mingGong}</b></div>
        <div><span>身宫</span><b>${b.shenGong}</b></div>
        <div><span>旬空</span><b>${b.xunKong}</b></div>
      </div>
      ${b.solarCorrection ? `<div class="note">已按出生地经度做真太阳时校正：${b.solarCorrection.minutes >= 0 ? '+' : ''}${b.solarCorrection.minutes} 分钟 → 校正后 ${b.solarCorrection.corrected}</div>` : ''}
    </div>
    <div class="card"><h3>四柱</h3>${pillarTable(b)}
      <details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--accent2);">四柱宫位详解</summary>
        ${Object.entries(interp.pillarsDetail).map(([k, v]) => `<p style="font-size:13.5px;"><b>${k}：</b>${v}</p>`).join('')}
      </details></div>
    ${strengthCard(b)}
    ${relationCard(b)}
    ${marriageCard(b)}
    <div class="grid grid-2">
      <div class="card"><h3>五行分布（含藏干）</h3>${wuxingBar(b.fiveElements)}</div>
      <div class="card"><h3>大运（每步十年）</h3>
        <table class="plain"><tr><th>步骤</th><th>干支</th><th>起运年龄</th><th>起始年份</th></tr>
        ${b.daYun.map((d) => `<tr ${d.startYear <= nowYear && nowYear < d.startYear + 10 ? 'style="color:var(--accent)"' : ''}><td>${d.index === 0 ? '—' : d.index}</td><td>${d.ganZhi || '起运前'}</td><td>${d.startAge}</td><td>${d.startYear}</td></tr>`).join('')}
        </table>
        <div class="note">起运：出生后 ${b.qiYun.years} 年 ${b.qiYun.months} 个月 ${b.qiYun.days} 天（${b.qiYun.solar}）。高亮为当前所行大运。</div>
      </div>
    </div>
    ${chengguCard(b)}
    ${shenshaCard(shensha)}
    <div class="card"><h3>规则式解读 <span class="src-tag">释义</span></h3>
      <p><b>日主${b.dayGan}</b>：${interp.gan[b.dayGan]}</p>
      <p>${interp.wuXingStrong.replace('{wx}', strongest[0]).replace('{trait}', interp.wuXing[strongest[0]])}${strongest[0] !== weakest[0] ? '<br>' + interp.wuXingWeak.replace('{wx}', weakest[0]).replace('{trait}', interp.wuXing[weakest[0]]) : ''}</p>
      <p>${shiShenItems || ''}</p>
      ${Object.entries(b.pillars).map(([k, p]) => p.ganShiShen !== '日主' && interp.shiShen[p.ganShiShen] ? `<p style="font-size:13.5px;color:var(--muted)">▸ ${k === 'year' ? '年柱' : k === 'month' ? '月柱' : '时柱'}${p.ganShiShen}：${interp.shiShen[p.ganShiShen]}</p>` : '').join('')}
      <p class="note">${interp.naYin} ${interp.qiYunNote.replace('{minutes}', b.solarCorrection ? b.solarCorrection.minutes : 0)}</p>
      <p class="note">${interp.disclaimer}</p>
    </div>
    ${caseLibraryCard()}`;
}

function cast() {
  const p = card.get();
  if (!p) { showError(els.result, '请先在上方填写并保存出生信息（或到首页填写，全站通用）'); return; }
  withBusy(els.btn, '排盘中…', () => {
    try {
      const b = castBazi({ year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, gender: p.gender, longitude: els.solar.checked ? p.lon : undefined });
      render(b);
      revealCards(els.result);
      animateMeters(els.result);
      announce(els.result, `排盘完成：${b.solar.date} ${b.solar.time}，日主${b.dayGan}（${b.dayGanWuXing}）`);
      lastRendered = true;
      els.result.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
    } catch (e) {
      showError(els.result, `排盘出错：${e.message}`);
    }
  });
}

els.btn.addEventListener('click', cast);
