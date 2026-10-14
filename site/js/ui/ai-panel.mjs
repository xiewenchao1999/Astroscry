// ai-panel.mjs — 全站常驻 AI 解读悬浮栏（右侧，可收起/展开；layout.mjs 挂载一次全站生效）
// 数据流：各页面排盘后调 setAISource(domain, structured, summary) → 面板针对当前页问答；
// sessionStorage 记录本次会话各页排盘与问答 → 「综合解读」跨页汇总。
// 隐私：跨页缓存仅存 sessionStorage（关标签页即清）；外发仍受 ai-settings opt-in 约束。

import { aiEnabled, mountAICard } from './ai-settings.mjs';
import { streamReading, streamCombined, domainLabel } from './ai-reading.mjs';

const SES_KEY = 'astroscry.ai.session.v1';
// ponytail: qa 只保留每盘最近 3 条、回答截断 200 字，控制 prompt 体积；升级路径=完整对话历史 + 按盘裁剪
const QA_KEEP = 3;
const ANSWER_TRUNC = 200;

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SES_KEY)) || { sources: {} }; }
  catch { return { sources: {} }; }
}
function saveSession(s) {
  try { sessionStorage.setItem(SES_KEY, JSON.stringify(s)); }
  catch { /* ponytail: 超配额（如紫微大对象）直接放弃会话缓存，不影响单页问答 */ }
}

let current = null; // { domain, structured, summary }
let els = null;

/** 页面排盘成功后调用：注册当前页数据源并写入会话缓存（同 domain 覆盖最近一次） */
export function setAISource(domain, structured, summary = '') {
  current = { domain, structured, summary };
  const s = loadSession();
  s.sources[domain] = { domain, summary, ts: Date.now(), structured };
  saveSession(s);
  renderSrc();
}

export function mountAIPanel() {
  if (document.getElementById('ai-fab')) return; // 幂等
  const dock = document.createElement('div');
  dock.id = 'ai-dock';
  dock.innerHTML = `
    <button id="ai-fab" aria-expanded="false" aria-controls="ai-panel" title="AI 解读">✦<span>AI</span></button>
    <aside id="ai-panel" hidden aria-label="AI 解读悬浮栏">
      <div class="ai-head"><b>AI 解读</b><span class="ai-tag">默认关闭 · 自供端点</span>
        <button class="btn ghost" id="ai-collapse" type="button" aria-label="收起 AI 面板">收起</button></div>
      <div class="ai-src" id="ai-src"></div>
      <div class="ai-out" id="ai-out" aria-live="polite"></div>
      <form id="ai-ask" class="panel">
        <input type="text" id="ai-q" placeholder="针对当前页盘面提问…" autocomplete="off">
        <button class="btn" type="submit" id="ai-send">发送</button>
      </form>
      <div class="ai-foot">
        <button class="btn ghost" id="ai-comb" type="button">综合解读</button>
        <button class="btn ghost" id="ai-setbtn" type="button" aria-expanded="false">设置</button>
      </div>
      <div id="ai-set" hidden></div>
    </aside>`;
  document.body.append(dock);
  els = {
    fab: dock.querySelector('#ai-fab'),
    panel: dock.querySelector('#ai-panel'),
    src: dock.querySelector('#ai-src'),
    out: dock.querySelector('#ai-out'),
    q: dock.querySelector('#ai-q'),
    send: dock.querySelector('#ai-send'),
    comb: dock.querySelector('#ai-comb'),
    setbtn: dock.querySelector('#ai-setbtn'),
    set: dock.querySelector('#ai-set'),
  };

  els.fab.addEventListener('click', () => togglePanel(true));
  dock.querySelector('#ai-collapse').addEventListener('click', () => togglePanel(false));
  els.setbtn.addEventListener('click', () => {
    const open = els.set.hidden;
    if (open && !els.set.firstChild) mountAICard(els.set); // 懒挂载设置卡
    els.set.hidden = !open;
    els.setbtn.setAttribute('aria-expanded', String(open));
  });
  els.panel.querySelector('#ai-ask').addEventListener('submit', (e) => {
    e.preventDefault();
    ask(els.q.value.trim());
  });
  els.comb.addEventListener('click', () => {
    const q = els.q.value.trim();
    els.q.value = '';
    askCombined(q);
  });

  renderSrc();
}

function togglePanel(open) {
  els.panel.hidden = !open;
  els.fab.style.display = open ? 'none' : '';
  els.fab.setAttribute('aria-expanded', String(open));
  if (open) els.q.focus();
}

function renderSrc() {
  if (!els) return; // 面板尚未挂载（页面未调 mountAIPanel 前数据源先到）
  const n = Object.keys(loadSession().sources).length;
  if (current) {
    const label = domainLabel(current.domain)?.split('（')[0] || current.domain;
    els.src.textContent = `当前页：${label}${current.summary ? ` · ${current.summary}` : ''}`;
  } else {
    els.src.textContent = '当前页尚未排盘（可先排盘，或使用综合解读汇总其他页）';
  }
  els.comb.textContent = n > 0 ? `综合解读（${n} 盘）` : '综合解读';
  els.comb.disabled = n === 0;
}

function guardEnabled() {
  if (aiEnabled()) return true;
  els.out.innerHTML = '<span class="hint">AI 解读默认关闭。点右下「设置」填齐端点 / 模型 / 密钥并勾选开启（数据将发送至你填写的端点）。</span>';
  if (els.set.hidden) els.setbtn.click(); // 顺手展开设置区，少一步操作
  return false;
}

async function runStream(iter) {
  els.out.textContent = '';
  els.send.disabled = true;
  els.comb.disabled = true;
  let n = 0;
  try {
    for await (const chunk of iter) { els.out.textContent += chunk; n++; }
    if (n === 0) els.out.textContent = '（端点返回空响应，请检查模型 / 密钥 / 端点 URL）';
  } catch (e) {
    els.out.textContent = `AI 解读失败：${e.message}。本页规则解读不受影响。`; // textContent 防注入（layout 的 esc 会循环 import）
  } finally {
    els.send.disabled = false;
    renderSrc();
  }
  return n ? els.out.textContent : '';
}

async function ask(question) {
  if (current && current.summary === undefined) current.summary = '';
  if (!current) {
    els.out.innerHTML = '<span class="hint">本页尚未排盘，请先完成排盘；或点「综合解读」汇总其他页的盘面。</span>';
    return;
  }
  if (!guardEnabled()) return;
  const answer = await runStream(streamReading(current.domain, current.structured, question));
  if (!answer) return;
  const s = loadSession();
  const src = s.sources[current.domain];
  if (src) {
    src.qa = [...(src.qa || []), { q: question || '综合解读当前盘面', a: answer.slice(0, ANSWER_TRUNC) }].slice(-QA_KEEP);
    saveSession(s);
  }
}

async function askCombined(question) {
  const sources = Object.values(loadSession().sources);
  if (!sources.length) { els.out.innerHTML = '<span class="hint">暂无任何排盘数据：先在任意页完成排盘。</span>'; return; }
  if (!guardEnabled()) return;
  await runStream(streamCombined(sources, question));
}
