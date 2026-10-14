// 隐私与「非 AI 核心」不变量测试（ADR-001 fitness functions）
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import assert from 'node:assert/strict';
import test from 'node:test';

const SITE = join(import.meta.dirname, '..', 'site');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const SOURCE_FILES = walk(SITE).filter((f) => /\.(mjs|html|css|json)$/.test(f) && !f.includes('vendor'));

test('隐私不变量：无外部主机资源引用（vendor 脚本与数据全部本地）', () => {
  for (const f of SOURCE_FILES) {
    const src = readFileSync(f, 'utf8');
    // 资源引用（script/link/img src）不得指向外部主机
    for (const m of src.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
      const url = m[1];
      const isLink = f.endsWith('about.html') || f.endsWith('index.html');
      const isAnchor = /<a\s/.test(src.slice(Math.max(0, src.indexOf(m[1]) - 60), src.indexOf(m[1])));
      if (isAnchor && (isLink || url.startsWith('http'))) continue; // 站内可见的 <a> 外链（关于页）允许
      if (/^(https?:)?\/\//.test(url)) {
        assert.fail(`${f} 引用了外部资源 ${url}`);
      }
    }
    // 网络调用只允许同源相对路径
    for (const m of src.matchAll(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/g)) {
      if (/^(https?:)?\/\//.test(m[1])) assert.fail(`${f} 的 fetch 指向外部主机 ${m[1]}`);
    }
    for (const banned of ['XMLHttpRequest', 'WebSocket', 'EventSource']) {
      if (src.includes(banned) && !f.includes('vendor')) assert.fail(`${f} 使用了 ${banned}`);
    }
  }
});

test('非 AI 不变量：无任何大模型 API 痕迹', () => {
  const patterns = [/openai/i, /anthropic/i, /claude/i, /gpt-?\d/i, /deepseek/i, /qianwen|qwen/i, /api[_-]?key/i, /sk-[a-zA-Z0-9]{10,}/, /chat\.?completions/i];
  for (const f of SOURCE_FILES) {
    const src = readFileSync(f, 'utf8');
    for (const p of patterns) {
      assert.ok(!p.test(src), `${f} 疑似包含大模型 API 痕迹：${p}`);
    }
  }
});

test('测试本身不得因 vendor 目录被误判', () => {
  assert.ok(SOURCE_FILES.length > 10, '扫描文件数异常');
});
