// synastry-page.mjs — 合盘页胶水：双人出生信息 → castNatal ×2 → 跨盘相位 → 评分与解读
import { renderLayout, loadData, showError, bootPage } from '../ui/layout.mjs';
import { mountBirthCard } from '../ui/birth-profile.mjs';
import { castNatal } from '../core/astro.mjs';
import { interAspects, compatibilityScore, compatibilityDimensions, strengthsAndChallenges, pairKey, houseOverlay } from '../core/astro-synastry.mjs';
import { castBazi } from '../core/bazi.mjs';
import { matchBazi } from '../core/bazi-synastry.mjs';
import { revealCards, withBusy, announce, reducedMotion } from '../ui/motion.mjs';
import { setAISource } from '../ui/ai-panel.mjs';

renderLayout();

const els = { me: document.getElementById('form-me'), other: document.getElementById('form-other'), result: document.getElementById('result'), btn: document.getElementById('cast') };

const cardMe = mountBirthCard(els.me, {});
const cardOther = mountBirthCard(els.other, { storageKey: 'astroscry.partner.v1' });
// O08：数据加载迁入 bootPage——失败显示错误卡并终止模块（不再静默白屏）
let interp, baziInterp, weights;

await bootPage(els.result, async () => {
  [interp, baziInterp, weights] = await Promise.all([
    loadData('../data/interpret-synastry.json'),
    loadData('../data/interpret-bazi.json'),
    loadData('../data/wuxing-weights.json'),
  ]);
});

function castOne(card, label) {
  const p = card.get();
  if (!p) throw new Error(`请先填写并保存「${label}」的出生信息`);
  if (p.lat == null) throw new Error(`「${label}」的出生信息缺少城市（计算上升点需要经纬度）`);
  return castNatal({ year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, lat: p.lat, lon: p.lon, tzOffsetHours: p.tz, cityName: p.cityName });
}

const bandOf = (score) => interp.scoreBands.find((b) => score >= b.min);

/** 八字合婚卡：生肖/夫妻宫/日干五合/五行互补（matchBazi 规则引擎）；失败静默降级为空 */
function baziMatchCard(pA, pB) {
  try {
    const opt = (p) => ({ year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, gender: p.gender });
    const m = matchBazi(castBazi(opt(pA)), castBazi(opt(pB)), weights, baziInterp);
    return `
      <div class="card"><h3>八字合婚 <span class="src-tag">规则引擎</span></h3>
        <p style="color:var(--accent);font-weight:700;">${m.summary}</p>
        ${m.items.map((x) => `<p><b>${x.area}${x.typeCn ? '·' + x.typeCn : ''}${x.pair ? '（' + x.pair + '）' : ''}：</b>${x.verdict}</p>`).join('')}
        <p class="hint">与上方星盘合盘相互独立：星盘看心理互动，八字合婚看气场结构。${baziInterp.synastry.intro}</p>
      </div>`;
  } catch { /* 八字合婚失败不影响星盘合盘主流程 */ return ''; }
}

function render(nA, nB, pA, pB) {
  const { items, summary } = interAspects(nA.planets, nB.planets);
  const score = compatibilityScore(items);
  const dims = compatibilityDimensions(items);
  const overlay = houseOverlay(nA, nB);
  const { harmonious, challenging, neutral } = strengthsAndChallenges(items, 4);
  const band = bandOf(score);
  // AI 数据源：双方盘只瘦身传落座/落宫，相位/评分/宫位叠加全传
  const slimNatal = (n) => ({
    sun: n.planets.sun.signCn, moon: n.planets.moon.signCn, asc: n.ascSign,
    planets: Object.fromEntries(Object.entries(n.planets).map(([k, p]) => [k, { sign: p.signCn, house: p.house }])),
  });
  setAISource('synastry', { a: slimNatal(nA), b: slimNatal(nB), aspects: items, score, dims, overlay }, `${score} 分 · ${band?.cn ?? ''}`);

  const row = (x) => `<tr><td>${x.aCn} ${x.aspectCn} ${x.bCn}</td><td style="color:var(--muted)">容许度 ${x.orb}°</td><td>${x.strength}</td></tr>`;
  const pairText = (x) => interp.pairs[pairKey(x.a, x.b)] ?? interp.pairFallback.replace('{aCn}', x.aCn).replace('{bCn}', x.bCn).replace('{aspectCn}', x.aspectCn).replace('{natureText}', interp.natureTexts[x.nature]);
  const overlayTable = (list) => `<table class="plain"><tr><th>行星</th><th>落宫</th><th>领域</th></tr>
    ${list.map((x) => `<tr><td>${x.planetCn}<span style="color:var(--muted);font-size:12px;">（${x.signCn}）</span></td><td><b>第 ${x.house} 宫</b></td><td style="color:var(--muted);font-size:13px;">${interp.houses[String(x.house)]}</td></tr>`).join('')}</table>`;

  els.result.innerHTML = `
    <div class="card"><h3>总览</h3>
      <div class="kv">
        <div><span>${pA.cityName || 'A'}</span><b>日${nA.planets.sun.signCn} 月${nA.planets.moon.signCn} 升${nA.ascSign}</b></div>
        <div><span>${pB.cityName || 'B'}</span><b>日${nB.planets.sun.signCn} 月${nB.planets.moon.signCn} 升${nB.ascSign}</b></div>
      </div>
      <div style="display:flex;align-items:center;gap:16px;margin-top:14px;flex-wrap:wrap;">
        <div style="font-size:44px;font-weight:800;color:var(--accent);">${score}</div>
        <div>
          <div style="font-weight:700;color:var(--accent2);">${band.cn}</div>
          <div class="hint">${summary.total} 组跨盘相位 · 和谐 ${summary.harmonious} / 挑战 ${summary.challenging} / 中性 ${summary.neutral}</div>
        </div>
      </div>
      <p style="margin-top:10px;">${band.text}</p>
      <div style="margin-top:8px;">${Object.entries(summary.byType).map(([k, v]) => `<span class="pill">${k} × ${v}</span>`).join('')}</div>
    </div>
    ${baziMatchCard(pA, pB)}
    <div class="card"><h3>${interp.dimensionsTitle}</h3>
      <table class="plain"><tr><th>维度</th><th>评分</th><th>档位</th><th>最强互动</th></tr>
      ${Object.values(dims).map((d) => `<tr>
        <td>${d.cn}</td>
        <td>${d.score ?? '—'}</td>
        <td>${d.score != null ? bandOf(d.score).cn : '—'}</td>
        <td style="color:var(--muted)">${d.top ? `${d.top.aCn} ${d.top.aspectCn} ${d.top.bCn}` : interp.dimensionEmpty}</td>
      </tr>`).join('')}
      </table>
      <p class="note">${interp.dimensionNote}</p>
    </div>
    <div class="grid grid-2">
      <div class="card"><h3>关系优势（最强和谐相位）</h3>
        ${harmonious.length ? `<table class="plain">${harmonious.map((x) => row(x)).join('')}</table>${harmonious.map((x) => `<p style="font-size:13px;color:var(--muted)">▸ ${pairText(x)}</p>`).join('')}` : '<p class="hint">无显著和谐相位</p>'}
      </div>
      <div class="card"><h3>关系课题（最强挑战相位）</h3>
        ${challenging.length ? `<table class="plain">${challenging.map((x) => row(x)).join('')}</table>${challenging.map((x) => `<p style="font-size:13px;color:var(--muted)">▸ ${pairText(x)}</p>`).join('')}` : '<p class="hint">无显著挑战相位</p>'}
      </div>
    </div>
    <div class="card"><h3>${interp.overlayTitle}</h3>
      <p class="hint">${interp.overlayNote}</p>
      <div class="grid grid-2" style="margin-top:10px;">
        <div><h4 style="margin:0 0 8px;">${interp.overlayATitle}</h4>${overlayTable(overlay.aInB)}</div>
        <div><h4 style="margin:0 0 8px;">${interp.overlayBTitle}</h4>${overlayTable(overlay.bInA)}</div>
      </div>
    </div>
    <div class="card"><h3>全部跨盘相位（按强度降序）</h3>
      <table class="plain"><tr><th>相位</th><th>容许度</th><th>强度</th></tr>${items.slice(0, 20).map((x) => row(x)).join('')}</table>
      ${neutral.length ? `<p class="note">▸ 合相示例：${pairText(neutral[0])}</p>` : ''}
      <p class="note">${interp.synastryNote}</p>
      <p class="note">${interp.disclaimer}</p>
    </div>`;
}

function cast() {
  withBusy(els.btn, '合盘中…', () => {
    try {
      const pA = cardMe.get(), pB = cardOther.get();
      const nA = castOne(cardMe, '你');
      const nB = castOne(cardOther, '对方');
      render(nA, nB, pA, pB);
      revealCards(els.result);
      announce(els.result, '合盘完成');
      els.result.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
    } catch (e) {
      showError(els.result, e.message);
    }
  });
}

els.btn.addEventListener('click', cast);
