// 动效与可访问性契约测试 — 防止视觉改造时丢掉动效回落与键盘可达性
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const R = (p) => readFileSync(new URL('../site/' + p, import.meta.url), 'utf8');

test('CSS：存在 reduced-motion 回落与焦点可见样式', () => {
  const css = R('assets/css/base.css');
  assert.ok(/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css), '缺 prefers-reduced-motion 回落（可访问性硬要求）');
  assert.ok(css.includes(':focus-visible'), '缺 :focus-visible 焦点样式（键盘导航不可用）');
  assert.ok(css.includes('@keyframes'), '缺动效关键帧');
  // 回落块必须真的关闭动画与过渡，而不是只写了个空壳
  const block = css.slice(css.indexOf('prefers-reduced-motion'));
  assert.ok(block.includes('animation-duration'), '回落块未关闭 animation');
  assert.ok(block.includes('transition-duration'), '回落块未关闭 transition');
});

test('动效工具：导出齐备且不引入网络依赖', () => {
  const m = R('js/ui/motion.mjs');
  for (const fn of ['revealCards', 'stagger', 'animateMeters', 'withBusy', 'announce']) {
    assert.ok(m.includes(`export function ${fn}`), `缺导出 ${fn}`);
  }
  assert.ok(!/fetch\(|XMLHttpRequest|https?:\/\//.test(m), '动效工具不应有网络调用');
  assert.ok(m.includes('requestAnimationFrame'), 'withBusy 应先用双 rAF 让忙碌态与数据条先渲染');
});

test('塔罗发牌：卡牌具备键盘可达性（role/tabindex/keydown）', () => {
  const t = R('js/pages/tarot-page.mjs');
  assert.ok(t.includes('tabindex="0"'), '缺 tabindex（无法用 Tab 定位）');
  assert.ok(t.includes('role="button"'), '缺 role 语义');
  assert.ok(t.includes("e.key === 'Enter'"), '缺 Enter 键处理');
  assert.ok(t.includes("e.key === ' '"), '缺空格键处理');
  assert.ok(t.includes('aria-label'), '缺 aria-label 描述');
  // 重绘时应标记已翻开状态，避免重复触发
  assert.ok(t.includes('已翻开'), '翻牌后未更新无障碍描述');
});

test('结果页：均接入动效层并设置忙碌态文案', () => {
  for (const p of ['bazi', 'ziwei', 'natal', 'tarot']) {
    const src = R(`js/pages/${p}-page.mjs`);
    assert.ok(src.includes("from '../ui/motion.mjs'"), `${p} 页未接入动效层`);
    assert.ok(src.includes('revealCards'), `${p} 页未使用结果入场`);
  }
  assert.ok(R('js/pages/bazi-page.mjs').includes('排盘中…'), '八字页缺忙碌态文案');
  assert.ok(R('js/pages/ziwei-page.mjs').includes('起盘中…'), '紫微页缺忙碌态文案');
  assert.ok(R('js/pages/natal-page.mjs').includes('绘制中…'), '星盘页缺忙碌态文案');
  assert.ok(R('js/pages/tarot-page.mjs').includes('洗牌中…'), '塔罗页缺忙碌态文案');
});
