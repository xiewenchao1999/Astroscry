// ziwei-page.mjs — 紫微页胶水：出生信息卡（共享）→ castZiwei → 渲染 12 宫盘
import { renderLayout, loadData, showError } from '../ui/layout.mjs';
import { mountBirthCard } from '../ui/birth-profile.mjs';
import { castZiwei, ziweiHoroscope } from '../core/ziwei.mjs';
import { revealCards, withBusy, announce, reducedMotion } from '../ui/motion.mjs';
import { setAISource } from '../ui/ai-panel.mjs';

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
  return `<div class="palace ${p.name === '命宫' ? 'ming' : ''}" ${interp.palaces[p.name] ? `title="${p.name}宫：${interp.palaces[p.name]}"` : ''}>
    <div class="p-head"><b>${p.name}${p.isBodyPalace ? '<span style="color:var(--accent)">✦身宫</span>' : ''}</b><span>${p.stemBranch}</span></div>
    ${major}${minor}${adj}
    ${p.decadal ? `<div class="p-decade" title="大限：${p.decadal.range[0]}~${p.decadal.range[1]} 虚岁行此宫（每步十年）">限 ${p.decadal.range[0]}-${p.decadal.range[1]}</div>` : ''}
  </div>`;
}

// 四化文案：iztro 的 mutagen 是「按 禄/权/科/忌 顺序」的星名数组（个别版本给对象，防御式取值）
const MUTAGEN_ORDER = ['禄', '权', '科', '忌'];
const mutagenList = (arr) => (arr || [])
  .map((m, i) => `${typeof m === 'string' ? m : (m?.name ?? '')}${MUTAGEN_ORDER[i] ?? ''}`)
  .filter((s) => s.length > 1)
  .join('、');

/** 运限取数：本地今日日期 + ziweiHoroscope；结构不全或引擎异常时返回 null（页面降级为提示句） */
function currentHoroscope(profile) {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const todayISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  try {
    const h = ziweiHoroscope(profile, todayISO);
    return h?.decadal && h?.yearly ? { h, todayISO } : null;
  } catch { return null; }
}

/** 运限卡：当前大限与流年（限内命宫落在本命盘哪一宫 + 各自四化） */
function horoscopeCard(z, hzInfo) {
  const hz = interp.horoscope;
  if (!hzInfo) return `<div class="card"><h3>${hz.title}</h3><p class="hint">${hz.fail}</p></div>`;
  const { h, todayISO } = hzInfo;
  const palaceNameAt = (idx) => z.palaces[idx]?.name ?? '未知宫位';
  const range = z.palaces[h.decadal.index]?.decadal?.range;
  return `
    <div class="card"><h3>${hz.title} <span class="src-tag">${todayISO}</span></h3>
      <p class="hint">${hz.intro}</p>
      <p><b>${hz.decadal.replace('{stem}', h.decadal.stemBranch).replace('{from}', range?.[0] ?? '—').replace('{to}', range?.[1] ?? '—').replace('{palace}', palaceNameAt(h.decadal.index))}</b></p>
      <p>${hz.mutagen.replace('{list}', mutagenList(h.decadal.mutagen) || '—')}</p>
      <p class="hint">${hz.decadalNote}</p>
      <p><b>${hz.yearly.replace('{stem}', h.yearly.stemBranch).replace('{age}', h.age?.nominalAge ?? '—').replace('{palace}', palaceNameAt(h.yearly.index))}</b></p>
      <p>${hz.mutagen.replace('{list}', mutagenList(h.yearly.mutagen) || '—')}</p>
      <p class="hint">${hz.yearlyNote}</p>
      <p class="note">${hz.note}</p>
    </div>`;
}

/** 十二宫主星速览：每宫的 主星星性（语料 starNature）+ 宫职（语料 palaces）+ 亮度判词，三层并列 */
function palaceStarsCard(z) {
  const rows = z.palaces.map((p) => {
    const stars = p.majorStars.length ? p.majorStars : null;
    if (!stars) {
      return `<p><b>${p.name}宫</b>（${p.stemBranch}）：无主星——借对宫主星参看，此宫的力量偏薄，宜主动借力。</p>`;
    }
    const head = `<p><b>${p.name}宫</b>（${p.stemBranch}）：主星 ${stars.map((s) => `${s.name}${s.brightness ? `（${s.brightness}）` : ''}${s.mutagen ? `化${s.mutagen}` : ''}`).join('、')}</p>`;
    const starLines = stars.map((s) => {
      const nat = interp.starNature?.[s.name];
      const br = s.brightness ? interp.brightness?.[s.brightness] : '';
      return `<p class="hint" style="margin-left:14px">▸ ${interp.palaceStarStarLabel}·${s.name}：${nat ?? '（本星未收录释义）'}${br ? ` ${br}` : ''}</p>`;
    }).join('');
    const duty = interp.palaces?.[p.name] ?? '';
    return `${head}${starLines}${duty ? `<p class="hint" style="margin-left:14px">▸ ${interp.palaceStarDutyLabel}·${p.name}：${duty}</p>` : ''}`;
  }).join('');
  return `
    <div class="card"><h3>${interp.palaceStarTitle} <span class="src-tag">释义</span></h3>
      <p class="hint">${interp.palaceStarNote}</p>
      <details style="margin-top:8px;" open>
        <summary style="cursor:pointer;color:var(--accent2);font-weight:600;">逐宫展开（十二宫）</summary>
        ${rows}
      </details>
      <p class="note">${interp.palaceStarBoundary}</p>
    </div>`;
}

function render(z, hzInfo) {
  // AI 数据源：iztro 完整盘过大，只瘦身传关键字段（主星含四化/亮度、辅星、宫干支）+ 当前运限
  setAISource('ziwei', {
    lunarDate: z.lunarDate, chineseDate: z.chineseDate, timeText: z.timeText,
    fiveElementsClass: z.fiveElementsClass, soul: z.soul, body: z.body, sign: z.sign, zodiac: z.zodiac,
    horoscope: hzInfo ? {
      date: hzInfo.todayISO,
      decadal: { stem: hzInfo.h.decadal.stemBranch, palace: z.palaces[hzInfo.h.decadal.index]?.name, mutagen: mutagenList(hzInfo.h.decadal.mutagen) },
      yearly: { stem: hzInfo.h.yearly.stemBranch, palace: z.palaces[hzInfo.h.yearly.index]?.name, mutagen: mutagenList(hzInfo.h.yearly.mutagen), age: hzInfo.h.age?.nominalAge },
    } : null,
    palaces: z.palaces.map((p) => ({
      name: p.name, isBodyPalace: !!p.isBodyPalace, stemBranch: p.stemBranch,
      majorStars: p.majorStars.map((s) => `${s.name}${s.mutagen ? `化${s.mutagen}` : ''}${s.brightness ? `(${s.brightness})` : ''}`),
      minorStars: p.minorStars.map((s) => s.name + (s.mutagen || '')),
      adjectiveStars: (p.adjectiveStars || []).slice(0, 6),
    })),
  }, `命主${z.soul} · ${z.fiveElementsClass}${hzInfo ? ` · 流年${hzInfo.h.yearly.stemBranch}` : ''}`);
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
      <div class="note">金色高亮为<b>命宫</b>（全盘核心）；「✦身宫」为后天发力点所在宫。宫内底部「限 X-Y」＝行至此宫的大限起讫虚岁（每步十年，随五行局起限不同）。悬停宫格可查看宫职说明。</div>
      <details style="margin-top:10px;"><summary style="cursor:pointer;color:var(--accent2);">十二宫职速查</summary>
        ${Object.entries(interp.palaces).map(([k, v]) => `<p style="font-size:13.5px;"><b>${k}宫：</b>${v}</p>`).join('')}
      </details></div>
    <div class="card"><h3>命宫解读 <span class="src-tag">释义</span></h3>
      <p style="color:var(--muted)">命宫在 ${ming.stemBranch}，${ming.majorStars.length ? '主星：' + ming.majorStars.map((s) => s.name + (s.brightness || '') + (s.mutagen || '')).join('、') : '无主星'}</p>
      <p>${mingText}</p>
      ${ming.majorStars.filter((s) => s.mutagen).map((s) => `<p style="font-size:13.5px;color:var(--muted)">▸ ${s.name}化${s.mutagen}：${interp.mutagen[s.mutagen]}</p>`).join('')}
      <h3 style="margin-top:14px">本命四化图例</h3>
      <div>${['禄', '权', '科', '忌'].map((k) => `<span class="pill ${k === '忌' ? 'bad' : 'good'}">${k}</span><span style="font-size:12.5px;color:var(--muted);margin-right:12px;">${interp.mutagen[k]}</span>`).join('')}</div>
      <p style="font-size:13.5px;color:var(--muted)">▸ ${interp.bodyPalaceNote}（身宫在${z.shenGong.name}）</p>
      <p class="note">${interp.fiveElementsNote.replace('{cls}', z.fiveElementsClass)}</p>
      <p class="note">${interp.disclaimer}</p>
    </div>
    ${palaceStarsCard(z)}
    ${horoscopeCard(z, hzInfo)}`;
}

function cast() {
  const p = card.get();
  if (!p) { showError(els.result, '请先在上方填写并保存出生信息（或到首页填写，全站通用）'); return; }
  withBusy(els.btn, '起盘中…', () => {
    try {
      const z = castZiwei({ year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, gender: p.gender });
      const hzInfo = currentHoroscope({ year: p.year, month: p.month, day: p.day, hour: p.hour, gender: p.gender });
      render(z, hzInfo);
      revealCards(els.result);
      announce(els.result, `起盘完成：命主${z.soul}，身主${z.body}，${z.fiveElementsClass}`);
      lastRendered = true;
      els.result.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
    } catch (e) {
      showError(els.result, `起盘出错：${e.message}`);
    }
  });
}

els.btn.addEventListener('click', cast);
