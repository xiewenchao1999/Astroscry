// tarot-reading.mjs — 塔罗解读结构化引擎（确定性规则，无 DOM / 无网络）
// 方法论整理自 daman-ovo-0404/tarot-skill：花色分布 / 大阿卡纳比例 / 正逆位 / 五段式综合解读
// 文案一律来自 data/interpret-tarot.json，本模块只产出结构化事实与语料键

/**
 * 分析一次抽牌的结构特征。
 * @param {Array<{card:object, positionCn:string, positionDuty:string, reversed:boolean}>} cards drawSpread().cards
 * @returns {object} 结构化事实（无文案），文案由页面按语料键渲染
 */
export function analyzeReading(cards) {
  const suits = { wands: 0, cups: 0, swords: 0, pentacles: 0 };
  let major = 0;
  let reversed = 0;
  for (const { card, reversed: rev } of cards) {
    if (card.arcana === 'major') major++;
    else if (card.suit in suits) suits[card.suit]++;
    if (rev) reversed++;
  }
  const total = cards.length;
  const majorRatio = total ? major / total : 0;
  const reversedRatio = total ? reversed / total : 0;

  const suitEntries = Object.entries(suits).sort((a, b) => b[1] - a[1]);
  const maxCount = suitEntries[0]?.[1] ?? 0;
  // 主导花色：占比 ≥ 50% 或（多牌阵中）数量 ≥3
  const dominant = maxCount >= Math.max(3, Math.ceil(total * 0.5)) ? suitEntries[0][0] : null;
  const missing = Object.entries(suits).filter(([, v]) => v === 0).map(([k]) => k);

  // 大阿卡纳三档
  const majorBand = majorRatio > 0.5 ? 'high' : majorRatio >= 0.3 ? 'mid' : 'low';

  // 正逆位
  const reversalBand = reversedRatio > 0.6 ? 'many' : reversedRatio >= 0.25 ? 'mix' : 'few';

  return {
    total,
    suits,
    dominant,               // 'wands' | null …
    missing,                // 缺席花色数组
    major, majorRatio,
    majorBand,              // high | mid | low
    reversed, reversedRatio, reversalBand, // many | mix | few
  };
}

/**
 * 五段式综合解读（起点→张力→转折→出口→回响）。
 * 全部为语料键 + 数据，页面据此从 interpret-tarot.json 取文案拼装。
 * @returns {object}
 */
export function synthesizeReading(cards, analysis, question) {
  const byPos = new Map(cards.map((c) => [c.position, c]));
  const first = cards[0];
  const last = cards[cards.length - 1];
  // 张力 = 正逆位最多的一端；转折 = 唯一大阿卡纳优先，否则取中间位置
  const tension = analysis.reversalBand === 'few' ? first : cards.find((c) => c.reversed) ?? first;
  const turn = cards.find((c) => c.card.arcana === 'major') ?? cards[Math.floor(cards.length / 2)];
  return {
    question: question || null,
    opening: { card: first.card.cn, reversed: first.reversed, position: first.positionCn },   // 起点
    tension: { card: tension.card.cn, reversed: tension.reversed, position: tension.positionCn },
    turn: { card: turn.card.cn, reversed: turn.reversed, position: turn.positionCn },
    exit: { dominant: analysis.dominant, majorBand: analysis.majorBand },                      // 出口：按主导花色给行动模板
    closing: { cards: cards.map((c) => `${c.card.cn}${c.reversed ? '(逆)' : ''}`).join('、') },
    byPos,
  };
}

/** 读取分析所需要素是否齐备（页面渲染前快速校验） */
export function validateReadingInput(reading, interp) {
  if (!reading?.cards?.length) throw new Error('无抽牌结果');
  for (const k of ['suitDominant', 'majorBands', 'reversalBands', 'synthesis', 'suitNames']) {
    if (!interp?.[k]) throw new Error(`解读语料缺段落 ${k}`);
  }
  return true;
}
