import { gzipSync } from 'node:zlib';
import { CliError } from '../cli-output.mjs';
export function doopClient({ url = process.env.DOOP_URL, key = process.env.DOOP_AGENT_KEY, fetch: request = fetch } = {}) {
  if (!url?.trim() || !key?.trim()) throw new CliError('PUBLISH_CREDENTIALS_MISSING', 'Set DOOP_URL and DOOP_AGENT_KEY in the environment before publishing.');
  let endpoint;
  try { endpoint = new URL(url); if (!['http:', 'https:'].includes(endpoint.protocol)) throw Error(); }
  catch { throw new CliError('CONFIG_INVALID', 'DOOP_URL must be an HTTP(S) Doop URL or MCP endpoint.'); }
  if (!endpoint.pathname.endsWith('/mcp')) endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + '/mcp';
  const origin = endpoint.origin;
  let id = 0, session;
  async function rpc(method, params) {
    try {
      const response = await request(endpoint, {
        method: 'POST', signal: AbortSignal.timeout(300000),
        headers: { 'content-encoding': 'gzip', authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(session ? { 'mcp-session-id': session } : {}) },
        body: gzipSync(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })),
      });
      session = response.headers.get('mcp-session-id') ?? session;
      if ([401, 403].includes(response.status)) throw new CliError('PUBLISH_AUTH_FAILED', 'Doop rejected DOOP_AGENT_KEY; replace it with a valid agent key.');
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const body = await response.text();
      const messages = response.headers.get('content-type')?.includes('text/event-stream')
        ? body.split(/\r?\n\r?\n/).flatMap(event => { const data = event.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n'); return data ? [JSON.parse(data)] : []; }) : [JSON.parse(body)];
      const message = messages.find(m => m.id === id);
      if (!message) throw Error('Missing MCP response');
      if (message.error || message.result?.isError) {
        const detail = (message.error?.message ?? message.result?.content?.filter(item => item.type === 'text').map(item => item.text).join(' ') ?? 'Remote tool failed').replaceAll(key, '[REDACTED]').slice(0, 500);
        throw new CliError('PUBLISH_DOOP_FAILED', `Doop ${method === 'tools/call' ? params.name : method}: ${detail}`);
      }
      return message.result;
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError('PUBLISH_UNREACHABLE', 'Cannot reach the Doop MCP endpoint; check DOOP_URL and connectivity, then retry.', { cause: error });
    }
  }
  return { origin, async call(name, args = {}) {
    const result = await rpc('tools/call', { name, arguments: { agent_name: 'ADG', ...args } });
    for (const entry of result.content ?? []) if (entry.type === 'text') { try { return JSON.parse(entry.text); } catch {} }
    if (result.structuredContent) return result.structuredContent;
    throw new CliError('PUBLISH_DOOP_FAILED', `Doop ${name} returned no structured result.`);
  }};
}
