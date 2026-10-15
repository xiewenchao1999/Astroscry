// 周易核心回归测试 — 起卦三法（rng 注入）+ 朱熹《易学启蒙》变爻取辞七档 + 数据闭合
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
Object.assign(globalThis, require('../site/vendor/lunar.js')); // 梅花时间卦需要农历（Solar/Lunar）

import { readFileSync } from 'node:fs';
import { castCoinHexagram, plumTimeCast, plumThreeCast, hexagramByBits, resolveReading, changedBits, validateIching } from '../site/js/core/iching.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const data = JSON.parse(readFileSync(new URL('../site/data/iching.json', import.meta.url), 'utf8'));
const byName = (name) => data.hexagrams.find((h) => h.full === name);
const QIAN = byName('乾为天'), KUN = byName('坤为地');

// 确定性 rng 桩：按队列依次返回（每枚铜钱消费一个值；<0.5 为反、≥0.5 为正）
const rngQueue = (values) => {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('rng 队列耗尽');
    return values[i++];
  };
};

test('数据闭合：validateIching 通过（64 卦、bits 无重、386 爻辞）', () => {
  const v = validateIching(data);
  assert.deepEqual(v, { ok: true, errors: [] }, `校验失败：${v.errors.join('；')}`);
  assert.equal(data.hexagrams.length, 64);
  assert.equal(new Set(data.hexagrams.map((h) => h.bits)).size, 64, 'bits 应全表唯一');
  // 特殊爻辞：乾坤用九用六
  assert.equal(QIAN.special.pos, '用九');
  assert.equal(KUN.special.pos, '用六');
});

test('铜钱法：三枚组合 → 爻值映射（3反=6 / 2反=7 / 1反=8 / 3正=9）', () => {
  // 每组合只控制第一爻（3 枚），其余 5 爻固定全正（=9）
  const cases = [
    [[0, 0, 0], 6],      // 3 反 → 老阴
    [[0, 0, 0.9], 7],    // 2 反 1 正 → 少阳
    [[0, 0.9, 0.9], 8],  // 1 反 2 正 → 少阴
    [[0.9, 0.9, 0.9], 9],// 3 正 → 老阳
  ];
  for (const [combo, expect] of cases) {
    const queue = [...combo, ...Array(15).fill(0.9)];
    const cast = castCoinHexagram(rngQueue(queue));
    assert.equal(cast.lines[0], expect, `组合 ${combo} 应为爻值 ${expect}`);
    assert.equal(cast.bits[0], expect === 7 || expect === 9 ? '1' : '0', '爻值应正确映射阴阳');
    assert.equal(cast.coins[0].length, 3);
  }
});

test('铜钱法：确定性（同 rng 同卦）、全反 → 坤六爻全动', () => {
  const a = castCoinHexagram(rngQueue(Array(18).fill(0)));
  const b = castCoinHexagram(rngQueue(Array(18).fill(0)));
  assert.deepEqual(a, b, '同 rng 序列应产出同卦');
  assert.equal(a.bits, '000000', '全反应为坤（六爻皆阴）');
  assert.deepEqual(a.moving, [1, 2, 3, 4, 5, 6], '六爻全老阴 → 全动');
});

test('朱熹七档·0 动：本卦卦辞', () => {
  const rd = resolveReading(data, QIAN, []);
  assert.equal(rd.movingCount, 0);
  assert.equal(rd.rule.key, 'static');
  assert.equal(rd.citations[0].source, '本卦卦辞');
  assert.equal(rd.citations[0].text, '元亨，利贞。');
  assert.equal(rd.changed, null);
});

test('朱熹七档·1 动：乾初九「潜龙勿用」', () => {
  const rd = resolveReading(data, QIAN, [1]);
  assert.equal(rd.movingCount, 1);
  assert.ok(rd.citations[0].source.includes('初九'));
  assert.equal(rd.citations[0].text, '潜龙勿用。');
});

test('朱熹七档·2 动：以上爻为主（乾初九+九二 → 主取九二）', () => {
  const rd = resolveReading(data, QIAN, [1, 2]);
  assert.equal(rd.movingCount, 2);
  assert.equal(rd.rule.key, 'two');
  assert.ok(rd.citations[0].source.includes('九二'), '上爻（九二）应为主');
  assert.equal(rd.citations[0].text, '见龙在田，利见大人。');
  assert.ok(rd.citations[1].source.includes('初九'), '下爻兼读');
});

test('朱熹七档·3 动：本卦卦辞（贞）+ 之卦卦辞（悔）', () => {
  const rd = resolveReading(data, QIAN, [1, 2, 3]);
  assert.equal(rd.movingCount, 3);
  assert.equal(rd.rule.key, 'three');
  assert.equal(rd.citations[0].source, '本卦卦辞');
  assert.ok(rd.citations[1].source.includes('之卦'), '应有之卦一路');
  assert.equal(rd.changed.full, '天地否', '乾下三爻全动 → 之卦为否（坤下乾上）');
});

test('朱熹七档·4 动：之卦不动爻之下者为主（乾四爻动 → 观九五）', () => {
  const rd = resolveReading(data, QIAN, [1, 2, 3, 4]);
  assert.equal(rd.movingCount, 4);
  assert.equal(rd.rule.key, 'four');
  assert.equal(rd.changed.full, '风地观', '乾下四爻全动 → 之卦为观');
  assert.ok(rd.citations[0].source.includes('九五'), '之卦不动爻（五六爻）之下者=九五');
  assert.ok(rd.citations[1].source.includes('上九'));
});

test('朱熹七档·5 动：之卦不动爻为主（乾五爻动 → 剥上九「硕果不食」）', () => {
  const rd = resolveReading(data, QIAN, [1, 2, 3, 4, 5]);
  assert.equal(rd.movingCount, 5);
  assert.equal(rd.rule.key, 'five');
  assert.equal(rd.changed.full, '山地剥', '乾下五爻全动 → 之卦为剥');
  assert.ok(rd.citations[0].source.includes('上九'));
  assert.ok(rd.citations[0].text.includes('硕果不食'), '应取剥卦上九爻辞');
});

test('朱熹七档·6 动：乾坤用九/用六（special 承载）', () => {
  const rdQ = resolveReading(data, QIAN, [1, 2, 3, 4, 5, 6]);
  assert.equal(rdQ.rule.key, 'six');
  assert.ok(rdQ.citations[0].source.includes('用九'));
  assert.equal(rdQ.citations[0].text, '见群龙，无首，吉。');
  const rdK = resolveReading(data, KUN, [1, 2, 3, 4, 5, 6]);
  assert.ok(rdK.citations[0].source.includes('用六'));
  assert.equal(rdK.citations[0].text, '利永贞。');
  // 余卦六爻全动 → 之卦卦辞
  const PI = byName('水地比');
  const rdP = resolveReading(data, PI, [1, 2, 3, 4, 5, 6]);
  assert.ok(rdP.citations[0].source.includes('之卦'), '非乾坤六爻全动应取之卦卦辞');
});

test('变卦 bits：动爻位翻转（乾初爻动 → 天风姤）', () => {
  const nb = changedBits('111111', [1]);
  assert.equal(nb, '011111');
  assert.equal(hexagramByBits(data, nb).full, '天风姤');
});

test('梅花时间卦：已知日期基准（2026-10-15 12:00 → 水风井·五爻动）', () => {
  // 年支序 7（丙午年·午）+ 农历九月 9 + 初六 6 = 22 → 上卦 22%8=6 坎；
  // 加午时序 7 = 29 → 下卦 29%8=5 巽、动爻 29%6=5 → bits 011010 = 水风井
  const cast = plumTimeCast(new Date(2026, 9, 15, 12, 0, 0));
  assert.equal(cast.upper, '坎');
  assert.equal(cast.lower, '巽');
  assert.equal(cast.moving, 5);
  assert.equal(cast.bits, '011010');
  assert.equal(hexagramByBits(data, cast.bits).full, '水风井');
});

test('三数法：11/5/3 → 火风鼎·初爻动；余 0 归模数（8/16/6 → 坤为地·上爻动）', () => {
  const c1 = plumThreeCast(11, 5, 3);
  assert.equal(c1.upper, '离', '11%8=3 → 离');
  assert.equal(c1.lower, '巽', '5 → 巽');
  assert.equal(c1.moving, 1, '(11+5+3)%6=1 → 初爻');
  assert.equal(hexagramByBits(data, c1.bits).full, '火风鼎');

  const c2 = plumThreeCast(8, 16, 6);
  assert.equal(c2.upper, '坤', '8%8 余 0 → 归 8 坤');
  assert.equal(c2.lower, '坤', '16%8 余 0 → 归 8 坤');
  assert.equal(c2.moving, 6, '(8+16+6)%6 余 0 → 归 6 上爻');
  assert.equal(hexagramByBits(data, c2.bits).full, '坤为地');
});

test('三数法：非法输入抛错（0 / 负数 / 非整数）', () => {
  assert.throws(() => plumThreeCast(0, 5, 3));
  assert.throws(() => plumThreeCast(7, -1, 3));
  assert.throws(() => plumThreeCast(7.5, 5, 3));
});

test('动爻位校验：越界抛错；非法 bits 抛错', () => {
  assert.throws(() => resolveReading(data, QIAN, [7]));
  assert.throws(() => resolveReading(data, QIAN, [0]));
  assert.throws(() => hexagramByBits(data, '11111'), '六位之外的 bits 应抛错（六位二进制全为合法卦，故用位数错误用例）');
});
