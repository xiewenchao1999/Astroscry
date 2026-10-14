// bazi-page.mjs — 八字页胶水：出生信息卡（共享）→ castBazi → 渲染
import { renderLayout, loadData, showError } from '../ui/layout.mjs';
import { mountBirthCard } from '../ui/birth-profile.mjs';
import { castBazi } from '../core/bazi.mjs';

renderLayout();

const els = { form: document.getElementById('form'), result: document.getElementById('result'), btn: document.getElementById('cast'), solar: document.getElementById('solarTime') };
const interp = await loadData('../data/interpret-bazi.json');
let lastRendered = false;

const card = mountBirthCard(els.form, { onChange: () => { if (lastRendered) cast(); } });

function wuxingBar(five) {
  const total = Object.values(five).reduce((a, b) => a + b, 0) || 1;
  const colors = { 金: '#cbd5e1', 木: '#86efac', 水: '#7dd3fc', 火: '#fca5a5', 土: '#f0c86d' };
  return Object.entries(five).map(([k, v]) => `
    <div style="margin:6px 0;"><span style="font-size:13px;">${k} · ${v}（${Math.round(v / total * 100)}%）</span>
    <div style="background:rgba(255,255,255,0.06);border-radius:6px;height:8px;margin-top:3px;">
      <div style="width:${v / total * 100}%;height:100%;border-radius:6px;background:${colors[k]}"></div></div></div>`).join('');
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

function render(b) {
  const fiveEntries = Object.entries(b.fiveElements);
  const strongest = fiveEntries.reduce((a, x) => (x[1] > a[1] ? x : a));
  const weakest = fiveEntries.reduce((a, x) => (x[1] < a[1] ? x : a));
  const age = new Date().getFullYear() - b.input.year;
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
    <div class="card"><h3>四柱</h3>${pillarTable(b)}</div>
    <div class="grid grid-2">
      <div class="card"><h3>五行分布（含藏干）</h3>${wuxingBar(b.fiveElements)}</div>
      <div class="card"><h3>大运（每步十年）</h3>
        <table class="plain"><tr><th>步骤</th><th>干支</th><th>起运年龄</th><th>起始年份</th></tr>
        ${b.daYun.map((d) => `<tr ${d.startAge <= age && d.startAge + 10 > age ? 'style="color:var(--accent)"' : ''}><td>${d.index === 0 ? '—' : d.index}</td><td>${d.ganZhi || '起运前'}</td><td>${d.startAge}</td><td>${d.startYear}</td></tr>`).join('')}
        </table>
        <div class="note">起运：出生后 ${b.qiYun.years} 年 ${b.qiYun.months} 个月 ${b.qiYun.days} 天（${b.qiYun.solar}）。高亮为当前所行大运。</div>
      </div>
    </div>
    <div class="card"><h3>规则式解读 <span class="src-tag">释义</span></h3>
      <p><b>日主${b.dayGan}</b>：${interp.gan[b.dayGan]}</p>
      <p>${interp.wuXingStrong.replace('{wx}', strongest[0]).replace('{trait}', interp.wuXing[strongest[0]])}${strongest[0] !== weakest[0] ? '<br>' + interp.wuXingWeak.replace('{wx}', weakest[0]).replace('{trait}', interp.wuXing[weakest[0]]) : ''}</p>
      <p>${shiShenItems || ''}</p>
      ${Object.entries(b.pillars).map(([k, p]) => p.ganShiShen !== '日主' && interp.shiShen[p.ganShiShen] ? `<p style="font-size:13.5px;color:var(--muted)">▸ ${k === 'year' ? '年柱' : k === 'month' ? '月柱' : '时柱'}${p.ganShiShen}：${interp.shiShen[p.ganShiShen]}</p>` : '').join('')}
      <p class="note">${interp.naYin} ${interp.qiYunNote.replace('{minutes}', b.solarCorrection ? b.solarCorrection.minutes : 0)}</p>
      <p class="note">${interp.disclaimer}</p>
    </div>`;
}

function cast() {
  try {
    const p = card.get();
    if (!p) { showError(els.result, '请先在上方填写并保存出生信息（或到首页填写，全站通用）'); return; }
    const b = castBazi({ year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, gender: p.gender, longitude: els.solar.checked ? p.lon : undefined });
    render(b);
    lastRendered = true;
    els.result.scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    showError(els.result, `排盘出错：${e.message}`);
  }
}

els.btn.addEventListener('click', cast);
