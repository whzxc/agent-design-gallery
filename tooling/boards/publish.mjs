// Publish rendered boards to one Doop canvas, one frame per board; re-runs replace HTML in place.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { call } from './doop.mjs';
import { carryAnchors } from './anchors.mjs';
const agent_name = 'Claude';
const boards = [
  ['board-01-foundations', '01 · 基础'],
  ['board-02-controls', '02 · 控件'],
  ['board-03-containers', '03 · 容器与展示'],
  ['board-04-timeline', '04 · 任务时间线'],
];
const stateFile = './publish-state.json';
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
if (!state.canvasId) state.canvasId = (await call('create_canvas', { name: 'ARC · Design boards', agent_name })).id;
writeFileSync(stateFile, JSON.stringify(state, null, 1));
let x = 0;
for (const [file, name] of boards) {
  let html = readFileSync(`out/${file}-light.html`, 'utf8');
  const { height } = JSON.parse(readFileSync(`out/${file}-light.meta.json`, 'utf8'));
  const started = Date.now();
  let anchors;
  if (state[file]) {
    const current = await call('get_frame', { frame_id: state[file], expand_components: true, agent_name });
    const carried = carryAnchors(current.html ?? current.frame?.html ?? '', html);
    html = carried.html;
    anchors = { kept: carried.kept.map(a => a.id), orphaned: carried.orphaned };
    await call('set_frame_html', { frame_id: state[file], html, agent_name });
    await call('update_frame', { frame_id: state[file], name, x, y: 0, width: 1680, height, agent_name });
  } else {
    const created = await call('create_frame', { canvas_id: state.canvasId, name, html, x, y: 0, width: 1680, height, agent_name });
    state[file] = created.frame?.id ?? created.id;
    writeFileSync(stateFile, JSON.stringify(state, null, 1));
  }
  console.log(JSON.stringify({ name, frameId: state[file], height, bytes: html.length, ms: Date.now() - started, anchors }));
  x += 1680 + 240;
}
const canvas = await call('get_canvas', { canvas_id: state.canvasId, agent_name });
console.log(JSON.stringify({ canvasId: state.canvasId, frames: canvas.frames?.map(f => [f.name, f.width, f.height]) }));
