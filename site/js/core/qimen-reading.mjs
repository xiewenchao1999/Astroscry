// qimen-reading.mjs — 奇门流程化读盘引擎（规则层，无 AI）
// 输入 castQimen 输出 + interpret-qimen.json 语料，输出流程化步骤与结论。
// 长文案全部来自语料（labels/titles/panYan/summaryTpl），本模块只做数据拼装。
// ponytail: 暂不识别门迫/击刑/入墓等深层格局（同 core/qimen.mjs 注），升级路径=在 steps 追加 key。

const GONG_CN = '一二三四五六七八九';
const GONG_DIR = { 1: '北', 2: '西南', 3: '东', 4: '东南', 5: '中', 6: '西北', 7: '西', 8: '东北', 9: '南' };

const gongName = (p) => `${GONG_CN[p - 1]}宫`;
const PALACES = (q) => Object.keys(q.palaces).map(Number).filter((p) => p !== 5);
const findDoor = (q, door) => PALACES(q).filter((p) => q.palaces[p].door === door);
const findGod = (q, god) => PALACES(q).filter((p) => q.palaces[p].god === god);
const findStar = (q, star) => PALACES(q).filter((p) => q.palaces[p].stars.includes(star));
const findStem = (q, gan) => PALACES(q).filter((p) => q.palaces[p].tg.includes(gan) || q.earth[p].includes(gan));
const toneOf = (jx) => (jx.includes('凶') ? 'bad' : jx.includes('吉') ? 'good' : undefined);

/**
 * 流程化读盘：识局 → 盘眼 → 用神 → 举要 → 阻隔。
 * @param {object} q castQimen 输出
 * @param {object} interp interpret-qimen.json 语料
 * @param {string} topic 所问之事（general|career|wealth|marriage|health）：把对应用神提到最前并标记 focused；
 *                       未选或未知一律按原序输出（默认行为与旧版完全一致）
 * @returns {{ summary: string, steps: Array<{key: string, items: Array<{label: string, value: string, tone?: string, focused?: boolean}>}> }}
 */
export function readQimen(q, interp, topic = 'general') {
  const R = interp.reading;
  const zf = interp.stars[q.zhiFuStar];
  const zs = interp.doors[q.zhiShiDoor];

  // 盘眼总判：值符星 + 值使门 吉凶组合三档
  const badCount = [zf.jx, zs.jx].filter((j) => j.includes('凶')).length;
  const panYan = badCount === 0 ? R.panYanGood : badCount === 2 ? R.panYanBad : R.panYanMix;

  const steps = [
    {
      key: 'ju',
      items: [
        { label: R.lJu, value: `${q.juName}（${q.term} · ${q.yuan}）` },
        { label: R.lFutou, value: `符头${q.fuTou} · 旬首${q.xunShou}遁${q.xunShouGan}` },
        { label: R.lPillars, value: `${q.pillars.year} ${q.pillars.month} ${q.pillars.day} ${q.pillars.time}` },
      ],
    },
    {
      key: 'eyes',
      items: [
        { label: R.lZhiFu, value: `${q.zhiFuStar}（${zf.jx}）落${gongName(q.zhiFuPalace)} · ${zf.desc}`, tone: toneOf(zf.jx) },
        { label: R.lZhiShi, value: `${q.zhiShiDoor}（${zs.jx}）落${gongName(q.zhiShiPalace)} · ${zs.desc}`, tone: toneOf(zs.jx) },
        { label: R.lPanYan, value: panYan, tone: badCount === 0 ? 'good' : badCount === 2 ? 'bad' : undefined },
      ],
    },
  ];

  // 第三步 · 按问取用神：领域 → 用神落宫（不存在的用神不上行）
  const kai = findDoor(q, '开门')[0];
  const sheng = findDoor(q, '生门')[0];
  const liuhe = findGod(q, '六合')[0];
  const rui = findStar(q, '天芮')[0];
  const xin = findStar(q, '天心')[0];
  const wu = findStem(q, '戊')[0];
  const yi = findStem(q, '乙')[0];
  const geng = findStem(q, '庚')[0];
  const on = (p) => (p ? `落${gongName(p)}宫，利${GONG_DIR[p]}方` : '不上盘');
  // 用神四项：按所问之事把对应项提到最前并标记（未选/未知则原序，行为与旧版一致）
  const yongshen = [
    { k: 'career', label: R.yCareer, value: `开门${on(kai)}`, tone: kai ? 'good' : undefined },
    { k: 'wealth', label: R.yWealth, value: `生门${on(sheng)}；戊${wu ? `落${gongName(wu)}宫` : '不上盘'}`, tone: sheng ? 'good' : undefined },
    { k: 'marriage', label: R.yMarriage, value: `六合${on(liuhe)}；乙${yi ? `落${gongName(yi)}宫` : '不上盘'}、庚${geng ? `落${gongName(geng)}宫` : '不上盘'}` },
    { k: 'health', label: R.yHealth, value: `天芮${on(rui)}；天心${xin ? `落${gongName(xin)}宫` : '不上盘'}`, tone: rui ? 'bad' : undefined },
  ];
  const hasTopic = yongshen.some((x) => x.k === topic);
  const ordered = hasTopic
    ? [{ ...yongshen.find((x) => x.k === topic), focused: true }, ...yongshen.filter((x) => x.k !== topic)]
    : yongshen;
  steps.push({
    key: 'yongshen',
    items: ordered.map(({ label, value, tone, focused }) => ({ label, value, tone, focused: !!focused })),
  });

  // 第四步 · 全盘吉凶举要：八门按吉/凶/平分列落宫
  const buckets = { good: [], bad: [], mid: [] };
  for (const p of PALACES(q)) {
    const d = q.palaces[p].door;
    const jx = interp.doors[d].jx;
    (jx.includes('凶') ? buckets.bad : jx.includes('吉') ? buckets.good : buckets.mid).push(`${d}（${gongName(p)}）`);
  }
  steps.push({
    key: 'overview',
    items: [
      { label: R.lGoodDoors, value: buckets.good.join('、') || '无', tone: buckets.good.length ? 'good' : undefined },
      { label: R.lBadDoors, value: buckets.bad.join('、') || '无', tone: buckets.bad.length ? 'bad' : undefined },
      { label: R.lMidDoors, value: buckets.mid.join('、') || '无' },
    ],
  });

  // 第五步 · 阻隔之干：天盘庚所在即阻力所在（庚为奇门最凶之干）
  if (geng) {
    steps.push({
      key: 'jingeng',
      items: [
        { label: R.lGeng, value: `庚落${gongName(geng)}宫（${GONG_DIR[geng]}方）`, tone: 'bad' },
        { label: R.lGengNote, value: interp.stems.庚 },
      ],
    });
  }

  const summary = R.summaryTpl
    .replace('{zfx}', q.zhiFuStar)
    .replace('{zsm}', q.zhiShiDoor)
    .replace('{panYan}', panYan);
  return { summary, steps };
}
