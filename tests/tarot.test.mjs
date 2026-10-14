// 塔罗核心回归测试 — 牌组完整性（78 张）+ 洗牌确定性 + 牌阵结构（数据驱动，六牌阵）
import { readFileSync } from 'fs';
import { drawSpread, mulberry32, shuffle, validateDeck, validateSpread } from '../site/js/core/tarot.mjs';
import { analyzeReading, synthesizeReading } from '../site/js/core/tarot-reading.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

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

test('牌阵定义：六牌阵齐备且全部通过校验', () => {
  assert.deepEqual(spreads.map((s) => s.key), ['single', 'three', 'diamond', 'moon', 'horseshoe', 'celtic']);
  for (const s of spreads) assert.equal(validateSpread(s), true);
  assert.equal(spreadByKey.get('celtic').positions.length, 10);
  assert.equal(spreadByKey.get('horseshoe').positions.length, 7);
  assert.throws(() => validateSpread({ key: 'x', cn: 'x', positions: [] }));
  assert.throws(() => validateSpread({ key: 'x', cn: 'x', positions: [{ key: 'a', cn: 'a' }] })); // 缺 duty
});

test('洗牌确定性：同种子同结果、异种子异结果', () => {
  const a1 = shuffle(deck, mulberry32(42));
  const a2 = shuffle(deck, mulberry32(42));
  const b = shuffle(deck, mulberry32(43));
  assert.deepEqual(a1.map((c) => c.id), a2.map((c) => c.id));
  assert.notDeepEqual(a1.map((c) => c.id), b.map((c) => c.id));
  assert.deepEqual(a1.map((c) => c.id).sort(), deck.map((c) => c.id).sort());
});

test('牌阵抽牌：三张/凯尔特十字，位置语义与职责齐备', () => {
  const one = drawSpread(deck, spreadByKey.get('single'), 7);
  assert.equal(one.cards.length, 1);
  assert.ok(one.cards[0].positionDuty);
  const three = drawSpread(deck, spreadByKey.get('three'), 7);
  assert.deepEqual(three.cards.map((c) => c.positionCn), ['过去', '现在', '未来']);
  const celtic = drawSpread(deck, spreadByKey.get('celtic'), 7);
  assert.equal(celtic.cards.length, 10);
  assert.equal(celtic.cards[0].positionCn, '核心');
  assert.ok(celtic.cards.every((c) => typeof c.reversed === 'boolean' && c.positionDuty));
  // 未知牌阵对象应被拒绝
  assert.throws(() => drawSpread(deck, { key: 'bad', cn: '坏', positions: [] }));
});

test('抽牌无重复、逆位概率合理（多种子统计）', () => {
  let revCount = 0, trials = 0;
  const seen = new Set();
  for (let s = 1; s <= 50; s++) {
    const r = drawSpread(deck, spreadByKey.get('three'), s * 1000);
    for (const c of r.cards) {
      assert.ok(!seen.has(c.card.id + ':' + s), '同一次抽牌出现重复牌');
      seen.add(c.card.id + ':' + s);
      trials++;
      if (c.reversed) revCount++;
    }
  }
  const ratio = revCount / trials;
  assert.ok(ratio > 0.35 && ratio < 0.65, `逆位率 ${ratio.toFixed(2)} 应≈0.5`);
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
