// synastry-page.mjs — 合盘页胶水：双人出生信息 → castNatal ×2 → 跨盘相位 → 评分与解读
import { renderLayout, loadData, showError } from '../ui/layout.mjs';
import { mountBirthCard } from '../ui/birth-profile.mjs';
import { castNatal } from '../core/astro.mjs';
import { interAspects, compatibilityScore, strengthsAndChallenges, pairKey } from '../core/astro-synastry.mjs';
import { revealCards, withBusy, announce } from '../ui/motion.mjs';

renderLayout();

const els = { me: document.getElementById('form-me'), other: document.getElementById('form-other'), result: document.getElementById('result'), btn: document.getElementById('cast') };

const cardMe = mountBirthCard(els.me, {});
const cardOther = mountBirthCard(els.other, { storageKey: 'astroscry.partner.v1' });
const interp = await loadData('../data/interpret-synastry.json');

function castOne(card, label) {
  const p = card.get();
  if (!p) throw new Error(`请先填写并保存「${label}」的出生信息`);
  if (p.lat == null) throw new Error(`「${label}」的出生信息缺少城市（计算上升点需要经纬度）`);
  return castNatal({ year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, lat: p.lat, lon: p.lon, tzOffsetHours: p.tz, cityName: p.cityName });
}

function render(nA, nB, pA, pB) {
  const { items, summary } = interAspects(nA.planets, nB.planets);
  const score = compatibilityScore(items);
  const { harmonious, challenging, neutral } = strengthsAndChallenges(items, 4);
  const band = interp.scoreBands.find((b) => score >= b.min);

  const row = (x) => `<tr><td>${x.aCn} ${x.aspectCn} ${x.bCn}</td><td style="color:var(--muted)">容许度 ${x.orb}°</td><td>${x.strength}</td></tr>`;
  const pairText = (x) => interp.pairs[pairKey(x.a, x.b)] ?? interp.pairFallback.replace('{aCn}', x.aCn).replace('{bCn}', x.bCn).replace('{aspectCn}', x.aspectCn).replace('{natureText}', interp.natureTexts[x.nature]);

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
    <div class="grid grid-2">
      <div class="card"><h3>关系优势（最强和谐相位）</h3>
        ${harmonious.length ? `<table class="plain">${harmonious.map((x) => row(x)).join('')}</table>${harmonious.map((x) => `<p style="font-size:13px;color:var(--muted)">▸ ${pairText(x)}</p>`).join('')}` : '<p class="hint">无显著和谐相位</p>'}
      </div>
      <div class="card"><h3>关系课题（最强挑战相位）</h3>
        ${challenging.length ? `<table class="plain">${challenging.map((x) => row(x)).join('')}</table>${challenging.map((x) => `<p style="font-size:13px;color:var(--muted)">▸ ${pairText(x)}</p>`).join('')}` : '<p class="hint">无显著挑战相位</p>'}
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
      els.result.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      showError(els.result, e.message);
    }
  });
}

els.btn.addEventListener('click', cast);
