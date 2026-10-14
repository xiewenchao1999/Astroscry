// tarot-page.mjs — 塔罗页胶水：洗牌动画 + 用户自抽牌 + 翻牌 + 结构化解读
import { renderLayout, loadData, showError, esc, SITE_ROOT } from '../ui/layout.mjs';
import { cryptoRng, shuffle } from '../core/tarot.mjs';
import { analyzeReading, synthesizeReading } from '../core/tarot-reading.mjs';
import { stagger, revealCards, withBusy, announce, reducedMotion } from '../ui/motion.mjs';
import { setAISource } from '../ui/ai-panel.mjs';

renderLayout();

const els = { spread: document.getElementById('spread'), question: document.getElementById('question'), draw: document.getElementById('draw'), stage: document.getElementById('stage') };
let deck, spreads, interp, reading = null;
let pending = null; // { spread, deck }：crypto 真随机洗出的牌序，等待用户自抽
let picks = [];     // 用户抽中的牌：{ deckIdx, reversed }——正逆在抽取落位那一刻掷币确定

try {
  [deck, spreads, interp] = await Promise.all([
    loadData('../data/tarot.json').then((d) => d.cards),
    loadData('../data/tarot-spreads.json').then((d) => d.spreads),
    loadData('../data/interpret-tarot.json'),
  ]);
} catch (e) { showError(els.stage, `牌库加载失败：${e.message}`); throw e; } // 数据缺失时终止模块，避免后续空引用

const spreadByKey = new Map(spreads.map((s) => [s.key, s]));
els.spread.innerHTML = spreads.map((s) => `<option value="${s.key}">${s.cn}（${s.positions.length} 张）</option>`).join('');
els.spread.value = 'three';

els.draw.addEventListener('click', () => {
  withBusy(els.draw, '洗牌中…', () => {
    try {
      const spread = spreadByKey.get(els.spread.value);
      pending = { spread, deck: shuffle(deck, cryptoRng) }; // 真随机洗牌：每次独立取熵，不可复现
      picks = [];
      renderShuffle();
    } catch (e) { showError(els.stage, `抽牌出错：${e.message}`); }
  });
});

/** 阶段一：洗牌动画（reduced-motion 下几乎瞬时跳过） */
function renderShuffle() {
  els.stage.innerHTML = `
    <div class="tarot-shuffle" aria-hidden="true">${'<i>✦</i>'.repeat(12)}</div>
    <p class="hint" style="text-align:center;">洗牌中…</p>`;
  announce(els.stage, '正在洗牌，请稍候');
  setTimeout(renderFan, reducedMotion() ? 80 : 1500);
}

/** 阶段二：牌位待抽 + 扇形牌堆，用户自抽 N 张 */
function renderFan() {
  const spread = pending.spread;
  const total = spread.positions.length;
  els.stage.innerHTML = `
    <p class="hint" style="text-align:center;">${interp.fanHint.replace('{total}', total)}</p>
    <div class="tarot-slots">${spread.positions.map((p) => `
      <div class="tarot-slot"><div class="tarot-pos">${esc(p.cn)}</div>
        <div class="box"><span>${interp.slotEmpty}</span></div></div>`).join('')}
    </div>
    <p class="hint" style="text-align:center;" data-pick-count>${interp.picked.replace('{picked}', 0).replace('{total}', total)}</p>
    <div class="tarot-fan">${pending.deck.map((_, i) => `
      <div class="fan-card" data-i="${i}" role="button" tabindex="0"
           style="--r:${((i - (pending.deck.length - 1) / 2) * 1.85).toFixed(2)}deg"
           aria-label="牌堆第 ${i + 1} 张（背面朝上），点击或按 Enter 抽取这张"></div>`).join('')}
    </div>`;
  announce(els.stage, interp.fanHint.replace('{total}', total));

  const pick = (el) => {
    const i = +el.dataset.i;
    el.remove(); // 从牌堆移除（同时防重复抽取），留下自然缺口
    const slot = els.stage.querySelector('.tarot-slot .box:not(.filled)');
    if (slot) { slot.classList.add('filled'); slot.innerHTML = '<span>✦</span>'; }
    picks.push({ deckIdx: i, reversed: cryptoRng() < 0.5 }); // 落位瞬间定正逆
    els.stage.querySelector('[data-pick-count]').textContent = interp.picked.replace('{picked}', picks.length).replace('{total}', total);
    if (picks.length === total) setTimeout(finishPick, 350); // 稍作停顿让最后一张落位可见
  };
  els.stage.querySelectorAll('.fan-card').forEach((el) => {
    el.addEventListener('click', () => pick(el));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(el); }
    });
  });
}

/** 阶段三：全部抽齐 → 组装 reading，进入翻牌流程 */
function finishPick() {
  const spread = pending.spread;
  reading = {
    spread: spread.key,
    spreadCn: spread.cn,
    cards: picks.map((p, i) => ({
      card: pending.deck[p.deckIdx],
      position: spread.positions[i].key,
      positionCn: spread.positions[i].cn,
      positionDuty: spread.positions[i].duty,
      reversed: p.reversed,
    })),
  };
  render();
}

function render() {
  const q = els.question.value.trim();
  els.stage.innerHTML = `
    ${q ? `<p style="text-align:center;color:var(--muted)">你的问题：${esc(q)}</p>` : ''}
    <p class="hint" style="text-align:center;">${interp.seedNote} · 牌阵：${reading.spreadCn}</p>
    <div class="tarot-stage">${reading.cards.map((c, i) => `
      <div>
        <div class="tarot-pos" title="${c.positionDuty}">${c.positionCn}</div>
        <div class="tarot-card" data-i="${i}" role="button" tabindex="0"
             aria-label="${c.positionCn}：${c.card.cn}，点击翻开">
        <div class="inner">
          <div class="face back">✦ ✦ ✦</div>
          <div class="face front ${c.reversed ? 'rev-tag' : ''}">
            <img class="c-img ${c.reversed ? 'img-rev' : ''}" src="${SITE_ROOT}assets/tarot/${c.card.id}.png" alt="${esc(c.card.name)}" loading="lazy">
            <div class="c-name">${c.card.cn}</div>
            <div class="c-kw">${(c.reversed ? c.card.kwRev : c.card.kwUp).join(' · ')}</div>
          </div>
        </div></div>
      </div>`).join('')}
    </div>
    <div id="structure" class="result" style="margin-top:20px;"></div>
    <div id="meanings" class="result"></div>`;

  stagger(els.stage.querySelector('.tarot-stage'), '.tarot-card');

  const revealed = new Array(reading.cards.length).fill(false);
  const flip = (el) => {
    const i = +el.dataset.i;
    if (revealed[i]) return;
    el.classList.add('open');
    el.setAttribute('aria-label', `${reading.cards[i].positionCn}：${reading.cards[i].card.cn}（${reading.cards[i].reversed ? '逆位' : '正位'}），已翻开`);
    revealed[i] = true;
    if (revealed.every(Boolean)) renderStructure(); // 全部翻开后给出结构化解读
    appendMeaning(i);
  };
  els.stage.querySelectorAll('.tarot-card').forEach((el) => {
    el.addEventListener('click', () => flip(el));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(el); }
    });
  });
}

/** 结构化解读：花色分布 / 大阿卡纳 / 正逆位 / 五段式综合（全部翻开后展示） */
function renderStructure() {
  const box = els.stage.querySelector('#structure');
  const analysis = analyzeReading(reading.cards);
  const syn = synthesizeReading(reading.cards, analysis, els.question.value.trim());
  // AI 数据源：只传牌面结构（位置/牌名/正逆），规则层结论不传，牌义交由 AI 现场解读
  setAISource('tarot', {
    spread: reading.spreadCn,
    question: els.question.value.trim(),
    cards: reading.cards.map((c) => ({ pos: c.positionCn, duty: c.positionDuty, name: c.card.cn, reversed: c.reversed })),
  }, reading.spreadCn);
  const rev = (c) => (c.reversed ? '（逆位）' : '');
  const exitKey = syn.exit.dominant ?? 'none';

  box.innerHTML = `
    <div class="card"><h3>${interp.structureTitle}</h3>
      <p><b>主导花色：</b>${analysis.dominant
        ? `<span class="pill gold">${interp.suitNames[analysis.dominant]}（${interp.suitElements[analysis.dominant]}）× ${analysis.suits[analysis.dominant]}</span>`
        : '<span class="pill">均衡分布</span>'}
        ${analysis.missing.map((k) => `<span class="pill bad" title="缺席能量">缺${interp.suitNames[k]}</span>`).join('')}</p>
      <p>${interp.suitDominant[analysis.dominant ?? 'none']}</p>
      ${analysis.missing.map((k) => `<p style="color:var(--muted);font-size:13px;">▸ ${interp.suitMissing[k]}</p>`).join('')}
      <p><b>大阿卡纳：</b>${analysis.major}/${analysis.total}（${Math.round(analysis.majorRatio * 100)}%）</p>
      <p>${interp.majorBands[analysis.majorBand]}</p>
      <p><b>正逆位：</b>正 ${analysis.total - analysis.reversed} / 逆 ${analysis.reversed}</p>
      <p>${interp.reversalBands[analysis.reversalBand]}</p>
    </div>
    <div class="card"><h3>${interp.synthesis.title} <span class="src-tag">释义</span></h3>
      <p>${(syn.question ? interp.synthesis.questionEcho.replace('{q}', esc(syn.question)) : interp.synthesis.noQuestion)}</p>
      <p>${interp.synthesis.opening.replace('{pos}', syn.opening.position).replace('{card}', syn.opening.card).replace('{rev}', rev(syn.opening)).replaceAll('{cardShort}', syn.opening.card)}</p>
      <p>${interp.synthesis.tension.replace('{card}', syn.tension.card).replace('{rev}', rev(syn.tension)).replace('{pos}', syn.tension.position)}</p>
      <p>${interp.synthesis.turn.replace('{card}', syn.turn.card).replace('{rev}', rev(syn.turn)).replace('{pos}', syn.turn.position)}</p>
      <p><b>${interp.synthesis.exitTitle}</b></p>
      <p>▸ ${interp.synthesis.exit[exitKey]}</p>
      <p>${interp.synthesis.echo}</p>
      <p class="note">${interp.seedNote}</p>
      <p class="note">${interp.disclaimer}</p>
    </div>`;
  revealCards(box);
}

/** 牌义卡：按翻开顺序增量追加（不重建已渲染的卡，避免旧卡重播入场动画） */
function appendMeaning(i) {
  const box = els.stage.querySelector('#meanings');
  const c = reading.cards[i];
  const meaning = c.reversed ? c.card.rev : c.card.up;
  box.insertAdjacentHTML('beforeend', `
    <div class="card"><h3>${c.positionCn} · ${c.card.cn}（${c.reversed ? '逆位' : '正位'}）</h3>
      <p class="hint" title="位置职责">${c.positionDuty}</p>
      <p>${meaning}</p>
      <div>${(c.reversed ? c.card.kwRev : c.card.kwUp).map((k) => `<span class="pill">${k}</span>`).join('')}</div>
    </div>`);
  const el = box.lastElementChild;
  el.style.setProperty('--i', String(Math.min(box.children.length - 1, 12)));
  el.classList.add('reveal');
}
