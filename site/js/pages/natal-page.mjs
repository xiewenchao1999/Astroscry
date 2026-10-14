// natal-page.mjs — 西方本命盘页胶水：出生信息卡（共享）→ castNatal → 渲染
import { renderLayout, loadData, showError } from '../ui/layout.mjs';
import { mountBirthCard } from '../ui/birth-profile.mjs';
import { castNatal, SIGNS } from '../core/astro.mjs';
import { renderWheel } from '../ui/wheel.mjs';

renderLayout();

const els = { form: document.getElementById('form'), result: document.getElementById('result'), btn: document.getElementById('cast') };
const interp = await loadData('../data/interpret-horoscope.json');
let lastRendered = false;

const card = mountBirthCard(els.form, { onChange: () => { if (lastRendered) cast(); } });

function render(n) {
  const planetRows = Object.values(n.planets).map((p) => `
    <tr><td>${p.cn}${p.retrograde ? '<span class="pill retro" style="margin-left:4px">℞逆行</span>' : ''}</td>
    <td>${p.signCn} ${Math.floor(p.degInSign)}°${String(Math.floor((p.degInSign % 1) * 60)).padStart(2, '0')}′</td>
    <td>第 ${p.house} 宫</td></tr>`).join('');
  const aspectRows = n.aspects.sort((a, b) => a.orb - b.orb).slice(0, 14).map((a) => `
    <tr><td>${a.aCn} ${a.aspectCn} ${a.bCn}</td><td style="color:var(--muted)">容许度 ${a.orb}°</td></tr>`).join('');
  const sun = interp.signs[n.planets.sun.signKey];
  const moon = interp.signs[n.planets.moon.signKey];
  const asc = interp.signs[n.ascSignKey];
  const elTotal = Object.values(n.elements).reduce((a, b) => a + b, 0) || 1;
  const elBar = Object.entries(n.elements).map(([k, v]) => `<span class="pill">${k}象 ${Math.round(v / elTotal * 100)}%</span>`).join('');
  // 三态（本位/固定/变动）统计：按行星落座
  const modality = { 本位: 0, 固定: 0, 变动: 0 };
  for (const p of Object.values(n.planets)) modality[SIGNS[p.signIndex].modality]++;
  const modBar = Object.entries(modality).map(([k, v]) => `<span class="pill gold">${k} ${v}</span>`).join('');

  els.result.innerHTML = `
    <div class="card"><h3>星盘总览</h3>
      <div class="kv">
        <div><span>太阳星座</span><b>${n.planets.sun.signCn}</b></div>
        <div><span>月亮星座</span><b>${n.planets.moon.signCn}</b></div>
        <div><span>上升星座</span><b>${n.ascSign}</b></div>
        <div><span>中天（MC）</span><b>${n.mcSign}</b></div>
        <div><span>出生地</span><b>${n.input.cityName || '未选城市'}</b></div>
      </div>
    </div>
    <div class="card"><h3>星盘轮（整宫制）</h3><div class="chart-box">${renderWheel(n)}</div>
      <div class="note">金色实线为上升点 ASC，虚线为中天 MC；行星标 ℞ 为逆行。宫位制采用整宫制。</div></div>
    <div class="grid grid-2">
      <div class="card"><h3>行星落座落宫</h3><table class="plain"><tr><th>星体</th><th>星座</th><th>宫位</th></tr>${planetRows}</table></div>
      <div class="card"><h3>主要相位</h3><table class="plain"><tr><th>相位</th><th>容许度</th></tr>${aspectRows || '<tr><td colspan="2" style="color:var(--muted)">无主要相位</td></tr>'}</table>
        <div style="margin-top:10px;">${elBar}</div>
        <div style="margin-top:6px;" title="本位主动开创、固定主持续深耕、变动主灵活调适">${modBar}</div></div>
    </div>
    <div class="card"><h3>三要素解读 <span class="src-tag">释义</span></h3>
      <p><b>太阳 · ${sun.cn}</b>：${sun.trait}</p>
      <p><b>月亮 · ${moon.cn}</b>：${moon.trait}</p>
      <p><b>上升 · ${asc.cn}</b>：${asc.trait}（上升是你呈现给世界的第一层气质。）</p>
      <p class="note">${interp.disclaimer}</p>
    </div>`;
}

function cast() {
  try {
    const p = card.get();
    if (!p) { showError(els.result, '请先在上方填写并保存出生信息（或到首页填写，全站通用）'); return; }
    if (p.lat == null) { showError(els.result, '出生信息缺少城市：请点击「修改」补充出生城市（计算上升点需要经纬度）'); return; }
    const n = castNatal({ year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, lat: p.lat, lon: p.lon, tzOffsetHours: p.tz, cityName: p.cityName });
    render(n);
    lastRendered = true;
    els.result.scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    showError(els.result, `绘制出错：${e.message}`);
  }
}

els.btn.addEventListener('click', cast);
