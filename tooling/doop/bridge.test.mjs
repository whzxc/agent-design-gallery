import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { identity, documentFor, createClient, mapComments, sync } from './bridge.mjs';

test('frame identity includes source, frame and theme without delimiter ambiguity', () => {
  assert.notEqual(identity('a#b', 'c', 'light'), identity('a', 'b#c', 'light'));
  assert.notEqual(identity('a', 'b', 'light'), identity('a', 'b', 'dark'));
});

test('documents retain tokens, artwork, themes and inherited source ownership', () => {
  const built = { css: ':root{--text:red}' };
  const frame = { name: 'a"b', width: 120, html: '<button data-adg-owners="[{&quot;source&quot;:&quot;components/button.tsx&quot;,&quot;export&quot;:&quot;Button&quot;}]"><svg><path d="M0 0"/></svg>Go</button>' };
  const result = documentFor(built, frame, 'dark');
  assert.match(result.html, /data-theme="dark"/);
  assert.match(result.html, /width:120px/);
  assert.match(result.html, /a&quot;b/);
  assert.match(result.html, /--text:red/);
  assert.equal(Object.values(result.elements).find(e => e.tag === 'path').owners[0].export, 'Button');
  assert.ok(Object.keys(result.elements).every(id => /^[a-z0-9]{6}$/.test(id)));
  assert.deepEqual(documentFor(built, frame, 'dark'), result);
});

test('MCP bearer and SSE response errors are handled', async () => {
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-key');
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    res.setHeader('content-type', 'text/event-stream');
    res.end(`event: message\ndata: ${JSON.stringify({jsonrpc:'2.0', id:input.id, result:input.params.name === 'fail' ? {isError:true,content:[{type:'text',text:'denied'}]} : {content:[{type:'text',text:'{"id":"canvas"}'}]}})}\n\n`);
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const client = createClient(`http://127.0.0.1:${server.address().port}`, 'test-key');
    assert.equal((await client('create_canvas')).id, 'canvas');
    await assert.rejects(client('fail'), /denied/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('sync recovers identity, overwrites remote edits and removes retired managed frames only', async () => {
  const source = { projectSource:'design/components/button.tsx',css:'',frames:[{name:'default',html:'<button>Go</button>'}] };
  let assets = [{path:'components/button.tsx'}];
  const server = createServer((req,res) => {res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url === '/manifest' ? {assets} : source));}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const canvas={id:'canvas',pages:[{id:'first',name:'Page 1'}],frames:[]};let next=0;
  const client=async(name,args)=>{
    if(name==='create_canvas')return {id:canvas.id};
    if(name==='get_canvas')return structuredClone(canvas);
    if(name==='set_canvas_pages'){canvas.pages=args.pages;return {};}
    if(name==='create_frame'){const frame={...args,id:String(++next)};canvas.frames.push(frame);return {frame};}
    const frame=canvas.frames.find(f=>f.id===args.frame_id);
    if(name==='get_frame')return frame;
    if(name==='set_frame_html'){frame.html=args.html;return {};}
    if(name==='update_frame'){Object.assign(frame,args);return {};}
    if(name==='delete_frame'){canvas.frames=canvas.frames.filter(f=>f.id!==args.frame_id);return {};}
    throw Error(name);
  };
  const browser={newPage:async()=>({emulateMedia:async()=>{},setViewportSize:async()=>{},setContent:async()=>{},evaluate:async()=>{},locator:()=>({boundingBox:async()=>({width:120,height:36})}),close:async()=>{}})};
  const state={frames:{}};
  try {
    const args={adgUrl:`http://127.0.0.1:${server.address().port}`,client,browser,state};
    assert.equal((await sync(args)).created,2);
    const ids=canvas.frames.map(f=>f.id);
    canvas.frames[0].html='remote edit';
    assert.equal((await sync(args)).updated,1);
    assert.deepEqual(canvas.frames.map(f=>f.id),ids);
    assert.equal((await sync(args)).unchanged,2);
    canvas.frames.push({id:'foreign',name:'unmanaged',pageId:'adg-components'});
    source.frames=[{name:'replacement',html:'<button>Next</button>'}];
    const retired=await sync(args);
    assert.equal(retired.removed,2);
    assert.equal(retired.created,2);
    assert.ok(canvas.frames.some(f=>f.id==='foreign'));
    const saved=structuredClone(state);state.frames={};
    assert.equal((await sync(args)).created,0);
    assert.deepEqual(Object.values(state.frames).map(f=>f.id),Object.values(saved.frames).map(f=>f.id));
    assets = [];
    assert.equal((await sync(args)).removed, 2);
    assert.deepEqual(canvas.frames.map(f => f.id), ['foreign']);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('comments resolve source, theme and element with explicit unmapped anchors', () => {
  const state={frames:{one:{id:'frame',source:'design/a.tsx',frame:'default',theme:'dark',elements:{abc123:{tag:'button',owners:[]}}}}};
  const rows=mapComments([{frameId:'frame',elementId:'abc123'},{frameId:'frame',elementId:'gone'},{frameId:'other'}],state);
  assert.equal(rows[0].adg.theme,'dark');
  assert.equal(rows[0].adg.element.tag,'button');
  assert.equal(rows[1].adg.anchorStatus,'unmapped');
  assert.equal(rows[2].adg,null);
});

test('Doop font injection is ignored without ignoring authored font styles', async () => {
  const { canonicalHtml } = await import('./bridge.mjs');
  const html = '<html><head><style>body{font-family:serif}</style></head><body>Hi</body></html>';
  assert.equal(canonicalHtml(html.replace('<head>', '<head><link data-doop-webfonts href="https://fonts.googleapis.com/example">')), html);
  assert.notEqual(canonicalHtml(html.replace('serif', 'monospace')), html);
});
