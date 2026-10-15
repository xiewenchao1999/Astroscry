// 跨盘相位引擎回归测试 — 合盘/行运共用引擎（astro-synastry.mjs）
// 基准：几何构造相位 + 真实双盘（castNatal）
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
globalThis.self = globalThis;
globalThis.Astronomy = require('../site/vendor/astronomy.min.js');

import { castNatal, computeSky } from '../site/js/core/astro.mjs';
import { interAspects, compatibilityScore, strengthsAndChallenges, pairKey, houseOverlay, compatibilityDimensions } from '../site/js/core/astro-synastry.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const mk = (key, cn, lon) => ({ key, cn, lon });

test('跨盘相位：精确几何构造（合/冲/拱/刑/六合/无）', () => {
  // moon 放在 45°：对全部测试偏移（0/30/45/60/90/120/150/180）加上发光体加成后的各相位窗口均不入轨
  // （O06 归一后发光体加成 2°，原 200° 夹具在 170° 差处恰好触到冲相窗口边界 10°，故挪位）
  const A = { sun: mk('sun', '太阳', 0), moon: mk('moon', '月亮', 45) };
  const cases = [
    [0, 'conj'], [60, 'sextile'], [90, 'square'], [120, 'trine'], [150, 'quincunx'], [180, 'opp'], [30, 'semisextile'],
  ];
  for (const [delta, expect] of cases) {
    const B = { sun: mk('sun', '太阳', delta) };
    const { items } = interAspects(A, B);
    assert.equal(items.length, 1, `偏移 ${delta}° 应得 1 条相位，实际 ${JSON.stringify(items)}`);
    assert.equal(items[0].aspect, expect, `偏移 ${delta}° 应为 ${expect}，实际 ${items[0].aspect}`);
  }
  // 无相位（45° 不在收录集合；用仅含太阳的盘，避免与夹具 moon@45 构成合相）
  const B45 = { sun: mk('sun', '太阳', 45) };
  assert.equal(interAspects({ sun: mk('sun', '太阳', 0) }, B45).items.length, 0, '45° 半刑不应收录（ponytail 范围外）');
});

test('跨盘相位：发光体容许度放宽（任一端为日月即 +2°，O06 与本命口径归一）', () => {
  // 非发光体对：上限 8°，8.5° 不收录
  const A = { mars: mk('mars', '火星', 0) };
  assert.equal(interAspects(A, { pluto: mk('pluto', '冥王星', 8.5) }).items.length, 0);
  assert.equal(interAspects(A, { pluto: mk('pluto', '冥王星', 7.9) }).items.length, 1);
  // 发光体对：上限 10°（原 1.5° 口径为 9.5°，行为变化点），9.4° 收录为合相
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

test('宫位叠加：几何构造（整宫制换盘落宫）', () => {
  // A 上升在白羊（index 0）：sun@0° 落自己第 1 宫，moon@200°（天秤）落第 7 宫
  const A = { ascSignIndex: 0, planets: { sun: mk('sun', '太阳', 0), moon: mk('moon', '月亮', 200) } };
  // B 上升也在白羊，其 sun@90°（巨蟹）应落入 A 的第 4 宫
  const B = { ascSignIndex: 0, planets: { sun: mk('sun', '太阳', 90) } };
  const { bInA, aInB } = houseOverlay(A, B);
  assert.equal(bInA.length, 1);
  assert.equal(bInA[0].house, 4, 'B 太阳（巨蟹）应落入 A 的第 4 宫');
  assert.deepEqual(aInB.map((x) => x.house), [1, 7], 'A 的日/月相对 B 上升落第 1/7 宫');
  // 跨黄道零点回绕：A 上升双鱼（index 11），B sun@0°（白羊）应落 A 的第 2 宫
  const wrapA = { ascSignIndex: 11, planets: {} };
  const wrap = houseOverlay(wrapA, { ascSignIndex: 0, planets: { sun: mk('sun', '太阳', 0) } });
  assert.equal(wrap.bInA[0].house, 2, '黄经回绕后应为第 2 宫而非负数');
});

test('宫位叠加：真实双盘（条数守恒、宫位范围 1-12）', () => {
  const nA = castNatal({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, lat: 39.9042, lon: 116.4074, tzOffsetHours: 8 });
  const nB = castNatal({ year: 1992, month: 8, day: 14, hour: 14, minute: 30, lat: 51.5074, lon: -0.1278, tzOffsetHours: 1 });
  const { aInB, bInA } = houseOverlay(nA, nB);
  assert.equal(aInB.length, Object.keys(nA.planets).length);
  assert.equal(bInA.length, Object.keys(nB.planets).length);
  assert.ok([...aInB, ...bInA].every((x) => x.house >= 1 && x.house <= 12));
  // 同宫内按行星权重降序
  const firstPair = aInB.filter((x) => x.house === aInB[0].house);
  assert.ok(firstPair.length === 1 || (firstPair[0].planet === 'sun' || firstPair[0].planet === 'moon'), '同宫应高权重行星在前');
});

test('维度评分：互斥划分、空维度为 null、与总分同模型', () => {
  // sun-sun 拱 → 情感；venus-venus 拱 → 恋爱；mercury-pluto 合 → 沟通；无木土 → 承诺为 null
  const A = { sun: mk('sun', '太阳', 0), venus: mk('venus', '金星', 100), mercury: mk('mercury', '水星', 200) };
  const B = { sun: mk('sun', '太阳', 120), venus: mk('venus', '金星', 220), pluto: mk('pluto', '冥王星', 200) };
  const { items } = interAspects(A, B);
  assert.equal(items.length, 3, `应恰好 3 条相位，实际 ${JSON.stringify(items)}`);
  const dims = compatibilityDimensions(items);
  assert.equal(dims.emotional.count, 1);
  assert.equal(dims.romance.count, 1);
  assert.equal(dims.mental.count, 1);
  assert.equal(dims.stability.score, null, '无木土相位 → 承诺维度为 null');
  assert.equal(dims.stability.count, 0);
  const scores = [dims.romance, dims.mental, dims.emotional].map((d) => d.score);
  assert.ok(scores.every((s) => s >= 0 && s <= 100));
  assert.equal(dims.romance.count + dims.mental.count + dims.emotional.count + dims.stability.count, items.length, '互斥划分应覆盖全部相位');
  assert.ok(dims.romance.top.aCn, 'top 应携带最强相位供页面引用');
  // 空输入
  const empty = compatibilityDimensions([]);
  assert.ok(Object.values(empty).every((d) => d.score === null && d.count === 0));
});
