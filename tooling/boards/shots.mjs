import { writeFileSync, readFileSync } from 'node:fs';
import { call } from './doop.mjs';
const state = JSON.parse(readFileSync('./publish-state.json', 'utf8'));
for (const key of Object.keys(state).filter(k => k.startsWith('board-'))) {
  const result = await call('get_frame_screenshot', { frame_id: state[key], agent_name: 'Claude' });
  const image = (result.content ?? []).find(c => c.type === 'image');
  if (!image) { console.log(key, 'no image', JSON.stringify(result).slice(0, 300)); continue; }
  writeFileSync(`out/doop-${key}.png`, Buffer.from(image.data, 'base64'));
  console.log(key, 'saved', image.data.length);
}
