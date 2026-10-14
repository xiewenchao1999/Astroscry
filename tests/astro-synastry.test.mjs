// 跨盘相位引擎回归测试 — 合盘/行运共用引擎（astro-synastry.mjs）
// 基准：几何构造相位 + 真实双盘（castNatal）
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
globalThis.self = globalThis;
globalThis.Astronomy = require('../site/vendor/astronomy.min.js');

import { castNatal, computeSky } from '../site/js/core/astro.mjs';
import { interAspects, compatibilityScore, strengthsAndChallenges, pairKey } from '../site/js/core/astro-synastry.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const mk = (key, cn, lon) => ({ key, cn, lon });

test('跨盘相位：精确几何构造（合/冲/拱/刑/六合/无）', () => {
  // moon 放在 200°：与所有测试偏移（0/30/45/60/90/120/150/180）及发光体放宽后均构不成收录相位
  const A = { sun: mk('sun', '太阳', 0), moon: mk('moon', '月亮', 200) };
  const cases = [
    [0, 'conj'], [60, 'sextile'], [90, 'square'], [120, 'trine'], [150, 'quincunx'], [180, 'opp'], [30, 'semisextile'],
  ];
  for (const [delta, expect] of cases) {
    const B = { sun: mk('sun', '太阳', delta) };
    const { items } = interAspects(A, B);
    assert.equal(items.length, 1, `偏移 ${delta}° 应得 1 条相位，实际 ${JSON.stringify(items)}`);
    assert.equal(items[0].aspect, expect, `偏移 ${delta}° 应为 ${expect}，实际 ${items[0].aspect}`);
  }
  // 无相位（45° 不在收录集合）
  const B45 = { sun: mk('sun', '太阳', 45) };
  assert.equal(interAspects(A, B45).items.length, 0, '45° 半刑不应收录（ponytail 范围外）');
});

test('跨盘相位：发光体容许度放宽（任一端为日月即 +1.5°）', () => {
  // 非发光体对：上限 8°，8.5° 不收录
  const A = { mars: mk('mars', '火星', 0) };
  assert.equal(interAspects(A, { pluto: mk('pluto', '冥王星', 8.5) }).items.length, 0);
  assert.equal(interAspects(A, { pluto: mk('pluto', '冥王星', 7.9) }).items.length, 1);
  // 发光体对：上限 9.5°，9.4° 收录为合相
  const { items } = interAspects({ sun: mk('sun', '太阳', 0) }, { moon: mk('moon', '月亮', 9.4) });
  assert.equal(items.length, 1);
  assert.equal(items[0].aspect, 'conj');
});

test('强度与排序：越接近精确、权重越高则越强，且降序排列', () => {
  const A = { sun: mk('sun', '太阳', 0) };
  const B = { moon: mk('moon', '月亮', 0.5), pluto: mk('pluto', '冥王星', 0.5) };
  const { items } = interAspects(A, B);
  assert.equal(items.length, 2);
  assert.equal(items[0].aCn ? items[0].b : '', 'moon', '月亮权重高应排前');
  assert.ok(items[0].strength > items[1].strength);
  assert.ok(items.every((x) => x.strength >= 0 && x.strength <= 100));
});

test('兼容度评分：0-100、确定性、方向正确（全拱高分 / 全刑低分）', () => {
  const A = { sun: mk('sun', '太阳', 0), moon: mk('moon', '月亮', 120) };
  const trineB = { sun: mk('sun', '太阳', 120), moon: mk('moon', '月亮', 240) };
  const scoreHi = compatibilityScore(interAspects(A, trineB).items);
  const squareB = { sun: mk('sun', '太阳', 90), moon: mk('moon', '月亮', 210) };
  const scoreLo = compatibilityScore(interAspects(A, squareB).items);
  assert.ok(scoreHi >= 75, `全拱应高分，实际 ${scoreHi}`);
  assert.ok(scoreLo <= 45, `全刑应低分，实际 ${scoreLo}`);
  // 确定性
  assert.equal(scoreHi, compatibilityScore(interAspects(A, trineB).items));
  // 空相位 → 中位 50
  assert.equal(compatibilityScore([]), 50);
});

test('汇总与优势/挑战：结构齐备', () => {
  const A = { sun: mk('sun', '太阳', 0), moon: mk('moon', '月亮', 60) };
  const B = { sun: mk('sun', '太阳', 120), moon: mk('moon', '月亮', 240), mars: mk('mars', '火星', 90) };
  const { items, summary } = interAspects(A, B);
  assert.equal(summary.total, items.length);
  assert.ok(summary.harmonious + summary.challenging + summary.neutral === summary.total);
  const { harmonious, challenging, neutral } = strengthsAndChallenges(items, 3);
  assert.ok(harmonious.every((x) => x.nature === 'harmonious'));
  assert.ok(challenging.every((x) => x.nature === 'challenging'));
  assert.ok(neutral.every((x) => x.nature === 'neutral'));
  assert.equal(pairKey('sun', 'moon'), 'moon-sun', 'pairKey 应双向归一');
});

test('真实双盘：2000-01-01 北京 × 1992-08-14 伦敦', () => {
  const nA = castNatal({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, lat: 39.9042, lon: 116.4074, tzOffsetHours: 8 });
  const nB = castNatal({ year: 1992, month: 8, day: 14, hour: 14, minute: 30, lat: 51.5074, lon: -0.1278, tzOffsetHours: 1 });
  const { items, summary } = interAspects(nA.planets, nB.planets);
  assert.ok(items.length >= 20, `真实双盘相位应丰富，实际 ${items.length}`);
  const score = compatibilityScore(items);
  assert.ok(score >= 5 && score <= 95, `评分越界 ${score}`);
  // 北交点不参与
  assert.ok(items.every((x) => x.a !== 'northnode' && x.b !== 'northnode'));
});

test('行运：今日天象 × 本命（computeSky × castNatal 同引擎）', () => {
  const natal = castNatal({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, lat: 39.9042, lon: 116.4074, tzOffsetHours: 8 });
  const sky = computeSky(new Date());
  const { items } = interAspects(sky.planets, natal.planets);
  assert.ok(items.length > 0, '行运应至少有一条相位');
  assert.ok(items[0].strength >= items.at(-1).strength, '应按强度降序');
});
