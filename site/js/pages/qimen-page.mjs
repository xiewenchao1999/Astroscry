// qimen-page.mjs — 奇门页胶水：起局时间 → core/qimen 排盘 → 九宫格渲染 + 点宫释义
import { renderLayout, loadData, showError, esc } from '../ui/layout.mjs';
import { castQimen } from '../core/qimen.mjs';
import { stagger, revealCards, withBusy, announce } from '../ui/motion.mjs';

renderLayout();

const els = { time: document.getElementById('qtime'), cast: document.getElementById('cast'), stage: document.getElementById('stage') };
let interp = null;

// 默认起局时间 = 现在（datetime-local 需要本地时区格式）
{
  const n = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  els.time.value = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}`;
}

try {
  interp = await loadData('../data/interpret-qimen.json');
} catch (e) { showError(els.stage, `语料加载失败：${e.message}`); throw e; }

// 洛书九宫布局顺序
const LUO = [4, 9, 2, 3, 5, 7, 8, 1, 6];

els.cast.addEventListener('click', () => {
  withBusy(els.cast, '排盘中…', () => {
    try {
      const v = els.time.value; // "YYYY-MM-DDTHH:mm"
      if (!v) { showError(els.stage, '请选择起局时间'); return; }
      const [d, t] = v.split('T');
      const [y, m, dd] = d.split('-').map(Number);
      const [hh, mm] = t.split(':').map(Number);
      render(castQimen({ year: y, month: m, day: dd, hour: hh, minute: mm }));
    } catch (e) { showError(els.stage, `排盘出错：${e.message}`); }
  });
});

function render(q) {
  els.stage.innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <p style="text-align:center;"><b class="pill gold">${q.juName}</b>
        <span class="pill">${q.term} · ${q.yuan}</span>
        <span class="pill">符头 ${q.fuTou}</span>
        <span class="pill">旬首 ${q.xunShou}（遁${q.xunShouGan}）</span></p>
      <p style="text-align:center;color:var(--muted);font-size:13.5px;">
        四柱：${q.pillars.year} ${q.pillars.month} ${q.pillars.day} ${q.pillars.time}
        · 值符 <b>${q.zhiFuStar}</b>（落${q.zhiFuPalace}宫）
        · 值使 <b>${q.zhiShiDoor}</b>（落${q.zhiShiPalace}宫）</p>
    </div>
    <div class="qimen-grid" role="group" aria-label="奇门九宫格">
      ${LUO.map((p) => cell(q, p)).join('')}
    </div>
    <div id="detail" class="result" style="margin-top:14px;"></div>
    <div class="card" style="margin-top:14px;"><h3>读盘要点</h3>
      ${interp.guide.map((g) => `<p>▸ ${g}</p>`).join('')}
      <p class="note">${interp.disclaimer}</p>
    </div>`;
  stagger(els.stage.querySelector('.qimen-grid'), '.qimen-cell');
  announce(els.stage, `已排出${q.juName}，值符${q.zhiFuStar}，值使${q.zhiShiDoor}`);
  els.stage.querySelector('.qimen-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });

  els.stage.querySelectorAll('.qimen-cell[data-p]').forEach((el) => {
    el.addEventListener('click', () => detail(q, +el.dataset.p));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); detail(q, +el.dataset.p); }
    });
  });
  detail(q, q.zhiFuPalace); // 默认展示值符宫
}

function cell(q, p) {
  const c = q.palaces[p];
  const head = `<div class="q-gong">${'一二三四五六七八九'[p - 1]}宫</div>`;
  if (p === 5) {
    return `<div class="qimen-cell center" aria-label="中宫，地盘${c.dg}">
      ${head}<div class="q-dg">地盘 ${c.dg}</div><div class="q-note">${c.note}</div></div>`;
  }
  const stars = c.stars.join(' ');
  return `<div class="qimen-cell" data-p="${p}" role="button" tabindex="0"
      aria-label="${'一二三四五六七八九'[p - 1]}宫：${c.god}，${stars}，天盘干${c.tg}，${c.door}，地盘干${c.dg}，点击查看释义">
    ${head}
    <div class="q-god">${c.god}</div>
    <div class="q-star">${stars}</div>
    <div class="q-tg">${c.tg}</div>
    <div class="q-door">${c.door}</div>
    <div class="q-dg">地盘 ${c.dg}</div>
  </div>`;
}

/** 宫位释义卡：门/星/神/干含义（点击宫位或默认值符宫触发） */
function detail(q, p) {
  const c = q.palaces[p];
  if (p === 5) return;
  const box = els.stage.querySelector('#detail');
  const gong = `${'一二三四五六七八九'[p - 1]}宫`;
  const starRows = c.stars.map((s) => {
    const st = interp.stars[s];
    return `<p><b>${s}</b> <span class="pill ${st.jx.includes('凶') ? 'bad' : 'gold'}">${st.jx}</span> ${st.desc}</p>`;
  }).join('');
  const door = interp.doors[c.door];
  const tgRows = c.tg.split('').map((g) => `<span class="pill" title="${interp.stems[g]}">${g}</span>`).join('');
  box.innerHTML = `
    <div class="card"><h3>${gong} · ${c.god} / ${c.stars.join('、')} / ${c.door}</h3>
      <p><b>八神：</b>${interp.gods[c.god]}</p>
      ${starRows}
      <p><b>${c.door}</b> <span class="pill ${door.jx.includes('凶') ? 'bad' : 'gold'}">${door.jx}</span> ${door.desc}</p>
      <p><b>天盘干：</b>${tgRows}</p>
      <p class="hint">天盘干为现状，地盘干（${c.dg}）为其根基；同宫星门神组合即此方吉凶大势。</p>
    </div>`;
  revealCards(box);
  box.querySelectorAll('.pill[title]').forEach((el) => { el.style.cursor = 'help'; });
}
