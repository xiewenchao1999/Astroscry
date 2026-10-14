// ziwei.mjs — 紫微斗数核心计算（纯函数，无 DOM / 无网络）
// 依赖：vendor/iztro.min.js 暴露的 globalThis.iztro（浏览器 <script>；Node 测试垫片注入）
// 输出结构化命盘；解读文案映射见 data/interpret-ziwei.json

/**
 * 时辰索引：0=早子 1=丑 … 11=亥 12=晚子（iztro 约定）
 */
export function toTimeIndex(hour) {
  if (hour === 23) return 12;
  return Math.max(0, Math.floor((hour + 1) / 2));
}

/**
 * 排紫微命盘。
 * @param {object} input {year,month,day,hour,minute?, gender:'male'|'female', leapMonth?:boolean}
 */
export function castZiwei(input) {
  const iztro = globalThis.iztro;
  if (!iztro) throw new Error('vendor iztro.min.js not loaded');
  const dateStr = `${input.year}-${input.month}-${input.day}`;
  const ast = iztro.astro.bySolar(dateStr, toTimeIndex(input.hour || 0), input.gender === 'male' ? '男' : '女', true, 'zh-CN');

  const palaces = ast.palaces.map((p) => ({
    index: p.index,
    name: p.name,
    stemBranch: (p.heavenlyStem || '') + (p.earthlyBranch || ''),
    earthlyBranch: p.earthlyBranch,
    isBodyPalace: !!p.isBodyPalace,
    majorStars: p.majorStars.map((s) => ({ name: s.name, brightness: s.brightness || '', mutagen: s.mutagen || '' })),
    minorStars: p.minorStars.map((s) => ({ name: s.name, mutagen: s.mutagen || '' })),
    adjectiveStars: p.adjectiveStars.map((s) => s.name),
    decadal: p.decadal ? { range: p.decadal.range, stemBranch: (p.decadal.heavenlyStem || '') + (p.decadal.earthlyBranch || '') } : null,
    changsheng12: p.changsheng12,
  }));

  return {
    input,
    solarDate: ast.solarDate,
    lunarDate: ast.lunarDate,
    chineseDate: ast.chineseDate, // 四柱干支（字符串组）
    timeText: `${ast.time} ${ast.timeRange}`,
    sign: ast.sign,
    zodiac: ast.zodiac,
    soul: ast.soul,       // 命主
    body: ast.body,       // 身主
    fiveElementsClass: ast.fiveElementsClass,
    soulPalaceBranch: ast.earthlyBranchOfSoulPalace,
    bodyPalaceBranch: ast.earthlyBranchOfBodyPalace,
    palaces,
    mingGong: palaces.find((p) => p.name === '命宫'),
    shenGong: palaces.find((p) => p.isBodyPalace),
  };
}

/**
 * 运限：指定日期所在大限/流年（含四化星）。
 */
export function ziweiHoroscope(castInput, dateISO) {
  const iztro = globalThis.iztro;
  if (!iztro) throw new Error('vendor iztro.min.js not loaded');
  const dateStr = `${castInput.year}-${castInput.month}-${castInput.day}`;
  const ast = iztro.astro.bySolar(dateStr, toTimeIndex(castInput.hour || 0), castInput.gender === 'male' ? '男' : '女', true, 'zh-CN');
  const hor = ast.horoscope(dateISO);
  const brief = (x) => x && ({
    index: x.index,
    stemBranch: (x.heavenlyStem || '') + (x.earthlyBranch || ''),
    mutagen: x.mutagen || [],
    palaceNames: x.palaceNames || [],
  });
  return {
    date: dateISO,
    decadal: brief(hor.decadal),
    yearly: brief(hor.yearly),
    age: hor.age ? { index: hor.age.index, nominalAge: hor.age.nominalAge, stemBranch: (hor.age.heavenlyStem || '') + (hor.age.earthlyBranch || '') } : null,
  };
}
