// tarot.mjs — 塔罗核心（洗牌 / 抽牌阵，纯函数，无 DOM / 无网络）
// 牌义数据：data/tarot.json；牌阵定义：data/tarot-spreads.json（数据驱动，core 不硬编码牌阵）
// 牌义中文化改编自 Waite《The Pictorial Key to the Tarot》1911 公版文本

export const SUITS = { wands: '权杖', cups: '圣杯', swords: '宝剑', pentacles: '星币' };
export const SUIT_ELEMENTS = { wands: '火', cups: '水', swords: '风', pentacles: '土' };
export const RANKS = { ace: '王牌', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九', 10: '十', page: '侍从', knight: '骑士', queen: '王后', king: '国王' };

/** 校验牌阵定义（页面加载 tarot-spreads.json 后对所选牌阵调用） */
export function validateSpread(spread) {
  if (!spread || typeof spread !== 'object') throw new Error('牌阵定义缺失');
  const { key, cn, positions } = spread;
  if (!key || !cn || !Array.isArray(positions) || positions.length < 1 || positions.length > 10) {
    throw new Error(`牌阵 ${key ?? '?'} 定义不合法`);
  }
  for (const p of positions) {
    if (!p.key || !p.cn || !p.duty) throw new Error(`牌阵 ${key} 的位置缺 key/cn/duty`);
  }
  return true;
}

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
 * 洗牌准备：确定性洗出整副牌序 + 每张的逆位标记（按牌序一一对应）。
 * 供「用户自抽牌」交互使用：页面先洗牌，用户从扇形牌堆中自选 N 张，
 * 抽取哪张由用户决定，但牌序与正逆仍由 seed 确定性给出。
 * 同 seed 同结果（确定性）；无 seed 用 crypto 随机。
 */
export function prepareSpread(deck, spread, seed) {
  validateSpread(spread);
  const s = seed ?? (globalThis.crypto ? [...globalThis.crypto.getRandomValues(new Uint32Array(1))][0] : Math.floor(Math.random() * 2 ** 31));
  const rng = mulberry32(s);
  const shuffled = shuffle(deck, rng);
  const reversals = shuffled.map(() => rng() < 0.5);
  return { spread: spread.key, spreadCn: spread.cn, seed: s, deck: shuffled, reversals };
}

/**
 * 抽牌阵（自动抽前 N 张）。spread 为数据驱动的牌阵对象（见 data/tarot-spreads.json）。
 * 与 prepareSpread 同源：同 seed 下 drawSpread 的结果 = prepareSpread 牌序的前 N 张。
 */
export function drawSpread(deck, spread, seed) {
  const p = prepareSpread(deck, spread, seed);
  if (p.deck.length < spread.positions.length) throw new Error('牌库不足');
  const cards = spread.positions.map((pos, i) => ({
    card: p.deck[i],
    position: pos.key,
    positionCn: pos.cn,
    positionDuty: pos.duty,
    reversed: p.reversals[i],
  }));
  return { spread: p.spread, spreadCn: p.spreadCn, seed: p.seed, cards };
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
