// natal-page.mjs — 西方本命盘页胶水：出生信息卡（共享）→ castNatal → 渲染
import { renderLayout, loadData, showError } from '../ui/layout.mjs';
import { mountBirthCard } from '../ui/birth-profile.mjs';
import { castNatal, SIGNS, computeSky, ASPECTS } from '../core/astro.mjs';
import { readNatal } from '../core/natal-reading.mjs';
import { interAspects, strengthsAndChallenges } from '../core/astro-synastry.mjs';
import { renderWheel } from '../ui/wheel.mjs';
import { revealCards, withBusy, animateMeters, announce, reducedMotion } from '../ui/motion.mjs';
import { setAISource } from '../ui/ai-panel.mjs';

renderLayout();

const els = { form: document.getElementById('form'), result: document.getElementById('result'), btn: document.getElementById('cast') };
// O06：相位表为单一事实来源（全 7 种），本命页口径仍只取前 5 种（inNatal:true）；合盘/行运卡用全表
const IN_NATAL = new Set(ASPECTS.filter((a) => a.inNatal).map((a) => a.key));
const [interp, synInterp, natalInterp] = await Promise.all([
  loadData('../data/interpret-horoscope.json'),
  loadData('../data/interpret-synastry.json'),
  loadData('../data/interpret-natal.json'),
]);
let lastRendered = false;

const card = mountBirthCard(els.form, { onChange: () => { if (lastRendered) cast(); } });

/** 当前行运：今日天象 × 本命行星的跨盘相位 */
function transitsCard(n) {
  const sky = computeSky(new Date());
  const { items } = interAspects(sky.planets, n.planets);
  if (!items.length) return '';
  const top = items.slice(0, 8);
  return `
    <div class="card"><h3>${synInterp.transitsTitle}</h3>
      <table class="plain"><tr><th>行运</th><th>相位</th><th>本命</th><th>强度</th></tr>
      ${top.map((x) => `<tr><td>${x.aCn}${sky.planets[x.a].retrograde ? '℞' : ''}</td><td>${x.aspectCn}</td><td>${x.bCn}</td><td>${x.strength}</td></tr>`).join('')}
      </table>
      <p class="note">${synInterp.transitsNote}</p>
    </div>`;
}

function render(n) {
  const rd = readNatal(n, natalInterp);
  setAISource('natal', { ...n, reading: { summary: rd.summary, patterns: rd.patterns } });
  const planetRows = Object.values(n.planets).map((p) => `
    <tr><td>${p.cn}${p.retrograde ? `<span class="pill retro" style="margin-left:4px" title="${(natalInterp.retrograde[p.key] ?? natalInterp.retrograde.general)}">℞逆行</span>` : ''}</td>
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
    ${transitsCard(n)}
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
      ${sunDomainsBlock(n.planets.sun.signKey)}
      <p class="note">${interp.disclaimer}</p>
    </div>
    ${readingCard(rd)}`;
}

/** 太阳星座的六域评语（语料同每日星象页的 interpret-horoscope.json signs[x].domains） */
function sunDomainsBlock(signKey) {
  const s = interp.signs?.[signKey];
  if (!s?.domains || !interp.domainsLabels) return '';
  return `
      <details style="margin-top:10px;"><summary style="cursor:pointer;color:var(--accent2);font-weight:600;">太阳星座 · ${interp.domainsTitle}（${s.cn}）</summary>
        <p class="hint">${interp.domainsNote}</p>
        ${Object.entries(interp.domainsLabels).map(([k, v]) => `<p><b>${v}：</b>${s.domains[k] ?? ''}</p>`).join('')}
        <p class="hint">想看当天运势与相性速览，请到「每日星象」页。</p>
      </details>`;
}

/** 深入解读卡：综合判词 + 相位图形 + 元素/模式 + 行星落宫主题 + 关键相位判词（readNatal 规则引擎） */
function readingCard(rd) {
  const houseItems = rd.inHouses.map((x) => `<p><b>${x.cn}</b>（${x.signCn}，第 ${x.house} 宫）：${x.line}</p>${x.signLine ? `<p class="hint" style="margin-left:14px">▸ 落座释义：${x.signLine}</p>` : ''}`).join('');
  const aspectItems = rd.aspectLines.slice(0, 6).map((x) =>
    `<p style="color:${x.nature === 'harmony' ? 'var(--good)' : x.nature === 'tension' ? 'var(--bad)' : ''}"><b>${x.aCn} ${x.aspectCn} ${x.bCn}</b>（容许 ${x.orb}°）：${x.line}</p>`).join('');
  const pat = natalInterp.patterns;
  const patternBlock = pat ? `
      <p style="margin-top:10px;"><b>${pat.title}</b></p>
      <p class="hint">${pat.intro}</p>
      ${rd.patterns.length
        ? rd.patterns.map((p) => `<p><span class="pill gold">${p.label}</span> ${p.line}</p>`).join('')
        : `<p>${pat.none}</p>`}
      <p class="note">${pat.note}</p>` : '';
  return `
    <div class="card"><h3>深入解读 <span class="src-tag">规则引擎</span></h3>
      <p style="color:var(--accent);font-weight:700;">${rd.summary}</p>
      ${patternBlock}
      <p><b>元素分布：</b>${rd.elements.detail}——${rd.elements.line}</p>
      <p><b>三态分布：</b>${rd.modality.line}</p>
      <details style="margin-top:8px;" open><summary style="cursor:pointer;color:var(--accent2);font-weight:600;">行星落宫主题</summary>
        ${houseItems}
      </details>
      <details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--accent2);font-weight:600;">关键相位判词（最紧 ${Math.min(6, rd.aspectLines.length)} 条）</summary>
        ${aspectItems || '<p class="hint">本盘无主要相位。</p>'}
      </details>
      ${rd.love ? `
      <details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--accent2);font-weight:600;">姻缘视角（单盘）</summary>
        <p><b>亲密需求：</b>${rd.love.moonLine}</p>
        <p><b>爱的表达：</b>${rd.love.venusLine}</p>
        <p><b>伴侣画像：</b>第 7 宫（伴侣宫）宫头在${rd.love.dscSign}——${rd.love.dscLine}</p>
        <p class="hint">想看双人匹配度？进「合盘」页输入双方出生信息，可计算契合度总分与四维度评分。</p>
      </details>` : ''}
      <p class="note">${natalInterp.disclaimer}</p>
    </div>`;
}

function cast() {
  const p = card.get();
  if (!p) { showError(els.result, '请先在上方填写并保存出生信息（或到首页填写，全站通用）'); return; }
  if (p.lat == null) { showError(els.result, '出生信息缺少城市：请点击「修改」补充出生城市（计算上升点需要经纬度）'); return; }
  withBusy(els.btn, '绘制中…', () => {
    try {
      const n = castNatal({ year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, lat: p.lat, lon: p.lon, tzOffsetHours: p.tz, cityName: p.cityName });
      n.aspects = n.aspects.filter((a) => IN_NATAL.has(a.aspect)); // 本命口径：按 inNatal 过滤（星盘轮/相位表/解读共用此 filtered 集）
      render(n);
      revealCards(els.result);
      animateMeters(els.result);
      announce(els.result, `星盘完成：太阳${n.planets.sun.signCn}，月亮${n.planets.moon.signCn}，上升${n.ascSign}`);
      lastRendered = true;
      els.result.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
    } catch (e) {
      showError(els.result, `绘制出错：${e.message}`);
    }
  });
}

els.btn.addEventListener('click', cast);
