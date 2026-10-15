// qimen.mjs — 奇门遁甲时家排盘核心（转盘法 · 拆补定局，纯函数，无 DOM / 无网络）
// 依赖：vendor/lunar.js（四柱，globalThis.Lunar/Solar）+ vendor/astronomy.min.js（太阳视黄经定节气，globalThis.Astronomy）
// 口径（已对照 kinqimen 参考实现核对）：拆补法定局；地盘戊落局宫阳顺阴逆；
//   值符随时干（甲时用旬首遁干）；值使从旬首宫按宫序逐时辰飞（过中宫照数，落中寄坤二）；
//   星门为刚性轮盘（宫序 1-8-3-4-9-2-7-6）；八神值符宫起阳顺阴逆。
// ponytail: 流派固定为「时家·转盘·拆补·中宫寄坤二·八神取白虎玄武派」；
//   未实现 置闰法/茅山法/飞盘法/暗干/击刑入墓/门迫 等参数与格局，升级路径为 castQimen 增加 school 选项并扩格局层

export const TERMS = ['冬至', '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪'];

/** 每节气 [上元, 中元, 下元] 局数（经典口诀：冬至惊蛰一七四，小寒二八五，大寒春分三九六，雨水九六三……大雪四七一） */
export const JU_TABLE = {
  冬至: [1, 7, 4], 小寒: [2, 8, 5], 大寒: [3, 9, 6], 立春: [8, 5, 2], 雨水: [9, 6, 3], 惊蛰: [1, 7, 4],
  春分: [3, 9, 6], 清明: [4, 1, 7], 谷雨: [5, 2, 8], 立夏: [4, 1, 7], 小满: [5, 2, 8], 芒种: [6, 3, 9],
  夏至: [9, 3, 6], 小暑: [8, 2, 5], 大暑: [7, 1, 4], 立秋: [2, 5, 8], 处暑: [1, 4, 7], 白露: [9, 3, 6],
  秋分: [7, 1, 4], 寒露: [6, 9, 3], 霜降: [5, 8, 2], 立冬: [6, 9, 3], 小雪: [5, 8, 2], 大雪: [4, 7, 1],
};

const GAN = '甲乙丙丁戊己庚辛壬癸';
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
const STEMS = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙']; // 六仪+三奇，甲遁于六仪之下
const WHEEL = [1, 8, 3, 4, 9, 2, 7, 6]; // 转盘顺时针宫序（不含中宫 5）
const HOME_STAR = { 1: '天蓬', 8: '天任', 3: '天冲', 4: '天辅', 9: '天英', 2: '天芮', 7: '天柱', 6: '天心' };
const HOME_DOOR = { 1: '休门', 8: '生门', 3: '伤门', 4: '杜门', 9: '景门', 2: '死门', 7: '惊门', 6: '开门' };
const GODS = ['值符', '腾蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天'];
const XUN_SHOU = { 0: ['甲子', '戊'], 10: ['甲戌', '己'], 20: ['甲申', '庚'], 30: ['甲午', '辛'], 40: ['甲辰', '壬'], 50: ['甲寅', '癸'] };
const JU_CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const YUAN_CN = ['上元', '中元', '下元'];

const zhiIdx = (z) => ZHI.indexOf(z);

/** 六十甲子序（甲子=0）；干支序号奇偶一致，必有唯一解 */
function jiaziIdx(gz) {
  const g = GAN.indexOf(gz[0]), z = zhiIdx(gz[1]);
  for (let k = 0; k < 6; k++) { const n = g + 10 * k; if (n % 12 === z) return n; }
  throw new Error(`非法干支 ${gz}`);
}

/** 太阳视黄经（true equinox of date）→ 节气序号：0=冬至，每 15° 一气；节气时刻按时区换算 */
function termIndexAt(year, month, day, hour, minute, tzOffsetHours) {
  const A = globalThis.Astronomy;
  if (!A) throw new Error('vendor astronomy.min.js not loaded');
  const instant = new Date(Date.UTC(year, month - 1, day, hour, minute) - tzOffsetHours * 3600e3);
  return Math.floor(((A.SunPosition(instant).elon - 270 + 360) % 360) / 15) % 24;
}

/** 拆补定元：日柱向前找最近甲/己符头；符头支 子午卯酉上元、寅申巳亥中元、辰戌丑未下元 */
function findFuTou(dayGz) {
  const dn = jiaziIdx(dayGz);
  const rem = dn % 10;
  const fuTou = dn - (rem >= 5 ? rem - 5 : rem);
  const z = fuTou % 12;
  const yuan = [0, 3, 6, 9].includes(z) ? 0 : [2, 5, 8, 11].includes(z) ? 1 : 2;
  return { fuTou: `${GAN[fuTou % 10]}${ZHI[z]}`, yuan };
}

function palaceOf(earth, gan) {
  const p = Object.keys(earth).find((k) => earth[k] === gan);
  if (!p) throw new Error(`地盘无干 ${gan}`);
  return +p;
}

/**
 * 时家奇门排盘（转盘法·拆补）。
 * @param {object} input {year,month,day,hour,minute} 问局时刻（本地钟表时）
 * @param {number} [tzOffsetHours=8] 标准时区偏移（东正）。
 *   ponytail: 奇门口径（干支四柱/符头/局数口诀）当前仅按北京时间（UTC+8）设计验证，
 *   其余时区未核验流派差异，升级路径=跨时区命例基准补齐后再开放页面入口。
 */
export function castQimen(input, tzOffsetHours = 8) {
  const { Lunar, Solar } = globalThis;
  if (!Lunar || !Solar) throw new Error('vendor lunar.js not loaded');
  const { year, month, day, hour = 0, minute = 0 } = input;
  const solar = Solar.fromYmdHms(year, month, day, hour, minute, 0);
  const ec = solar.getLunar().getEightChar();
  const pillars = { year: ec.getYear(), month: ec.getMonth(), day: ec.getDay(), time: ec.getTime() };

  const tIdx = termIndexAt(year, month, day, hour, minute, tzOffsetHours);
  const term = TERMS[tIdx];
  const yang = tIdx < 12; // 冬至~芒种阳遁，夏至~大雪阴遁
  const { fuTou, yuan } = findFuTou(pillars.day);
  const ju = JU_TABLE[term][yuan];

  // 地盘：戊落局数宫，阳遁顺布、阴遁逆布六仪三奇
  const earth = {};
  STEMS.forEach((s, i) => {
    earth[yang ? ((ju - 1 + i) % 9) + 1 : ((ju - 1 - i) % 9 + 9) % 9 + 1] = s;
  });

  // 旬首（时柱所在旬）与遁干
  const tn = jiaziIdx(pillars.time);
  const [xunShou, xunGan] = XUN_SHOU[tn - (tn % 10)];

  const homeP = palaceOf(earth, xunGan);        // 旬首遁干之地盘宫（可为中宫 5）
  const homeWheel = homeP === 5 ? 2 : homeP;    // 中宫寄坤二
  const zhiFuStar = HOME_STAR[homeWheel] + (homeP === 5 ? '（天禽寄）' : '');
  const zhiShiDoor = HOME_DOOR[homeWheel];

  // 天盘九星：值符随时干；时干为甲用旬首遁干（伏吟）；时干落中宫寄 2
  const hourGan = pillars.time[0] === '甲' ? xunGan : pillars.time[0];
  const zhiFuPalace = palaceOf(earth, hourGan) === 5 ? 2 : palaceOf(earth, hourGan);
  const ks = (WHEEL.indexOf(zhiFuPalace) - WHEEL.indexOf(homeWheel) + 8) % 8;
  const palaces = {};
  WHEEL.forEach((p) => { palaces[p] = {}; });
  WHEEL.forEach((home, h) => {
    const p = WHEEL[(h + ks) % 8];
    const star = HOME_STAR[home];
    // 天芮宫携天禽（寄）与其两地盘干
    palaces[p].stars = star === '天芮' ? ['天芮', '天禽'] : [star];
    palaces[p].tg = star === '天芮' ? `${earth[2]}${earth[5]}` : earth[home];
  });

  // 值使门飞宫：旬首宫起，阳顺阴逆按宫序数每时辰一格（过中宫照数），落中寄 2
  const steps = (zhiIdx(pillars.time[1]) - zhiIdx(xunShou[1]) + 12) % 12;
  const land = yang ? ((homeP - 1 + steps) % 9) + 1 : ((homeP - 1 - steps) % 9 + 9) % 9 + 1;
  const zhiShiPalace = land === 5 ? 2 : land;
  const kd = (WHEEL.indexOf(zhiShiPalace) - WHEEL.indexOf(homeWheel) + 8) % 8;
  WHEEL.forEach((home, h) => {
    palaces[WHEEL[(h + kd) % 8]].door = HOME_DOOR[home];
  });

  // 八神：值符宫起，阳遁顺时针、阴遁逆时针
  const gi = WHEEL.indexOf(zhiFuPalace);
  WHEEL.forEach((_, h) => {
    palaces[WHEEL[(gi + (yang ? h : 8 - h) % 8) % 8]].god = GODS[h];
  });

  palaces[5] = { dg: earth[5], note: '中宫 · 天禽寄坤二' };

  return {
    input, pillars,
    dun: yang ? '阳' : '阴',
    juName: `${yang ? '阳' : '阴'}遁${JU_CN[ju]}局`,
    ju, term, yuan: YUAN_CN[yuan], fuTou,
    xunShou, xunShouGan: xunGan,
    zhiFuStar, zhiFuPalace, zhiShiDoor, zhiShiPalace,
    earth, palaces,
  };
}
