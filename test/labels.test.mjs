import test from 'node:test';
import assert from 'node:assert/strict';
import { placeLabels } from '../public/labels.js';

const part = (text, width, extra = {}) => ({ text, size:12, width, ...extra });
const place = (candidates, obstacles = []) => placeLabels(candidates, obstacles, 1000, 1000, p => p.width);
test('set labels keep the name when only the count exceeds the slot or hits chrome', () => {
  const label={ id:'set',x:20,y:40,slot:85,parts:[part('icon-button',65),part('2 forms',43,{gap:6,optional:true})] };
  assert.deepEqual(place([label])[0].parts.map(p=>p.text),['icon-button']);
  assert.equal(place([{...label,slot:120}])[0].parts.length,2);
  assert.equal(place([{...label,slot:120}],[{x:100,y:30,width:30,height:20}])[0].parts.length,1);
  assert.equal(place([label],[{x:20,y:30,width:30,height:20}]).length,0);
  assert.equal(place([{...label,slot:60}]).length,0);
});
test('form labels use padded text bounds inside the artboard and appear as a group', () => {
  const within={x:100,y:100,width:144,height:94};
  const first={ id:'regular',x:124,y:126.5,height:13,paddingRight:6,slot:Infinity,within,parts:[part('regular',36)] };
  const second={...first,id:'compact',x:188,parts:[part('compact',42)]};
  const result=place([[first,second]]);
  assert.equal(result.length,2);
  assert.deepEqual([result[0].y,result[0].height,result[0].width],[120,13,42]);
  for(const invalid of [{...second,x:160},{...second,x:196},{...second,y:108.5}]) assert.equal(place([[first,invalid]]).length,0);
  assert.equal(place([[first,second]],[{x:220,y:120,width:30,height:15}]).length,0);
});
