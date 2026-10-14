// 塔罗核心回归测试 — 牌组完整性（78 张）+ 洗牌确定性 + 牌阵结构
import { readFileSync } from 'fs';
import { drawSpread, mulberry32, shuffle, validateDeck } from '../site/js/core/tarot.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

const deck = JSON.parse(readFileSync(new URL('../site/data/tarot.json', import.meta.url), 'utf8')).cards;

test('牌组完整性：78 张、22 大阿卡纳、4 花色各 14 张、字段齐全', () => {
  assert.equal(validateDeck(deck), true);
  const majors = deck.filter((c) => c.arcana === 'major');
  assert.deepEqual(majors.map((c) => c.num), [...Array(22).keys()]);
  for (const c of deck) {
    assert.ok(c.up.length >= 8 && c.rev.length >= 8, `${c.id} 牌义过短`);
    assert.ok(Array.isArray(c.kwUp) && c.kwUp.length >= 3, `${c.id} 关键词不足`);
  }
});

test('洗牌确定性：同种子同结果、异种子异结果', () => {
  const a1 = shuffle(deck, mulberry32(42));
  const a2 = shuffle(deck, mulberry32(42));
  const b = shuffle(deck, mulberry32(43));
  assert.deepEqual(a1.map((c) => c.id), a2.map((c) => c.id));
  assert.notDeepEqual(a1.map((c) => c.id), b.map((c) => c.id));
  // 洗牌是无损重排
  assert.deepEqual(a1.map((c) => c.id).sort(), deck.map((c) => c.id).sort());
});

test('牌阵：single 1 张 / three 3 张，含正逆位与位置语义', () => {
  const one = drawSpread(deck, 'single', 7);
  assert.equal(one.cards.length, 1);
  assert.equal(one.cards[0].positionCn, '今日指引');
  const three = drawSpread(deck, 'three', 7);
  assert.deepEqual(three.cards.map((c) => c.positionCn), ['过去', '现在', '未来']);
  assert.ok(three.cards.every((c) => typeof c.reversed === 'boolean'));
  assert.ok(three.cards.every((c) => deck.includes(c.card)));
});

test('抽牌无重复、逆位概率合理（多种子统计）', () => {
  let revCount = 0, trials = 0;
  const seenIds = new Set();
  for (let s = 1; s <= 50; s++) {
    const r = drawSpread(deck, 'three', s * 1000);
    for (const c of r.cards) {
      assert.ok(!seenIds.has(c.card.id + ':' + s), '同一次抽牌出现重复牌');
      seenIds.add(c.card.id + ':' + s);
      trials++;
      if (c.reversed) revCount++;
    }
  }
  const ratio = revCount / trials;
  assert.ok(ratio > 0.35 && ratio < 0.65, `逆位率 ${ratio.toFixed(2)} 应≈0.5`);
});
