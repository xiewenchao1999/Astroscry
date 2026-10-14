// qimen-page.mjs — 奇门页胶水：起局时间 → core/qimen 排盘 → 九宫格渲染 + 点宫释义
import { renderLayout, loadData, showError, esc } from '../ui/layout.mjs';
import { castQimen } from '../core/qimen.mjs';
import { stagger, revealCards, withBusy, announce, reducedMotion } from '../ui/motion.mjs';
import { mountAICard, aiEnabled } from '../ui/ai-settings.mjs';
import { streamReading } from '../ui/ai-reading.mjs';

renderLayout();

const els = { time: document.getElementById('qtime'), cast: document.getElementById('cast'), stage: document.getElementById('stage') };
let interp = null;

// ADR-002：AI 设置卡（opt-in），持久挂在 #stage 下方，与每次排盘渲染解耦
const aiCardEl = document.createElement('div');
aiCardEl.id = 'ai-card';
els.stage.parentNode.insertBefore(aiCardEl, els.stage.nextSibling);
mountAICard(aiCardEl);

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
    </div>
    <div class="card" id="ai-section" style="margin-top:14px;">
      <h3>AI 综合解读</h3>
      <p class="hint">基于上方盘面数据，由你配置的端点给出综合解读；排盘由本地规则引擎完成，AI 只读盘面数据。</p>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
        <input type="text" id="ai-question" placeholder="可填具体问题，如「问事业」；留空则综合解读" style="flex:1;min-width:200px;">
        <button class="btn" type="button" id="ai-run">AI 综合解读</button>
      </div>
      <div id="ai-output" class="result" aria-live="polite" style="white-space:pre-wrap;"></div>
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
  wireAI(q);
}

/**
 * AI 综合解读按钮：关闭态提示去下方设置卡开启；开启态流式渲染到 #ai-output。
 * 失败降级：显示失败原因 + 引导用户参考上方规则层「读盘要点」（始终可见）。
 */
function wireAI(q) {
  const btn = els.stage.querySelector('#ai-run');
  const out = els.stage.querySelector('#ai-output');
  const qInput = els.stage.querySelector('#ai-question');
  if (!btn || !out || !qInput) return;
  let streaming = false;
  btn.addEventListener('click', async () => {
    if (streaming) return;
    if (!aiEnabled()) {
      out.innerHTML = '<p class="hint">请先在页面底部「AI 解读」设置卡中填齐端点 / 模型 / 密钥并勾选开启。</p>';
      aiCardEl.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    streaming = true;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '解读中…';
    out.textContent = '';
    let n = 0;
    try {
      announce(els.stage, 'AI 解读中');
      for await (const chunk of streamReading('qimen', q, qInput.value.trim())) {
        out.textContent += chunk;
        n++;
      }
      if (n === 0) out.textContent = '（端点返回空响应，请检查模型 / 密钥 / 端点 URL）';
    } catch (e) {
      out.innerHTML = `<p class="hint">AI 解读失败：${esc(e.message)}。请参考上方「读盘要点」的规则解读。</p>`;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
      streaming = false;
    }
  });
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
