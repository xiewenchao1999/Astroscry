// bazi-analysis.mjs — 八字分析层（纯规则推理，无 DOM / 无网络）
// 依赖：core/bazi.mjs 的输出 + data/wuxing-weights.json、data/chenggu.json
// 规则来源：《四柱编程》与 yuan 八字规则包（藏干权重、十神强弱分值、合冲刑害表）、袁天罡称骨查表

/** 十神对日主的生扶/克耗方向 */
const SUPPORT_GODS = new Set(['比肩', '劫财', '正印', '偏印']);

/**
 * 日主强弱量化（规则化模型）
 * 遍历四柱天干与藏干：生扶取正、克耗取负；藏干按权重折算；月令分数加倍。
 * @returns {{net:number, support:number, drain:number, band:object, monthGejuShiShen:string, contributions:Array}}
 */
export function analyzeStrength(bazi, weights) {
  const score = weights.shiShenStrengthScore;
  const mult = weights.monthMultiplier ?? 2;
  const POS_CN = { year: '年', month: '月', day: '日', time: '时' }; // 柱位内部 key → 中文显示
  const contributions = [];
  let support = 0, drain = 0;

  for (const [pos, pillar] of Object.entries(bazi.pillars)) {
    const isMonth = pos === 'month';
    const factor = isMonth ? mult : 1;

    // 天干（日主自身不计）
    if (pillar.ganShiShen && pillar.ganShiShen !== '日主') {
      const s = score[pillar.ganShiShen] ?? 0;
      const v = s * factor;
      if (v > 0) support += v; else drain += -v;
      contributions.push({ pos, source: `${pillar.gan}（${POS_CN[pos]}干）`, shiShen: pillar.ganShiShen, value: v });
    }
    // 地支藏干（权重折算）
    for (const h of pillar.hideGans ?? []) {
      if (!h.shiShen || h.shiShen === '日主') continue;
      const w = hiddenWeight(weights, pillar.zhi, h.gan);
      const s = score[h.shiShen] ?? 0;
      const v = s * w * factor;
      if (v > 0) support += v; else drain += -v;
      contributions.push({ pos, source: `${pillar.zhi}藏${h.gan}`, shiShen: h.shiShen, value: v, weight: w });
    }
  }
  const round = (x) => Math.round(x * 100) / 100;
  const net = round(support - drain);
  const band = weights.strengthBands.find((b) => net <= b.max) ?? weights.strengthBands.at(-1);
  return {
    net,
    support: round(support),
    drain: round(drain),
    band,
    contributions: contributions.map((c) => ({ ...c, value: round(c.value) })),
  };
}

function hiddenWeight(weights, zhi, gan) {
  const list = weights.cangGan[zhi] ?? [];
  const hit = list.find(([g]) => g === gan);
  return hit ? hit[1] : 0;
}

/**
 * 月令取格（《子平真诠》体系 + 《四柱编程》简化规则）
 * 规则：月令主气与日主同类 → 建禄格／月刃格（禄刃专论，不取他格）；
 *       否则优先取月支藏干中透出天干者为格；无透出则取月支主气。
 */
export function detectGeju(bazi, interp) {
  const month = bazi.pillars.month;
  const cang = month.hideGans ?? [];
  if (!cang.length) return { key: null, name: interp.geju.none, shiShen: null, reason: '月支无藏干' };
  // 月支主气若即日干本身，其十神按比肩论
  const godOf = (h) => (h.shiShen === '日主' ? '比肩' : h.shiShen);
  const main = cang[0];
  const mainGod = godOf(main);
  const nan = (t) => ({ key: mainGod, name: interp.geju.byShiShen[mainGod] ?? interp.geju.none, shiShen: mainGod, reason: t });
  if (mainGod === '比肩') return nan(`月令主气「${main.gan}」与日主同类，取建禄格（比肩当令）`);
  if (mainGod === '劫财') return nan(`月令主气「${main.gan}」与日主同类异阴阳，取月刃格（劫财当令）`);

  const otherGans = new Set([bazi.pillars.year.gan, bazi.pillars.day.gan, bazi.pillars.time.gan].filter((g) => g !== bazi.dayGan));
  const tou = cang.slice(1).find((h) => otherGans.has(h.gan));
  const pick = tou ?? main;
  const pickGod = godOf(pick);
  return {
    key: pickGod,
    name: interp.geju.byShiShen[pickGod] ?? interp.geju.none,
    shiShen: pickGod,
    reason: tou ? `月支「${month.zhi}」中气「${pick.gan}」透出天干，取为格` : `月支「${month.zhi}」藏干未透，取主气「${pick.gan}」为格`,
  };
}

/**
 * 四柱之间的干支关系（合、冲、刑、害）。
 * @returns {{items:Array, hasAny:boolean}}
 */
export function analyzeRelations(bazi, weights) {
  const pos = { year: '年柱', month: '月柱', day: '日柱', time: '时柱' };
  const GAN_ORDER = '甲乙丙丁戊己庚辛壬癸';
  const ZHI_ORDER = '子丑寅卯辰巳午未申酉戌亥';
  // pair 键必须按干支自然序归一：字符串码点排序与地支序不一致（戌 U+620C < 辰 U+8FB0），
  // 曾导致辰戌冲等全部失配（relations 假阴性）。语料 pair 均为自然序。
  const ganKey = (a, b) => (GAN_ORDER.indexOf(a) <= GAN_ORDER.indexOf(b) ? a + b : b + a);
  const zhiKey = (a, b) => (ZHI_ORDER.indexOf(a) <= ZHI_ORDER.indexOf(b) ? a + b : b + a);
  const gans = Object.entries(bazi.pillars).map(([k, p]) => ({ pos: k, label: pos[k], gan: p.gan, zhi: p.zhi }));
  const items = [];

  // 天干五合
  for (let i = 0; i < gans.length; i++) {
    for (let j = i + 1; j < gans.length; j++) {
      const hit = weights.ganHe.find((h) => h.pair === ganKey(gans[i].gan, gans[j].gan));
      if (hit) items.push({ type: 'he', typeCn: '天干合', pair: `${gans[i].gan}${gans[j].gan}`, element: hit.element, cn: hit.cn, positions: [gans[i].label, gans[j].label] });
    }
  }
  // 地支六合 / 半合 / 冲 / 害 / 相刑
  for (let i = 0; i < gans.length; i++) {
    for (let j = i + 1; j < gans.length; j++) {
      const a = gans[i].zhi, b = gans[j].zhi, key = zhiKey(a, b);
      const liuhe = weights.zhiLiuHe.find((h) => h.pair === key);
      if (liuhe) items.push({ type: 'he', typeCn: '地支六合', pair: `${a}${b}`, element: liuhe.element, positions: [gans[i].label, gans[j].label] });
      const banhe = weights.banHe.find((h) => h.pair === key);
      if (banhe) items.push({ type: 'he', typeCn: '地支半合', pair: `${a}${b}`, element: banhe.element, positions: [gans[i].label, gans[j].label] });
      if (weights.liuChong.some((h) => h.pair === key)) items.push({ type: 'chong', typeCn: '六冲', pair: `${a}${b}`, positions: [gans[i].label, gans[j].label] });
      if (weights.liuHai.some((h) => h.pair === key)) items.push({ type: 'hai', typeCn: '六害', pair: `${a}${b}`, positions: [gans[i].label, gans[j].label] });
      if (weights.xiangXing.some((h) => h.pair === key)) items.push({ type: 'xing', typeCn: weights.xiangXing.find((h) => h.pair === key).cn, pair: `${a}${b}`, positions: [gans[i].label, gans[j].label] });
    }
  }
  // 三合局 / 三刑（需三支齐）
  const zhis = gans.map((g) => g.zhi);
  for (const s of weights.sanHe) {
    if ([...s.trio].every((z) => zhis.includes(z))) {
      items.push({ type: 'he', typeCn: `地支三合（${s.cn}）`, pair: s.trio, element: s.element, positions: [...s.trio].map((z) => gans.find((g) => g.zhi === z).label) });
    }
  }
  for (const g of weights.sanXing) {
    if ([...g.group].every((z) => zhis.includes(z))) {
      items.push({ type: 'xing', typeCn: g.cn, pair: g.group, positions: [...g.group].map((z) => gans.find((x) => x.zhi === z).label) });
    }
  }
  for (const z of weights.ziXing) {
    if (zhis.filter((x) => x === z).length >= 2) {
      items.push({ type: 'xing', typeCn: `${z}自刑`, pair: z + z, positions: gans.filter((g) => g.zhi === z).map((g) => g.label) });
    }
  }
  return { items, hasAny: items.length > 0 };
}

/**
 * 袁天罡称骨。
 * 边界规则：夜子时（23:00~23:59）按次日计；闰月 1~15 按本月、16~30 按下月；年键用六十甲子干支。
 * @returns {{parts:object, totalQian:number, tier:object, notes:string[]}}
 */
export function castChenggu(bazi, weights, chengguData) {
  const { Solar } = globalThis;
  if (!Solar) throw new Error('vendor lunar.js not loaded');
  const inp = bazi.effective ?? bazi.input; // 真太阳时校正后的实际排盘时刻
  const notes = [];
  let { year, month, day, hour } = inp;

  // 夜子时→次日
  if (hour === 23) {
    const next = new Date(Date.UTC(year, month - 1, day) + 86400000);
    year = next.getUTCFullYear(); month = next.getUTCMonth() + 1; day = next.getUTCDate();
    notes.push('生于夜子时（23:00~23:59），按次日计');
  }
  const lunar = Solar.fromYmdHms(year, month, day, hour, inp.minute || 0, 0).getLunar();
  const lm = lunar.getMonth();          // 闰月为负
  const ld = lunar.getDay();
  const yearGanZhi = lunar.getYearInGanZhi();   // 农历年干支（与四柱年柱一致）

  // 闰月折算：上半月按本月、下半月按下月
  let monthKey = Math.abs(lm);
  if (lm < 0 && ld >= 16) {
    monthKey = monthKey === 12 ? 1 : monthKey + 1;
    notes.push(`闰${monthKey === 1 ? '12' : monthKey - 1}月下半月，按次月（${monthKey} 月）计`);
  } else if (lm < 0) {
    notes.push('闰月上半月，按本月计');
  }
  const hourZhi = bazi.pillars.time.zhi;

  const W = chengguData.weights;
  const parts = {
    year: { ganzhi: yearGanZhi, qian: W.year_weight_qian_by_ganzhi[yearGanZhi] },
    month: { lunarMonth: monthKey, qian: W.month_weight_qian[String(monthKey)] },
    day: { lunarDay: ld, qian: W.day_weight_qian[String(ld)] },
    hour: { zhi: hourZhi, qian: W.hour_weight_qian[hourZhi] },
  };
  const missing = Object.entries(parts).filter(([, v]) => !Number.isFinite(v.qian));
  if (missing.length) throw new Error(`称骨查表缺项：${missing.map(([k]) => k).join(',')}`);

  const totalQian = parts.year.qian + parts.month.qian + parts.day.qian + parts.hour.qian;
  const tier = chengguData.tiers.find((t) => t.qian === totalQian);
  if (!tier) throw new Error(`总骨重 ${totalQian} 钱超出称骨表范围（21~71 钱）`);
  return { parts, totalQian, tier, notes, lunar };
}

/**
 * 名人案例库：按日期计算各案例的年/月/日三柱（正午取时以避开日界争议），供页面作参照展示。
 * ponytail: 不含时柱——史料时辰多不可考，异地时区亦不可靠；只做参照，不作命理比对结论
 */
export function buildCaseLibrary(cases, castFn) {
  const out = [];
  for (const c of cases) {
    try {
      const [date] = c.birth.split('T');
      const [y, m, d] = date.split('-').map(Number);
      const cb = castFn({ year: y, month: m, day: d, hour: 12, minute: 0, gender: 'male' });
      out.push({ ...c, pillars: ['year', 'month', 'day'].map((k) => cb.pillars[k].ganZhi), dayGan: cb.dayGan, dayGanWuXing: cb.dayGanWuXing });
    } catch { /* 单个案例失败不影响其余 */ }
  }
  return out;
}

/**
 * 姻缘视角（规则层）：配偶宫（日支）+ 配偶星（按性别）+ 日支参与的合冲刑害提示。
 * @param {object} bazi castBazi 输出（含 input.gender）
 * @param {object} interp interpret-bazi.json 语料（含 spouse 节）
 * @param {object} relations analyzeRelations 输出 { items }
 * @returns {{ palaceLine: string, starLine: string, tips: Array<{ typeCn: string, pair: string, tip: string }> }}
 */
export function readMarriage(bazi, interp, relations) {
  const S = interp.spouse;
  if (!S) throw new Error('语料缺少 spouse 节');
  const dayZhi = bazi.pillars.day.zhi;
  const palaceLine = S.spousePalace[dayZhi] ?? '日支罕见，参照同五行地支参看。';

  const starShiShen = bazi.input.gender === 'female' ? '正官' : '正财';
  const starLine = S.spouseStar[bazi.input.gender === 'female' ? 'female' : 'male'];
  let whereKey = null, wherePos = '';
  for (const [k, p] of Object.entries(bazi.pillars)) {
    if (k !== 'day' && p.ganShiShen === starShiShen) { whereKey = k; break; }
  }
  if (!whereKey) {
    for (const [k, p] of Object.entries(bazi.pillars)) {
      if ((p.hideGans ?? []).some((h) => h.shiShen === starShiShen)) { whereKey = 'day'; break; }
    }
  }
  const whereLine = whereKey
    ? S.starWhere[whereKey]
    : S.starWhere.none;
  if (whereKey === 'day') wherePos = '（藏干坐配偶宫）';
  const starFull = `${starLine}${whereLine}${wherePos}`;

  const tipOf = S.marriageTips;
  const tips = (relations?.items ?? [])
    .filter((it) => it.positions?.includes('日柱'))
    .map((it) => ({ typeCn: it.typeCn, pair: Array.isArray(it.pair) ? it.pair.join('') : it.pair, tip: tipOf[it.type] ?? '' }))
    .filter((it) => it.tip);
  // 去重：同一 type+pair 只留一条
  const seen = new Set();
  const uniqTips = tips.filter((t) => { const k = t.typeCn + t.pair; if (seen.has(k)) return false; seen.add(k); return true; });

  return { palaceLine, starLine: starFull, tips: uniqTips };
}

// —— 神煞（标记层，只判「见 / 未见」与落柱，不做吉凶总评）——
// 口径只取一套主流口诀（见语料 shensha.rulesNote），不混派；各派取法不同，改表前先改语料。
const SHENSHA_GAN = {
  tianyi: { 甲: '丑未', 戊: '丑未', 庚: '丑未', 乙: '子申', 己: '子申', 丙: '亥酉', 丁: '亥酉', 壬: '卯巳', 癸: '卯巳', 辛: '午寅' },
  wenchang: { 甲: '巳', 乙: '午', 丙: '申', 戊: '申', 丁: '酉', 己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯' },
  lushen: { 甲: '寅', 乙: '卯', 丙: '巳', 戊: '巳', 丁: '午', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' },
  yangren: { 甲: '卯', 乙: '辰', 丙: '午', 丁: '未', 戊: '午', 己: '未', 庚: '酉', 辛: '戌', 壬: '子', 癸: '丑' },
};
// 三合局：驿马 / 桃花 / 华盖 / 将星
const SANHE = [
  { zhis: '申子辰', ma: '寅', tao: '酉', hua: '辰', jiang: '子' },
  { zhis: '寅午戌', ma: '申', tao: '卯', hua: '戌', jiang: '午' },
  { zhis: '巳酉丑', ma: '亥', tao: '午', hua: '丑', jiang: '酉' },
  { zhis: '亥卯未', ma: '巳', tao: '子', hua: '未', jiang: '卯' },
];
const GU_GUA = [
  { zhis: '亥子丑', gu: '寅', gua: '戌' },
  { zhis: '寅卯辰', gu: '巳', gua: '丑' },
  { zhis: '巳午未', gu: '申', gua: '辰' },
  { zhis: '申酉戌', gu: '亥', gua: '未' },
];
const YUEDE = { 寅午戌: '丙', 申子辰: '壬', 亥卯未: '甲', 巳酉丑: '庚' };
const KUIGANG = ['庚辰', '庚戌', '壬辰', '戊戌'];
const POS_CN_MAP = { year: '年柱', month: '月柱', day: '日柱', time: '时柱' };

/**
 * 神煞标记（确定性规则，无 AI）。
 * 返回固定顺序的 11 项，每项 `hits` 为空数组表示本命四柱未见——调用方据此区分「见 / 未见」。
 * @param {object} bazi castBazi 输出
 * @param {object} interp interpret-bazi.json 语料（含 shensha.items）
 * @returns {Array<{ key: string, name: string, text: string, value: string, hits: string[] }>}
 */
export function analyzeShensha(bazi, interp) {
  const cfg = interp?.shensha;
  if (!cfg?.items) throw new Error('语料缺少 shensha.items 节');
  const cols = Object.entries(bazi.pillars).map(([k, p]) => ({ key: k, label: POS_CN_MAP[k], gan: p.gan, zhi: p.zhi, ganZhi: p.ganZhi }));
  const dayGan = bazi.pillars.day.gan;
  const groupOf = (zhi) => SANHE.find((g) => g.zhis.includes(zhi)) ?? null;
  const hitZhi = (set) => cols.filter((c) => set.includes(c.zhi)).map((c) => c.label);
  const hitGan = (set) => cols.filter((c) => set.includes(c.gan)).map((c) => c.label);
  const seen = (labels) => [...new Set(labels)];

  const out = [];
  const push = (key, value, hits) => {
    const item = cfg.items[key];
    if (!item) return; // 语料未定义则该神煞不上行（避免产出无名条目）
    out.push({ key, name: item.name, text: item.text, value, hits: seen(hits) });
  };

  // 日干起的四类
  for (const key of ['tianyi', 'wenchang', 'lushen', 'yangren']) {
    const set = SHENSHA_GAN[key][dayGan] ?? '';
    push(key, `${dayGan}日干见${set}`, hitZhi(set));
  }

  // 三合局四类：以年支为主、兼看日支（两组命中合并）
  const yimaHits = [], taoHits = [], huaHits = [], jiangHits = [];
  for (const zhi of [bazi.pillars.year.zhi, bazi.pillars.day.zhi]) {
    const g = groupOf(zhi);
    if (!g) continue;
    yimaHits.push(...hitZhi(g.ma));
    taoHits.push(...hitZhi(g.tao));
    huaHits.push(...hitZhi(g.hua));
    jiangHits.push(...hitZhi(g.jiang));
  }
  const baseZhis = `${bazi.pillars.year.zhi}（年支）/${bazi.pillars.day.zhi}（日支）`;
  push('yima', `驿马（${baseZhis} 起）`, yimaHits);
  push('taohua', `桃花（${baseZhis} 起）`, taoHits);
  push('huagai', `华盖（${baseZhis} 起）`, huaHits);
  push('jiangxing', `将星（${baseZhis} 起）`, jiangHits);

  // 孤辰寡宿（年支组）
  const gg = GU_GUA.find((x) => x.zhis.includes(bazi.pillars.year.zhi));
  if (gg) push('gugua', `孤辰${gg.gu} / 寡宿${gg.gua}（年支组 ${gg.zhis}）`, hitZhi(gg.gu + gg.gua));

  // 月德（月支组 → 天干）
  const ydKey = Object.keys(YUEDE).find((k) => k.includes(bazi.pillars.month.zhi));
  if (ydKey) push('yuede', `${ydKey}月见${YUEDE[ydKey]}`, hitGan(YUEDE[ydKey]));

  // 魁罡（日柱干支）
  push('kuigang', `日柱${bazi.pillars.day.ganZhi}`, KUIGANG.includes(bazi.pillars.day.ganZhi) ? ['日柱'] : []);

  // ponytail: 只覆盖 11 类常用神煞（天乙/文昌/禄/羊刃/驿马/桃花/华盖/将星/孤辰寡宿/月德/魁罡）；
  // 未做天德、红艳、金舆、天赦等——加神煞 = 先加语料 items 再在此处补规则，别只改一边
  return out;
}
