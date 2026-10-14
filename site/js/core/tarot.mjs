// tarot.mjs — 塔罗核心（洗牌 / 抽牌阵，纯函数，无 DOM / 无网络）
// 牌义数据：data/tarot.json（正逆位牌义中文化自 Waite《The Pictorial Key to the Tarot》1911 公版文本）
// ponytail: 随机源用宿主 crypto 或 mulberry32 种子（可复现测试）；不引入外部随机库

export const SUITS = { wands: '权杖', cups: '圣杯', swords: '宝剑', pentacles: '星币' };
export const RANKS = { ace: '王牌', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九', 10: '十', page: '侍从', knight: '骑士', queen: '王后', king: '国王' };

export const SPREADS = {
  single: { key: 'single', cn: '每日一牌', positions: [{ key: 'today', cn: '今日指引' }] },
  three: { key: 'three', cn: '时间之流', positions: [{ key: 'past', cn: '过去' }, { key: 'present', cn: '现在' }, { key: 'future', cn: '未来' }] },
};

/** mulberry32 种子随机（确定性，用于测试与可复现抽牌） */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(deck, rng) {
  const arr = deck.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 抽牌阵。同 seed 同结果（确定性）；无 seed 用 crypto 随机。
 * @returns {{spread: string, seed: number, cards: Array<{card: object, position: string, positionCn: string, reversed: boolean}>}}
 */
export function drawSpread(deck, spreadKey, seed) {
  const spread = SPREADS[spreadKey];
  if (!spread) throw new Error(`未知牌阵 ${spreadKey}`);
  const s = seed ?? (globalThis.crypto ? [...globalThis.crypto.getRandomValues(new Uint32Array(1))][0] : Math.floor(Math.random() * 2 ** 31));
  const rng = mulberry32(s);
  const shuffled = shuffle(deck, rng);
  const cards = spread.positions.map((pos, i) => ({
    card: shuffled[i],
    position: pos.key,
    positionCn: pos.cn,
    reversed: rng() < 0.5,
  }));
  return { spread: spread.key, spreadCn: spread.cn, seed: s, cards };
}

/** 数据完整性校验（加载 tarot.json 后调用） */
export function validateDeck(deck) {
  const ids = new Set(deck.map((c) => c.id));
  if (deck.length !== 78) throw new Error(`牌数应为 78，实际 ${deck.length}`);
  if (ids.size !== 78) throw new Error('存在重复牌 id');
  const majors = deck.filter((c) => c.arcana === 'major');
  if (majors.length !== 22) throw new Error(`大阿卡纳应为 22，实际 ${majors.length}`);
  for (const suit of Object.keys(SUITS)) {
    const n = deck.filter((c) => c.arcana === 'minor' && c.suit === suit).length;
    if (n !== 14) throw new Error(`${suit} 应为 14 张，实际 ${n}`);
  }
  for (const c of deck) {
    for (const f of ['name', 'cn', 'kwUp', 'up', 'rev']) {
      if (c[f] == null || c[f] === '') throw new Error(`牌 ${c.id} 缺字段 ${f}`);
    }
  }
  return true;
}
