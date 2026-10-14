// 奇门遁甲核心回归测试 — 两个手算基准局（阳遁七局 / 阴遁六局含中宫寄宫）+ 结构不变量
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
Object.assign(globalThis, require('../site/vendor/lunar.js'));
globalThis.Astronomy = require('../site/vendor/astronomy.min.js');

import { castQimen, JU_TABLE, TERMS } from '../site/js/core/qimen.mjs';
import { readQimen } from '../site/js/core/qimen-reading.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const QMEN_INTERP = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'site', 'data', 'interpret-qimen.json'), 'utf8'));

const WHEEL = [1, 8, 3, 4, 9, 2, 7, 6];

test('局数表：24 节气齐备、每气三元、局数 1-9', () => {
  assert.deepEqual(Object.keys(JU_TABLE), TERMS);
  for (const arr of Object.values(JU_TABLE)) {
    assert.equal(arr.length, 3);
    assert.ok(arr.every((n) => n >= 1 && n <= 9));
  }
});

test('基准一：2000-01-01 12:00 → 阳遁七局（冬至中元），值符天冲值使伤门', () => {
  const q = castQimen({ year: 2000, month: 1, day: 1, hour: 12, minute: 0 });
  assert.deepEqual(q.pillars, { year: '己卯', month: '丙子', day: '戊午', time: '戊午' });
  assert.equal(q.term, '冬至');
  assert.equal(q.dun, '阳');
  assert.equal(q.ju, 7);
  assert.equal(q.juName, '阳遁七局');
  assert.equal(q.yuan, '中元');
  assert.equal(q.fuTou, '甲寅');
  assert.equal(q.xunShou, '甲寅');
  assert.equal(q.xunShouGan, '癸');
  assert.equal(q.zhiFuStar, '天冲');
  assert.equal(q.zhiShiDoor, '伤门');
  // 地盘：戊落七宫，阳遁顺布
  assert.deepEqual(q.earth, { 7: '戊', 8: '己', 9: '庚', 1: '辛', 2: '壬', 3: '癸', 4: '丁', 5: '丙', 6: '乙' });
  // 天盘九星（值符天冲随时干戊落七宫，刚性轮盘转 4 格）+ 天盘干
  assert.deepEqual(WHEEL.map((p) => q.palaces[p].stars.join('')), ['天英', '天芮天禽', '天柱', '天心', '天蓬', '天任', '天冲', '天辅']);
  assert.deepEqual(WHEEL.map((p) => q.palaces[p].tg), ['庚', '壬丙', '戊', '乙', '辛', '己', '癸', '丁']);
  // 八门（值使伤门落七宫，轮盘转 4 格）
  assert.deepEqual(WHEEL.map((p) => q.palaces[p].door), ['景门', '死门', '惊门', '开门', '休门', '生门', '伤门', '杜门']);
  // 八神（值符宫起阳遁顺时针）
  assert.deepEqual(WHEEL.map((p) => q.palaces[p].god), ['太阴', '六合', '白虎', '玄武', '九地', '九天', '值符', '腾蛇']);
  assert.equal(q.zhiFuPalace, 7);
  assert.equal(q.zhiShiPalace, 7);
  assert.equal(q.palaces[5].dg, '丙');
});

test('基准二：2000-07-01 12:00 → 阴遁六局（夏至下元），旬首中宫寄坤二', () => {
  const q = castQimen({ year: 2000, month: 7, day: 1, hour: 12, minute: 0 });
  assert.equal(q.pillars.day, '庚申');
  assert.equal(q.pillars.time, '壬午');
  assert.equal(q.term, '夏至');
  assert.equal(q.dun, '阴');
  assert.equal(q.ju, 6);
  assert.equal(q.yuan, '下元');
  assert.equal(q.fuTou, '己未');
  assert.equal(q.xunShou, '甲戌');
  assert.equal(q.xunShouGan, '己');
  // 旬首遁干己落中宫 → 值符天芮（禽寄）、值使死门
  assert.equal(q.zhiFuStar, '天芮（天禽寄）');
  assert.equal(q.zhiShiDoor, '死门');
  assert.deepEqual(q.earth, { 6: '戊', 5: '己', 4: '庚', 3: '辛', 2: '壬', 1: '癸', 9: '丁', 8: '丙', 7: '乙' });
  // 时干壬在地盘二宫 → 值符落二宫（伏吟：星各归本位）
  assert.equal(q.zhiFuPalace, 2);
  assert.deepEqual(WHEEL.map((p) => q.palaces[p].stars.join('')), ['天蓬', '天任', '天冲', '天辅', '天英', '天芮天禽', '天柱', '天心']);
  // 值使死门从旬首宫（中宫照数）阴遁逆飞 8 格落六宫
  assert.equal(q.zhiShiPalace, 6);
  assert.deepEqual(WHEEL.map((p) => q.palaces[p].door), ['惊门', '开门', '休门', '生门', '伤门', '杜门', '景门', '死门']);
  // 八神阴遁逆时针：值符@二宫
  assert.deepEqual(WHEEL.map((p) => q.palaces[p].god), ['玄武', '白虎', '六合', '太阴', '腾蛇', '值符', '九天', '九地']);
  assert.equal(q.palaces[5].dg, '己');
});

test('结构不变量：星门神齐备无重复、天盘干守恒、甲不上盘', () => {
  for (const t of [
    { year: 1990, month: 3, day: 15, hour: 9, minute: 30 },
    { year: 2026, month: 10, day: 14, hour: 21, minute: 0 },
    { year: 1984, month: 12, day: 25, hour: 23, minute: 10 }, // 晚子时边界
  ]) {
    const q = castQimen(t);
    const stars = WHEEL.flatMap((p) => q.palaces[p].stars);
    assert.equal(new Set(stars).size, 9, '九星各现一次（芮禽分列）');
    const doors = WHEEL.map((p) => q.palaces[p].door);
    assert.equal(new Set(doors).size, 8, '八门各现一次');
    const gods = WHEEL.map((p) => q.palaces[p].god);
    assert.equal(new Set(gods).size, 8, '八神各现一次');
    // 天盘干守恒：与地盘同为九干各一（芮宫双干、中宫干随禽上盘）
    const tgList = WHEEL.flatMap((p) => q.palaces[p].tg.split(''));
    assert.equal(tgList.length, 9);
    assert.deepEqual([...tgList].sort(), Object.values(q.earth).sort());
    assert.ok(!tgList.includes('甲'), '甲遁不现');
    assert.ok(!Object.values(q.earth).includes('甲'), '地盘无甲');
    assert.ok(q.palaces.every || true);
    assert.ok(q.palaces[5].dg, '中宫有地盘干');
  }
});

test('流程读盘：基准盘 2000-01-01 12:00 五步结构与盘眼结论', () => {
  const q = castQimen({ year: 2000, month: 1, day: 1, hour: 12, minute: 0 });
  const rd = readQimen(q, QMEN_INTERP);
  assert.ok(rd.summary.includes('天冲') && rd.summary.includes('伤门'), 'summary 含盘眼星门');
  assert.equal(rd.steps[0].key, 'ju');
  const keys = rd.steps.map((s) => s.key);
  for (const k of ['ju', 'eyes', 'yongshen', 'overview']) assert.ok(keys.includes(k), `缺少步骤 ${k}`);
  const eyes = rd.steps.find((s) => s.key === 'eyes');
  assert.ok(eyes.items.some((it) => it.value.includes('天冲') && it.value.includes('宫')));
  assert.ok(eyes.items.some((it) => it.value.includes('伤门') && it.value.includes('宫')));
  const ys = rd.steps.find((s) => s.key === 'yongshen');
  assert.ok(ys.items.length >= 3, '用神步骤至少覆盖 3 个领域');
  const ov = rd.steps.find((s) => s.key === 'overview');
  assert.ok(ov.items.every((it) => typeof it.value === 'string' && it.value.length > 0));
});
