// 八字分析层回归测试 — 强弱量化 / 月令取格 / 合冲刑害 / 称骨 / 案例库
// 基准：规则来源见 docs/research/专项调研-用户指定项目.md（《四柱编程》与 yuan 规则包 + 袁天罡称骨表）
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
Object.assign(globalThis, require('../site/vendor/lunar.js'));

import { castBazi } from '../site/js/core/bazi.mjs';
import { analyzeStrength, detectGeju, analyzeRelations, castChenggu, buildCaseLibrary, readMarriage, analyzeShensha } from '../site/js/core/bazi-analysis.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const D = (p) => JSON.parse(readFileSync(new URL('../site/data/' + p, import.meta.url), 'utf8'));
const W = D('wuxing-weights.json');
const CG = D('chenggu.json');
const I = D('interpret-bazi.json');

test('十神修正：非日柱天干与日干相同者为「比肩」，仅日柱为「日主」', () => {
  // 庚申日 庚辰时、月干庚 —— 三处庚，仅日柱标日主
  const b = castBazi({ year: 1968, month: 8, day: 8, hour: 8, minute: 0, gender: 'male' });
  assert.equal(b.pillars.day.ganShiShen, '日主');
  assert.equal(b.pillars.month.ganShiShen, '比肩', '月干庚应为比肩');
  assert.equal(b.pillars.time.ganShiShen, '比肩', '时干庚应为比肩');
  assert.equal(b.pillars.month.hideGans.find((h) => h.gan === '庚').shiShen, '比肩', '藏干庚应为比肩');
  assert.ok(!Object.values(b.pillars).some((p) => p.hideGans.some((h) => h.shiShen === '日主')), '藏干不应出现日主');
});

test('强弱量化：1968-08-08 08:00（庚金生申月，身强）', () => {
  const b = castBazi({ year: 1968, month: 8, day: 8, hour: 8, minute: 0, gender: 'male' });
  assert.deepEqual(Object.values(b.pillars).map((p) => p.ganZhi), ['戊申', '庚申', '庚戌', '庚辰'], '四柱基准');
  const s = analyzeStrength(b, W);
  assert.equal(s.support, 7.1);
  assert.equal(s.drain, 0.76);
  assert.equal(s.net, 6.34);
  assert.equal(s.band.cn, '身强');
  // 月令加倍：月干比肩 +2.0，同柱非月令的时干比肩 +1.0（恰为两倍）
  const monthGan = s.contributions.find((c) => c.pos === 'month' && !c.weight);
  const timeGan = s.contributions.find((c) => c.pos === 'time' && !c.weight);
  assert.equal(monthGan.value, 2.0);
  assert.equal(timeGan.value, 1.0);
  assert.equal(monthGan.value, timeGan.value * W.monthMultiplier, '月干得分应为非月令同分项的两倍');
});

test('强弱量化：算术自洽（support - drain = net）且月令系数生效', () => {
  for (const args of [[2000, 1, 1, 12], [1990, 10, 10, 10], [2020, 6, 10, 12], [1978, 8, 23, 12]]) {
    const b = castBazi({ year: args[0], month: args[1], day: args[2], hour: args[3], minute: 0, gender: 'male' });
    const s = analyzeStrength(b, W);
    assert.equal(Math.round((s.support - s.drain) * 100) / 100, s.net, '净值应等于生扶减克耗');
    // 月柱所有分项应带 2 倍系数：检查月柱藏干分值 = 单倍分值 × 2
    for (const c of s.contributions.filter((x) => x.pos === 'month' && x.weight)) {
      const single = (W.shiShenStrengthScore[c.shiShen] ?? 0) * c.weight;
      assert.ok(Math.abs(c.value - single * W.monthMultiplier) < 1e-9, `月柱藏干 ${c.source} 未按 ${W.monthMultiplier} 倍计`);
    }
  }
});

test('月令取格：建禄格 / 正财格（含禄刃专论）', () => {
  // 庚日生申月，月令主气即日主同类 → 建禄格
  const b1 = castBazi({ year: 1968, month: 8, day: 8, hour: 8, minute: 0, gender: 'male' });
  const g1 = detectGeju(b1, I);
  assert.equal(g1.shiShen, '比肩');
  assert.ok(g1.name.includes('建禄格'), `应为建禄格，实际：${g1.name}`);
  // 戊日生子月，藏干癸（正财）未透 → 正财格
  const b2 = castBazi({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, gender: 'male' });
  const g2 = detectGeju(b2, I);
  assert.equal(g2.shiShen, '正财');
  assert.ok(g2.name.includes('正财格'));
});

test('合冲刑害：戊午日戊午时检出「午自刑」', () => {
  const b = castBazi({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, gender: 'male' });
  const r = analyzeRelations(b, W);
  const ziXing = r.items.find((x) => x.typeCn === '午自刑');
  assert.ok(ziXing, '应检出午自刑');
  assert.deepEqual(ziXing.positions, ['日柱', '时柱']);
  // 冲/合各至少覆盖一次关系表全量：用子午冲构造
  const b2 = castBazi({ year: 2000, month: 6, day: 15, hour: 12, minute: 0, gender: 'male' });
  const r2 = analyzeRelations(b2, W);
  assert.ok(r2.items.every((x) => ['he', 'chong', 'xing', 'hai'].includes(x.type)), '关系类型应在四类内');
});

test('称骨：2000-08-16 早子时 → 四两六钱（46 钱）', () => {
  const b = castBazi({ year: 2000, month: 8, day: 16, hour: 0, minute: 0, gender: 'female' });
  const c = castChenggu(b, W, CG);
  assert.deepEqual(
    { y: c.parts.year.qian, m: c.parts.month.qian, d: c.parts.day.qian, h: c.parts.hour.qian },
    { y: 12, m: 9, d: 9, h: 16 },
  );
  assert.equal(c.totalQian, 46);
  assert.equal(c.tier.label, '四两六钱');
  assert.equal(c.parts.year.ganzhi, '庚辰', '年键应为农历年干支');
  assert.ok(c.tier.verse.length > 10);
});

test('称骨边界：夜子时按次日计、闰月下半月按下月', () => {
  const night = castBazi({ year: 2000, month: 8, day: 16, hour: 23, minute: 30, gender: 'female' });
  const c1 = castChenggu(night, W, CG);
  assert.equal(c1.parts.day.lunarDay, 18, '夜子时应按次日（农历十八）计');
  assert.equal(c1.totalQian, 55);
  assert.ok(c1.notes.some((n) => n.includes('夜子时')));

  // 2020-06-10 = 农历闰四月十九（下半月）→ 月份键应为 5
  const leap = castBazi({ year: 2020, month: 6, day: 10, hour: 12, minute: 0, gender: 'male' });
  assert.equal(leap.lunar.monthNum, -4, '应为闰四月');
  const c2 = castChenggu(leap, W, CG);
  assert.equal(c2.parts.month.lunarMonth, 5, '闰月下半月应按次月（五月）计');
  assert.ok(c2.notes.some((n) => n.includes('闰')));

  // 闰月上半月按本月：2020-06-01 = 闰四月初十
  const leapUp = castBazi({ year: 2020, month: 6, day: 1, hour: 12, minute: 0, gender: 'male' });
  assert.equal(leapUp.lunar.monthNum, -4);
  assert.equal(castChenggu(leapUp, W, CG).parts.month.lunarMonth, 4, '闰月上半月应按本月计');
});

test('称骨：总骨重恒在 21~71 钱闭区间（抽样全年每日）', () => {
  let n = 0;
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 28; d += 9) {
      const b = castBazi({ year: 1988, month: m, day: d, hour: 12, minute: 0, gender: 'male' });
      const c = castChenggu(b, W, CG);
      assert.ok(c.totalQian >= 21 && c.totalQian <= 71, `总骨重 ${c.totalQian} 越界`);
      n++;
    }
  }
  assert.ok(n >= 30, '抽样量不足');
});

test('名人案例库：25 条均可算出年/月/日三柱', () => {
  const cases = D('celebrity-cases.json').cases;
  const lib = buildCaseLibrary(cases, castBazi);
  assert.equal(lib.length, 25);
  for (const x of lib) {
    assert.equal(x.pillars.length, 3);
    assert.ok(x.pillars.every((p) => /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(p)), `${x.name} 柱格式异常`);
    assert.ok(x.dayGan && x.dayGanWuXing);
  }
  // 1978 年为戊午年（科比案例）——年柱校验
  const kobe = lib.find((x) => x.id === 'kobe_bryant');
  assert.equal(kobe.pillars[0], '戊午');
});

test('姻缘视角：readMarriage 配偶宫/配偶星/日支关系提示', () => {
  const interp = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'interpret-bazi.json'), 'utf8'));
  const weights = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'wuxing-weights.json'), 'utf8'));
  // 基准盘：1968-08-08 08:00（公历）→ 戊申庚申庚戌庚辰，男命；日支戌，辰戌冲
  const b = castBazi({ year: 1968, month: 8, day: 8, hour: 8, minute: 0, gender: 'male' });
  const rel = analyzeRelations(b, weights);
  const m = readMarriage(b, interp, rel);
  assert.ok(m.palaceLine.includes('戌') || m.palaceLine.length > 10, '配偶宫画像非空');
  assert.ok(m.starLine.includes('正财'), '男命配偶星应为正财');
  const f = { ...b, input: { ...b.input, gender: 'female' } };
  const mf = readMarriage(f, interp, rel);
  assert.ok(mf.starLine.includes('正官'), '女命配偶星应为正官');
  assert.ok(m.tips.some((t) => t.typeCn.includes('冲')), '日支戌辰冲应产出提示');
  assert.ok(m.tips.every((t) => t.tip.length > 5));
});

// —— 神煞：用两个已知干支基准手算核对（口诀见语料 shensha.rulesNote）——
const shOf = (items, key) => items.find((x) => x.key === key);

test('神煞：1968-08-08 08:00（戊申 庚申 庚戌 庚辰）→ 禄神/魁罡/华盖/驿马', () => {
  const b = castBazi({ year: 1968, month: 8, day: 8, hour: 8, minute: 0, gender: 'male' });
  const items = analyzeShensha(b, I);
  assert.equal(items.length, 11, '应覆盖 11 类神煞');
  // 庚日干禄在申：年支与月支皆申 → 年柱 + 月柱
  assert.deepEqual(shOf(items, 'lushen').hits, ['年柱', '月柱'], '禄神应落年柱与月柱');
  // 日柱庚戌属魁罡
  assert.deepEqual(shOf(items, 'kuigang').hits, ['日柱']);
  // 年支申（申子辰）华盖在辰 → 时柱；日支戌（寅午戌）华盖在戌 → 日柱
  assert.deepEqual(shOf(items, 'huagai').hits.sort(), ['日柱', '时柱'].sort(), '华盖应落日柱与时柱');
  // 驿马：年支申组驿马在寅（无）；日支戌组驿马在申 → 年柱 + 月柱
  assert.deepEqual(shOf(items, 'yima').hits, ['年柱', '月柱'], '驿马应落年柱与月柱');
  // 庚日干天乙贵人在丑未，四柱无丑未
  assert.deepEqual(shOf(items, 'tianyi').hits, [], '天乙贵人不应命中');
  // 每项字段齐备、无 undefined 文本
  for (const x of items) {
    assert.ok(x.name && x.text && x.text.length > 10, `${x.key} 缺判词`);
    assert.ok(Array.isArray(x.hits), `${x.key} hits 应为数组`);
    assert.ok(!x.text.includes('undefined') && x.value.length > 0);
  }
});

test('神煞：2000-01-01 12:00（己卯 丙子 戊午 戊午）→ 羊刃/桃花/将星，且「未见」以空数组表达', () => {
  const b = castBazi({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, gender: 'male' });
  const items = analyzeShensha(b, I);
  // 戊日干羊刃在午 → 日柱与时柱
  assert.deepEqual(shOf(items, 'yangren').hits.sort(), ['日柱', '时柱'].sort(), '羊刃应落日柱与时柱');
  // 年支卯（亥卯未）桃花在子 → 月柱；日支午（寅午戌）桃花在卯 → 年柱
  assert.deepEqual(shOf(items, 'taohua').hits.sort(), ['月柱', '年柱'].sort(), '桃花应落年柱与月柱');
  // 将星：年支卯组在卯 → 年柱；日支午组在午 → 日柱/时柱
  assert.deepEqual(shOf(items, 'jiangxing').hits.sort(), ['年柱', '日柱', '时柱'].sort(), '将星应落年柱/日柱/时柱');
  assert.deepEqual(shOf(items, 'kuigang').hits, [], '戊午日柱不属魁罡');
  assert.equal(items.filter((x) => x.hits.length).length, 3, '本基准应恰好命中三类神煞');
});

test('神煞：语料 items 缺失时显式报错，不静默产出空表', () => {
  const b = castBazi({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, gender: 'male' });
  assert.throws(() => analyzeShensha(b, {}), /shensha/);
});

