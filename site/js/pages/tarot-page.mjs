// tarot-page.mjs — 塔罗页胶水：洗牌动画 + 翻牌 + 牌义展示
import { renderLayout, loadData, showError } from '../ui/layout.mjs';
import { drawSpread } from '../core/tarot.mjs';
import { stagger, revealCards, withBusy } from '../ui/motion.mjs';

renderLayout();

const els = { spread: document.getElementById('spread'), question: document.getElementById('question'), draw: document.getElementById('draw'), stage: document.getElementById('stage') };
let deck, reading = null;

try {
  deck = (await loadData('../data/tarot.json')).cards;
} catch (e) { showError(els.stage, `牌库加载失败：${e.message}`); }

els.draw.addEventListener('click', () => {
  withBusy(els.draw, '洗牌中…', () => {
    reading = drawSpread(deck, els.spread.value);
    render();
  });
});

function render() {
  const q = els.question.value.trim();
  els.stage.innerHTML = `
    ${q ? `<p style="text-align:center;color:var(--muted)">你的问题：${q}</p>` : ''}
    <div class="tarot-stage">${reading.cards.map((c, i) => `
      <div>
        <div class="tarot-pos">${c.positionCn}</div>
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
    <div id="meanings" class="result" style="margin-top:20px;"></div>`;

  stagger(els.stage.querySelector('.tarot-stage'), '.tarot-card');

  const revealed = new Array(reading.cards.length).fill(false);
  const flip = (el) => {
    const i = +el.dataset.i;
    if (revealed[i]) return;
    el.classList.add('open');
    el.setAttribute('aria-label', `${reading.cards[i].positionCn}：${reading.cards[i].card.cn}（${reading.cards[i].reversed ? '逆位' : '正位'}），已翻开`);
    revealed[i] = true;
    renderMeanings(revealed);
  };
  els.stage.querySelectorAll('.tarot-card').forEach((el) => {
    el.addEventListener('click', () => flip(el));
    // 键盘可访问：Enter / Space 与点击等价
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(el); }
    });
  });
}

function renderMeanings(revealed) {
  const box = els.stage.querySelector('#meanings');
  box.innerHTML = reading.cards.map((c, i) => {    if (!revealed[i]) return '';
    const meaning = c.reversed ? c.card.rev : c.card.up;
    return `<div class="card"><h3>${c.positionCn} · ${c.card.cn}（${c.reversed ? '逆位' : '正位'}）</h3>
      <p>${meaning}</p>
      <div>${(c.reversed ? c.card.kwRev : c.card.kwUp).map((k) => `<span class="pill">${k}</span>`).join('')}</div>
    </div>`;
  }).join('');
  revealCards(box);
}
