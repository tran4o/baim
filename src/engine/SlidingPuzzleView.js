import { PHOTO_PUZZLE, initialPuzzle, validPuzzle, movePuzzle, puzzleHint, puzzleSolved } from './SlidingBlockPuzzle.js';
import { puzzleMoveTargets, puzzleDragDirection, puzzleDragPreview } from './PuzzlePointer.js';

// A genuine Blender GLB, with grid rules shared by mouse and accessible controls.
export function createSlidingPuzzle({ state, text, onChange, onSolved, onClose, definition = PHOTO_PUZZLE,
  modelUrl = 'assets/chapter1/puzzles/photo-cupboard-c01.glb', helpKey = 'help', goalTextKey = null,
  selectedPieceId = 'blue', showExit = false, legalDirectionsOnly = false, directMouse = false, dragOnly = false, minimal = false }) {
  const freshState = () => ({ ...initialPuzzle(definition), ...(definition.id ? { definitionId: definition.id } : {}) });
  const boundState = !definition.id || (state?.definitionId === definition.id && Object.keys(state?.positions || {}).length === definition.pieces.length);
  let current = validPuzzle(state, definition) && boundState ? structuredClone(state) : freshState();
  let selected = selectedPieceId, ready = false, disposed = false, release = () => {}, draw = () => {};
  const panel = document.createElement('section'); panel.className = 'photo-puzzle-screen';
  panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true'); panel.setAttribute('aria-label',text('title'));
  const title=document.createElement('h2'); title.textContent=text('title'); panel.append(title);
  panel.dataset.definitionId=definition.id || 'photo-puzzle-medium-c01';
  const help=document.createElement('p'); help.textContent=text(helpKey); panel.append(help);
  if(minimal){title.hidden=true;help.hidden=true;panel.dataset.presentation='minimal-drag';}
  const host=document.createElement('div'); host.className='photo-puzzle-view'; panel.append(host);
  if(goalTextKey){const goal=document.createElement('p');goal.className='photo-puzzle-goal';goal.style.cssText='color:#57c4ff;font-weight:bold;margin:4px;';goal.textContent=text(goalTextKey);panel.append(goal);}
  const status=document.createElement('p'); status.setAttribute('role','status'); status.textContent=text('loading'); panel.append(status);
  if(minimal)status.style.cssText='position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;';
  const buttons=document.createElement('div'); buttons.className='photo-puzzle-controls'; panel.append(buttons);
  const pieceButtons = new Map();
  const directions = [];
  function updateDirections() { if(legalDirectionsOnly)for(const {button,dx,dy} of directions)button.disabled=!ready || !movePuzzle(current,selected,dx,dy,definition); }
  function button(label, action, parent=buttons) { const b=document.createElement('button'); b.type='button'; b.textContent=label; b.onclick=action; parent.append(b); return b; }
  function choose(id) { selected=id; for(const [key,b] of pieceButtons) b.setAttribute('aria-pressed',String(key===id)); updateDirections(); draw(); }
  const selectors=document.createElement('div'); selectors.className='photo-puzzle-pieces'; panel.append(selectors);
  if(directMouse) selectors.style.cssText='position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);';
  for(const [i,p] of definition.pieces.entries()) {
    const b=button(`${text(minimal?'title':p.color)} ${i+1}`,()=>choose(p.id),selectors); b.dataset.piece=p.id; pieceButtons.set(p.id,b);
    if(directMouse)b.addEventListener('focus',()=>choose(p.id));
  }
  function slide(dx,dy) {
    if(!ready || disposed) return;
    const next=movePuzzle(current,selected,dx,dy,definition);
    if(!next) { status.textContent=text('blocked'); return; }
    current=next; onChange(structuredClone(current)); updateDirections(); draw();
    if(!dragOnly)pieceButtons.get(selected)?.focus();
    status.textContent=`${text('moves')}: ${current.moves}`;
    if(puzzleSolved(current,definition)) { ready=false; onSolved(); }
  }
  for(const [key,dx,dy,glyph] of (directMouse?[]:[['left',-1,0,'←'],['up',0,-1,'↑'],['down',0,1,'↓'],['right',1,0,'→']])) {
    const b=button(`${glyph} ${text(key)}`,()=>slide(dx,dy)); b.dataset.direction=key;directions.push({button:b,dx,dy});
  }
  if(!minimal)button(text('hint'),()=>{
    if(!ready) return;
      const hint=puzzleHint(current,definition); if(!hint) return;
    choose(hint.id);
    status.textContent=`${pieceButtons.get(hint.id).textContent}: ${text(hint.dx<0?'left':hint.dx>0?'right':hint.dy<0?'up':'down')}`;
  }).dataset.action='hint';
  button(text('reset'),()=> { if(!ready) return; current=freshState(); onChange(structuredClone(current)); choose(selectedPieceId); status.textContent=`${text('moves')}: 0`; }).dataset.action='reset';
  button(text('close'),onClose);
  const keydown=event=>{
    if(event.key==='Escape') { event.preventDefault(); onClose(); return; }
    if(event.key==='Tab') {
      const controls=[...panel.querySelectorAll('button')], i=controls.indexOf(document.activeElement);
      controls[(i+(event.shiftKey?-1:1)+controls.length)%controls.length]?.focus(); event.preventDefault(); return;
    }
    const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(d) { event.preventDefault(); slide(...d); }
  };
  panel.addEventListener('keydown',keydown); choose(selectedPieceId);
  (async()=>{
    const [T,{GLTFLoader}]=await Promise.all([import('../vendor/three/three.module.js'),import('../vendor/three/GLTFLoader.js')]);
    if(disposed) return;
    const renderer=new T.WebGLRenderer({antialias:true,alpha:true}); renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    const scene=new T.Scene(), camera=new T.OrthographicCamera(-.15,.15,.145,-.145,.001,2);
    camera.position.set(0,.37,.22); camera.lookAt(0,0,0);
    scene.add(new T.HemisphereLight(0xfff0d2,0x372616,2.8));
    const light=new T.DirectionalLight(0xffffff,3); light.position.set(-.15,.4,.2); scene.add(light);
    const canvas=renderer.domElement; canvas.setAttribute('aria-label',text('title')); canvas.tabIndex=0; canvas.style.touchAction='none'; host.append(canvas);
    let model=null; const pieces=new Map(), ray=new T.Raycaster();
    let hover=null,gesture=null;
    const feedback=new T.Group();scene.add(feedback);
    const clearFeedback=()=>{for(const child of [...feedback.children]){feedback.remove(child);child.geometry.dispose();child.material.dispose();}};
    const projected=(x,y,z)=>{const v=new T.Vector3(x,y,z).project(camera);return{x:(v.x+1)*canvas.clientWidth/2,y:(1-v.y)*canvas.clientHeight/2};};
    draw=()=>{
      if(disposed) return;
      for(const p of definition.pieces) {
        const object=pieces.get(p.id); if(!object) continue;
        object.position.x=(current.positions[p.id].x+p.w/2-2)*.04;
        object.position.z=(current.positions[p.id].y+p.h/2-2.5)*.04;
        object.position.y = !dragOnly && p.id === selected ? .012 : .010;
        if(dragOnly&&gesture?.id===p.id&&gesture.preview){object.position.x+=gesture.preview.x;object.position.z+=gesture.preview.z;}
      }
      const w=Math.max(250,host.clientWidth),h=Math.max(230,host.clientHeight);
      camera.left=-.145*w/h; camera.right=.145*w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h,false);
      clearFeedback();
      if(directMouse && ready){
        const selectedObject=pieces.get(selected);
        if(selectedObject&&!dragOnly){selectedObject.updateWorldMatrix(true,true);const outline=new T.Box3Helper(new T.Box3().setFromObject(selectedObject).expandByScalar(.0007),0xffdf70);outline.material.depthTest=false;feedback.add(outline);}
        const targets=puzzleMoveTargets(current,selected,definition);
        if(!dragOnly)for(const t of targets){const hot=hover?.x===t.x&&hover?.y===t.y,marker=new T.Mesh(new T.PlaneGeometry(.034,.034),new T.MeshBasicMaterial({color:hot?0x9affbf:0x50dba0,transparent:true,opacity:hot?.75:.30,side:T.DoubleSide,depthTest:false}));marker.rotation.x=-Math.PI/2;marker.position.set((t.x+.5-2)*.04,.018,(t.y+.5-2.5)*.04);marker.renderOrder=2;feedback.add(marker);}
        host.dataset.targets=JSON.stringify(targets.map(t=>({...t,screen:projected((t.x+.5-2)*.04,.018,(t.y+.5-2.5)*.04)})));
        host.dataset.pieceScreens=JSON.stringify(Object.fromEntries(definition.pieces.map(s=>{const p=current.positions[s.id];return[s.id,projected((p.x+s.w/2-2)*.04,.026,(p.y+s.h/2-2.5)*.04)];})));
        host.dataset.selected=selected;
        const origin=projected(0,.018,0),right=projected(.04,.018,0),down=projected(0,.018,.04);
        host.dataset.gridScreenSteps=JSON.stringify({right:{x:right.x-origin.x,y:right.y-origin.y},down:{x:down.x-origin.x,y:down.y-origin.y}});
      }
      renderer.render(scene,camera);
      host.dataset.modelState=ready?'ready':'loading'; host.dataset.triangles=renderer.info.render.triangles;
      host.dataset.pieceIds=JSON.stringify([...pieces.keys()].sort());
      host.dataset.pieceTransforms=JSON.stringify(Object.fromEntries([...pieces].map(([id,o])=>[id,{x:o.position.x,y:o.position.y,z:o.position.z}])));
      host.dataset.definitionId=definition.id || 'photo-puzzle-medium-c01';host.dataset.exitVisible=String(showExit);
      host.dataset.dragOnly=String(dragOnly);host.dataset.dragging=gesture?.id||'';host.dataset.dragOffset=JSON.stringify(gesture?.preview||{x:0,z:0});host.dataset.feedbackCount=String(feedback.children.length);
    };
    const cast=event=>{
      const r=canvas.getBoundingClientRect();
      ray.setFromCamera(new T.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),camera);
    };
    const tileAt=event=>{cast(event);
      for(const hit of ray.intersectObjects([...pieces.values()],true)) {
        let o=hit.object; while(o && !o.userData.pieceId) o=o.parent;
        if(o) return o.userData.pieceId;
      }
      return null;
    };
    const boardAt=event=>{cast(event);return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-.018),new T.Vector3());};
    const cellAt=event=>{const p=boardAt(event);return p?{x:Math.floor(p.x/.04+2),y:Math.floor(p.z/.04+2.5)}:null;};
    const pick=event=>{
      if(!ready || event.button!==0) return;
      const id=tileAt(event);
      if(id)choose(id);
      if(!directMouse){if(id)pieceButtons.get(id).focus();return;}
      canvas.focus();if(dragOnly&&!id){gesture=null;return;}gesture={id,start:boardAt(event),clientX:event.clientX,clientY:event.clientY,pointerId:event.pointerId,preview:{x:0,z:0}};canvas.setPointerCapture(event.pointerId);draw();
    };
    const move=event=>{
      if(!ready || !directMouse)return;
      if(dragOnly&&gesture?.id){if(!(event.buttons&1)){cancel();return;}gesture.preview=puzzleDragPreview(current,gesture.id,gesture.start,boardAt(event),definition);}
      hover=cellAt(event);const target=!dragOnly&&puzzleMoveTargets(current,selected,definition).some(t=>t.x===hover?.x&&t.y===hover?.y);
      canvas.style.cursor=gesture?.id?'grabbing':tileAt(event)?'grab':target?'pointer':'default';draw();
    };
    const up=event=>{
      if(!gesture || event.pointerId!==gesture.pointerId)return;
      const g=gesture;gesture=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
      if(!ready)return;
      const distance=Math.hypot(event.clientX-g.clientX,event.clientY-g.clientY),end=boardAt(event);
      if(g.id && g.start && end){const d=puzzleDragDirection(g.start,end,distance);if(d)slide(d.dx,d.dy);}
      else if(!dragOnly&&distance<12){const cell=cellAt(event),target=puzzleMoveTargets(current,selected,definition).find(t=>t.x===cell?.x&&t.y===cell?.y);if(target)slide(target.dx,target.dy);}
      hover=null;canvas.style.cursor='grab';draw();
    };
    const cancel=()=>{const id=gesture?.pointerId;gesture=null;hover=null;if(id!==undefined&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);canvas.style.cursor='grab';draw();};
    canvas.addEventListener('pointerdown',pick);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);const observer=new ResizeObserver(draw); observer.observe(host);
    const disposeModel=root=>{ const materials=new Set(),textures=new Set(); root?.traverse(o=>{o.geometry?.dispose(); for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)) materials.add(m);}); for(const m of materials){ for(const v of Object.values(m))if(v?.isTexture)textures.add(v); m.dispose(); } for(const t of textures){t.source?.data?.close?.();t.dispose();} };
    release=()=>{observer.disconnect();canvas.removeEventListener('pointerdown',pick);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',cancel);clearFeedback();disposeModel(model);renderer.dispose();renderer.forceContextLoss();};
    try {
      const gltf=await new GLTFLoader().loadAsync(modelUrl);
      if(disposed) { disposeModel(gltf.scene); return; }
      model=gltf.scene; model.traverse(o=>{if(o.userData.pieceId)pieces.set(o.userData.pieceId,o);});
      if(pieces.size!==definition.pieces.length || definition.pieces.some(p=>!pieces.has(p.id))) throw new Error('Puzzle model/definition mismatch');
      if(showExit){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([-.006,.019,.119,.006,.019,.119,.006,.019,.14,-.006,.019,.119,.006,.019,.14,-.006,.019,.14,-.018,.019,.14,.018,.019,.14,0,.019,.16],3));const marker=new T.Mesh(geometry,new T.MeshBasicMaterial({color:0x29b6f6,side:T.DoubleSide}));marker.name='easy-bottom-exit';model.add(marker);}
      scene.add(model); ready=true; updateDirections(); status.textContent=`${text('moves')}: ${current.moves}`; draw();
      if(puzzleSolved(current,definition)) { ready=false; onSolved(); }
    } catch(error) { if(!disposed) {ready=false;host.dataset.modelState='error';status.textContent=text('error');} }
  })().catch(()=> {if(!disposed)status.textContent=text('error');});
  queueMicrotask(()=> {if(!disposed)pieceButtons.get(selectedPieceId)?.focus();});
  return { element:panel, dispose(){disposed=true;ready=false;panel.removeEventListener('keydown',keydown);release();} };
}
