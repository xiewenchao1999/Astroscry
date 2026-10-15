// folk-page.mjs — 民俗占卜页胶水：观音灵签（摇签 → 签诗/典故/分项解 → 掷筊验签）+ 掷圣杯（连掷三次）
import { renderLayout, loadData, showError, esc, bootPage } from '../ui/layout.mjs';
import { cryptoRng } from '../core/tarot.mjs';
import { drawSign, signById, validateSigns } from '../core/guanyin.mjs';
import { castMoonblock, voteThree } from '../core/jiaobei.mjs';
import { revealCards, withBusy, announce, reducedMotion } from '../ui/motion.mjs';
import { setAISource } from '../ui/ai-panel.mjs';

renderLayout();

const els = {
  tab: document.getElementById('tab'),
  sign: { panel: document.getElementById('panel-sign'), intro: document.getElementById('sign-intro'), tube: document.getElementById('tube'), question: document.getElementById('sign-question'), shake: document.getElementById('shake'), stage: document.getElementById('sign-stage') },
  jb: { panel: document.getElementById('panel-jiaobei'), intro: document.getElementById('jiaobei-intro'), question: document.getElementById('jb-question'), cast: document.getElementById('jb-cast'), stage: document.getElementById('jiaobei-stage') },
};
let signsData, interp;

await bootPage(els.sign.stage, async () => {
  [signsData, interp] = await Promise.all([
    loadData('../data/guanyin-signs.json'),
    loadData('../data/interpret-guanyin.json'),
  ]);
  const v = validateSigns(signsData);
  if (!v.ok) throw new Error(`签库数据异常：${v.errors[0]}`);
  els.sign.intro.textContent = interp.sign.intro;
  els.jb.intro.textContent = interp.jiaobei.intro;
});

// 双 tab 切换（事件委托）
const TAB_PANELS = { sign: els.sign.panel, jiaobei: els.jb.panel };
els.tab.addEventListener('click', (e) => {
  const v = e.target?.dataset?.v;
  if (!v) return;
  els.tab.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
  for (const [k, panel] of Object.entries(TAB_PANELS)) panel.hidden = k !== v;
});

/** 分项解列表：按 domainsOrder 渲染，缺键显示「此签未列」（容忍按签非全键） */
function domainsList(sign) {
  return interp.domainsOrder.map((key) => {
    const val = sign.interpret?.[key];
    return `<div class="domain-item"><b>${esc(key)}</b>${val ? esc(val) : `<span style="color:var(--muted)">${esc(interp.missingNote)}</span>`}</div>`;
  }).join('');
}

/** 签文卡（抽签结果与掷筊验签区） */
function signCard(sign) {
  const luckCls = interp.luckStyle[sign.luck] ?? 'gold';
  return `
    <div class="card"><h3 class="sign-head"><span class="src-tag">${interp.sign.signNo.replace('{n}', sign.id)}</span> <b>${esc(sign.story)}</b>
      <span class="pill ${luckCls}">${esc(sign.luck)}</span><span class="pill">${esc(sign.palace)}</span></h3>
      <p style="margin:10px 0 2px;"><b>${interp.sign.poemTitle}</b></p>
      <div class="poem">${sign.poem.map((l) => esc(l)).join('<br>')}</div>
      <details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--accent2);">${interp.sign.storyTitle}：${esc(sign.story)}</summary>
        <p>${esc(sign.storyDetail)}</p>
      </details>
      <p style="margin-top:10px;"><b>${interp.sign.domainsTitle}</b> <span class="hint">（释义为开源语料整理，仅供文化研究）</span></p>
      <div class="domains">${domainsList(sign)}</div>
      <details style="margin-top:12px;"><summary style="cursor:pointer;color:var(--accent2);font-weight:600;">${interp.sign.jiaobeiCheckTitle}</summary>
        <p class="hint">${interp.sign.jiaobeiCheckIntro}</p>
        <button class="btn" type="button" id="jb-verify">${interp.sign.jiaobeiCheckBtn}</button>
        <div id="jb-verify-stage"></div>
      </details>
      <p class="note">${interp.disclaimer}<br>${interp.sourceNote}</p>
    </div>`;
}

/** 掷筊结果块（验签与独立掷杯共用） */
function jiaobeiResult(result, container) {
  const rows = result.casts.map((c, i) => `
    <div class="cast-row">
      <span class="src-tag">${interp.jiaobei.roundLabel.replace('{n}', i + 1)}</span>
      <b>${esc(c.cn)}</b>
      <span class="pill ${c.key === 'sheng' ? 'good' : c.key === 'yin' ? 'bad' : 'gold'}">${c.verdict}</span>
      <span style="color:var(--muted);font-size:13px;">${c.faces.map((f) => interp.jiaobei.faces[f]).join(' + ')} · ${esc(c.desc)}</span>
    </div>`).join('');
  container.innerHTML = `
    ${rows}
    <p class="verdict">${interp.jiaobei.verdictTitle}：<b>${esc(result.verdict)}</b></p>
    <p>${esc(interp.jiaobei.verdicts[result.verdict])}</p>
    ${result.verdict !== '允' ? `<p class="hint">${esc(interp.jiaobei.rerollHint)}</p>` : ''}`;
  revealCards(container);
}

function renderSign() {
  const sign = signById(signsData, drawSign(cryptoRng));
  setAISource('guanyin', {
    question: els.sign.question.value.trim(),
    sign: { id: sign.id, luck: sign.luck, palace: sign.palace, poem: sign.poem, story: sign.story, interpret: sign.interpret },
  }, `第 ${sign.id} 签（${sign.luck}·${sign.story}）`);
  els.sign.stage.innerHTML = signCard(sign);
  revealCards(els.sign.stage);
  announce(els.sign.stage, `求得第 ${sign.id} 签，${sign.luck}，${sign.story}`);
  els.sign.stage.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });

  // 掷筊验签联动：抽签后连掷三次（动态按钮挂在签卡内）
  const verifyBtn = els.sign.stage.querySelector('#jb-verify');
  verifyBtn.addEventListener('click', () => {
    withBusy(verifyBtn, interp.sign.jiaobeiChecking, () => {
      try {
        jiaobeiResult(voteThree(cryptoRng), els.sign.stage.querySelector('#jb-verify-stage'));
      } catch (e) { showError(els.sign.stage.querySelector('#jb-verify-stage'), `掷筊出错：${e.message}`); }
    });
  });
}

// —— 摇签：摇动动画（约 900ms，reduced-motion 跳过）→ 落签 → 签文淡入 ——
els.sign.shake.addEventListener('click', () => {
  withBusy(els.sign.shake, interp.sign.shaking, () => {
    const tube = els.sign.tube;
    const doDraw = () => {
      tube.classList.remove('shaking');
      renderSign();
    };
    if (reducedMotion()) { doDraw(); return; }
    tube.classList.add('shaking');
    tube.textContent = '🥢';
    setTimeout(doDraw, 900);
  });
});

// —— 掷圣杯（独立问事）：一次连掷三筊 ——
els.jb.cast.addEventListener('click', () => {
  withBusy(els.jb.cast, interp.jiaobei.casting, () => {
    try {
      const result = voteThree(cryptoRng);
      setAISource('guanyin', { question: els.jb.question.value.trim(), jiaobei: { casts: result.casts.map((c) => c.cn), verdict: result.verdict } }, `掷筊${result.verdict}`);
      jiaobeiResult(result, els.jb.stage);
      announce(els.jb.stage, `三掷总评：${result.verdict}`);
    } catch (e) { showError(els.jb.stage, `掷筊出错：${e.message}`); }
  });
});
