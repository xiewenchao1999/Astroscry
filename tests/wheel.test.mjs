// 星盘轮布局回归测试 — 不变量：11 个行星标签齐备、无 NaN、两两展示角间距 ≥ 下限
// 依据：ADR-001 适配函数（星盘可视化不变量）；对 renderWheel 的真实 SVG 输出反算角度验证
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.self = globalThis;
globalThis.Astronomy = require('../site/vendor/astronomy.min.js');

import { castNatal } from '../site/js/core/astro.mjs';
import { renderWheel } from '../site/js/ui/wheel.mjs';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const CX = 220, CY = 220, R_PLANET = 128, MIN_SEP_FLOOR = 8;

// 用例覆盖：常规盘、多星合相、跨年边界、极端时辰（早晚子时）
const CASES = [
  [2000, 1, 1, 12], [2002, 5, 10, 12], [2000, 5, 3, 12], [2020, 1, 12, 12],
  [1988, 3, 5, 3], [1995, 11, 20, 22], [1970, 8, 8, 8], [2005, 4, 20, 6],
  [2026, 10, 14, 4], [1968, 8, 8, 8], [2010, 12, 31, 23], [1949, 10, 1, 15],
];

function chartFor([y, m, d, h]) {
  return castNatal({ year: y, month: m, day: d, hour: h, minute: 0, lat: 39.9042, lon: 116.4074, tzOffsetHours: 8 });
}

/** 从 SVG 反算行星字形标签的展示角（黄经 0° 在左、逆时针增长） */
function glyphAngles(svg) {
  const out = [];
  for (const t of svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)" text-anchor="middle" font-size="15"[^>]*>/g)) {
    const x = +t[1], yy = +t[2] - 5;
    out.push(180 - Math.atan2(CY - yy, x - CX) * 180 / Math.PI);
  }
  return out;
}

test('星盘轮：11 个行星标签齐备且无 NaN/undefined', () => {
  for (const c of CASES) {
    const svg = renderWheel(chartFor(c));
    assert.ok(!/NaN|undefined/.test(svg), `${c.join('-')} 输出含 NaN/undefined`);
    assert.equal(glyphAngles(svg).length, 11, `${c.join('-')} 行星标签数应为 11`);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `${c.join('-')} SVG 结构不完整`);
  }
});

test('星盘轮：标签两两展示角间距不低于下限（重叠防护）', () => {
  for (const c of CASES) {
    const angles = glyphAngles(renderWheel(chartFor(c)));
    for (let i = 0; i < angles.length; i++) {
      for (let j = i + 1; j < angles.length; j++) {
        const sep = ((angles[j] - angles[i]) % 360 + 360) % 360;
        const circ = Math.min(sep, 360 - sep);
        assert.ok(circ >= MIN_SEP_FLOOR - 0.01, `${c.join('-')} 标签 ${i}/${j} 间距仅 ${circ.toFixed(2)}°`);
      }
    }
  }
});

test('星盘轮：标签落在行星环半径上（引线不越位）', () => {
  for (const c of CASES) {
    const svg = renderWheel(chartFor(c));
    for (const t of svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)" text-anchor="middle" font-size="15"/g)) {
      const r = Math.hypot(+t[1] - CX, (+t[2] - 5) - CY);
      assert.ok(Math.abs(r - R_PLANET) < 1.5, `${c.join('-')} 标签半径 ${r.toFixed(1)} 偏离 ${R_PLANET}`);
    }
  }
});

test('星盘轮源码：必要的可读性属性存在（抗遮挡描边）', () => {
  const src = readFileSync(new URL('../site/js/ui/wheel.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes('paint-order'), '缺 paint-order（文字描边抗遮挡）');
  assert.ok(src.includes('MIN_FLOOR'), '缺挤密降级下限常量');
});
