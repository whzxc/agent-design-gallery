// Minimal Doop MCP client over HTTPS; the session proxy injects the agent key.
export async function call(name, args = {}) {
  const response = await fetch('https://doop.leow.cc/mcp', {
    method: 'POST', signal: AbortSignal.timeout(120000),
    headers: { authorization: `Bearer ${process.env.DOOP_AGENT_KEY ?? 'proxy-injected'}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args } }),
  });
  const text = await response.text();
  const message = response.headers.get('content-type')?.includes('text/event-stream')
    ? JSON.parse(text.split('\n').find(line => line.startsWith('data: ')).slice(6)) : JSON.parse(text);
  if (message.error) throw Error(`${name}: ${JSON.stringify(message.error).slice(0, 300)}`);
  if (message.result?.isError) throw Error(`${name}: ${message.result.content.map(c => c.text).join('\n').slice(0, 500)}`);
  const texts = (message.result?.content ?? []).filter(c => c.type === 'text').map(c => c.text);
  for (const t of texts) { try { return JSON.parse(t); } catch {} }
  return { texts, content: message.result?.content };
}
if (process.argv[2]) console.log(JSON.stringify(await call(process.argv[2], JSON.parse(process.argv[3] ?? '{}')), null, 1).slice(0, 3000));
