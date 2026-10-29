import assert from'node:assert/strict';
export async function mousePuzzleSlide(page,id,dx,dy){
 const host=page.locator('.photo-puzzle-view'),canvas=host.locator('canvas'),box=await canvas.boundingBox(),points=JSON.parse(await host.getAttribute('data-piece-screens'));
 if(await host.getAttribute('data-drag-only')==='true'){
  const s=JSON.parse(await host.getAttribute('data-grid-screen-steps')),start=points[id];
  await page.mouse.move(box.x+start.x,box.y+start.y);await page.mouse.down();
  await page.mouse.move(box.x+start.x+s.right.x*dx+s.down.x*dy,box.y+start.y+s.right.y*dx+s.down.y*dy,{steps:6});await page.mouse.up();return;
 }
 await page.mouse.click(box.x+points[id].x,box.y+points[id].y);
 assert.equal(await host.getAttribute('data-selected'),id);
 const target=JSON.parse(await host.getAttribute('data-targets')).find(t=>t.dx===dx&&t.dy===dy);assert.ok(target,'one-cell legal mouse target');
 await page.mouse.click(box.x+target.screen.x,box.y+target.screen.y);
}
