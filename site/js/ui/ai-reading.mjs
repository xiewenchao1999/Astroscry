// ai-reading.mjs — AI 解读润色层（opt-in；用户开启且填齐密钥后才会发起外部请求）
// 依赖方向：仅 ui/pages 可 import；core/data 禁止依赖本模块（ADR-002 强制）
// 协议：兼容主流流式对话协议的 SSE 增量格式；fetch 参数全部运行时变量，源码无硬编码外部 URL

import { loadAIConfig, aiEnabled } from './ai-settings.mjs';

const SYSTEM_PROMPTS = {
  qimen: [
    '你是奇门遁甲解读助手。下方 JSON 是已排好的奇门盘结构化输出。',
    '请基于给定数据回答用户问题，遵守：',
    '1) 只解读盘面中实际出现的宫位、门、星、神、干；不得虚构未出现的信息；',
    '2) 不得替用户做医疗、法律、投资等重大决策；',
    '3) 用简体中文，条理清晰，通俗易懂；',
    '4) 末尾附一句免责声明：「本解读仅供文化参考」。'
  ].join('\n'),
  // ponytail: 其他 domain（bazi/ziwei/astro/tarot）后续按需补；留空会在 buildMessages 抛错，避免误用
};

export function buildMessages(domain, structured, question) {
  const sys = SYSTEM_PROMPTS[domain];
  if (!sys) throw new Error(`AI 解读暂未支持 ${domain} 领域`);
  return [
    { role: 'system', content: sys },
    { role: 'user', content: `排盘数据（JSON）：\n${JSON.stringify(structured)}\n\n用户问题：${question || '请综合解读这盘面'}` },
  ];
}

/**
 * 流式 AI 解读。调用方用 `for await (const chunk of streamReading(...))` 增量渲染。
 * 失败抛错；调用方负责降级到规则解读层（ADR-002 降级路径）。
 * @param {string} domain  术数领域 key（见 SYSTEM_PROMPTS）
 * @param {object} structured  排盘模块输出的结构化对象
 * @param {string} question  用户问题（可空）
 * @yields {string}  增量文本片段
 */
export async function* streamReading(domain, structured, question) {
  const config = loadAIConfig();
  if (!aiEnabled(config)) throw new Error('AI 解读未开启或配置不完整');

  const messages = buildMessages(domain, structured, question);
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
