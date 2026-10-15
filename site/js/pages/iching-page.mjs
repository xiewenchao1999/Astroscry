// iching-page.mjs — 周易页胶水：三法起卦 → core/iching 成卦 → 朱熹变爻取辞 → 渲染
import { renderLayout, loadData, showError, esc, bootPage } from '../ui/layout.mjs';
import { cryptoRng } from '../core/tarot.mjs';
import { castCoinHexagram, plumTimeCast, plumThreeCast, hexagramByBits, resolveReading, validateIching } from '../core/iching.mjs';
import { revealCards, withBusy, announce, reducedMotion } from '../ui/motion.mjs';
import { setAISource } from '../ui/ai-panel.mjs';

renderLayout();

const els = {
  method: document.getElementById('method'), methodDesc: document.getElementById('method-desc'),
  coin: { panel: document.getElementById('panel-coin'), question: document.getElementById('coin-question'), cast: document.getElementById('coin-cast') },
  plumTime: { panel: document.getElementById('panel-plumTime'), time: document.getElementById('plum-time'), cast: document.getElementById('plum-cast') },
  plumThree: { panel: document.getElementById('panel-plumThree'), n: [document.getElementById('n1'), document.getElementById('n2'), document.getElementById('n3')], cast: document.getElementById('three-cast') },
  stage: document.getElementById('stage'),
};
let data, interp;

await bootPage(els.stage, async () => {
  [data, interp] = await Promise.all([
    loadData('../data/iching.json'),
    loadData('../data/interpret-iching.json'),
  ]);
  const v = validateIching(data);
  if (!v.ok) throw new Error(`卦库数据异常：${v.errors[0]}`);
});

// 默认起卦时刻 = 现在（datetime-local 本地时区格式）
{
  const n = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  els.plumTime.time.value = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}`;
}

// 起卦方式切换（事件委托）
const PANELS = { coin: els.coin.panel, plumTime: els.plumTime.panel, plumThree: els.plumThree.panel };
els.methodDesc.textContent = interp.methods.coin.desc;
els.method.addEventListener('click', (e) => {
  const v = e.target?.dataset?.v;
  if (!v) return;
  els.method.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
  for (const [k, panel] of Object.entries(PANELS)) panel.hidden = k !== v;
  els.methodDesc.textContent = interp.methods[v].desc;
});

/**
 * 卦爻自下而上绘制（动爻标记：老阳 ○、老阴 ×）。
 * @param {object} cast 成卦结果（bits + moving；铜钱法另有 lines 爻值）
 */
function yaoRows(cast) {
  const rows = [];
  for (let pos = 6; pos >= 1; pos--) {
    const yang = cast.bits[pos - 1] === '1';
    const isMoving = cast.moving.includes(pos);
    // 爻值标注：铜钱法显示老阴/少阳/少阴/老阳；梅花法动爻标注「动爻」
    const valueCn = cast.lines ? interp.lineValues[String(cast.lines[pos - 1])] : (isMoving ? '动爻' : '');
    rows.push(`
      <div class="yao-row ${yang ? 'yang' : 'yin'}">
        <div class="yao-bar">${yang ? '<i></i>' : '<i></i><i></i>'}</div>
        <span class="yao-mark">${isMoving ? (yang ? interp.markers['9'] : interp.markers['6']) : ''}</span>
        <span class="yao-value">${valueCn}</span>
        <span class="yao-pos">第 ${pos} 爻</span>
      </div>`);
  }
  return rows.join('');
}

/** 错综互卦速览（按文王卦序号查表） */
function cuozonghuCard(hx) {
  const byId = (id) => data.hexagrams[id - 1];
  const cell = (label, h) => `<div><span class="src-tag">${label}</span> <b>${h.symbol} ${h.full}</b></div>`;
  return `
    <div class="card"><h3>${interp.sections.cuozonghuTitle} <span class="src-tag">查表</span></h3>
      ${cell(interp.cuozonghu.cuo, byId(hx.cuo))}
      ${cell(interp.cuozonghu.zong, byId(hx.zong))}
      ${cell(interp.cuozonghu.hu, byId(hx.hu))}
    </div>`;
}

/** 卦象卡：卦名/辞/白话/大象/关键词/场景白话/建议 */
function hexagramCard(hx, title) {
  const advice = hx.advice ?? {};
  return `
    <div class="card"><h3>${title}：${hx.symbol} ${esc(hx.full)}（${hx.palace}宫 · ${hx.wuxing}）</h3>
      <p><b>${interp.sections.guaciLabel}：</b>${esc(hx.guaCi)}</p>
      <p>${esc(hx.guaCiBaiHua)}</p>
      <p><b>${interp.sections.daxiangLabel}：</b>${esc(hx.daXiang)}</p>
      <p style="color:var(--muted)">${esc(hx.daXiangBaiHua)}</p>
      ${(hx.kw ?? []).length ? `<p><b>${interp.sections.kwLabel}：</b>${hx.kw.map((k) => `<span class="pill gold">${esc(k)}</span>`).join('')}</p>` : ''}
      ${hx.scene ? `<p><b>${interp.sections.sceneLabel}：</b>${esc(hx.scene)}</p>` : ''}
      ${advice.c || advice.l || advice.s || advice.m ? `
        <details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--accent2);">${interp.sections.adviceLabel}</summary>
          ${Object.entries(interp.sections.adviceDims).map(([k, label]) => advice[k] ? `<p><b>${label}：</b>${esc(advice[k])}</p>` : '').join('')}
          <p class="hint">${interp.adviceNote}</p>
        </details>` : ''}
    </div>`;
}

/** 解卦卡：朱熹七档取辞 */
function readingCard(cast, hx) {
  const rd = resolveReading(data, hx, cast.moving);
  const citations = rd.citations.map((c) => `
    <p style="color:${c.role === 'primary' ? 'var(--accent)' : 'var(--muted)'}">
      <b>【${esc(c.source)}】</b>${esc(c.text)}<br><span style="font-size:13.5px;">白话：${esc(c.baiHua)}</span>
    </p>`).join('');
  const zhiBlock = rd.changed ? `<p class="hint">${interp.sections.zhiGua}：${rd.changed.symbol} ${esc(rd.changed.full)}（bits ${rd.changed.bits}）</p>` : '';
  return `
    <div class="card"><h3>${interp.sections.readingTitle} <span class="src-tag">规则引擎</span></h3>
      <p><b>${esc(rd.rule.cn)}</b>　<span class="hint">${cast.moving.length ? `${interp.sections.movingLabel}：第 ${cast.moving.join('、')} 爻` : interp.sections.noMoving}</span></p>
      ${zhiBlock}
      ${citations}
      <p class="note">${interp.ruleNote}</p>
    </div>`;
}

function renderResult(cast) {
  const hx = hexagramByBits(data, cast.bits);
  const rd = resolveReading(data, hx, cast.moving);
  setAISource('iching', {
    question: els.coin.question?.value || '',
    method: cast.method,
    benGua: { name: hx.full, guaCi: hx.guaCi, guaCiBaiHua: hx.guaCiBaiHua, bits: hx.bits, moving: cast.moving },
    movingLines: cast.moving.map((p) => ({ pos: hx.lines[p - 1].pos, text: hx.lines[p - 1].text })),
    zhiGua: rd.changed ? { name: rd.changed.full, guaCi: rd.changed.guaCi, bits: rd.changed.bits } : null,
    rule: rd.rule, citations: rd.citations,
  }, `${hx.full}${cast.moving.length ? `（动爻 ${cast.moving.join('、')}）` : '（静卦）'}`);

  els.stage.innerHTML = `
    <div class="card"><h3>${interp.sections.hexTitle} <span class="src-tag">${interp.methods[cast.method]?.label ?? ''}</span></h3>
      ${yaoRows(cast)}
      <p class="hint">自下而上成卦 · ○ 老阳 / × 老阴为动爻</p>
    </div>
    ${hexagramCard(hx, interp.sections.benGua)}
    ${readingCard(cast, hx)}
    ${cuozonghuCard(hx)}
    <p class="note">${interp.disclaimer}<br>${interp.sourceNote}</p>`;
  revealCards(els.stage);
  announce(els.stage, `成卦：${hx.full}${cast.moving.length ? `，动爻第 ${cast.moving.join('、')} 爻` : '，静卦'}`);
  els.stage.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
}

// —— 铜钱摇卦 ——
els.coin.cast.addEventListener('click', () => {
  withBusy(els.coin.cast, interp.coinAnim.shake, () => {
    try {
      renderResult(castCoinHexagram(cryptoRng));
    } catch (e) { showError(els.stage, `起卦出错：${e.message}`); }
  });
});

// —— 梅花时间卦 ——
els.plumTime.cast.addEventListener('click', () => {
  withBusy(els.plumTime.cast, interp.coinAnim.shake, () => {
    try {
      const d = els.plumTime.time.value ? new Date(els.plumTime.time.value) : new Date();
      if (Number.isNaN(d.getTime())) throw new Error('起卦时刻无效');
      renderResult(plumTimeCast(d));
    } catch (e) { showError(els.stage, `起卦出错：${e.message}`); }
  });
});

// —— 三数法 ——
els.plumThree.cast.addEventListener('click', () => {
  withBusy(els.plumThree.cast, interp.coinAnim.shake, () => {
    try {
      const [a, b, c] = els.plumThree.n.map((el) => Number(el.value));
      renderResult(plumThreeCast(a, b, c));
    } catch (e) { showError(els.stage, `起卦出错：${e.message}`); }
  });
});
