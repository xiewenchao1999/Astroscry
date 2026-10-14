// ziwei-page.mjs — 紫微页胶水：出生信息卡（共享）→ castZiwei → 渲染 12 宫盘
import { renderLayout, loadData, showError } from '../ui/layout.mjs';
import { mountBirthCard } from '../ui/birth-profile.mjs';
import { castZiwei } from '../core/ziwei.mjs';
import { revealCards, withBusy, announce } from '../ui/motion.mjs';

renderLayout();

const els = { form: document.getElementById('form'), result: document.getElementById('result'), btn: document.getElementById('cast') };
const interp = await loadData('../data/interpret-ziwei.json');
let lastRendered = false;

const card = mountBirthCard(els.form, { onChange: () => { if (lastRendered) cast(); } });

// 12 宫按地支布局（4×4，中宫 2×2）
const GRID = [
  ['巳', '午', '未', '申'],
  ['辰', null, null, '酉'],
  ['卯', null, null, '戌'],
  ['寅', '丑', '子', '亥'],
];

function palaceCell(p) {
  const major = p.majorStars.map((s) => `<div class="p-major">${s.name}${s.brightness ? `<small style="font-weight:400">(${s.brightness})</small>` : ''}${s.mutagen ? `<span style="color:${s.mutagen === '忌' ? 'var(--bad)' : 'var(--good)'}">${s.mutagen}</span>` : ''}</div>`).join('');
  const minor = p.minorStars.length ? `<div class="p-minor">${p.minorStars.map((s) => s.name + (s.mutagen || '')).join(' ')}</div>` : '';
  const adj = p.adjectiveStars.length ? `<div class="p-adj">${p.adjectiveStars.slice(0, 5).join('·')}</div>` : '';
  return `<div class="palace ${p.name === '命宫' ? 'ming' : ''}" ${p.name === '命宫' ? 'title="命宫：全盘核心，代表先天格局与本性"' : ''}>
    <div class="p-head"><b>${p.name}${p.isBodyPalace ? '<span style="color:var(--accent)">✦身宫</span>' : ''}</b><span>${p.stemBranch}</span></div>
    ${major}${minor}${adj}
    ${p.decadal ? `<div class="p-decade" title="大限：${p.decadal.range[0]}~${p.decadal.range[1]} 虚岁行此宫（每步十年）">限 ${p.decadal.range[0]}-${p.decadal.range[1]}</div>` : ''}
  </div>`;
}

function render(z) {
  const info = `
    <div class="palace" style="grid-column:2/4;grid-row:2/4;display:flex;flex-direction:column;justify-content:center;text-align:center;">
      <div style="font-size:26px;color:var(--accent);letter-spacing:4px;">星卜 · 紫微命盘</div>
      <div style="color:var(--muted);margin-top:8px;">${z.lunarDate} · ${z.timeText}</div>
      <div style="margin-top:6px;">五行局 <b style="color:var(--accent2)">${z.fiveElementsClass}</b> · 命主 <b style="color:var(--accent2)">${z.soul}</b> · 身主 <b style="color:var(--accent2)">${z.body}</b></div>
      <div style="color:var(--muted);margin-top:4px;font-size:12px;">四柱 ${z.chineseDate} · ${z.sign} · 生肖${z.zodiac}</div>
    </div>`;
  // 4×4 网格按地支序铺宫位，中宫信息在「辰」后插入
  const parts = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const br = GRID[r][c];
      if (br === null) continue;
      const p = z.palaces.find((x) => x.earthlyBranch === br);
      parts.push(p ? palaceCell(p) : '');
      if (r === 1 && c === 0) parts.push(info);
    }
  }
  const ming = z.mingGong;
  const mingText = ming && ming.majorStars.length
    ? ming.majorStars.map((s) => interp.majorStars[s.name] || '').join('<br>')
    : (ming ? interp.emptyPalace : '');

  els.result.innerHTML = `
    <div class="card"><h3>命盘</h3><div class="palace-grid">${parts.join('')}</div>
      <div class="note">金色高亮为<b>命宫</b>（全盘核心）；「✦身宫」为后天发力点所在宫。宫内底部「限 X-Y」＝行至此宫的大限起讫虚岁（每步十年，随五行局起限不同）。悬停可查看说明。</div></div>
    <div class="card"><h3>命宫解读 <span class="src-tag">释义</span></h3>
      <p style="color:var(--muted)">命宫在 ${ming.stemBranch}，${ming.majorStars.length ? '主星：' + ming.majorStars.map((s) => s.name + (s.brightness || '') + (s.mutagen || '')).join('、') : '无主星'}</p>
      <p>${mingText}</p>
      ${ming.majorStars.filter((s) => s.mutagen).map((s) => `<p style="font-size:13.5px;color:var(--muted)">▸ ${s.name}化${s.mutagen}：${interp.mutagen[s.mutagen]}</p>`).join('')}
      <h3 style="margin-top:14px">本命四化图例</h3>
      <div>${['禄', '权', '科', '忌'].map((k) => `<span class="pill ${k === '忌' ? 'bad' : 'good'}">${k}</span><span style="font-size:12.5px;color:var(--muted);margin-right:12px;">${interp.mutagen[k]}</span>`).join('')}</div>
      <p style="font-size:13.5px;color:var(--muted)">▸ ${interp.bodyPalaceNote}（身宫在${z.shenGong.name}）</p>
      <p class="note">${interp.fiveElementsNote.replace('{cls}', z.fiveElementsClass)}</p>
      <p class="note">${interp.disclaimer}</p>
    </div>`;
}

function cast() {
  const p = card.get();
  if (!p) { showError(els.result, '请先在上方填写并保存出生信息（或到首页填写，全站通用）'); return; }
  withBusy(els.btn, '起盘中…', () => {
    try {
      const z = castZiwei({ year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, gender: p.gender });
      render(z);
      revealCards(els.result);
      announce(els.result, `起盘完成：命主${z.soul}，身主${z.body}，${z.fiveElementsClass}`);
      lastRendered = true;
      els.result.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      showError(els.result, `起盘出错：${e.message}`);
    }
  });
}

els.btn.addEventListener('click', cast);
