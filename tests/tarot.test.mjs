// 塔罗核心回归测试 — 牌组完整性（78 张）+ 洗牌确定性 + 牌阵结构（数据驱动，六牌阵）+ 真随机源
import { readFileSync } from 'fs';
import { cryptoRng, shuffle, validateDeck, validateSpread } from '../site/js/core/tarot.mjs';
import { analyzeReading, synthesizeReading } from '../site/js/core/tarot-reading.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

// 测试夹具：确定性伪随机（mulberry32 副本）。core 已改 crypto 真随机，种子机制仅存在于测试夹具
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const deck = JSON.parse(readFileSync(new URL('../site/data/tarot.json', import.meta.url), 'utf8')).cards;
const spreads = JSON.parse(readFileSync(new URL('../site/data/tarot-spreads.json', import.meta.url), 'utf8')).spreads;
const spreadByKey = new Map(spreads.map((s) => [s.key, s]));

test('牌组完整性：78 张、22 大阿卡纳、4 花色各 14 张、字段齐全', () => {
  assert.equal(validateDeck(deck), true);
  const majors = deck.filter((c) => c.arcana === 'major');
  assert.deepEqual(majors.map((c) => c.num), [...Array(22).keys()]);
  for (const c of deck) {
    assert.ok(c.up.length >= 8 && c.rev.length >= 8, `${c.id} 牌义过短`);
    assert.ok(Array.isArray(c.kwUp) && c.kwUp.length >= 3, `${c.id} 关键词不足`);
  }
});

test('牌阵定义：六牌阵齐备、全部通过校验、位置语义齐备', () => {
  assert.deepEqual(spreads.map((s) => s.key), ['single', 'three', 'diamond', 'moon', 'horseshoe', 'celtic']);
  for (const s of spreads) {
    assert.equal(validateSpread(s), true);
    assert.ok(s.positions.every((p) => p.duty), `${s.key} 有位置缺 duty`);
  }
  assert.equal(spreadByKey.get('celtic').positions.length, 10);
  assert.equal(spreadByKey.get('horseshoe').positions.length, 7);
  assert.deepEqual(spreadByKey.get('three').positions.map((p) => p.cn), ['过去', '现在', '未来']);
  assert.equal(spreadByKey.get('celtic').positions[0].cn, '核心');
  assert.throws(() => validateSpread({ key: 'x', cn: 'x', positions: [] }));
  assert.throws(() => validateSpread({ key: 'x', cn: 'x', positions: [{ key: 'a', cn: 'a' }] })); // 缺 duty
});

test('洗牌确定性：同 rng 序列同结果、异序列异结果、不丢牌', () => {
  const a1 = shuffle(deck, mulberry32(42));
  const a2 = shuffle(deck, mulberry32(42));
  const b = shuffle(deck, mulberry32(43));
  assert.deepEqual(a1.map((c) => c.id), a2.map((c) => c.id));
  assert.notDeepEqual(a1.map((c) => c.id), b.map((c) => c.id));
  assert.deepEqual(a1.map((c) => c.id).sort(), deck.map((c) => c.id).sort(), '洗牌不得丢牌');
});

test('cryptoRng：取值范围、分布合理、连续取值不重复', () => {
  const vals = Array.from({ length: 2000 }, cryptoRng);
  assert.ok(vals.every((v) => v >= 0 && v < 1), '取值须落在 [0,1)');
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  assert.ok(mean > 0.45 && mean < 0.55, `均值 ${mean.toFixed(3)} 应≈0.5`);
  assert.ok(new Set(vals).size > 1900, '连续取值不应大量重复（真随机熵源）');
});

test('解读分析：结构特征与分档正确', () => {
  // 构造受控输入：3 张全大阿卡纳 → high；含逆位
  const mk = (id, arcana, suit, reversed) => ({ card: { id, arcana, suit, cn: id, kwUp: ['x'], kwRev: ['y'], up: 'x'.repeat(10), rev: 'y'.repeat(10) }, positionCn: 'p', positionDuty: 'd', reversed });
  const cardsHigh = [mk('m0', 'major', null, false), mk('m1', 'major', null, true), mk('m2', 'major', null, false)];
  const a1 = analyzeReading(cardsHigh);
  assert.equal(a1.major, 3);
  assert.equal(a1.majorBand, 'high');
  assert.ok(a1.dominant === null, '无小牌时不应有主导花色');
  assert.ok(a1.missing.length === 4, '四花色全缺');
  const r1 = synthesizeReading(cardsHigh, a1, '测试问题');
  assert.equal(r1.question, '测试问题');
  assert.ok(r1.closing.cards.includes('m1(逆)'));

  // 全权杖 → 权杖主导；全正位 → few
  const cardsWands = [mk('w1', 'minor', 'wands', false), mk('w2', 'minor', 'wands', false), mk('w3', 'minor', 'wands', false), mk('w4', 'minor', 'wands', false)];
  const a2 = analyzeReading(cardsWands);
  assert.equal(a2.dominant, 'wands');
  assert.equal(a2.reversalBand, 'few');
  assert.equal(a2.majorBand, 'low');
  // 同输入同输出（确定性）
  assert.deepEqual(analyzeReading(cardsWands), a2);
});
