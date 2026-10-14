// tarot-page.mjs — 塔罗页胶水：多牌阵 + 洗牌发牌 + 翻牌 + 结构化解读
import { renderLayout, loadData, showError, esc } from '../ui/layout.mjs';
import { drawSpread, validateSpread, SUITS } from '../core/tarot.mjs';
import { analyzeReading, synthesizeReading } from '../core/tarot-reading.mjs';
import { stagger, revealCards, withBusy } from '../ui/motion.mjs';

renderLayout();

const els = { spread: document.getElementById('spread'), question: document.getElementById('question'), draw: document.getElementById('draw'), stage: document.getElementById('stage') };
let deck, spreads, interp, reading = null;

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
      reading = drawSpread(deck, spreadByKey.get(els.spread.value));
      render();
    } catch (e) { showError(els.stage, `抽牌出错：${e.message}`); }
  });
});

function render() {
  const q = els.question.value.trim();
  els.stage.innerHTML = `
    ${q ? `<p style="text-align:center;color:var(--muted)">你的问题：${esc(q)}</p>` : ''}
    <p class="hint" style="text-align:center;">${interp.seedNote.replace('{seed}', reading.seed)} · 牌阵：${reading.spreadCn}</p>
    <div class="tarot-stage">${reading.cards.map((c, i) => `
      <div>
        <div class="tarot-pos" title="${c.positionDuty}">${c.positionCn}</div>
        <div class="tarot-card" data-i="${i}" role="button" tabindex="0"
             aria-label="${c.positionCn}：${c.card.cn}，点击翻开">
        <div class="inner">
          <div class="face back">✦ ✦ ✦</div>
          <div class="face front ${c.reversed ? 'rev-tag' : ''}">
            <div class="c-name">${c.card.cn}</div>
            <div class="c-en">${c.card.name}</div>
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
      <p class="note">${interp.seedNote.replace('{seed}', reading.seed)}</p>
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
