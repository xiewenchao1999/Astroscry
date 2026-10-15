// tarot-reading.mjs — 塔罗解读结构化引擎（确定性规则，无 DOM / 无网络）
// 方法论整理自 daman-ovo-0404/tarot-skill：花色分布 / 大阿卡纳比例 / 正逆位 / 五段式综合
// 牌间关系（愚人之旅 / 数字旅程 / 牌性 / 宫廷牌角色 / 经典组合）见 docs/research/塔罗综合解读方法论.md
// 文案一律来自 data/interpret-tarot.json，本模块只产出结构化事实与语料键

const ELEMENT_OF = { wands: '火', cups: '水', swords: '风', pentacles: '土' };
// 元素对 → 语料键（火风/水土互助，水火/风土相克，火土需落地，水风易荡）；排序键固定「火水风土」序
const ELEM_ORDER = '火水风土';
const ELEM_KEY = (x, y) => ({
  火风: 'fireAir', 水土: 'waterEarth', 火水: 'fireWater', 风土: 'airEarth', 火土: 'fireEarth', 水风: 'waterAir',
}[[x, y].sort((p, q) => ELEM_ORDER.indexOf(p) - ELEM_ORDER.indexOf(q)).join('')]);
const actOf = (n) => (n <= 7 ? 0 : n <= 14 ? 1 : 2); // 愚人之旅三幕：0-7 / 8-14 / 15-21

/**
 * 相邻两牌的关系分类（每对只取一个，优先级见 links.note）。
 * 缺少判定所需事实（如夹具无 num）时返回 null，调用方跳过该对——绝不产出半成品。
 */
function classifyPair(A, B, classicMap) {
  const pairId = [A.id, B.id].sort().join('+');
  if (classicMap && pairId in classicMap) return { key: pairId, classic: true };
  const numA = typeof A.num === 'number' ? A.num : null;
  const numB = typeof B.num === 'number' ? B.num : null;
  const courtA = typeof A.num === 'string', courtB = typeof B.num === 'string';
  if (numA !== null && numB !== null && numA === numB) return { key: 'echo', vars: { num: numA } };
  if (A.arcana === 'major' && B.arcana === 'major') {
    if (numA === null || numB === null) return null;
    if (numA + numB === 21) return { key: 'mirror' };
    const up = numA < numB, cross = actOf(numA) !== actOf(numB);
    return { key: up ? (cross ? 'majorUpCross' : 'majorUp') : (cross ? 'majorDownCross' : 'majorDown') };
  }
  if (A.suit && A.suit === B.suit && numA !== null && numB !== null) {
    if (numA === 5 || numB === 5 || (Math.min(numA, numB) < 5 && Math.max(numA, numB) > 5)) return { key: 'suitFive' };
    return { key: numA < numB ? 'suitUp' : 'suitDown' };
  }
  if (courtA || courtB) {
    if (courtA && courtB) return { key: 'courtPair' };
    return { key: 'courtRole', vars: { court: courtA ? A.cn : B.cn, event: courtA ? B.cn : A.cn } };
  }
  if (A.arcana === 'major' || B.arcana === 'major') {
    const minor = A.arcana === 'major' ? B : A;
    if (typeof minor.num === 'number' || typeof minor.num === 'string') return { key: 'majorMinor' };
    return null;
  }
  if (A.suit && B.suit) {
    const k = ELEM_KEY(ELEMENT_OF[A.suit], ELEMENT_OF[B.suit]);
    if (!k) return null;
    return { key: k, tone: (k === 'fireWater' || k === 'airEarth') ? 'bad' : (k === 'fireAir' || k === 'waterEarth') ? 'good' : undefined };
  }
  return null;
}

/**
 * 分析一次抽牌的结构特征。
 * @param {Array<{card:object, positionCn:string, positionDuty:string, reversed:boolean}>} cards reading.cards（页面自抽后组装）
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
 * 五段式综合解读（起点→张力→转折→出口→回响）+ 牌间连线 + 牌面图案。
 * 全部为语料键 + 数据，页面据此从 interpret-tarot.json 取文案拼装。
 * @param {Array} cards reading.cards
 * @param {object} analysis analyzeReading 输出
 * @param {string} question
 * @param {object} [linksCfg] interp.links（含 classic 表）；缺省时经典组合不参与，其余关系照常判定
 * @returns {object}
 */
export function synthesizeReading(cards, analysis, question, linksCfg) {
  const byPos = new Map(cards.map((c) => [c.position, c]));
  const first = cards[0];
  const last = cards[cards.length - 1];
  // 张力 = 正逆位最多的一端；转折 = 唯一大阿卡纳优先，否则取中间位置
  const tension = analysis.reversalBand === 'few' ? first : cards.find((c) => c.reversed) ?? first;
  const turn = cards.find((c) => c.card.arcana === 'major') ?? cards[Math.floor(cards.length / 2)];
  const kwOf = (c) => (c.reversed ? c.card.kwRev : c.card.kwUp)?.[0] ?? '';

  // 牌间连线：阅读顺序相邻两两
  const classicMap = linksCfg?.classic ?? null;
  const links = [];
  for (let i = 0; i < cards.length - 1; i++) {
    const cls = classifyPair(cards[i].card, cards[i + 1].card, classicMap);
    if (cls) links.push({ aCn: cards[i].card.cn, bCn: cards[i + 1].card.cn, aPos: cards[i].positionCn, bPos: cards[i + 1].positionCn, ...cls });
  }

  // 牌面图案：王牌 / 宫廷牌 / 数字连跑（≥3 连续，跨花色合并）
  const aces = cards.filter((c) => c.card.suit && c.card.num === 1).length;
  const courts = cards.filter((c) => typeof c.card.num === 'string').length;
  const nums = [...new Set(cards.map((c) => (c.card.suit && typeof c.card.num === 'number') ? c.card.num : null).filter((n) => n !== null))].sort((a, b) => a - b);
  let run = null, cur = [];
  for (const n of nums) {
    if (cur.length && n === cur[cur.length - 1] + 1) cur.push(n);
    else { if (cur.length >= 3) run = cur; cur = [n]; }
  }
  if (cur.length >= 3) run = cur;
  const patterns = {
    aces, courts, run,
    acesKey: aces === 0 ? 'acesNone' : aces === 1 ? 'acesOne' : 'acesMany',
    courtsKey: courts === 0 ? 'courtsNone' : courts <= 2 ? 'courtsFew' : 'courtsMany',
  };

  return {
    question: question || null,
    opening: { card: first.card.cn, reversed: first.reversed, position: first.positionCn, kw: kwOf(first) },   // 起点
    tension: { card: tension.card.cn, reversed: tension.reversed, position: tension.positionCn, kw: kwOf(tension) },
    turn: { card: turn.card.cn, reversed: turn.reversed, position: turn.positionCn, kw: kwOf(turn) },
    exit: { dominant: analysis.dominant, majorBand: analysis.majorBand },                      // 出口：按主导花色给行动模板
    closing: { cards: cards.map((c) => `${c.card.cn}${c.reversed ? '(逆)' : ''}`).join('、') },
    links, patterns,
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
