import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountInspectionControls, INSPECTION_PROFILE as profile } from '../src/engine/InspectionControls.js';

class Canvas extends EventTarget {
  clientWidth=400; clientHeight=300; captured=new Set();
  focus() { this.focused=true; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); this.fire('lostpointercapture',{pointerId:id}); }
  fire(type, values={}) { const event=new Event(type,{cancelable:true});Object.assign(event,values);this.dispatchEvent(event);return event; }
}
const pointer={button:0,pointerId:1,clientX:200,clientY:150};
function fixture(){const canvas=new Canvas(),changes=[],controls=mountInspectionControls(canvas,s=>changes.push(s));return{canvas,changes,controls};}
const bounded=s=>{assert.ok(Math.abs(s.pitch)<=profile.tiltLimit);assert.ok(Math.abs(s.yaw)<=profile.tiltLimit);assert.ok(s.zoom>=1&&s.zoom<=1.5);};

test('shared default keeps repeated long drags front-facing and uses bottle radius scaling',()=>{
  const{canvas:c,controls:v}=fixture();c.fire('pointerdown',pointer);c.fire('pointermove',{...pointer,clientX:275,clientY:225});
  assert.equal(v.state().yaw,profile.tiltLimit/2);assert.equal(v.state().pitch,profile.tiltLimit/2);c.fire('pointerup',pointer);
  for(let i=0;i<100;i++){c.fire('pointerdown',pointer);c.fire('pointermove',{...pointer,clientX:i<50?9999:-9999,clientY:i<50?9999:-9999});c.fire('pointerup',pointer);bounded(v.state());}
  assert.equal(v.state().yaw,-profile.tiltLimit);assert.equal(v.state().pitch,-profile.tiltLimit);
  const before=v.state();for(let i=0;i<100;i++)for(const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','e'])c.fire('keydown',{key});assert.deepEqual(v.state(),before);
  c.fire('keydown',{key:'Home'});assert.deepEqual(v.state(),{pitch:0,yaw:0,zoom:1});
});

test('shared pointer ownership, release, cancellation, reset and disposal stop dragging',()=>{
  for(const ending of ['pointerup','pointercancel','lostpointercapture','Home','dispose']){
    const{canvas:c,controls:v,changes}=fixture();c.fire('pointerdown',{...pointer,button:2});c.fire('pointermove',{...pointer,clientX:9999});assert.equal(changes.length,0);
    c.fire('pointerdown',pointer);c.fire('pointermove',{...pointer,pointerId:7,clientX:9999});assert.equal(changes.length,0);
    c.fire('pointerdown',{...pointer,pointerId:7});c.fire('pointermove',{...pointer,clientX:240});assert.ok(v.state().yaw>0);
    if(ending==='Home')c.fire('keydown',{key:'Home'});else if(ending==='dispose')v.dispose();else c.fire(ending,pointer);
    const before=v.state();c.fire('pointermove',{...pointer,clientX:9999,clientY:9999});assert.deepEqual(v.state(),before);assert.equal(c.captured.size,0);
    if(ending==='dispose'){const n=changes.length;c.fire('wheel',{deltaY:-9999,deltaMode:0});c.fire('keydown',{key:'Home'});assert.equal(changes.length,n);}
  }
});

test('shared wheel handles pixel/line/page units, clamps zoom and preserves tilt at rest',async()=>{
  const{canvas:c,controls:v,changes}=fixture();c.fire('pointerdown',pointer);c.fire('pointermove',{...pointer,clientX:260});c.fire('pointerup',pointer);const yaw=v.state().yaw;
  c.fire('wheel',{deltaY:-1,deltaMode:1});assert.equal(v.state().zoom,Math.exp(16*.0015));v.reset();
  c.fire('wheel',{deltaY:-1,deltaMode:2});assert.equal(v.state().zoom,Math.exp(.3));
  for(let i=0;i<20;i++)c.fire('wheel',{deltaY:-9999,deltaMode:0});assert.equal(v.state().zoom,1.5);
  for(let i=0;i<20;i++)c.fire('wheel',{deltaY:9999,deltaMode:0});assert.equal(v.state().zoom,1);
  c.fire('pointerdown',pointer);c.fire('pointermove',{...pointer,clientX:260});c.fire('pointerup',pointer);assert.equal(v.state().yaw,yaw);
  const before=v.state(),count=changes.length;await new Promise(r=>setTimeout(r,20));assert.deepEqual(v.state(),before);assert.equal(changes.length,count,'no idle timer emits rotation');
});

test('both existing 3D viewers install shared controls; static shelf path does not',()=>{
  for(const file of ['ItemModelViewer.js','ObjectPropView.js']){const s=readFileSync(new URL('../src/engine/'+file,import.meta.url),'utf8');assert.match(s,/from '\.\/InspectionControls\.js'/);assert.match(s,/mountInspectionControls\(canvas/);assert.doesNotMatch(s,/\.012|const limit = Math\.PI/);}
  assert.match(readFileSync(new URL('../src/engine/ObjectPropView.js',import.meta.url),'utf8'),/interactive\?mountInspectionControls/);
});
