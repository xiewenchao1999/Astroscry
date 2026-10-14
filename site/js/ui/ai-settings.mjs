// ai-settings.mjs — AI 解读层 opt-in 设置卡（独立模块，core/data 禁止 import）
// 存储约定：localStorage 单 KEY；默认 enabled=false（关闭态零外部请求）
// 隐私边界：开启后，当前排盘结构化输出与用户问题将发送至用户自填的端点；密钥仅存本机

const KEY = 'astroscry.ai.v1';
const DEFAULTS = { enabled: false, baseURL: '', model: '', key: '' };

export function loadAIConfig() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEFAULTS }; }
}
export function saveAIConfig(cfg) {
  localStorage.setItem(KEY, JSON.stringify({ ...DEFAULTS, ...cfg }));
}
export function clearAIConfig() {
  localStorage.removeItem(KEY);
}
export function aiEnabled(cfg) {
  const c = cfg || loadAIConfig();
  return !!(c.enabled && c.baseURL && c.model && c.key);
}

/**
 * 挂载 AI 设置卡（折叠摘要 + 展开表单风格，与 birth-profile 一致）。
 * @param {HTMLElement} container
 * @returns {{ get: () => object }}
 */
export function mountAICard(container) {
  let cfg = loadAIConfig();
  let expanded = false;

  function render() {
    if (!expanded) {
      container.innerHTML = `
        <div class="birth-summary">
          <div><span class="src-tag">AI 解读</span><b>${cfg.enabled ? '已开启' : '已关闭'}</b>
            <span class="hint">${cfg.enabled ? '排盘与问题将发送至你的端点' : '默认关闭，数据不外发'}</span></div>
          <button class="btn ghost" id="ai-toggle" type="button">${cfg.enabled ? '关闭' : '开启'}</button>
          <button class="btn ghost" id="ai-edit" type="button">设置</button>
        </div>`;
      container.querySelector('#ai-toggle').addEventListener('click', () => {
        // 未填齐配置时直接展开表单，避免开启一个不可用的状态
        if (!cfg.enabled && !(cfg.baseURL && cfg.model && cfg.key)) { expanded = true; render(); return; }
        cfg.enabled = !cfg.enabled;
        saveAIConfig(cfg);
        render();
      });
      container.querySelector('#ai-edit').addEventListener('click', () => { expanded = true; render(); });
      return;
    }
    container.innerHTML = `
      <form id="ai-form" class="panel" style="grid-template-columns: 1fr;">
        <div class="hint" style="grid-column:1/-1;">
          ⚠ 开启后，当前排盘的结构化输出与你的问题将发送至你填写的端点（仅本地保存，不进代码仓库）。
          请使用兼容主流流式对话协议的端点；密钥仅存本机 localStorage。
        </div>
        <div><label>服务端点 URL</label><input type="text" id="ai-url" value="${cfg.baseURL}" placeholder="https://your-host/v1/..."></div>
        <div><label>模型名</label><input type="text" id="ai-model" value="${cfg.model}" placeholder="你所用模型的标识"></div>
        <div><label>密钥</label><input type="password" id="ai-key" value="${cfg.key}" placeholder="sk-..."></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <button class="btn" type="button" id="ai-save">保存</button>
          <button class="btn ghost" type="button" id="ai-cancel">取消</button>
          <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="ai-enable" ${cfg.enabled ? 'checked' : ''}> 开启 AI 解读</label>
        </div>
      </form>`;
    const $ = (id) => container.querySelector(id);
    $('#ai-save').addEventListener('click', () => {
      cfg.baseURL = $('#ai-url').value.trim();
      cfg.model = $('#ai-model').value.trim();
      cfg.key = $('#ai-key').value.trim();
      cfg.enabled = $('#ai-enable').checked;
      saveAIConfig(cfg);
      expanded = false;
      render();
    });
    $('#ai-cancel').addEventListener('click', () => { cfg = loadAIConfig(); expanded = false; render(); });
  }

  render();
  return { get: () => loadAIConfig() };
}
