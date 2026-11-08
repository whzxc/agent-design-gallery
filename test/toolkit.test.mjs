import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,readdirSync,symlinkSync,realpathSync,existsSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {jsx,jsxs,Fragment,Frame,Icon} from '../src/toolkit/runtime.mjs';
import {parseTokens,themeCss} from '../src/toolkit/tokens.mjs';
import {init,starterTokens,selectSources,refreshTypes,sourceDirectories,isSourcePath,listSources} from '../src/toolkit/project.mjs';
import {buildSource} from '../src/toolkit/build.mjs';
import {loadConfig,discoverRoot,satisfies,viewport} from '../src/toolkit/config.mjs';
import {check,inspectFrame,render} from '../src/toolkit/commands.mjs';
import {compare,compareReport} from '../src/toolkit/compare.mjs';
import {implementationTexts} from '../src/toolkit/document.mjs';
import {launch,loadFrame} from '../src/toolkit/browser.mjs';
import {matchTexts,textDelta} from '../src/toolkit/text.mjs';
import {parseCli,help} from '../src/cli.mjs';
const temporary=t=>{const root=mkdtempSync(path.join(tmpdir(),'sdg-v2-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;};
async function project(t){const root=temporary(t);init({root},()=>{});for(const file of listSources(path.join(root,'design')))rmSync(file);return loadConfig(root);}
const source=(body,props='')=>`import {Frame, Icon} from 'sdg'; export default()=> <Frame name="sample" width={200} height={100} ${props}>${body}</Frame>;`;
const put=(c,name,body)=>{const f=path.join(c.design,name);mkdirSync(path.dirname(f),{recursive:true});writeFileSync(f,body);return f;};

test('string runtime escapes text and attributes, flattens children, and emits void elements',()=>{
  assert.equal(String(jsx('p',{title:'"<&',children:['<hello>',null,false,jsx('b',{children:'A&B'}),3]})),'<p title="&quot;&lt;&amp;">&lt;hello&gt;<b>A&amp;B</b>3</p>');
  assert.equal(String(jsx('input',{disabled:true,value:'"',children:'ignored'})),'<input disabled="" value="&quot;">');
  assert.equal(String(jsx(Fragment,{children:[jsx('br',{}),'tail']})),'<br>tail');
  assert.match(String(jsx('div',{style:{width:22,opacity:.5,gridColumn:1}})),/width:22px;opacity:0.5;grid-column:1/);
  assert.match(String(Icon({name:'x',size:14})),/stroke-width="3"/);
  for(const [tag,props] of [['style',{}],['script',{}],['div',{onClick:'x'}],['div',{className:'x'}]])assert.throws(()=>jsx(tag,props),/Forbidden/);
});
test('build resolves sdg and relative modules; SVG props override root and raster imports become data URLs',async t=>{
  const c=await project(t);put(c,'art/mark.svg','<svg width="12" viewBox="0 0 12 12"><path d="M0 0h12"/></svg>');
  put(c,'art/pixel.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=','base64'));
  put(c,'components/item.ts','export const title="Built";');
  const f=put(c,'surfaces/a.tsx',`import {Frame} from 'sdg';import {jsx} from 'sdg/jsx-runtime';import Art from '../art/mark.svg';import pixel from '../art/pixel.png';import {title} from '../components/item';export default()=> <Frame name="a"><div><Art width={24} data-brand class="fill-text"/><img src={pixel}/><span>{title}</span></div></Frame>;`);
  const built=await buildSource(c,f);assert.match(built.frames[0].html,/<svg[^>]*width="24"/);assert.doesNotMatch(built.frames[0].html,/width="12"/);assert.match(built.frames[0].html,/src="data:image\/png;base64,/);assert.match(built.frames[0].html,/Built/);assert.equal(built.dependencies.length,5);
  assert.ok(readFileSync(path.join(c.output,'surfaces/a/a.html'),'utf8').startsWith('<!doctype html>'));
});
test('imports reject npm, escaping relative paths and symlink escapes with source locations',async t=>{
  const c=await project(t);writeFileSync(path.join(c.root,'outside.ts'),'export default 1');symlinkSync(path.join(c.root,'outside.ts'),path.join(c.design,'escape.ts'));
  for(const spec of ['react','../../outside','../escape']){
    const f=put(c,'surfaces/a.tsx',`import forbidden from '${spec}';\n${source('<div>{forbidden}</div>')}`);
    await assert.rejects(buildSource(c,f),e=>/a.tsx:1/.test(e.message)&&/Bare import|leaves design/.test(e.message));
  }
  put(c,'art/bad.svg','<svg>\n<script>alert(1)</script></svg>');
  await assert.rejects(buildSource(c,put(c,'surfaces/a.tsx',`import Art from '../art/bad.svg';${source('<Art/>')}`)),/bad.svg:2/);
});
test('?url embeds any art file, tracks its dependency and rejects files outside art',async t=>{
  const c=await project(t);
  const art=put(c,'art/preview.svg','<svg xmlns="http://www.w3.org/2000/svg"><style>rect{fill:red}</style><rect width="2" height="2"/></svg>');
  put(c,'art/data.txt','fixture artwork');
  const f=put(c,'surfaces/url.tsx',`import preview from '../art/preview.svg?url';import data from '../art/data.txt?url';${source('<div><img src={preview}/><a href={data}>Data</a></div>')}`);
  const built=await buildSource(c,f);
  assert.match(built.frames[0].html,/src="data:image\/svg\+xml[,;]/);
  assert.match(built.frames[0].html,/href="data:text\/plain[,;]/);
  assert.ok(built.dependencies.includes(realpathSync(art)));
  assert.match(readFileSync(path.join(c.design,'.sdg/assets.d.ts'),'utf8'),/declare module '\*\?url'/);
  put(c,'components/preview.svg','<svg/>');
  put(c,'surfaces/url.tsx',`import preview from '../components/preview.svg?url';${source('<img src={preview}/>')}`);
  await assert.rejects(buildSource(c,f),/url.tsx:1.*\?url imports must be under design\/art/s);
});
test('check rejects fractional pixel lengths in classes and styles outside data-free',async t=>{
  const c=await project(t);
  for(const [name,body] of [['class','<div class="w-[10.5px] h-4"/>'],['style','<div style={{width:10.5,height:16}}/>']])put(c,`surfaces/${name}.tsx`,source(body));
  put(c,'surfaces/frame.tsx',source('<div/>').replace('width={200}','width={200.5}'));
  const problems=[];assert.equal(await check(c,[],{},()=>{},s=>problems.push(s)),1);
  assert.equal(problems.length,6);
  assert.ok(problems.every(p=>p.endsWith('Fractional pixel length outside data-free')));
});
test('check rejects layout style properties outside data-free',async t=>{
  const c=await project(t);put(c,'surfaces/style.tsx',source('<div style={{padding:4}}>Label</div>'));
  const problems=[];assert.equal(await check(c,[],{},()=>{},s=>problems.push(s)),1);
  assert.equal(problems.length,2);assert.ok(problems.every(p=>p.endsWith('Style padding outside data-free; use layout classes')));
});
test('check permits whole-pixel dimensions, custom properties and inherited free-form geometry',async t=>{
  const c=await project(t);put(c,'surfaces/free.tsx',source('<div style={{width:100,height:60,"--gap":"4px"}}><div data-free class="relative"><div class="absolute left-[1.5px]" style={{top:2.5}}>Free</div></div></div>'));
  const problems=[];assert.equal(await check(c,[],{},()=>{},s=>problems.push(s)),0,problems.join('\n'));
});
test('frames without dimensions follow their content, including a changed button label',async t=>{
  const c=await project(t);put(c,'components/button.tsx',readFileSync(new URL('../design/components/button.tsx',import.meta.url),'utf8'));
  put(c,'fixtures/buttons.ts',readFileSync(new URL('../design/fixtures/buttons.ts',import.meta.url),'utf8'));
  put(c,'tokens.css',readFileSync(new URL('../design/tokens.css',import.meta.url),'utf8'));
  const f=put(c,'components/content.tsx',`import {Frame} from 'sdg';import {Button} from './button';const labels=['Open','Open a design directory'];export default()=>labels.map((label,i)=><Frame name={String(i)}><Button label={label}/></Frame>);`);
  const {frames}=await buildSource(c,f),browser=await launch();
  try {const page=await browser.newPage(),widths=[];for(const frame of frames){const size=await loadFrame(page,frame,'light');widths.push(size.width);assert.equal(size.height,32);}assert.ok(widths[1]>widths[0]+50);}
  finally{await browser.close();}
});
// Regression: a frame's PNG bytes depend on previously rendered image sizes in a shared page.
test('render produces identical PNG bytes in either frame order',async t=>{
  const c=await project(t),browser=await launch();
  try {
    const page=await browser.newPage();
    const png=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=360;canvas.height=235;
      const context=canvas.getContext('2d'),pixels=context.createImageData(canvas.width,canvas.height);
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
        const i=(y*canvas.width+x)*4;
        pixels.data.set([x*17%256,y*13%256,(x+y)*7%256,255],i);
      }
      context.putImageData(pixels,0,0);return canvas.toDataURL().split(',')[1];
    });
    put(c,'art/preview.png',Buffer.from(png,'base64'));
  } finally {await browser.close();}
  const files=[20,90].map(size=>put(c,`surfaces/size-${size}.tsx`,`import preview from '../art/preview.png';import {Frame} from 'sdg';export default()=> <Frame name="sample" width={96} height={96}><svg width={${size}} height={${size}} viewBox="0 0 360 235"><image width="360" height="235" href={preview}/></svg></Frame>;`));
  const images=()=>files.flatMap(file=>['light','dark'].map(theme=>readFileSync(path.join(c.output,'surfaces',path.basename(file,'.tsx'),`sample-${theme}.png`))));
  const logs=[],expected=order=>order.flatMap(file=>['light','dark'].map(theme=>path.relative(c.root,path.join(c.output,'surfaces',path.basename(file,'.tsx'),`sample-${theme}.png`))));
  t.mock.method(console,'log',line=>logs.push(line));
  await render(c,files);const first=images();
  await render(c,[...files].reverse());const second=images();
  assert.deepEqual(logs,[...expected(files),...expected([...files].reverse())]);
  for(let i=0;i<first.length;i++)assert.ok(first[i].equals(second[i]),`${path.basename(files[Math.floor(i/2)])}: ${['light','dark'][i%2]}`);
});
test('Tailwind uses rendered classes, inline token aliases and no color, size, font, radius or shadow defaults',async t=>{
  const c=await project(t);writeFileSync(path.join(c.design,'tokens.css'),starterTokens.replace('--canvas: #ffffff;','--canvas: #ffffff;\n  --surface: #eeeeee;\n  --text-body: 13px;\n  --radius-panel: 7px;\n  --shadow-card: 0 1px 3px #171717;').replace('--canvas: #171717;','--canvas: #171717;\n  --surface: #222222;'));
  const f=put(c,'surfaces/theme.tsx',`const unused='bg-red-500';const role='surface';${source('<div class={`bg-${role} text-body font-ui rounded-panel shadow-card p-4 font-semibold`}>Theme</div>')}`);
  const {frames,css}=await buildSource(c,f);assert.match(css,/background-color: var\(--surface\)/);assert.match(css,/font-size: var\(--text-body\)/);assert.match(css,/font-family: var\(--font-ui\)/);assert.match(css,/border-radius: var\(--radius-panel\)/);assert.doesNotMatch(css,/--font-ui:\s*var\(--font-ui\)/);assert.doesNotMatch(css,/\.bg-red-500|--color-red-/);assert.match(css,/--spacing: 0.25rem/);
  const b=await launch();try {const p=await b.newPage();for(const [theme,color] of [['light','rgb(238, 238, 238)'],['dark','rgb(34, 34, 34)']]){await loadFrame(p,frames[0],theme);assert.deepEqual(await p.locator('[data-sdg-frame]>div').evaluate(e=>{const s=getComputedStyle(e);return[s.backgroundColor,s.fontSize,s.borderRadius,s.padding,s.fontWeight]}),[color,'13px','7px','16px','600']);}}finally{await b.close();}
  const {compile}=await import('tailwindcss');const base=readFileSync(new URL('../node_modules/tailwindcss/theme.css',import.meta.url),'utf8');const compiler=await compile(base+themeCss(parseTokens(readFileSync(path.join(c.design,'tokens.css'),'utf8')))+'@tailwind utilities;');
  const defaults=compiler.build(['bg-red-500','text-sm','font-sans','rounded-lg','shadow-sm']);for(const cls of ['bg-red-500','text-sm','font-sans','rounded-lg','shadow-sm'])assert.ok(!defaults.includes('.'+cls));
});
test('check has a failing source for every contract rule, including both themes and all paint channels',async t=>{
  const c=await project(t);
  const samples={
    build:'export default () => <',render:source('<Missing/>'),duplicate:`import {Frame} from 'sdg';export default()=>[<Frame name="a"><div/></Frame>,<Frame name="a"><div/></Frame>];`,
    shell:source('<><div/><div/></>'),capture:source('<div/>','capture={{page:true,region:"X"}}'),
    text:source('<div class="text-[#ff0101]">Color</div>'),background:source('<div class="bg-[#ff0101]">Color</div>'),border:source('<div class="border border-[#ff0101]">Color</div>'),outline:source('<div class="outline outline-[#ff0101]">Color</div>'),fill:source('<svg width="20" height="20"><rect width="20" height="20" fill="#ff0101"/></svg>'),stroke:source('<svg width="20" height="20"><path d="M0 0L20 20" stroke="#ff0101"/></svg>'),shadow:source('<div class="shadow-[0_1px_3px_#ff0101]">Color</div>'),
    box:source('<div class="w-4 whitespace-nowrap">Text outside box</div>'),leaves:source('<div class="relative"><span class="absolute left-[190px]">Outside</span></div>'),overlap:source('<div class="relative w-[200px] h-[100px]"><span class="absolute">First</span><span class="absolute">Second</span></div>'),content:source('<div class="w-[300px] h-[110px]"/>'),
    style:source('<style/>'),script:source('<script/>'),event:source('<div onclick="x"/>'),className:source('<div className="x"/>'),dark:source('<div class="dark:bg-[#ff0101]">Dark</div>')
  };
  for(const [name,value]of Object.entries(samples))put(c,`surfaces/${name}.tsx`,value);
  const problems=[];assert.equal(await check(c,[],{},()=>{},s=>problems.push(s)),1);
  for(const name of Object.keys(samples))assert.ok(problems.some(p=>p.startsWith(`design/surfaces/${name}.tsx:`)),name);
  assert.ok(problems.some(p=>/dark.tsx: sample: dark:/.test(p)));assert.ok(!problems.some(p=>/dark.tsx: sample: light:/.test(p)));
  for(const p of problems)assert.equal(p.split('\n').length,1);
});
test('check permits token paint, brand art, clipped content and intentional ellipses',async t=>{
  const c=await project(t);put(c,'surfaces/a.tsx',source('<div class="w-[200px] h-[100px] overflow-hidden"><span data-brand class="text-[#ff0101]">Brand</span><div class="w-4 truncate">Clipped text</div></div>'));
  const p=[];assert.equal(await check(c,[],{},()=>{},s=>p.push(s)),0,p.join('\n'));
});
test('check, render and the canvas discover configured top-level TSX source directories',async t=>{
  assert.deepEqual(sourceDirectories(),['components','modules','surfaces']);
  for(const sources of [[],null,'modules',['nested/modules'],['../modules'],['.sdg'],['modules\\nested'],[42]]) {
    assert.throws(()=>sourceDirectories({sources}),/plain top-level directory names/);
  }
  assert.equal(isSourcePath('modules/a.tsx'),true);
  assert.equal(isSourcePath('modules/a.tsx',['modules']),true);
  const {startServer}=await import('../src/server.mjs');
  for(const directories of [['components','surfaces'],['components','modules','surfaces']]) {
    const root=temporary(t);init({root},()=>{});for(const file of listSources(path.join(root,'design')))rmSync(file);
    writeFileSync(path.join(root,'sdg.config.mjs'),`export default { sources: ${JSON.stringify(directories)} };`);
    const c=await loadConfig(root);
    assert.deepEqual(c.sources,directories);
    put(c,'scenes/topology-screen.tsx','export const width=200;');
    const component=put(c,'components/a.tsx',`import {width} from '../scenes/topology-screen';${source('<div style={{width,height:100}}/>')}`);
    const surface=put(c,'surfaces/a.tsx',source('<div/>'));
    const module=put(c,'modules/a.tsx',source('<div/>'));
    const expected=(directories.includes('modules')?[component,module,surface]:[component,surface]).sort();
    for(const name of ['helper.tsx','art/helper.tsx','helpers/helper.tsx','components/nested/helper.tsx',
      'surfaces/nested/helper.tsx','modules/nested/helper.tsx','components/helper.ts'])put(c,name,'imports only');
    writeFileSync(path.join(c.design,'gallery.json'),JSON.stringify({groups:[{title:'Sources',assets:directories.map(d=>`${d}/a.tsx`)}]}));
    assert.deepEqual(selectSources(c),expected);
    for(const name of ['scenes/topology-screen','design/helper.tsx','art/helper.tsx','components/nested/helper.tsx',
      'surfaces/nested/helper.tsx','modules/nested/helper.tsx','components/helper.ts']) {
      assert.throws(()=>selectSources(c,[name]),/Invalid source.*directly/);
    }
    if(directories.includes('modules'))assert.deepEqual(selectSources(c,['modules/a']),[module]);
    else assert.throws(()=>selectSources(c,['modules/a']),/Invalid source.*directly/);
    const logs=[],problems=[];
    assert.equal(await check(c,[],{},s=>logs.push(s),s=>problems.push(s)),0,problems.join('\n'));
    assert.deepEqual(logs,[`Design check passed for ${expected.length} sources.`]);
    assert.equal(await render(c),0);
    assert.deepEqual(readdirSync(c.output).sort(),[...directories].sort());
    for(const directory of directories)for(const theme of ['light','dark']) {
      assert.ok(readFileSync(path.join(c.output,directory,`a/sample-${theme}.png`)).length);
    }
    const server=await startServer({directory:c.design,stateDirectory:path.join(c.root,'.viewer')});
    try {
      const manifest=await (await fetch(new URL('/manifest',server.url))).json();
      assert.deepEqual(manifest.assets.map(asset=>asset.path),directories.map(d=>`${d}/a.tsx`).sort());
      if(directories.includes('modules')) {
        const asset=await (await fetch(new URL('/asset/modules/a.tsx',server.url))).json();
        assert.equal(asset.format,'tsx');assert.equal(asset.component,true);
      }
    } finally {await server.close();}
  }
});
test('gallery entries cannot promote helper modules to sources',async t=>{
  const c=await project(t);
  put(c,'components/a.tsx',source('<div/>'));
  for(const asset of ['scenes/helper.tsx','art/helper.tsx','helper.tsx','components/nested/helper.tsx','components/helper.ts','components/../helper.tsx']) {
    writeFileSync(path.join(c.design,'gallery.json'),JSON.stringify({groups:[{title:'Invalid',assets:[asset]}]}));
    assert.throws(()=>selectSources(c),/gallery.json: Invalid source/);
    assert.throws(()=>selectSources(c,['components/a']),/gallery.json: Invalid source/);
  }
});
test('check permits token opacity modifiers in both themes across paint channels',async t=>{
  const c=await project(t);
  writeFileSync(path.join(c.design,'tokens.css'),starterTokens.replace('--canvas: #ffffff;','--canvas: #ffffff;\n  --warning: #eab308;').replace('--canvas: #171717;','--canvas: #171717;\n  --warning: #d8b45c;'));
  put(c,'surfaces/opacity.tsx',source('<div class="bg-warning/10 text-warning/10 border border-warning/10 outline outline-warning/10 shadow-[0_1px_3px_var(--warning)]/10"><span class="text-warning/1">Warning</span><svg width="20" height="20"><rect width="20" height="20" class="fill-warning/10 stroke-warning/10"/></svg><div class="h-4 bg-linear-to-r from-warning/10 to-warning/1"/><span data-brand class="text-[#ff0101]/10">Brand</span></div>'));
  const problems=[];assert.equal(await check(c,[],{},()=>{},s=>problems.push(s)),0,problems.join('\n'));
});
test('check rejects literal translucent colors outside data-brand in both themes',async t=>{
  const c=await project(t);put(c,'surfaces/translucent.tsx',source('<div class="bg-[#ff0101]/10">Literal</div>'));
  const problems=[];assert.equal(await check(c,[],{},()=>{},s=>problems.push(s)),1);
  assert.equal(problems.length,2);
  for(const theme of ['light','dark'])assert.ok(problems.some(p=>p.includes(`: ${theme}: Color `)&&p.endsWith('matches no token')));
});
test('check applies RGB tolerance only to translucent paints',async t=>{
  const c=await project(t);
  writeFileSync(path.join(c.design,'tokens.css'),starterTokens.replace('--canvas: #ffffff;','--canvas: #ffffff;\n  --warning: #646464;'));
  for(const [name,color] of [['within','rgb(102 98 100 / 10%)'],['outside','rgb(103 100 100 / 10%)'],['opaque','rgb(101 100 100)']])put(c,`surfaces/${name}.tsx`,source(`<div class="bg-[${color.replaceAll(' ','_')}]">Color</div>`));
  const problems=[];assert.equal(await check(c,[],{},()=>{},s=>problems.push(s)),1);
  assert.equal(problems.length,4);
  for(const name of ['outside','opaque'])for(const theme of ['light','dark'])assert.ok(problems.some(p=>p.startsWith(`design/surfaces/${name}.tsx: sample: ${theme}: Color `)));
});
test('legacy SVG sources block all-source commands and init with exit 2 and the conversion message', async t => {
  const c = await project(t);
  put(c, 'components/converted.tsx', source('<div/>'));
  for (const directory of ['components', 'surfaces']) {
    const name = `${directory}/old.svg`, file = put(c, name, '<svg/>');
    for (const args of [['check'], ['render'], ['compare', '--all'], ['init']]) {
      await assert.rejects(promisify(execFile)(process.execPath, [path.resolve('src/cli.mjs'), ...args], { cwd: c.root }), error => {
        assert.equal(error.code, 2);
        assert.equal(error.stderr, `sdg: design/${name}: convert this SVG source to TSX; move artwork to design/art/\n`);
        return true;
      });
    }
    rmSync(file);
  }
});
test('named check, render and compare succeed during staged conversion and permit art imports', async t => {
  const c = await project(t), { createServer } = await import('node:http');
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><style>body{margin:0}</style><div style="width:200px;height:100px"></div>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  writeFileSync(path.join(c.root, 'sdg.config.mjs'), `export default { compare: { fixture() { return { url: 'http://127.0.0.1:${server.address().port}', theme: 'light', locale: 'en-US', clock: '2026-01-01' }; } } };`);
  put(c, 'components/old.svg', '<svg/>');
  put(c, 'surfaces/old.svg', '<svg/>');
  put(c, 'surfaces/unconverted.tsx', 'invalid TSX');
  put(c, 'art/mark.svg', '<svg width="12" height="12"></svg>');
  put(c, 'components/converted.tsx', `import Art from '../art/mark.svg';${source('<div class="w-[200px] h-[100px]"><Art/></div>', 'fixture="sample" capture={{page:true}}')}`);
  for (const args of [['check', 'components/converted'], ['render', 'design/components/converted.tsx'], ['compare', realpathSync(path.join(c.design, 'components/converted.tsx')), '--frame=sample']]) {
    await promisify(execFile)(process.execPath, [path.resolve('src/cli.mjs'), ...args], { cwd: c.root });
  }
  for (const theme of ['light', 'dark']) assert.ok(readFileSync(path.join(c.output, `components/converted/sample-${theme}.png`)).length);
  const report = JSON.parse(readFileSync(path.join(c.output, 'compare/components-converted-sample-sample/report.json')));
  assert.equal(report.missing.length, 0);
  assert.equal(report.extra.length, 0);
});
test('named commands reject a legacy SVG source and direct or transitive legacy imports', async t => {
  const c = await project(t);
  writeFileSync(path.join(c.root, 'sdg.config.mjs'), 'export default { compare: { fixture() {} } };');
  for (const directory of ['components', 'surfaces']) {
    const name = `${directory}/old.svg`;
    put(c, name, '<svg><style>rect{fill:red}</style></svg>');
    put(c, 'components/dependency.ts', `export { default } from '../${name}';`);
    for (const specifier of [`../${name}`, './dependency']) {
      put(c, 'components/converted.tsx', `import Legacy from '${specifier}';${source('<div><Legacy/></div>')}`);
      for (const selected of [name, 'components/converted']) {
        for (const args of [['check', selected], ['render', selected], ['compare', selected, '--frame=sample']]) {
          await assert.rejects(promisify(execFile)(process.execPath, [path.resolve('src/cli.mjs'), ...args], { cwd: c.root }), error => {
            assert.equal(error.code, 2);
            assert.ok(error.stderr.includes(`design/${name}: convert this SVG source to TSX; move artwork to design/art/`));
            return true;
          });
        }
      }
    }
  }
});
test('reader merges adjacent line segments and pairs duplicate content nearest-first',async()=>{
  const b=await launch();try{const p=await b.newPage();await p.setContent('<div id="capture" style="font:16px/20px monospace;width:300px"><span>A</span><span>B</span><span style="margin-left:2px">C</span><div>Next</div><span aria-hidden="true">Hidden</span></div>');const r=await p.locator('#capture').evaluate(implementationTexts);assert.deepEqual(r.texts.map(t=>t.text),['AB C','Next']);}finally{await b.close();}
  const box=(x,y,text='Same')=>({text,x,y,width:10,height:10});const a=box(0,0),near=box(100,0),i=box(99,1);const r=matchTexts([a,near],[i]);assert.deepEqual(r.pairs,[[near,i]]);assert.deepEqual(r.missing,[a]);assert.equal(matchTexts([a],[box(0,0,'Same suffix')]).pairs.length,0);
  assert.deepEqual(textDelta({...a,anchor:'end'},{...a,x:3,width:12}),{dx:5,dy:0,dw:2});
});

test('root discovery prefers nearest config over package and defaults to nearest package', async t => {
  const root = temporary(t), nested = path.join(root, 'a/b'); mkdirSync(nested, { recursive: true });
  // A repository-local TMPDIR may inherit an ancestor's config before this fixture creates its own.
  const ancestor = discoverRoot(root), inheritedConfig = existsSync(path.join(ancestor, 'sdg.config.mjs'));
  writeFileSync(path.join(root, 'package.json'), '{}'); writeFileSync(path.join(root, 'a/package.json'), '{}');
  assert.equal(discoverRoot(nested), inheritedConfig ? ancestor : path.join(root, 'a'));
  writeFileSync(path.join(root, 'sdg.config.mjs'), "export default { design: 'drawings' };");
  assert.equal(discoverRoot(nested), root);
  const config = await loadConfig(nested); assert.equal(config.design, path.join(root, 'drawings')); assert.equal(config.compare.port, 5188);
  writeFileSync(path.join(root, 'a/sdg.config.mjs'), 'export default {};'); assert.equal(discoverRoot(nested), path.join(root, 'a'));
});
test('requires compares releases, prereleases and supported ranges explicitly', () => {
  for (const range of ['>=0.3.0', '^0.3.0', '~0.3.0', '>= 0.2.0 < 0.4.0', '0.2.0 || 0.3.0', '*']) assert.equal(satisfies('0.3.0', range), true, range);
  for (const range of ['>0.3.0', '^0.2.0', '<0.3.0']) assert.equal(satisfies('0.3.0', range), false, range);
  assert.equal(satisfies('0.3.0-beta.2', '>=0.3.0-beta.1'), true);
  assert.equal(satisfies('0.3.0-beta.2', '>=0.2.0'), false);
  assert.throws(() => satisfies('0.3.0', '0.3.x'), /Unsupported/);
});

test('compare ignores aria-hidden on the capture target and ancestors but excludes hidden descendants', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    for (const [targetHidden, ancestorHidden] of [[true, false], [false, true], [true, true]]) {
      await page.setContent(`<section ${ancestorHidden ? 'aria-hidden="true"' : ''}>
        <div role="dialog" ${targetHidden ? 'aria-hidden="true"' : ''}><span>Visible dialog text</span><span aria-hidden="true">Decorative text</span></div>
      </section>`);
      const dialog = page.locator('[role="dialog"]');
      assert.deepEqual((await dialog.evaluate(implementationTexts)).texts.map(t => t.text), ['Visible dialog text']);
      await dialog.evaluate(el => el.insertAdjacentHTML('beforeend', `<input placeholder="Visible field" style="display:block">
        <div aria-hidden="true"><span>Nested decoration</span><input placeholder="Hidden field"></div>
        <span style="display:none">Not rendered</span>`));
      assert.deepEqual((await dialog.evaluate(implementationTexts)).texts.map(t => t.text), ['Visible dialog text', 'Visible field']);
      await dialog.evaluate(el => el.parentElement.style.display = 'none');
      assert.deepEqual((await dialog.evaluate(implementationTexts)).texts, []);
    }
  } finally { await browser.close(); }
});

test('compare reads centered clipped labels and one value or placeholder per text field', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<div id="panel" style="width:600px;height:300px;font:13px/12px Arial">
      <span id="label" style="display:block;width:120px;height:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Centered label</span>
      <span style="display:block;width:10px;height:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Horizontal clipping</span>
      <div style="height:4px;overflow:hidden"><span style="position:relative;top:8px">Below clip</span></div>
      <input type="search" value="pill" placeholder="Find assets…" style="display:block;width:220px">
      <input value="~/projects/empty" placeholder="/path/to/design" style="display:block;width:260px">
      <input type="text" placeholder="Empty field" style="display:block;width:220px">
      <textarea style="display:block;width:400px">First line
Second line</textarea>
      <textarea placeholder="Empty textarea" style="display:block;width:400px"></textarea>
    </div>`);
    const boxes = await page.locator('#label').evaluate(el => {
      const range=document.createRange();range.selectNodeContents(el);
      return [range.getBoundingClientRect().height,el.getBoundingClientRect().height];
    });
    assert.ok(boxes[0] > boxes[1], 'the glyph box must exceed its clipping span');
    const result = await page.locator('#panel').evaluate(implementationTexts);
    assert.deepEqual(result.texts.map(t=>t.text), ['Centered label','pill','~/projects/empty','Empty field','First line','Second line','Empty textarea']);
  } finally { await browser.close(); }
});
test('init preserves files and refreshes editor declarations; CLI accepts only v2 command flags',async t=>{
  const c=await project(t);writeFileSync(path.join(c.design,'tsconfig.json'),'preserved');writeFileSync(path.join(c.design,'.sdg/runtime.d.ts'),'stale');init(c,()=>{});
  assert.equal(readFileSync(path.join(c.design,'tsconfig.json'),'utf8'),'preserved');assert.match(readFileSync(path.join(c.design,'.sdg/runtime.d.ts'),'utf8'),/namespace JSX/);assert.match(readFileSync(path.join(c.root,'.gitignore'),'utf8'),/design\/\.sdg/);
  const f=put(c,'surfaces/a.tsx',source('<div/>'));assert.deepEqual(selectSources(c,['surfaces/a','design/surfaces/a.tsx']),[f,f]);
  assert.equal(parseCli(['compare','--all']).values.all,true);assert.equal(parseCli(['render','surfaces/a','--frame=sample']).values.frame,'sample');assert.throws(()=>parseCli(['compare','a']),/help/);assert.equal(parseCli(['open','check']).positionals[0],'check');assert.doesNotMatch(help(),/sdg sync|sdg measure/);assert.deepEqual(viewport('300x200'),{width:300,height:200});
});
test('compare uses Frame capture, flags override it, both sides share a reader, and --all writes linked summaries',async t=>{
  const c=await project(t);const {createServer}=await import('node:http');
  put(c,'scenes/helper.tsx','export const data=[];');
  const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><style>body{margin:0;font:16px/24px system-ui}.panel{width:200px;height:100px}button{margin-top:20px}</style><div class="panel" role="region" aria-label="Panel"><span>A</span><span>B</span></div><button onclick="setTimeout(()=>document.querySelector('.panel').innerHTML='<span>A</span><span>B</span>',100)">Go</button>`)});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  let environment;
  c.compare.fixture=name=>{assert.ok(['sample','override'].includes(name));return{url:`http://127.0.0.1:${server.address().port}`,theme:'dark',locale:'fr-FR',timezone:'Asia/Shanghai',clock:'2026-01-01T00:00:00Z'}};
  c.compare.ready=async p=>{environment=await p.evaluate(()=>[document.documentElement.dataset.theme,navigator.language,new Date().getHours(),matchMedia('(prefers-reduced-motion: reduce)').matches]);};
  const f=put(c,'surfaces/demo.tsx',source('<div class="w-[200px] h-[100px]"><span>A</span><span>B</span></div>','fixture="sample" capture={{region:"Wrong",viewport:"300x200",clicks:["Go"]}}'));
  const collected=[];assert.equal(await compare(c,[f],{frame:'sample',selector:'.panel',fixture:'override',collect:collected}),0);assert.deepEqual(environment,['dark','fr-FR',8,true]);assert.equal(collected[0].matched,1);assert.equal(collected[0].settled,true);
  for(const name of ['design.png','implementation.png','overlay.png','report.json','index.html'])assert.ok(readFileSync(path.join(c.output,'compare/surfaces-demo-sample-override',name)).length);
  put(c,'surfaces/demo.tsx',source('<div class="w-[200px] h-[100px]"><span>A</span><span>B</span></div>','fixture="sample" capture={{page:true,origin:"0 0",viewport:"300x200"}}'));
  assert.equal(await compare(c,[],{all:true}),0);const summary=JSON.parse(readFileSync(path.join(c.output,'compare/summary.json')));assert.equal(summary.length,1);assert.match(readFileSync(path.join(c.output,'compare/index.html'),'utf8'),/surfaces-demo-sample-sample\/index.html/);
  put(c,'surfaces/demo.tsx',source('<div class="w-[100px] h-[50px]"><span>A</span><span>B</span></div>','fixture="sample" capture={{page:true,viewport:"300x200"}}').replace('name="sample"','name="frame-sample"'));
  const sizes=[];await compare(c,[f],{frame:'frame-sample',collect:sizes});assert.deepEqual(sizes[0].size.implementation,[200,100]);assert.match(sizes[0].report,/frame-sample/);
  c.compare.fixture=()=>({url:'http://localhost',theme:'dark',locale:'en',timezone:'Invalid/Zone',clock:'2026-01-01'});await assert.rejects(compare(c,[f],{frame:'frame-sample'}),/timezone/);
});

// Regression: overlapping source bundles repeated every imported export transform.
// Cached registrations must preserve render bytes and observe edits to an import.
test('shared source transforms preserve documents and invalidate changed exports',async t=>{
  const c=await project(t);
  const shared=put(c,'components/shared.tsx',`export const Part=()=> <span>Original</span>;export {Part as Named};export default()=>null;`);
  const a=put(c,'surfaces/a.tsx',`import {Named} from '../components/shared';${source('<div><Named/></div>')}`);
  const b=put(c,'surfaces/b.tsx',`import {Named} from '../components/shared';${source('<div><Named/></div>')}`);
  const output = built => ({css:built.css,imports:built.imports,frames:built.frames.map(frame=>({html:frame.html,light:frame.document('light'),dark:frame.document('dark')}))});
  const cold=output(await buildSource(c,a,{write:false}));
  const [warm,other]=await Promise.all([buildSource(c,a,{write:false}),buildSource(c,b,{write:false})]);
  assert.deepEqual(output(warm),cold);
  assert.match(other.frames[0].html,/Original/);
  assert.match(cold.frames[0].html,/&quot;export&quot;:&quot;Named&quot;/);
  writeFileSync(shared,`export const Changed=()=> <span>Modified</span>;export {Changed as Named};export default()=>null;`);
  const edited=await buildSource(c,a,{write:false});
  assert.match(edited.frames[0].html,/Modified/);
  assert.doesNotMatch(edited.frames[0].html,/Original|&quot;export&quot;:&quot;Part&quot;/);
  assert.match(edited.frames[0].html,/&quot;export&quot;:&quot;Changed&quot;/);
  assert.doesNotMatch(edited.frames[0].html,/&quot;export&quot;:&quot;Named&quot;/);
});
