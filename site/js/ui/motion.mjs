// motion.mjs — 动效与交互反馈工具（不引入任何依赖）
// 设计原则：动效只用于「状态可感知」（结果出现 / 操作已受理 / 焦点可见），不制造眩晕；
// CSS 动画/过渡在 prefers-reduced-motion 分支下自动关闭；JS 侧动效（如 smooth 滚动）CSS 管不到，需调 reducedMotion() 分支。

/** JS 侧动效的 reduced-motion 判定（smooth 滚动等 CSS 覆盖不到的 API 用） */
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 结果卡依次浮现：为 .card 设置 --i 序号并加 .reveal（延迟由 CSS calc 计算） */
export function revealCards(root, selector = '.card') {
  if (!root) return;
  root.querySelectorAll(selector).forEach((el, i) => {
    el.style.setProperty('--i', String(Math.min(i, 12))); // 封顶，避免长列表末尾等待过久
    el.classList.add('reveal');
  });
}

/** 为容器内的一组元素设置错峰序号（首页入口、塔罗发牌） */
export function stagger(container, selector) {
  if (!container) return;
  container.querySelectorAll(selector).forEach((el, i) => el.style.setProperty('--i', String(i)));
}

/** 数据条填充动画：先以 0 宽渲染，再于下一帧过渡到 data-w 目标宽度 */
export function animateMeters(root) {
  if (!root) return;
  const items = root.querySelectorAll('.meter > i[data-w]');
  if (!items.length) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    items.forEach((el) => { el.style.width = `${el.dataset.w}%`; });
  }));
}

/**
 * 让「处理中」状态先渲染出来，再执行可能阻塞主线程的计算。
 * 计算是同步的，故用双 rAF 确保浏览器先绘制 disabled + 文案，再进入计算。
 * @param {HTMLButtonElement} btn
 * @param {string} busyText
 * @param {() => void} task
 */
export function withBusy(btn, busyText, task) {
  if (!btn) { task(); return; }
  const original = btn.dataset.originalText ?? btn.textContent;
  btn.dataset.originalText = original;
  btn.disabled = true;
  btn.textContent = busyText;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      task();
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }));
}

/** 结果区可读性播报：向 aria-live 容器写入简短状态（屏幕阅读器反馈） */
export function announce(root, message) {
  if (!root) return;
  let live = root.querySelector('[data-live]');
  if (!live) {
    live = document.createElement('p');
    live.dataset.live = '1';
    live.className = 'hint';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    root.prepend(live);
  }
  live.textContent = message;
}
