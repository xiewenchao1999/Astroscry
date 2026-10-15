// iching.mjs — 周易六十四卦核心计算（纯函数，无 DOM / 无网络）
// 依赖：梅花时间卦需要 vendor/lunar.js 暴露的 globalThis.Solar（农历年支/月/日）；铜钱法与三数法无依赖
// 约定：爻位自下而上 1..6（初爻=1，上爻=6）；bits 为六位字符串、自下而上，1=阳 0=阴（与 data/iching.json 同口径）
// 变爻取辞：朱熹《易学启蒙》七档（0~6 动），见 resolveReading
// ponytail: 梅花时间卦的年支按 lunar-javascript 的农历年（正月初一切换）；立春换年流派暂不处理。
//           晚子时（23:00-23:59）时辰按子时计、日柱不进位——仅影响临界时辰，升级路径=接入真太阳时与流派开关。

// 先天八卦：三画 bits（自下而上）与先天数
const TRIGRAM_BITS = { 乾: '111', 兑: '110', 离: '101', 震: '100', 巽: '011', 坎: '010', 艮: '001', 坤: '000' };
const NUM_TO_TRIGRAM = { 1: '乾', 2: '兑', 3: '离', 4: '震', 5: '巽', 6: '坎', 7: '艮', 8: '坤' };
export const ZHI_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

const isPositiveInt = (n) => Number.isInteger(n) && n > 0;

/** 由爻值序列（自下而上）取动爻位列表（1-6） */
function movingOf(lines) {
  return lines.map((v, i) => (v === 6 || v === 9 ? i + 1 : null)).filter((x) => x !== null);
}

/** 爻值序列 → bits（7/9 阳、6/8 阴） */
function bitsOfLines(lines) {
  return lines.map((v) => (v === 7 || v === 9 ? '1' : '0')).join('');
}

/**
 * 铜钱摇卦：六爻自下而上，每爻掷三枚铜钱。
 * 约定（本站口径）：反面（背）计数——3 反=老阴 6、2 反 1 正=少阳 7、1 反 2 正=少阴 8、3 正=老阳 9；
 * 老阴/老阳为动爻。rng 注入（页面传 cryptoRng，测试传确定性桩）。
 * @param {() => number} rng 返回 [0,1) 的随机源
 * @returns {{ method: 'coin', lines: number[6], coins: string[][6], bits: string, moving: number[] }}
 */
export function castCoinHexagram(rng) {
  if (typeof rng !== 'function') throw new Error('castCoinHexagram 需要注入 rng');
  const lines = [];
  const coins = [];
  for (let i = 0; i < 6; i++) {
    let fan = 0;
    const toss = [];
    for (let c = 0; c < 3; c++) {
      const isFan = rng() < 0.5;
      if (isFan) fan++;
      toss.push(isFan ? '反' : '正');
    }
    lines.push(fan === 3 ? 6 : fan === 2 ? 7 : fan === 1 ? 8 : 9);
    coins.push(toss);
  }
  return { method: 'coin', lines, coins, bits: bitsOfLines(lines), moving: movingOf(lines) };
}

/** (a+b+c) mod 8 / (a+b+c+h) mod 8 / mod 6 的公共实现；余 0 归模数（先天数 1..8、动爻 1..6） */
function plumFromNumbers(a, b, c, h, method) {
  const upperNum = (a + b + c) % 8 || 8;
  const lowerNum = (a + b + c + h) % 8 || 8;
  const moving = (a + b + c + h) % 6 || 6;
  const upper = NUM_TO_TRIGRAM[upperNum];
  const lower = NUM_TO_TRIGRAM[lowerNum];
  return { method, nums: { a, b, c, h }, upperNum, lowerNum, upper, lower, moving, bits: TRIGRAM_BITS[lower] + TRIGRAM_BITS[upper] };
}

/**
 * 梅花易数·时间卦（标准式）：年支序(子1..亥12) + 农历月 + 农历日 → mod 8 上卦；
 * 再加时辰序 → mod 8 下卦；总和 → mod 6 动爻；余 0 归模数。
 * @param {Date} dateLocal 当地时间（需 vendor/lunar.js 已加载）
 */
export function plumTimeCast(dateLocal) {
  const Solar = globalThis.Solar;
  if (!Solar) throw new Error('vendor lunar.js not loaded');
  const lunar = Solar.fromDate(dateLocal).getLunar();
  const y = ZHI_ORDER.indexOf(lunar.getYearZhi()) + 1;
  const m = Math.abs(lunar.getMonth()); // 闰月取月数
  const d = lunar.getDay();
  const h = Math.floor(((dateLocal.getHours() + 1) % 24) / 2) + 1; // 时支序（公式法）
  return plumFromNumbers(y, m, d, h, 'plum-time');
}

/**
 * 梅花易数·三数法：n1 mod 8 上卦、n2 mod 8 下卦、(n1+n2+n3) mod 6 动爻；余 0 归模数。
 * @param {number} n1 上卦数（正整数）
 * @param {number} n2 下卦数（正整数）
 * @param {number} n3 动爻数（正整数）
 */
export function plumThreeCast(n1, n2, n3) {
  for (const [name, v] of [['n1', n1], ['n2', n2], ['n3', n3]]) {
    if (!isPositiveInt(v)) throw new Error(`三数法 ${name} 应为正整数，实际 ${v}`);
  }
  // 三数法与时间卦公式不同：上/下卦各取自身之数（时间卦是「年月日 → +时辰」累加式）
  const upperNum = n1 % 8 || 8;
  const lowerNum = n2 % 8 || 8;
  const moving = (n1 + n2 + n3) % 6 || 6;
  const upper = NUM_TO_TRIGRAM[upperNum];
  const lower = NUM_TO_TRIGRAM[lowerNum];
  return { method: 'plum-three', nums: { a: n1, b: n2, c: n3, h: 0 }, upperNum, lowerNum, upper, lower, moving, bits: TRIGRAM_BITS[lower] + TRIGRAM_BITS[upper] };
}

// —— bits → 卦 索引（查询主键 = bits）——
const INDEX_CACHE = new WeakMap();
function indexOf(data) {
  let idx = INDEX_CACHE.get(data);
  if (!idx) {
    idx = new Map(data.hexagrams.map((h) => [h.bits, h]));
    INDEX_CACHE.set(data, idx);
  }
  return idx;
}

/** bits（六位自下而上）→ 卦对象；未知 bits 抛错 */
export function hexagramByBits(data, bits) {
  const h = indexOf(data).get(bits);
  if (!h) throw new Error(`未知卦 bits：${bits}`);
  return h;
}

/** 变卦 bits：动爻位翻转（老阴 0→1、老阳 1→0） */
export function changedBits(bits, moving) {
  const arr = bits.split('');
  for (const pos of moving) {
    if (!isPositiveInt(pos) || pos > 6) throw new Error(`动爻位应在 1..6，实际 ${pos}`);
    arr[pos - 1] = arr[pos - 1] === '1' ? '0' : '1';
  }
  return arr.join('');
}

/**
 * 朱熹《易学启蒙》变爻取辞（七档查表）：
 *   0 动 → 本卦卦辞；
 *   1 动 → 本卦动爻辞；
 *   2 动 → 本卦两动爻辞，以上爻为主；
 *   3 动 → 本卦卦辞（贞）+ 之卦卦辞（悔）；
 *   4 动 → 之卦两不动爻辞，以下爻为主；
 *   5 动 → 之卦不动爻辞；
 *   6 动 → 乾坤用九/用六，余卦之卦卦辞。动爻辞同时查 lines 与 special 两处（special 承载用九用六）。
 * @param {object} data iching.json 全量（供 bits→卦 索引）
 * @param {object} hexagram 本卦对象（data.hexagrams 之一）
 * @param {number[]} moving 动爻位列表（1-6，自下而上）
 * @returns {{ movingCount, rule: {key, cn}, citations: Array<{role, source, text, baiHua}>, changedBits, changed }}
 */
export function resolveReading(data, hexagram, moving) {
  const mv = [...new Set(moving)].sort((a, b) => a - b);
  for (const pos of mv) {
    if (!isPositiveInt(pos) || pos > 6) throw new Error(`动爻位应在 1..6，实际 ${pos}`);
  }
  const n = mv.length;
  const zhiBits = changedBits(hexagram.bits, mv);
  const zhi = n > 0 ? hexagramByBits(data, zhiBits) : null;
  const lineOf = (hx, pos) => hx.lines[pos - 1];
  const cite = (role, source, entry) => ({ role, source, text: entry.text, baiHua: entry.baiHua });
  let rule, citations = [];

  if (n === 0) {
    rule = { key: 'static', cn: '静卦（无动爻）' };
    citations.push(cite('primary', '本卦卦辞', { text: hexagram.guaCi, baiHua: hexagram.guaCiBaiHua }));
  } else if (n === 1) {
    rule = { key: 'one', cn: '一爻动' };
    const ln = lineOf(hexagram, mv[0]);
    citations.push(cite('primary', `本卦动爻（${ln.pos}）`, ln));
  } else if (n === 2) {
    rule = { key: 'two', cn: '二爻动（以上爻为主）' };
    const upper = lineOf(hexagram, mv[1]); // 上爻为主
    const lower = lineOf(hexagram, mv[0]); // 下爻兼读
    citations.push(cite('primary', `本卦动爻（${upper.pos}）`, upper));
    citations.push(cite('secondary', `本卦动爻（${lower.pos}）`, lower));
  } else if (n === 3) {
    rule = { key: 'three', cn: '三爻动（本卦为贞、之卦为悔）' };
    citations.push(cite('primary', '本卦卦辞', { text: hexagram.guaCi, baiHua: hexagram.guaCiBaiHua }));
    citations.push(cite('secondary', `之卦卦辞（${zhi.full}）`, { text: zhi.guaCi, baiHua: zhi.guaCiBaiHua }));
  } else if (n === 4) {
    rule = { key: 'four', cn: '四爻动（以之卦不动爻之下者为主）' };
    const still = [1, 2, 3, 4, 5, 6].filter((p) => !mv.includes(p)); // 恰为 2 个
    const lower = lineOf(zhi, still[0]);
    const upper = lineOf(zhi, still[1]);
    citations.push(cite('primary', `之卦不动爻（${lower.pos}）`, lower));
    citations.push(cite('secondary', `之卦不动爻（${upper.pos}）`, upper));
  } else if (n === 5) {
    rule = { key: 'five', cn: '五爻动（以之卦不动爻为主）' };
    const still = [1, 2, 3, 4, 5, 6].find((p) => !mv.includes(p));
    const ln = lineOf(zhi, still);
    citations.push(cite('primary', `之卦不动爻（${ln.pos}）`, ln));
  } else {
    rule = { key: 'six', cn: '六爻全动' };
    if (hexagram.special) {
      // 乾坤用九用六：special 承载（动爻辞同时查 lines 与 special 两处的「special」一路）
      citations.push(cite('primary', `本卦 ${hexagram.special.pos}`, hexagram.special));
    } else {
      citations.push(cite('primary', `之卦卦辞（${zhi.full}）`, { text: zhi.guaCi, baiHua: zhi.guaCiBaiHua }));
    }
  }
  return { movingCount: n, rule, citations, changedBits: n > 0 ? zhiBits : null, changed: zhi };
}

/**
 * 数据闭合校验：64 卦、bits 六位二进制且无重复、386 爻辞闭合（64×6 爻辞 + 乾坤用九用六）、动爻辞/卦辞字段齐备。
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateIching(data) {
  const errors = [];
  const hs = data?.hexagrams;
  if (!Array.isArray(hs) || hs.length !== 64) errors.push(`卦数应为 64，实际 ${hs?.length}`);
  const seen = new Set();
  let lineCount = 0, specialCount = 0;
  for (const h of hs ?? []) {
    if (!/^[01]{6}$/.test(h.bits ?? '')) { errors.push(`卦 ${h.id} bits 非六位二进制：${h.bits}`); continue; }
    if (seen.has(h.bits)) errors.push(`bits 重复：${h.bits}（${h.full}）`);
    seen.add(h.bits);
    for (const f of ['name', 'full', 'guaCi', 'guaCiBaiHua', 'daXiang', 'daXiangBaiHua']) {
      if (!h[f]) errors.push(`卦 ${h.id} 缺 ${f}`);
    }
    if (!Array.isArray(h.lines) || h.lines.length !== 6) { errors.push(`卦 ${h.id} 爻辞应为 6 条`); continue; }
    for (const ln of h.lines) {
      if (!ln.pos || !ln.text || !ln.baiHua) errors.push(`卦 ${h.id} 有爻辞字段缺失`);
      lineCount++;
    }
    if (h.special) {
      if (!h.special.pos || !h.special.text || !h.special.baiHua) errors.push(`卦 ${h.id} special 字段缺失`);
      specialCount++;
    }
  }
  if (lineCount !== 384) errors.push(`爻辞总数应为 384，实际 ${lineCount}`);
  if (specialCount !== 2) errors.push(`用九用六应恰为 2 条（乾坤），实际 ${specialCount}`);
  return { ok: errors.length === 0, errors };
}
