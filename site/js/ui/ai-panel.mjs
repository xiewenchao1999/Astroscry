// ai-panel.mjs — 全站常驻 AI 解读悬浮栏（右侧，可收起/展开；layout.mjs 挂载一次全站生效）
// 数据流：各页面排盘后调 setAISource(domain, structured, summary) → 面板针对当前页问答；
// sessionStorage 记录本次会话各页排盘与问答 → 「综合解读」跨页汇总。
// 隐私：跨页缓存仅存 sessionStorage（关标签页即清）；外发仍受 ai-settings opt-in 约束。

import { aiEnabled, mountAICard } from './ai-settings.mjs';
import { streamReading, streamCombined, domainLabel, buildPromptText, buildCombinedPromptText } from './ai-reading.mjs';

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
let activeAbort = null; // P13：进行中的流式请求控制器（非 null 时发送键为「停止」）

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
        <button class="btn" id="ai-copy" type="button" title="无需配置：把当前盘面 + 提问框架复制成一份完整提示词，粘到你常用的对话工具即可。内容含出生数据，请自行判断目标平台是否可信">复制提示词</button>
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
    copy: dock.querySelector('#ai-copy'),
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
    // P13：流式进行中发送键即「停止」——点击中断当前请求，不发新提问
    if (activeAbort) { activeAbort.abort(); return; }
    ask(els.q.value.trim());
  });
  els.comb.addEventListener('click', () => {
    const q = els.q.value.trim();
    els.q.value = '';
    askCombined(q);
  });
  els.copy.addEventListener('click', copyPrompt);

  renderSrc();
}

function togglePanel(open) {
  els.panel.hidden = !open;
  els.fab.style.display = open ? 'none' : '';
  els.fab.setAttribute('aria-expanded', String(open));
  if (open) els.q.focus(); else els.fab.focus(); // 焦点跟随 UI：收起后回到悬浮钮
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
  els.copy.disabled = !current && n === 0; // 无可复制内容时禁用，避免点了没反应
}

/** 写剪贴板：优先 Clipboard API（需安全上下文），失败降级 execCommand（http 局域网访问场景） */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* 权限被拒或非安全上下文 → 降级 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

/** 零网络提示词出口：无数据 → 本页盘 / 有数据 → 跨页综合盘；不依赖 aiEnabled（关闭态照常可用） */
async function copyPrompt() {
  const question = els.q.value.trim();
  let text;
  if (current) text = buildPromptText(current.domain, current.structured, question);
  else {
    const sources = Object.values(loadSession().sources);
    if (!sources.length) { els.out.innerHTML = '<span class="hint">本页尚未排盘，请先完成排盘；或先在其他页排盘后使用「复制提示词」汇总。</span>'; return; }
    text = buildCombinedPromptText(sources, question);
  }
  if (await copyText(text)) {
    els.out.innerHTML = '<span class="hint">已复制到剪贴板：把这份提示词粘贴到你常用的对话工具即可获得完整解读。内容含你的出生数据，请确认目标平台可信。</span>';
    const orig = els.copy.dataset.originalText ?? els.copy.textContent;
    els.copy.dataset.originalText = orig;
    els.copy.textContent = '已复制 ✓';
    setTimeout(() => { els.copy.textContent = orig; }, 1600);
  } else {
    // 复制不可用（如非安全上下文且 execCommand 被禁）：把文本落到输出区，让用户手动全选复制
    els.out.innerHTML = '<span class="hint">复制未成功（浏览器限制）。已把提示词完整显示如下，请手动全选复制。</span>';
    const pre = document.createElement('pre');
    pre.textContent = text; // textContent 防注入：用户问题可能含 HTML
    els.out.append(pre);
  }
}

function guardEnabled() {
  if (aiEnabled()) return true;
  els.out.innerHTML = '<span class="hint">AI 解读默认关闭。点右下「设置」填齐端点 / 模型 / 密钥并勾选开启（数据将发送至你填写的端点）。</span>';
  if (els.set.hidden) els.setbtn.click(); // 顺手展开设置区，少一步操作
  return false;
}

async function runStream(iter, controller) {
  els.out.textContent = '';
  els.send.textContent = '停止'; // P13：发送中发送键临时变「停止」，点击触发 abort
  els.send.disabled = false;
  els.comb.disabled = true;
  activeAbort = controller ?? null;
  let n = 0;
  try {
    for await (const chunk of iter) { els.out.textContent += chunk; n++; }
    if (n === 0) els.out.textContent = '（端点返回空响应，请检查模型 / 密钥 / 端点 URL）';
  } catch (e) {
    if (e?.name === 'AbortError') {
      els.out.textContent += (els.out.textContent ? '\n' : '') + '（已停止生成。）';
    } else {
      els.out.textContent = `AI 解读失败：${e.message}。本页规则解读不受影响。`; // textContent 防注入（layout 的 esc 会循环 import）
    }
  } finally {
    activeAbort = null;
    els.send.textContent = '发送';
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
  const controller = new AbortController(); // P13：可中断的流式请求
  const answer = await runStream(streamReading(current.domain, current.structured, question, controller.signal), controller);
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
  const controller = new AbortController();
  await runStream(streamCombined(sources, question, controller.signal), controller);
}
