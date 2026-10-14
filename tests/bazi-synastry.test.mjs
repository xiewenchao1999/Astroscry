// 八字合婚回归测试 — mock 四柱对象直接驱动 matchBazi（不依赖真实日期构造）
import { matchBazi } from '../site/js/core/bazi-synastry.mjs';
import { readFileSync } from 'fs';
import { join } from 'path';
import assert from 'node:assert/strict';
import test from 'node:test';

const weights = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'wuxing-weights.json'), 'utf8'));
const interp = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'interpret-bazi.json'), 'utf8'));
const mk = (yearZhi, dayGan, dayZhi, fx) => ({
  input: { gender: 'male' },
  pillars: { year: { zhi: yearZhi }, day: { zhi: dayZhi, gan: dayGan } },
  fiveElements: fx,
});
const FX = { 金: 2, 木: 2, 水: 2, 火: 2, 土: 2 };
const FXnoWater = { 金: 3, 木: 3, 水: 0, 火: 2, 土: 2 };

test('八字合婚：生肖六合（子丑）+ 夫妻宫六合（午未）→ 上等档', () => {
  const m = matchBazi(mk('子', '甲', '午', FX), mk('丑', '庚', '未', FX), weights, interp);
  const z = m.items.find((x) => x.area === '生肖');
  assert.equal(z.typeCn, '六合');
  assert.ok(z.verdict.includes('天生一对'));
  const d = m.items.find((x) => x.area === '夫妻宫');
  assert.equal(d.typeCn, '六合');
  assert.ok(m.score >= 75 && m.band.cn === '上等婚', `实际 ${m.score} ${m.band.cn}`);
});

test('八字合婚：生肖相冲（子午）+ 日支相冲（申寅）→ 需磨合档', () => {
  const m = matchBazi(mk('子', '甲', '申', FX), mk('午', '庚', '寅', FX), weights, interp);
  assert.ok(m.items.find((x) => x.area === '生肖' && x.typeCn === '相冲'));
  assert.ok(m.items.find((x) => x.area === '夫妻宫' && x.typeCn === '相冲'));
  assert.ok(m.score < 45 && m.band.cn === '需磨合', `实际 ${m.score} ${m.band.cn}`);
});

test('八字合婚：日干五合（甲己 → 中正之合）', () => {
  const m = matchBazi(mk('寅', '甲', '午', FX), mk('戌', '己', '子', FX), weights, interp);
  const g = m.items.find((x) => x.area === '日干');
  assert.equal(g.typeCn, '五合');
  assert.ok(g.verdict.includes('中正之合'));
});

test('八字合婚：五行互补（A 缺水、B 有水）', () => {
  const m = matchBazi(mk('子', '甲', '午', FXnoWater), mk('丑', '庚', '未', FX), weights, interp);
  const w = m.items.find((x) => x.area === '五行');
  assert.ok(w.verdict.includes('互补'));
  assert.ok(m.score >= 55);
});

test('八字合婚：分数范围与档位结构', () => {
  const m = matchBazi(mk('卯', '丙', '酉', FX), mk('酉', '辛', '卯', FX), weights, interp);
  assert.ok(m.score >= 0 && m.score <= 100);
  assert.ok(m.band && m.band.cn && m.band.text);
  assert.ok(m.summary.includes('分'));
});
