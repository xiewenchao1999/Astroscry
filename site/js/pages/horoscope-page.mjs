// horoscope-page.mjs — 每日星象页胶水
import { renderLayout, loadData, showError } from '../ui/layout.mjs';
import { loadProfile } from '../ui/birth-profile.mjs';
import { SIGNS, dailyFortune, computeSky, sunSignByDate } from '../core/astro.mjs';

renderLayout();

const els = { sign: document.getElementById('sign'), birth: document.getElementById('birth'), sky: document.getElementById('sky'), detail: document.getElementById('detail'), all: document.getElementById('all'), refresh: document.getElementById('refresh') };
let interp, fortune, sky;

els.sign.innerHTML = SIGNS.map((s) => `<option value="${s.key}">${s.cn}座</option>`).join('');
els.sign.value = 'leo';
// 已保存出生信息时自动选中太阳星座
const savedProfile = loadProfile();
if (savedProfile) els.sign.value = sunSignByDate(savedProfile.month, savedProfile.day);
window.__infer = () => {
  const d = els.birth.value;
  if (!d) return;
  const [y, m, dd] = d.split('-').map(Number);
  els.sign.value = sunSignByDate(m, dd);
};

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
  renderSky();
  renderAll();
  renderDetail(els.sign.value);
}

function renderSky() {
  const retros = Object.values(sky.planets).filter((p) => p.retrograde).map((p) => p.cn);
  els.sky.innerHTML = `<h3>今日天象</h3>
    <p>${interp.moonPhaseIntro.replace('{phase}', sky.moonPhase.name).replace('{angle}', sky.moonPhase.angle.toFixed(1)).replace('{illum}', (sky.moonPhase.illumination * 100).toFixed(0)).replace('{moonSign}', sky.planets.moon.signCn)}</p>
    <p>${(retros.length ? interp.retroNote.replace('{planets}', retros.join('、')) : interp.noRetro)}</p>`;
}

function renderAll() {
  els.all.innerHTML = fortune.map((f) => `
    <div class="card" style="cursor:pointer;margin-bottom:0" onclick="window.__pick('${f.signKey}')">
      <h3>${f.signCn} <span class="pill ${f.level === '旺' || f.level === '顺' ? 'good' : f.level === '滞' ? 'bad' : 'gold'}">${f.level} ${f.score}</span></h3>
      <div style="background:rgba(255,255,255,0.06);border-radius:6px;height:6px;">
        <div style="width:${f.score}%;height:100%;border-radius:6px;background:linear-gradient(90deg,var(--accent2),var(--accent))"></div></div>
    </div>`).join('');
  window.__pick = (key) => { els.sign.value = key; renderDetail(key); };
}

function renderDetail(signKey) {
  const f = fortune.find((x) => x.signKey === signKey);
  const s = interp.signs[signKey];
  if (!f || !s) return;
  els.detail.innerHTML = `<h3>${s.cn} · 今日 ${f.level}（${f.score}/95）</h3>
    <p>${interp.levels[f.level]}。${s.advice[f.level]}</p>
    <p style="color:var(--muted);font-size:13.5px;">${s.cn}特质：${s.trait}</p>
    <h3 style="margin-top:14px">评分因子（透明可查）</h3>
    ${f.factors.length ? f.factors.map((x) => `<span class="pill">${x}</span>`).join('') : '<span class="pill">今日无显著行运相位作用于守护星</span>'}
    <p class="note">${interp.disclaimer}</p>`;
}

els.sign.addEventListener('change', () => renderDetail(els.sign.value));
els.refresh.addEventListener('click', refresh);
boot();
