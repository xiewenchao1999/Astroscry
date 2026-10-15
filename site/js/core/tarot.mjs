// tarot.mjs — 塔罗核心（洗牌 / 真随机，纯函数，无 DOM / 无网络）
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

/**
 * crypto 真随机流：每次调用独立取熵（非种子派生，整副牌洗牌空间为全排列 78!）。
 * 传给 shuffle 即为「真实洗牌」；抽牌正逆用 cryptoRng() < 0.5 单次掷币。
 */
export function cryptoRng() {
  if (globalThis.crypto) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  return Math.random(); // ponytail: 仅无 WebCrypto 的老 Node/浏览器触达；项目目标环境均支持
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
 * 抽牌（O05 收敛点）：从 deck 抽 n 张（不重复），每张按 reversedRate 掷逆位币。
 * 与占卜页「用户自抽」流程兼容：对单张牌调用 drawCards([card], 1, rng, rate) 即只消耗一次正逆掷币。
 * @param {Array} deck 牌库
 * @param {number} n 抽取张数
 * @param {() => number} rng 随机源（选择与掷币共用）
 * @param {number} reversedRate 逆位概率（默认 0.5，与既有行为一致）
 * @returns {Array<{card: object, reversed: boolean}>}
 */
export function drawCards(deck, n, rng, reversedRate = 0.5) {
  if (!Array.isArray(deck) || !Number.isInteger(n) || n < 0 || n > deck.length) {
    throw new Error(`drawCards 参数非法：n=${n}, deck=${deck?.length}`);
  }
  if (typeof rng !== 'function') throw new Error('drawCards 需要注入 rng');
  // 选择：部分 Fisher-Yates（n 张不重复；rng 消耗次数与既有「用户指牌」路径解耦）
  const arr = deck.slice();
  for (let i = arr.length - 1; i > 0 && i >= arr.length - n; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const picked = arr.slice(arr.length - n);
  return picked.map((card) => ({ card, reversed: rng() < reversedRate }));
}

/**
 * 今日一牌（日签）：日期字符串 FNV-1a hash 确定性选牌与正逆。
 * 与占卜抽牌的 crypto 真随机不同——日签语义是「同一天同一张」，属日期映射而非随机。
 */
export function dailyDraw(deck, dateISO) {
  let h = 2166136261;
  for (const c of String(dateISO)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return { card: deck[Math.abs(h) % deck.length], reversed: (h >>> 31) === 1 };
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
    // O05：rws（Waite 1911 原文层）有则校验、无则跳过（向后兼容旧数据）
    if (c.rws != null) {
      for (const side of ['up', 'rev']) {
        if (!c.rws[side]?.en) throw new Error(`牌 ${c.id} rws.${side} 缺 en 原文`);
      }
    }
  }
  return true;
}
