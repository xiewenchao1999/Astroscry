// bazi-synastry.mjs — 八字合婚（双人相合）规则引擎（无 AI）
// 四要素：生肖（年支）气场 / 夫妻宫（日支）相处 / 日干五合吸引力 / 五行互补。
// 计分规则在本模块（确定性）；判词与档位语料在 interpret-bazi.json 的 synastry 节。
// ponytail: 只取年支+日支+日干三组干支与五行计数，未做大运/流年互动；升级路径=加逐步大运对照。

const GAN_ORDER = '甲乙丙丁戊己庚辛壬癸';
const ZHI_ORDER = '子丑寅卯辰巳午未申酉戌亥';
const key2 = (a, b, order) => (order.indexOf(a) <= order.indexOf(b) ? a + b : b + a);
const clamp = (v) => Math.max(0, Math.min(100, v));

/** 查一对地支在 weights 各表中的关系（返回第一条命中） */
function zhiRelation(za, zb, weights) {
  const k = key2(za, zb, ZHI_ORDER);
  if (weights.zhiLiuHe.some((h) => h.pair === k)) return { type: 'he', d: 30 };
  if (weights.banHe.some((h) => h.pair === k)) return { type: 'sanhe', d: 15 };
  if (weights.liuChong.some((h) => h.pair === k)) return { type: 'chong', d: -15 };
  if (weights.liuHai.some((h) => h.pair === k)) return { type: 'hai', d: -10 };
  if (weights.xiangXing.some((h) => h.pair === k)) return { type: 'xing', d: -10 };
  return null;
}

/**
 * 八字合婚。
 * @param {object} a castBazi 输出（一方，需 pillars/fiveElements/input.gender）
 * @param {object} b castBazi 输出（另一方）
 * @param {object} weights wuxing-weights.json
 * @param {object} interp interpret-bazi.json（需 synastry 节）
 * @returns {{ score: number, band: object, summary: string, items: Array<{area: string, typeCn: string, pair: string, verdict: string}> }}
 */
export function matchBazi(a, b, weights, interp) {
  const S = interp.synastry;
  if (!S) throw new Error('语料缺少 synastry 节');
  let score = 55;
  const items = [];

  // 1. 生肖（年支）
  const yearRel = zhiRelation(a.pillars.year.zhi, b.pillars.year.zhi, weights);
  const typeCnMap = { he: '六合', sanhe: '半合', chong: '相冲', hai: '相害', xing: '相刑' };
  if (yearRel) {
    score += yearRel.d;
    items.push({ area: '生肖', typeCn: typeCnMap[yearRel.type], pair: key2(a.pillars.year.zhi, b.pillars.year.zhi, ZHI_ORDER), verdict: S.zodiacVerdict[yearRel.type] });
  } else {
    items.push({ area: '生肖', typeCn: '', pair: key2(a.pillars.year.zhi, b.pillars.year.zhi, ZHI_ORDER), verdict: S.zodiacVerdict.none });
  }

  // 2. 夫妻宫（日支）
  const dayRel = zhiRelation(a.pillars.day.zhi, b.pillars.day.zhi, weights);
  if (dayRel) {
    score += dayRel.d;
    items.push({ area: '夫妻宫', typeCn: typeCnMap[dayRel.type], pair: key2(a.pillars.day.zhi, b.pillars.day.zhi, ZHI_ORDER), verdict: S.dayVerdict[dayRel.type] });
  } else {
    items.push({ area: '夫妻宫', typeCn: '', pair: key2(a.pillars.day.zhi, b.pillars.day.zhi, ZHI_ORDER), verdict: S.dayVerdict.none });
  }

  // 3. 日干五合
  const ganK = key2(a.pillars.day.gan, b.pillars.day.gan, GAN_ORDER);
  const ganHit = weights.ganHe.find((h) => h.pair === ganK);
  if (ganHit) {
    score += 15;
    items.push({ area: '日干', typeCn: '五合', pair: ganK, verdict: S.ganHeVerdict.replace('{he}', ganHit.cn) });
  } else {
    items.push({ area: '日干', typeCn: '', pair: ganK, verdict: S.ganHeNone });
  }

  // 4. 五行互补：双方缺失五行是否被对方补上
  const missingA = Object.entries(a.fiveElements).filter(([, v]) => v === 0).map(([k]) => k);
  const missingB = Object.entries(b.fiveElements).filter(([, v]) => v === 0).map(([k]) => k);
  const compBoth = missingA.filter((el) => (b.fiveElements[el] ?? 0) > 0).length > 0
    && missingB.filter((el) => (a.fiveElements[el] ?? 0) > 0).length > 0;
  const compOne = missingA.filter((el) => (b.fiveElements[el] ?? 0) > 0);
  let compText;
  if (compBoth) {
    score += 15;
    compText = S.wuxingBothTpl.replace('{a}', missingA.join('、')).replace('{b}', missingB.join('、'));
  } else if (compOne.length) {
    score += 8;
    compText = S.wuxingOneTpl.replace('{el}', compOne.join('、'));
  } else {
    compText = S.wuxingNone;
  }
  items.push({ area: '五行', typeCn: '互补', pair: '', verdict: compText });

  score = clamp(Math.round(score));
  const band = S.bands.find((x) => score >= x.min);
  const summary = `${band.cn}（${score} 分）：${band.text}`;
  return { score, band, summary, items }; // P16：complementary 死字段（恒 null 且零消费方）已删
}
