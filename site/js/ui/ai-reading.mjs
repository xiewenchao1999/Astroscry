// ai-reading.mjs — AI 边界模块（唯一可把排盘数据组织成「会离开浏览器」文本的地方，ADR-002/003）
// 依赖方向：仅 ui/pages 可 import；core/data 禁止依赖本模块
// 两条出口：
//   ① 站内流式解读（opt-in：用户开启并自供 key 时 fetch，「例外一」）
//   ② 复制提示词（零网络：只写剪贴板，「例外二」）—— 两条出口共用同一份约束文本，避免解读质量漂移
// 协议：兼容主流流式对话协议的 SSE 增量格式；fetch 参数全部运行时变量，源码无硬编码外部 URL

import { loadAIConfig, aiEnabled } from './ai-settings.mjs';

const DOMAINS = {
  qimen: '奇门遁甲盘（九宫格：每宫含八神/九星/八门/天地盘干，值符值使为盘眼）',
  bazi: '八字四柱盘（年月日时四柱、十神、五行强弱、格局）',
  ziwei: '紫微斗数命盘（十二宫，含主星辅星与四化）',
  natal: '西方占星本命盘（行星落座落宫、相位、上升点）',
  horoscope: '西方占星每日行运（当日行星天象与十二星座运势评分）',
  tarot: '塔罗牌阵（每张牌的位置职责、牌名与正逆位）',
  synastry: '西方占星合盘（双方行星跨盘相位、契合度评分、宫位叠加）',
  daily: '今日综合盘（星座运势、今日八字宜忌、紫微运限、奇门时局、塔罗日签的当日汇总）',
};

export function domainLabel(domain) { return DOMAINS[domain]; }

// 解读约束（站内流式与复制提示词共用同一份，单一事实来源）
// 口径来自开源项目方法论：先声明口径、先人话后术语、不展示推理链、禁恐吓式语言、高风险附现实路径（见 docs/research/开源项目调研-提示词与语料.md）
export const INTERPRET_RULES = [
  '【解读要求】',
  '1) 先声明口径：说明本次解读基于哪一套体系与默认项；若结论依赖流派选择或默认规则，先说清楚再下结论。',
  '2) 先复述已确认信息（盘面类型、用户问题），再给判断。',
  '3) 盘面摘要只说关键结论，不要堆砌术语；术语第一次出现时用一句话解释。',
  '4) 不要展示完整推理链，只给出用户看得懂的关键依据。',
  '5) 结论要明确，但语气保持平和；禁止恐吓式语言（如「必败」「必死」「无救」）。',
  '6) 涉及疾病、法律、重大投资等高风险话题时，必须同时建议咨询现实中的专业人士，不得替代专业意见。',
  '7) 用简体中文，条理清晰，通俗易懂。',
  '8) 末尾附一句免责声明：「本解读仅供文化参考，不构成任何现实决策依据。」',
].join('\n');

export const OUTPUT_SHAPE = '【建议输出结构】一、已确认信息 → 二、口径与默认项 → 三、盘面摘要 → 四、关键依据 → 五、核心判断 → 六、可执行建议 → 七、风险提醒与免责';

const DATA_ORIGIN = '【数据来源】以下盘面数据由确定性算法在用户浏览器本地算出，未经任何 AI 参与。你只负责解读：不得改动、重算或补全盘面数据，也不得虚构数据中未出现的信息。';

function systemFor(domain, combined = false) {
  const desc = DOMAINS[domain];
  if (!desc) throw new Error(`AI 解读暂未支持 ${domain} 领域`);
  const role = combined
    ? '你是命理解读助手。用户先后在多个体系排盘，请综合所有盘面给出整体解读：指出相互印证或矛盾之处；各体系口径独立，不强行混算。'
    : `你是命理解读助手。用户排的是${desc}。`;
  return [role, DATA_ORIGIN, INTERPRET_RULES, OUTPUT_SHAPE].join('\n');
}

/** 单页站内流式解读用的 messages（opt-in 出口，原路不变） */
export function buildMessages(domain, structured, question) {
  const desc = DOMAINS[domain];
  if (!desc) throw new Error(`AI 解读暂未支持 ${domain} 领域`);
  return [
    { role: 'system', content: systemFor(domain) },
    { role: 'user', content: `盘面类型：${desc}\n排盘数据（JSON）：\n${JSON.stringify(structured)}\n\n用户问题：${question || '请综合解读这一盘面'}` },
  ];
}

/**
 * 复制提示词的隐私抬头：让用户在粘贴前意识到内容含出生数据。
 * 与 systemFor 分离，因为站内流式解读不需要这句话（用户本来就在自己开的会话里）。
 */
const COPY_NOTICE = '【使用说明】以下内容包含你的出生/排盘数据。请仅粘贴到你信任的对话工具中；粘贴即代表你主动把这些数据带出了本站，本站自身不会向任何服务器发送它们。';

/** 跨页综合解读用的 messages（opt-in 出口） */
export function buildCombinedMessages(sources, question) {
  const parts = combinedParts(sources);
  return [
    { role: 'system', content: systemFor('daily', true) },
    { role: 'user', content: `${parts}\n\n用户问题：${question || '请综合以上全部盘面给出整体解读建议'}` },
  ];
}

function combinedParts(sources) {
  if (!sources?.length) throw new Error('暂无可综合的排盘数据');
  return sources.map((s, i) => {
    const label = DOMAINS[s.domain] || s.domain;
    // ponytail: 跨页只带最近几条问答且回答已截断（调用方在 ai-panel 里裁），控制提示词体积；升级路径=按盘裁剪完整历史
    const qa = (s.qa || []).map((x) => `\n此前提问：${x.q}${x.a ? `\n此前回答摘要：${x.a}` : ''}`).join('');
    return `【盘 ${i + 1}】${label}${s.summary ? `\n排盘摘要：${s.summary}` : ''}${qa}\n排盘数据（JSON）：\n${JSON.stringify(s.structured)}`;
  }).join('\n\n———\n\n');
}

/**
 * 零网络提示词出口（ADR-003）：产出可直接粘贴到任意对话工具的一份完整任务书。
 * 纯函数、无副作用、不联网；AI 关闭态同样可用。
 */
export function buildPromptText(domain, structured, question) {
  const desc = DOMAINS[domain];
  if (!desc) throw new Error(`提示词暂未支持 ${domain} 领域`);
  const ask = question?.trim()
    ? question.trim()
    : '<在这里填写你的具体问题；若留空，请先给出这张盘的整体解读>';
  return [
    COPY_NOTICE,
    '',
    systemFor(domain),
    '',
    `【盘面类型】${desc}`,
    '【排盘数据（JSON）】',
    JSON.stringify(structured, null, 2),
    '',
    `【我的问题】${ask}`,
  ].join('\n');
}

/** 零网络提示词出口（跨页综合版） */
export function buildCombinedPromptText(sources, question) {
  const ask = question?.trim()
    ? question.trim()
    : '<在这里填写你的具体问题；若留空，请综合以上盘面给出整体解读>';
  return [
    COPY_NOTICE,
    '',
    systemFor('daily', true),
    '',
    combinedParts(sources),
    '',
    `【我的问题】${ask}`,
  ].join('\n');
}

/** 站内流式解读：`for await (const chunk of streamReading(domain, structured, question))` */
export async function* streamReading(domain, structured, question) {
  yield* streamChat(buildMessages(domain, structured, question));
}

/** 跨页综合流式解读：`for await (const chunk of streamCombined(sources, question))` */
export async function* streamCombined(sources, question) {
  yield* streamChat(buildCombinedMessages(sources, question));
}

/** 共用底层：fetch + SSE 增量解析；失败抛错，调用方负责降级（ADR-002） */
async function* streamChat(messages) {
  const config = loadAIConfig();
  if (!aiEnabled(config)) throw new Error('AI 解读未开启或配置不完整');

  const res = await fetch(config.baseURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.key}`,
    },
    body: JSON.stringify({ model: config.model, messages, stream: true }),
  });
  if (!res.ok) throw new Error(`端点返回 ${res.status} ${res.statusText}`);
  if (!res.body) throw new Error('端点未返回流式响应');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // 保留最后未完整行，等下次拼接
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const obj = JSON.parse(payload);
          const delta = obj?.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch { /* ponytail: 跳过非 JSON 心跳/注释行（部分端点会发 keep-alive 空行） */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
