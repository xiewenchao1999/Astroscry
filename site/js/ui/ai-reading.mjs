// ai-reading.mjs — AI 解读润色层（opt-in；用户开启且填齐密钥后才会发起外部请求）
// 依赖方向：仅 ui/pages 可 import；core/data 禁止依赖本模块（ADR-002 强制）
// 协议：兼容主流流式对话协议的 SSE 增量格式；fetch 参数全部运行时变量，源码无硬编码外部 URL

import { loadAIConfig, aiEnabled } from './ai-settings.mjs';

const GENERIC_RULES = [
  '请基于给定数据回答用户问题，遵守：',
  '1) 只解读数据中实际出现的信息；不得虚构未出现的内容；',
  '2) 不得替用户做医疗、法律、投资等重大决策；',
  '3) 用简体中文，条理清晰，通俗易懂；',
  '4) 末尾附一句免责声明：「本解读仅供文化参考」。'
].join('\n');

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

export function buildMessages(domain, structured, question) {
  const desc = DOMAINS[domain];
  if (!desc) throw new Error(`AI 解读暂未支持 ${domain} 领域`);
  return [
    { role: 'system', content: `你是命理解读助手。用户排的是${desc}。\n${GENERIC_RULES}` },
    { role: 'user', content: `盘面类型：${desc}\n排盘数据（JSON）：\n${JSON.stringify(structured)}\n\n用户问题：${question || '请综合解读这一盘面'}` },
  ];
}

/**
 * 跨页综合解读：sources = [{ domain, summary, structured, qa: [{ q, a }] }]
 * qa 只带最近几条问答（a 截断），避免撑爆上下文。
 */
export function buildCombinedMessages(sources, question) {
  if (!sources?.length) throw new Error('暂无可综合的排盘数据');
  const parts = sources.map((s, i) => {
    const label = DOMAINS[s.domain] || s.domain;
    const qa = (s.qa || []).map((x) => `\n此前提问：${x.q}${x.a ? `\n此前回答摘要：${x.a}` : ''}`).join('');
    return `【盘 ${i + 1}】${label}${s.summary ? `\n排盘摘要：${s.summary}` : ''}${qa}\n排盘数据（JSON）：\n${JSON.stringify(s.structured)}`;
  });
  return [
    { role: 'system', content: `你是命理解读助手。用户先后在多个体系排盘并提问，请综合所有盘面给出整体解读建议：指出相互印证或矛盾之处；各体系口径独立，不强行混算。\n${GENERIC_RULES}` },
    { role: 'user', content: `${parts.join('\n\n———\n\n')}\n\n用户问题：${question || '请综合以上全部盘面给出整体解读建议'}` },
  ];
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

/** 单页流式解读：`for await (const chunk of streamReading(domain, structured, question))` */
export async function* streamReading(domain, structured, question) {
  yield* streamChat(buildMessages(domain, structured, question));
}

/** 跨页综合流式解读：`for await (const chunk of streamCombined(sources, question))` */
export async function* streamCombined(sources, question) {
  yield* streamChat(buildCombinedMessages(sources, question));
}
