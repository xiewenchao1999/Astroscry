// bazi.mjs — 八字四柱核心计算（纯函数，无 DOM / 无网络）
// 依赖：vendor/lunar.js 在宿主环境暴露的 globalThis.{Lunar,Solar,LunarUtil}
//   浏览器：<script src="../vendor/lunar.js"> 自动挂全局；Node 测试：createRequire 载入后注入 globalThis
// 输入为原始值，输出结构化对象；解读文案映射见 data/interpret-bazi.json

const GAN_WUXING = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const ZHI_WUXING = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const ZHI_ANIMAL = { 子: '鼠', 丑: '牛', 寅: '虎', 卯: '兔', 辰: '龙', 巳: '蛇', 午: '马', 未: '羊', 申: '猴', 酉: '鸡', 戌: '狗', 亥: '猪' };

// 真太阳时校正（仅经度差，中国标准时区中央经线 120°E）
// ponytail: 忽略均时差（±16 分钟量级），时辰边界 ±30 分钟内误判概率低；升级路径：astronomy-engine 太阳时角算视太阳时
export function solarTimeCorrection(hhmm, longitude) {
  if (longitude == null) return { corrected: hhmm, minutes: 0 };
  const offsetMin = Math.round((longitude - 120) * 4);
  const [h, m] = hhmm.split(':').map(Number);
  const total = ((h * 60 + m + offsetMin) % 1440 + 1440) % 1440;
  const pad = (n) => String(n).padStart(2, '0');
  return { corrected: `${pad(Math.floor(total / 60))}:${pad(total % 60)}`, minutes: offsetMin };
}

function pillarInfo(ganZhi, dayGan, LunarUtil) {
  const gan = ganZhi[0];
  const zhi = ganZhi[1];
  const hides = LunarUtil.ZHI_HIDE_GAN[zhi] || [];
  const shiShen = (g) => (g === dayGan ? '日主' : (LunarUtil.SHI_SHEN[dayGan + g] || ''));
  return {
    ganZhi,
    gan, zhi,
    ganWuXing: GAN_WUXING[gan],
    zhiWuXing: ZHI_WUXING[zhi],
    naYin: LunarUtil.NAYIN[ganZhi] || '',
    ganShiShen: shiShen(gan),
    hideGans: hides.map((hg) => ({ gan: hg, wuXing: GAN_WUXING[hg], shiShen: shiShen(hg) })),
    animal: ZHI_ANIMAL[zhi],
  };
}

function countFiveElements(pillars) {
  const count = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 };
  for (const p of pillars) {
    count[p.ganWuXing]++;
    count[p.zhiWuXing]++;
    // ponytail: 藏干按全量计数（不分本气/中气权重），升级路径：加权统计
    for (const h of p.hideGans) count[h.wuXing]++;
  }
  return count;
}

/**
 * 排八字。
 * @param {object} input {year,month,day,hour,minute, gender:'male'|'female', longitude?:number}
 */
export function castBazi(input) {
  const { Lunar, Solar, LunarUtil } = globalThis;
  if (!Lunar || !Solar || !LunarUtil) throw new Error('vendor lunar.js not loaded');
  const solar = Solar.fromYmdHms(input.year, input.month, input.day, input.hour || 0, input.minute || 0, 0);
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();
  const dayGan = ec.getDay()[0];

  const pillars = {
    year: pillarInfo(ec.getYear(), dayGan, LunarUtil),
    month: pillarInfo(ec.getMonth(), dayGan, LunarUtil),
    day: pillarInfo(ec.getDay(), dayGan, LunarUtil),
    time: pillarInfo(ec.getTime(), dayGan, LunarUtil),
  };

  // 大运：男阳女阴顺排、男阴女阳逆排；DaYun[0] 为起运前，其后 getStartAge（周岁）起每 10 年一步
  const yun = ec.getYun(input.gender === 'male' ? 1 : 0);
  const rawDaYun = yun.getDaYun();
  const daYun = [{ index: 0, ganZhi: '', label: '起运前', startAge: 0, startYear: input.year }];
  for (let i = 1; i < Math.min(rawDaYun.length, 9); i++) {
    const dy = rawDaYun[i];
    daYun.push({ index: i, ganZhi: dy.getGanZhi(), label: '大运', startAge: dy.getStartAge(), startYear: dy.getStartYear() });
  }

  const hhmm = `${String(input.hour || 0).padStart(2, '0')}:${String(input.minute || 0).padStart(2, '0')}`;
  const solarCorrection = input.longitude != null ? solarTimeCorrection(hhmm, input.longitude) : null;

  return {
    input,
    solar: { date: `${input.year}-${String(input.month).padStart(2, '0')}-${String(input.day).padStart(2, '0')}`, time: hhmm },
    lunar: {
      text: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
      leapMonth: lunar.getMonth() < 0,
    },
    animal: lunar.getYearShengXiao(),
    dayGan,
    dayGanWuXing: GAN_WUXING[dayGan],
    pillars,
    fiveElements: countFiveElements(Object.values(pillars)),
    taiYuan: ec.getTaiYuan(),
    mingGong: ec.getMingGong(),
    shenGong: ec.getShenGong(),
    xun: ec.getDayXun(),
    xunKong: ec.getDayXunKong(),
    qiYun: { years: yun.getStartYear(), months: yun.getStartMonth(), days: yun.getStartDay(), solar: yun.getStartSolar().toYmd() },
    daYun,
    solarCorrection,
  };
}
