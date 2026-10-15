// astro.mjs — 西方占星核心计算（纯函数，无 DOM / 无网络）
// 依赖：vendor/astronomy.min.js 暴露的 globalThis.Astronomy（Astronomy Engine, MIT）
// 黄经一律为「回归黄道·分点今日」(true ecliptic of date)，即占星标准坐标系
// ponytail: 北交点用平交点解析式（非真交点，误差 ≤1.5°）；凯龙无解析式不入 v1；宫位制 v1 用整宫制（Placidus 升级路径：实现逐宫经度截断）

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const SIGNS = [
  { key: 'aries', cn: '白羊', en: 'Aries', element: '火', modality: '本位', ruler: '火星', dateRange: '3.21-4.19' },
  { key: 'taurus', cn: '金牛', en: 'Taurus', element: '土', modality: '固定', ruler: '金星', dateRange: '4.20-5.20' },
  { key: 'gemini', cn: '双子', en: 'Gemini', element: '风', modality: '变动', ruler: '水星', dateRange: '5.21-6.21' },
  { key: 'cancer', cn: '巨蟹', en: 'Cancer', element: '水', modality: '本位', ruler: '月亮', dateRange: '6.22-7.22' },
  { key: 'leo', cn: '狮子', en: 'Leo', element: '火', modality: '固定', ruler: '太阳', dateRange: '7.23-8.22' },
  { key: 'virgo', cn: '处女', en: 'Virgo', element: '土', modality: '变动', ruler: '水星', dateRange: '8.23-9.22' },
  { key: 'libra', cn: '天秤', en: 'Libra', element: '风', modality: '本位', ruler: '金星', dateRange: '9.23-10.23' },
  { key: 'scorpio', cn: '天蝎', en: 'Scorpio', element: '水', modality: '固定', ruler: '冥王星', dateRange: '10.24-11.22' },
  { key: 'sagittarius', cn: '射手', en: 'Sagittarius', element: '火', modality: '变动', ruler: '木星', dateRange: '11.23-12.21' },
  { key: 'capricorn', cn: '摩羯', en: 'Capricorn', element: '土', modality: '本位', ruler: '土星', dateRange: '12.22-1.19' },
  { key: 'aquarius', cn: '水瓶', en: 'Aquarius', element: '风', modality: '固定', ruler: '土星', dateRange: '1.20-2.18' },
  { key: 'pisces', cn: '双鱼', en: 'Pisces', element: '水', modality: '变动', ruler: '木星', dateRange: '2.19-3.20' },
];

// —— CONFIG：本模块全部可调参数集中声明（P19：行星集 / 相位表 / 元素权重 / 个人行星集合）——
// ponytail: 配置面升级路径：迁 data 文件 + 页面开关（用户可选行星集/相位集/流派权重）；v1 不上 UI
export const CONFIG = {
  // 参与计算的 11 个天体（body 为 null 者用解析式，如北交点）
  PLANETS: [
    { key: 'sun', cn: '太阳', body: 'Sun' },
    { key: 'moon', cn: '月亮', body: 'Moon' },
    { key: 'mercury', cn: '水星', body: 'Mercury' },
    { key: 'venus', cn: '金星', body: 'Venus' },
    { key: 'mars', cn: '火星', body: 'Mars' },
    { key: 'jupiter', cn: '木星', body: 'Jupiter' },
    { key: 'saturn', cn: '土星', body: 'Saturn' },
    { key: 'uranus', cn: '天王星', body: 'Uranus' },
    { key: 'neptune', cn: '海王星', body: 'Neptune' },
    { key: 'pluto', cn: '冥王星', body: 'Pluto' },
    { key: 'northnode', cn: '北交点', body: null },
  ],
  // 相位定义（单一事实来源，O06）：本命 calcAspects 与跨盘 interAspects（astro-synastry.mjs）共用此表。
  // inNatal:false 的相位（150°/30°）只用于合盘与行运卡；本命页/星盘轮按 inNatal 过滤，仍只画前 5 种。
  // luminaryBonus：任一端为发光体（日/月）时的容许度加成（O06 归一：natal 与 synastry 统一 2°，原 synastry 为 1.5°）。
  // nature：吉凶性质（合盘汇总用）；conj 特殊处理为 neutral（见 astro-synastry.interAspects）。
  ASPECTS: [
    { angle: 0, cn: '合相', key: 'conj', orb: 8, color: '#7dd3fc', luminaryBonus: 2, inNatal: true, nature: 'neutral' },
    { angle: 60, cn: '六合', key: 'sextile', orb: 4, color: '#86efac', luminaryBonus: 2, inNatal: true, nature: 'harmonious' },
    { angle: 90, cn: '刑相', key: 'square', orb: 6, color: '#fca5a5', luminaryBonus: 2, inNatal: true, nature: 'challenging' },
    { angle: 120, cn: '拱相', key: 'trine', orb: 6, color: '#86efac', luminaryBonus: 2, inNatal: true, nature: 'harmonious' },
    { angle: 180, cn: '冲相', key: 'opp', orb: 8, color: '#fca5a5', luminaryBonus: 2, inNatal: true, nature: 'challenging' },
    { angle: 150, cn: '补十二分相', key: 'quincunx', orb: 3, color: '#c4b5fd', luminaryBonus: 2, inNatal: false, nature: 'challenging' },
    { angle: 30, cn: '十二分相', key: 'semisextile', orb: 2, color: '#94a3b8', luminaryBonus: 2, inNatal: false, nature: 'neutral' },
  ],
  // 元素统计权重（countElements）：个人行星权重高，世代行星低，交点不计
  ELEMENT_WEIGHTS: { sun: 3, moon: 3, mercury: 2, venus: 2, mars: 2, jupiter: 1, saturn: 1, uranus: 0.5, neptune: 0.5, pluto: 0.5, northnode: 0 },
  // 个人行星集合（detectPatterns 的群星判定要求至少含一颗，避免世代行星同座误报个人配置）
  PERSONAL_SET: ['sun', 'moon', 'mercury', 'venus', 'mars'],
};

export const PLANETS = CONFIG.PLANETS;
export const ASPECTS = CONFIG.ASPECTS;

// 跨盘相位强度评分的行星权重（合盘 synastry 与行运 transits 共用，astro-synastry.mjs 引用）。
// 注意与 countElements 的 ELEMENT_WEIGHTS 语义不同：此处衡量相位交互强度，彼处衡量元素占比。
export const PLANET_WEIGHT = {
  sun: 3, moon: 3, venus: 2.5, mars: 2.5,
  jupiter: 1.5, saturn: 1.5, mercury: 1.2,
  uranus: 0.8, neptune: 0.8, pluto: 0.8, northnode: 0.5,
};

export function signOf(lon) {
  const i = Math.floor(((lon % 360) + 360) % 360 / 30) % 12;
  const s = SIGNS[i];
  return { signIndex: i, signKey: s.key, signCn: s.cn, signElement: s.element, degInSign: ((lon % 30) + 30) % 30 };
}

// 平黄赤交角（Meeus 22.2 简化式，arcsec 级精度足够占星）
export function meanObliquity(dateUTC) {
  const T = (dateUTC.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000 / 36525;
  const s = 23.439291111 - 0.0130041667 * T - 1.6389e-7 * T * T;
  return s; // degrees
}

/** 平北交点黄经（解析式）。ponytail: 平交点非真交点，误差 ≤1.5°；升级路径：数值法求黄白交点 */
export function meanNodeLon(dateUTC) {
  const d = (dateUTC.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000; // days since J2000
  return ((125.04452 - 0.05295376 * d) % 360 + 360) % 360;
}

function eclipticLonOfBody(Astronomy, body, dateUTC) {
  const time = Astronomy.MakeTime(dateUTC);
  const vec = Astronomy.GeoVector(Astronomy.Body[body], time, true); // J2000 赤道坐标（含光行差）
  const rot = Astronomy.Rotation_EQJ_ECT(time); // → 分点今日黄道
  const ecl = Astronomy.RotateVector(rot, vec);
  const sph = Astronomy.SphereFromVector(ecl);
  return ((sph.lon % 360) + 360) % 360;
}

/** 月相名（P17 单一事实来源：home-page 复用，勿再各持一份 8 元数组） */
export function moonPhaseName(angle) {
  const names = ['新月', '娥眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月'];
  return names[Math.floor((angle + 22.5) / 45) % 8];
}

/**
 * 某时刻全部天体黄经 + 逆行 + 月相。
 */
export function computeSky(dateUTC) {
  const A = globalThis.Astronomy;
  if (!A) throw new Error('vendor astronomy.min.js not loaded');
  const planets = {};
  for (const p of PLANETS) {
    const lon = p.body ? eclipticLonOfBody(A, p.body, dateUTC) : meanNodeLon(dateUTC);
    // 逆行判定：24 小时后黄经变小（北交点永不逆行，月/日亦不可能出现）
    let retrograde = false;
    if (p.body && p.body !== 'Sun' && p.body !== 'Moon') {
      const lonNext = eclipticLonOfBody(A, p.body, new Date(dateUTC.getTime() + 86400000));
      retrograde = ((lonNext - lon + 540) % 360 - 180) < 0;
    }
    planets[p.key] = { key: p.key, cn: p.cn, lon, retrograde, ...signOf(lon) };
  }
  const phaseAngle = A.MoonPhase(A.MakeTime(dateUTC));
  const illumination = A.Illumination(A.Body.Moon, A.MakeTime(dateUTC)).phase_fraction;
  return {
    dateUTC: dateUTC.toISOString(),
    planets,
    moonPhase: { angle: phaseAngle, name: moonPhaseName(phaseAngle), illumination },
  };
}

/**
 * 上升点 / 中天（回归黄道）。
 * @param {number} lstDeg 当地恒星时（度）
 * @param {number} lat 地理纬度（北正）
 * @param {number} epsDeg 黄赤交角
 */
export function ascendantMc(lstDeg, lat, epsDeg) {
  const ramc = lstDeg * D2R;
  const eps = epsDeg * D2R;
  const phi = lat * D2R;
  const mc = Math.atan2(Math.sin(ramc), Math.cos(ramc) * Math.cos(eps)) * R2D;
  // 上升点：atan2(cos RAMC, -(sin RAMC·cosε + tanφ·sinε))——几何推导验证：ε→0,φ→0,RAMC=0 时上升=90°（0°巨蟹）
  const asc = Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) * R2D;
  const norm = (x) => ((x % 360) + 360) % 360;
  return { asc: norm(asc), mc: norm(mc) };
}

function greenwichSiderealTimeDeg(A, dateUTC) {
  const gast = A.SiderealTime(A.MakeTime(dateUTC)); // hours
  return ((gast * 15) % 360 + 360) % 360;
}

/**
 * 本命盘：整宫制。
 * @param {object} input {year,month,day,hour,minute, lat, lon(东正), tzOffsetHours(含小数, 标准时)}
 */
export function castNatal(input) {
  const A = globalThis.Astronomy;
  if (!A) throw new Error('vendor astronomy.min.js not loaded');
  const utc = new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour || 0, input.minute || 0) - (input.tzOffsetHours || 0) * 3600000);
  const sky = computeSky(utc);
  // ponytail: 恒星时未做 Ehrenfeucht/极移微修正； astro 精度需求内足够
  const lst = (greenwichSiderealTimeDeg(A, utc) + input.lon + 360) % 360;
  const eps = meanObliquity(utc);
  const { asc, mc } = ascendantMc(lst, input.lat, eps);
  const ascInfo = signOf(asc);
  // 整宫制：第 k 宫 = 上升星座起第 k 个星座
  const houses = [];
  for (let k = 0; k < 12; k++) {
    const signIdx = (ascInfo.signIndex + k) % 12;
    houses.push({ house: k + 1, sign: SIGNS[signIdx].cn, signKey: SIGNS[signIdx].key, lon: signIdx * 30 });
  }
  // 行星落宫：按行星星座位于哪个整宫
  const planets = {};
  for (const [key, pl] of Object.entries(sky.planets)) {
    const houseIdx = ((pl.signIndex - ascInfo.signIndex) % 12 + 12) % 12;
    planets[key] = { ...pl, house: houseIdx + 1 };
  }
  return {
    input,
    utc: utc.toISOString(),
    lst,
    planets,
    asc, mc,
    ascSign: ascInfo.signCn, mcSign: signOf(mc).signCn,
    ascSignKey: ascInfo.signKey,
    ascSignIndex: ascInfo.signIndex,
    houses,
    aspects: calcAspects(planets),
    elements: countElements(planets),
  };
}

export function countElements(planets) {
  const count = { 火: 0, 土: 0, 风: 0, 水: 0 };
  const W = CONFIG.ELEMENT_WEIGHTS; // P19：权重集中于 CONFIG
  for (const [k, pl] of Object.entries(planets)) {
    const s = SIGNS[pl.signIndex];
    if (count[s.element] != null) count[s.element] += W[k] ?? 1;
  }
  return count;
}

/** 角差（0-180）：相位判定的基础几何量（astro-synastry.mjs 同源引用，O06 收敛单份） */
export function angDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** 相位计算：输入含 lon 的行星对象表 */
export function calcAspects(planets) {
  const keys = Object.keys(planets);
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = planets[keys[i]], b = planets[keys[j]];
      if (a.key === 'northnode' || b.key === 'northnode') continue; // 交点不参与相位（传统处理之一）ponytail: 后续可加交点相位开关
      const diff = angDiff(a.lon, b.lon);
      for (const asp of ASPECTS) {
        const orbMax = asp.orb + ((a.key === 'sun' || a.key === 'moon' || b.key === 'sun' || b.key === 'moon') ? asp.luminaryBonus : 0);
        const orb = Math.abs(diff - asp.angle);
        if (orb <= orbMax) {
          out.push({ a: a.key, aCn: a.cn, b: b.key, bCn: b.cn, aspect: asp.key, aspectCn: asp.cn, angle: asp.angle, orb: +orb.toFixed(2), color: asp.color });
          break; // 每对行星只取最接近的一种相位
        }
      }
    }
  }
  return out;
}

function pairId(x, y) { return x < y ? `${x}|${y}` : `${y}|${x}`; }

/**
 * 相位图形识别（保守：只在几何关系成立时输出，宁缺勿错）。
 * 检出：大十字（双对分轴 + 四刑）/ T 三角（对分轴 + 双刑）/ 大三角（三拱闭环）/ 群星（同星座 ≥3）。
 * 群星要求至少含一颗个人行星——否则木土天海冥同座是世代现象，人人都有，不构成个人配置。
 * 返回形状：[{ kind, planets: string[](行星 key), signCn?, element? }]
 */
export function detectPatterns(planets, aspects) {
  const P = Object.fromEntries(Object.entries(planets).filter(([k]) => k !== 'northnode'));
  const keys = Object.keys(P);
  const angleOf = new Map();
  for (const a of aspects) angleOf.set(pairId(a.a, a.b), a.angle);
  const has = (x, y, ang) => angleOf.get(pairId(x, y)) === ang;
  const out = [];

  // 群星：同星座 ≥3 且含个人行星（集合集中于 CONFIG.PERSONAL_SET，P19）
  const PERSONAL = new Set(CONFIG.PERSONAL_SET);
  const bySign = new Map();
  for (const k of keys) {
    if (!P[k].signKey) continue;
    if (!bySign.has(P[k].signKey)) bySign.set(P[k].signKey, []);
    bySign.get(P[k].signKey).push(k);
  }
  for (const [, group] of bySign) {
    if (group.length >= 3 && group.some((k) => PERSONAL.has(k))) {
      out.push({ kind: 'stellium', planets: group, signCn: P[group[0]].signCn });
    }
  }

  // 对分轴先收集
  const oppos = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) if (has(keys[i], keys[j], 180)) oppos.push([keys[i], keys[j]]);
  }

  // 大十字：两组互不相交的对分轴之间四刑齐备（含此结构的 T 三角不再重复报告）
  const crossed = new Set();
  for (let i = 0; i < oppos.length; i++) {
    for (let j = i + 1; j < oppos.length; j++) {
      const [a, b] = oppos[i], [c, d] = oppos[j];
      if (new Set([a, b, c, d]).size !== 4) continue;
      if (has(a, c, 90) && has(a, d, 90) && has(b, c, 90) && has(b, d, 90)) {
        out.push({ kind: 'grandCross', planets: [a, b, c, d] });
        for (const k of [a, b, c, d]) crossed.add(k);
      }
    }
  }

  // 大三角：三颗两两成拱（120° 步进必然同元素，元素自动一致）
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (!has(keys[i], keys[j], 120)) continue;
      for (let k = j + 1; k < keys.length; k++) {
        if (has(keys[i], keys[k], 120) && has(keys[j], keys[k], 120)) {
          out.push({ kind: 'grandTrine', planets: [keys[i], keys[j], keys[k]], element: P[keys[i]].signElement });
        }
      }
    }
  }

  // T 三角：对分轴 + 第三颗对两端皆刑
  for (const [a, b] of oppos) {
    if (crossed.has(a) && crossed.has(b)) continue;
    const apex = keys.find((c) => c !== a && c !== b && has(a, c, 90) && has(b, c, 90));
    if (apex) out.push({ kind: 'tSquare', planets: [a, b, apex] });
  }

  const order = { grandCross: 0, tSquare: 1, grandTrine: 2, stellium: 3 };
  return out.sort((x, y) => order[x.kind] - order[y.kind]);
}

/**
 * 某个本地日历日的正午 UTC 时刻（O09：消除页面各自硬编码 UTC 4:00 的双口径）。
 * @param {Date} date 本地时间（取其年月日）
 * @param {number} tzOffsetHours 标准时区偏移（东正），默认 8（北京时间）
 * @returns {Date} 该地正午对应的 UTC 时刻
 */
export function localNoonUtc(date, tzOffsetHours = 8) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0) - tzOffsetHours * 3600000);
}

/** 星座日期粗推（用于仅知道生日时反查太阳星座） */
export function sunSignByDate(month, day) {
  // 边界取 c 期通表：每月 21 日前后切换，摩羯跨年
  const bounds = [20, 19, 21, 20, 21, 21, 23, 23, 23, 23, 22, 22]; // 每月切换日（进入下一个星座的日界）
  const order = ['capricorn', 'aquarius', 'pisces', 'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn'];
  // month m: 1..12。日界前为 order[m-1]，之后为 order[m]
  return day < bounds[month - 1] ? order[month - 1] : order[month];
}

// ---------- 每日星象运势（确定性评分，因子全部透明列出） ----------

const RULER_KEY = { 火星: 'mars', 金星: 'venus', 水星: 'mercury', 月亮: 'moon', 太阳: 'sun', 冥王星: 'pluto', 木星: 'jupiter', 土星: 'saturn' };
// 行星性质：吉 / 煞 / 中性
const NATURE = { venus: '吉', jupiter: '吉', sun: '光', moon: '光', mercury: '中', uranus: '中', neptune: '中', mars: '煞', saturn: '煞', pluto: '煞' };
const ASPECT_WEIGHT = { trine: 1.0, sextile: 0.7, conj: 0.5, opp: -0.8, square: -1.0 };

function transitScore(aspectKey, planetKey) {
  const nature = NATURE[planetKey] || '中';
  const w = ASPECT_WEIGHT[aspectKey] ?? 0;
  if (w === 0) return 0;
  let m = 1;
  if (nature === '吉') m = 1.2;
  else if (nature === '光') m = 1.0;
  else if (nature === '煞') m = w > 0 ? 0.8 : 1.3;
  return +(w * m * 10).toFixed(1);
}

/** 纬度截断辅助：把维度值约束到每维 0-4 */
const clampDim = (v) => Math.max(0, Math.min(4, v));
const round1 = (x) => Math.round(x * 10) / 10;

/**
 * 12 星座每日运势：以各星座守护星当日所受行运相位 + 月亮元素相合 + 水星逆行为因子。
 * O04：保留 score/level/factors 骨架，叠加五维 dimensions（总/爱/事业/财/健康，语料
 * horoscope-writing-patterns.md 口径：每维 0-4、总和约束 [14,19]、越界等比缩放）。
 * @param {Date} dateUTC
 * @param {object} fw fortune-weights.json 内容（dimensions/transitWeights/dimensionRules/discipline）
 * @returns {Array<{signKey, signCn, score, level, factors: string[], dimensions: object}>}
 */
export function dailyFortune(dateUTC, fw) {
  if (!fw?.transitWeights || !fw?.dimensionRules || !Array.isArray(fw.dimensions)) {
    throw new Error('dailyFortune 需要第二参数传入 fortune-weights.json 内容');
  }
  const sky = computeSky(dateUTC);
  const planets = sky.planets;
  const aspectPairs = calcAspects(planets); // 同盘内行星相位 → 即当日行运彼此相位
  const moonElement = planets.moon.signElement;
  const { min, max, base, scale } = fw.discipline;

  return SIGNS.map((s) => {
    let score = 60;
    const factors = [];
    const rulerKey = RULER_KEY[s.ruler];
    // 五维原始值：从中性基线出发，由行运因子推拉
    const raw = Object.fromEntries(fw.dimensions.map((d) => [d, base]));
    // 1) 守护星当日所受相位（同时按对方的维度归属投影到五维）
    for (const asp of aspectPairs) {
      const other = asp.a === rulerKey ? asp.bCn : asp.b === rulerKey ? asp.aCn : null;
      if (!other) continue; // calcAspects 保证 i<j，相位对两侧必不相同（P16：原恒假的 asp.a===asp.b 判断已删）
      const otherKey = asp.a === rulerKey ? asp.b : asp.a;
      const delta = transitScore(asp.aspect, otherKey);
      if (!delta) continue; // 收录但无权重因子的相位（如 150°/30°）不产出「+0」噪音因子
      score += delta;
      factors.push(`${other}${asp.aspectCn}守护星${s.ruler}（${delta > 0 ? '+' : ''}${delta}）`);
      // 维度投影：净值归一（±13 满幅）× 行星权重（满格 5）× 缩放常数
      const contrib = (delta / 13) * ((fw.transitWeights[otherKey] ?? 2) / 5) * scale;
      for (const dim of fw.dimensionRules[otherKey] ?? []) raw[dim] += contrib;
    }
    // 2) 月亮元素与星座元素相合 → 总分；健康维（情绪身心）随动
    if (moonElement === s.element) {
      score += 5;
      raw.health += 0.6;
      factors.push(`月亮入${moonElement}象，与${s.cn}同象（+5）`);
    } else if ((moonElement === '火' && s.element === '水') || (moonElement === '水' && s.element === '火') || (moonElement === '风' && s.element === '土') || (moonElement === '土' && s.element === '风')) {
      score -= 4;
      raw.health -= 0.8;
      factors.push(`月亮入${moonElement}象，与${s.cn}相冲（-4）`);
    }
    // 3) 水星逆行（沟通/出行减分 → 事务维承压）
    if (planets.mercury.retrograde) {
      score -= 3;
      raw.career -= 0.5;
      factors.push('水星逆行，沟通出行易有反复（-3）');
    }
    // 4) 守护星自身逆行（→ 总体维承压）
    if (planets[rulerKey] && planets[rulerKey].retrograde) {
      score -= 4;
      raw.total -= 0.5;
      factors.push(`守护星${s.ruler}逆行（-4）`);
    }
    score = Math.max(20, Math.min(95, Math.round(score)));
    const level = score >= 75 ? '旺' : score >= 60 ? '顺' : score >= 45 ? '平' : '滞';

    // 评分平衡纪律：逐维截断 0-4 后，总和等比缩放回 [min,max]（缩小时单次到位；放大时单调收敛）
    for (const d of fw.dimensions) raw[d] = clampDim(raw[d]);
    let sum = fw.dimensions.reduce((a, d) => a + raw[d], 0);
    if (sum > max) {
      const k = max / sum;
      for (const d of fw.dimensions) raw[d] *= k;
    } else if (sum < min) {
      let guard = 0;
      while (sum < min && guard++ < 60) {
        const k = Math.min(4, min / Math.max(sum, 0.1)); // 放大系数（钳制防除零过冲）
        for (const d of fw.dimensions) raw[d] = Math.min(4, raw[d] * k);
        sum = fw.dimensions.reduce((a, d) => a + raw[d], 0);
      }
      if (sum < min) for (const d of fw.dimensions) raw[d] = 4; // 理论不可达的兜底
    }
    // 保留 1 位小数；舍入漂移用 0.1 步进回补，确保总和仍落在纪律区间。
    // 回补候选只在合法值域内挑选（P-QA1：原实现取全维最大者，恰为 4.0 时会加出 4.1 越界）：
    // 加分只在值 < 4 的维度、减分只在值 > 0 的维度——候选恒存在（总和越界 ⇔ 必有未饱和/非零维），确定性不变。
    const dimensions = Object.fromEntries(fw.dimensions.map((d) => [d, round1(raw[d])]));
    let rsum = round1(fw.dimensions.reduce((a, d) => a + dimensions[d], 0));
    let guard = 0;
    while (rsum < min && guard++ < 20) {
      const d = fw.dimensions.reduce((best, x) => {
        if (dimensions[x] >= 4) return best;                 // 已达上限，不作为加分候选
        return best === null || dimensions[x] > dimensions[best] ? x : best;
      }, null);
      if (d === null) break; // 防御：全维饱和而总和仍越界（纪律区间与值域矛盾时应视为数据错误，不静默产出越界值）
      dimensions[d] = round1(dimensions[d] + 0.1);
      rsum = round1(rsum + 0.1);
    }
    while (rsum > max && guard++ < 40) {
      const d = fw.dimensions.reduce((best, x) => {
        if (dimensions[x] <= 0) return best;                 // 已达下限，不作为减分候选
        return best === null || dimensions[x] < dimensions[best] ? x : best;
      }, null);
      if (d === null) break; // 防御：全维归零而总和仍越界
      dimensions[d] = round1(dimensions[d] - 0.1);
      rsum = round1(rsum - 0.1);
    }

    return { signKey: s.key, signCn: s.cn, score, level, factors, dimensions };
  });
}
