// horoscope-page.mjs — 每日星象页胶水
import { renderLayout, loadData, showError } from '../ui/layout.mjs';
import { loadProfile } from '../ui/birth-profile.mjs';
import { SIGNS, dailyFortune, computeSky, sunSignByDate } from '../core/astro.mjs';
import { revealCards, animateMeters, stagger } from '../ui/motion.mjs';
import { setAISource } from '../ui/ai-panel.mjs';

renderLayout();

const els = { sign: document.getElementById('sign'), birth: document.getElementById('birth'), sky: document.getElementById('sky'), detail: document.getElementById('detail'), all: document.getElementById('all'), refresh: document.getElementById('refresh') };
let interp, fortune, sky;

els.sign.innerHTML = SIGNS.map((s) => `<option value="${s.key}">${s.cn}座</option>`).join('');
els.sign.value = 'leo';
// 已保存出生信息时自动选中太阳星座
const savedProfile = loadProfile();
if (savedProfile) els.sign.value = sunSignByDate(savedProfile.month, savedProfile.day);
// P15：按生日推断太阳星座（原 window.__infer 全局 + inline onchange 已移除，改模块内监听）
els.birth.addEventListener('change', () => {
  const d = els.birth.value;
  if (!d) return;
  const [y, m, dd] = d.split('-').map(Number);
  els.sign.value = sunSignByDate(m, dd);
});

async function boot() {
  try {
    interp = await loadData('../data/interpret-horoscope.json');
    refresh();
  } catch (e) { showError(els.detail, `加载失败：${e.message}`); }
}

function refresh() {
  // 今日 12:00 本地（东八区）
  const now = new Date();
  const utc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0));
  sky = computeSky(utc);
  fortune = dailyFortune(utc);
  setAISource('horoscope', { sky, fortunes: fortune });
  renderSky();
  renderAll();
  renderDetail(els.sign.value);
}

function renderSky() {
  const retros = Object.values(sky.planets).filter((p) => p.retrograde).map((p) => p.cn);
  els.sky.innerHTML = `<h3>今日天象</h3>
    <p>${interp.moonPhaseIntro.replace('{phase}', sky.moonPhase.name).replace('{angle}', sky.moonPhase.angle.toFixed(1)).replace('{illum}', (sky.moonPhase.illumination * 100).toFixed(0)).replace('{moonSign}', sky.planets.moon.signCn)}</p>
    <p>${(retros.length ? interp.retroNote.replace('{planets}', retros.join('、')) : interp.noRetro)}</p>`;
  revealCards(els.sky);
}

function renderAll() {
  els.all.innerHTML = fortune.map((f) => `
    <div class="card" style="cursor:pointer;margin-bottom:0" data-sign="${f.signKey}">
      <h3>${f.signCn} <span class="pill ${f.level === '旺' || f.level === '顺' ? 'good' : f.level === '滞' ? 'bad' : 'gold'}">${f.level} ${f.score}</span></h3>
      <div class="meter" style="background:rgba(255,255,255,0.06);border-radius:6px;height:6px;">
        <i style="width:0;background:linear-gradient(90deg,var(--accent2),var(--accent))" data-w="${f.score}"></i></div>
    </div>`).join('');
  stagger(els.all, '.card');
  revealCards(els.all);
  animateMeters(els.all);
}

// P15：星座卡点击走事件委托（原 inline onclick="window.__pick(...)" 已移除，对全站 addEventListener 模式对齐且免 CSP 顾虑）
els.all.addEventListener('click', (e) => {
  const card = e.target.closest('[data-sign]');
  if (!card) return;
  els.sign.value = card.dataset.sign;
  renderDetail(card.dataset.sign);
});

/** 星座档案：关键词 + 六域评语 + 相性（语料来自 interpret-horoscope.json 的 signs[x]） */
function signProfile(s) {
  if (!s?.domains || !interp.domainsLabels) return '';
  const lbl = interp.domainsLabels;
  const nameOf = (k) => SIGNS.find((x) => x.key === k)?.cn ?? k;
  const m = s.match;
  return `
    ${s.keywords ? `<p>${s.keywords.map((k) => `<span class="pill gold">${k}</span>`).join('')}</p>` : ''}
    <details style="margin-top:10px;" open>
      <summary style="cursor:pointer;color:var(--accent2);font-weight:600;">${interp.domainsTitle}</summary>
      <p class="hint">${interp.domainsNote}</p>
      ${Object.entries(lbl).map(([k, v]) => `<p><b>${v}：</b>${s.domains[k] ?? ''}</p>`).join('')}
    </details>
    ${m ? `<details style="margin-top:8px;">
      <summary style="cursor:pointer;color:var(--accent2);font-weight:600;">${interp.matchTitle}</summary>
      <p class="hint">${interp.matchNote}</p>
      <p><b>${interp.matchBestLabel}：</b>${m.best.signs.map((k) => `<span class="pill good">${nameOf(k)}座</span>`).join('')} ${m.best.text}</p>
      <p><b>${interp.matchHardLabel}：</b>${m.hard.signs.map((k) => `<span class="pill bad">${nameOf(k)}座</span>`).join('')} ${m.hard.text}</p>
    </details>` : ''}`;
}

function renderDetail(signKey) {
  const f = fortune.find((x) => x.signKey === signKey);
  const s = interp.signs[signKey];
  if (!f || !s) return;
  els.detail.innerHTML = `<h3>${s.cn} · 今日 ${f.level}（${f.score}/95）</h3>
    <p>${interp.levels[f.level]}。${s.advice[f.level]}</p>
    <p style="color:var(--muted);font-size:13.5px;">${s.cn}特质：${s.trait}</p>
    ${signProfile(s)}
    <h3 style="margin-top:14px">评分因子（透明可查）</h3>
    ${f.factors.length ? f.factors.map((x) => `<span class="pill">${x}</span>`).join('') : '<span class="pill">今日无显著行运相位作用于守护星</span>'}
    <p class="note">${interp.disclaimer}</p>`;
  revealCards(els.detail);
}

els.sign.addEventListener('change', () => renderDetail(els.sign.value));
els.refresh.addEventListener('click', refresh);
boot();
