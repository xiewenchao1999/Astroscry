// home-page.mjs — 首页：出生信息卡 + 今日干支/月相摘要 + 今日综合运势（星座/八字/紫微/奇门/塔罗 五域规则汇总）
import { renderLayout, loadData } from '../ui/layout.mjs';
import { mountBirthCard, loadProfile } from '../ui/birth-profile.mjs';
import { dailyFortune, computeSky, sunSignByDate, moonPhaseName } from '../core/astro.mjs';
import { castZiwei, ziweiHoroscope } from '../core/ziwei.mjs';
import { castQimen } from '../core/qimen.mjs';
import { readQimen } from '../core/qimen-reading.mjs';
import { dailyDraw } from '../core/tarot.mjs';
import { setAISource } from '../ui/ai-panel.mjs';
import { revealCards } from '../ui/motion.mjs';

renderLayout();
mountBirthCard(document.getElementById('birth-card'));

const { Lunar, Solar } = globalThis;
const A = globalThis.Astronomy;
const now = new Date();
const pad = (x) => String(x).padStart(2, '0');
const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

// —— 今日摘要（干支 / 农历 / 月相 / 宜忌） ——
let ganZhi = '', lunarText = '', moonText = '', yiText = '', jiText = '';
try {
  const lunar = Solar.fromDate(now).getLunar();
  const ec = lunar.getEightChar();
  ganZhi = `${ec.getYear()}年 ${ec.getMonth()}月 ${ec.getDay()}日`;
  lunarText = `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
  yiText = (lunar.getDayYi() || []).slice(0, 3).join('·');
  jiText = (lunar.getDayJi() || []).slice(0, 3).join('·');
} catch { /* 首页摘要失败不阻塞 */ }
try {
  const angle = A.MoonPhase(A.MakeTime(now));
  moonText = `${moonPhaseName(angle)}（月相角 ${angle.toFixed(0)}°）`; // P17：月相名复用 core 单一事实来源
} catch { /* 同上 */ }

document.getElementById('today').innerHTML = `
  <div class="kv" style="justify-content:space-around;text-align:center;">
    <div><span>今日干支</span><b>${ganZhi || '—'}</b></div>
    <div><span>农历</span><b>${lunarText || '—'}</b></div>
    <div><span>今日月相</span><b>${moonText || '—'}</b></div>
    <div><span>宜</span><b style="color:var(--good)">${yiText || '—'}</b></div>
    <div><span>忌</span><b style="color:var(--bad)">${jiText || '—'}</b></div>
  </div>`;

// —— 今日综合运势（五域） ——
const elsDaily = document.getElementById('daily');
// P18：homeInterp 单独加载——这样 interpret-home.json 成功而其它语料失败时，
// 失败分支可以取到语料里的 failNote；homeInterp 自身失败时 failNote 同样不可达，用同文兜底
let homeInterp = null, qimenInterp = null, deck = null;
try {
  homeInterp = await loadData('data/interpret-home.json');
} catch { /* interpret-home 缺失：下方失败分支走兜底文案 */ }
try {
  [qimenInterp, deck] = await Promise.all([
    loadData('data/interpret-qimen.json'),
    loadData('data/tarot.json').then((d) => d.cards),
  ]);
} catch { /* 语料失败：daily 卡显示失败提示，其余页面功能不受影响 */ }

// 今日 12:00 本地（东八区）—— 与每日星象页同一口径
const noonUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0));

function renderDaily() {
  // 加载失败分支（P18）：文案取语料 failNote；homeInterp 自身缺失时该键同样不可达，用同文兜底
  const failNote = homeInterp?.failNote ?? '语料加载失败，今日综合暂不可用。';
  if (!homeInterp || (!qimenInterp && !deck)) {
    elsDaily.innerHTML = `<h3>今日综合运势</h3><p class="hint">${failNote}</p>`;
    return;
  }
  const p = loadProfile();
  if (!(p && p.year)) {
    elsDaily.innerHTML = `<h3>今日综合运势</h3><p class="hint">${homeInterp.needBirth}</p>`;
    return;
  }

  const blocks = [];
  const ai = { date: todayISO };
  const push = (key, fn) => {
    try { const b = fn(); if (b) { blocks.push(b); ai[key] = b.data ?? b.line; } } catch { /* 单域失败不阻塞整体 */ }
  };

  push('sign', () => {
    const sign = sunSignByDate(p.month, p.day);
    const f = dailyFortune(noonUtc).find((x) => x.signKey === sign);
    const sky = computeSky(noonUtc);
    const retros = Object.values(sky.planets).filter((x) => x.retrograde).map((x) => x.cn);
    return {
      key: 'sign',
      line: `${f.signCn}座 ${f.level}（${f.score} 分）· ${sky.moonPhase.name}${retros.length ? ` · 逆行：${retros.join('、')}` : ' · 无逆行'}`,
      good: f.level === '旺' || f.level === '顺', bad: f.level === '滞',
      data: { sign: f.signCn, level: f.level, score: f.score, moonPhase: sky.moonPhase.name, retros },
    };
  });

  push('bazi', () => (ganZhi ? {
    key: 'bazi', line: `${ganZhi} · 宜 ${yiText || '—'} / 忌 ${jiText || '—'}`,
    data: { ganZhi, yi: yiText, ji: jiText },
  } : null));

  push('ziwei', () => {
    const h = ziweiHoroscope(p, todayISO);
    const mut = (h.yearly.mutagen || []).map((m) => (typeof m === 'string' ? m : `${m.name ?? ''}${m.mutagen ?? ''}`)).filter(Boolean).join('、');
    return {
      key: 'ziwei', line: `流年${h.yearly.stemBranch}${mut ? `（四化：${mut}）` : ''} · 行${h.decadal.stemBranch}大限`,
      data: { yearly: h.yearly.stemBranch, mutagen: mut, decadal: h.decadal.stemBranch },
    };
  });

  push('qimen', () => {
    const q = castQimen({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours(), minute: now.getMinutes() });
    const rd = readQimen(q, qimenInterp);
    const tone = rd.steps.find((s) => s.key === 'eyes').items.find((it) => it.label === qimenInterp.reading.lPanYan)?.tone;
    return {
      key: 'qimen', line: `${q.juName} · ${rd.summary}`,
      good: tone === 'good', bad: tone === 'bad',
      data: { juName: q.juName, term: q.term, zhiFuStar: q.zhiFuStar, zhiShiDoor: q.zhiShiDoor, summary: rd.summary },
    };
  });

  push('tarot', () => {
    const { card, reversed } = dailyDraw(deck, todayISO);
    const kw = (reversed ? card.kwRev : card.kwUp).slice(0, 3).join('·');
    return {
      key: 'tarot', line: `${card.cn}${reversed ? '（逆位）' : ''} · ${kw}`,
      good: !reversed, bad: reversed,
      data: { name: card.cn, reversed, keywords: kw },
    };
  });

  const up = blocks.filter((b) => b.good).length;
  const down = blocks.filter((b) => b.bad).length;
  const tone = up >= 2 && up > down ? homeInterp.toneUp : down >= 2 && down > up ? homeInterp.toneDown : homeInterp.toneFlat;

  elsDaily.innerHTML = `
    <h3>今日综合运势 <span class="hint">${todayISO}</span></h3>
    <p style="color:var(--accent);font-weight:700;">${tone}</p>
    ${blocks.map((b) => `<p><span class="src-tag">${homeInterp.titles[b.key]}</span><b style="${b.good ? 'color:var(--good)' : b.bad ? 'color:var(--bad)' : ''}">${b.line}</b></p>`).join('')}
    <p class="note">${homeInterp.tarotNote}</p>
    <p class="hint">${homeInterp.aiHint}</p>`;

  setAISource('daily', ai, '今日综合');
}

renderDaily();
window.addEventListener('astroscry:profile-saved', renderDaily);
window.addEventListener('astroscry:profile-cleared', renderDaily);

// 内容就绪后再入场（先渲染后动画，避免动效作用在空盒子上）
revealCards(document.querySelector('.wrap'), '.card');
