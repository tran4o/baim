import { mountInspectionControls, INSPECTION_PROFILE } from './InspectionControls.js';
// Static shelf props and optional inspection share the same GLB, with no sprite replacement.
export function mountObjectProp(host, { modelUrl, text = {}, interactive = false, cameraDirection = [0.18, 0.12, 1], fitBounds = false, verticalAlign = 'center', shelfPose = null, onReady = () => {}, onError = () => {} }) {
  let disposed = false, release = () => {};
  const status = document.createElement('span');status.className='object-prop-status';status.setAttribute('role','status');status.textContent=text.loading || '';host.append(status);host.dataset.modelState='loading';
  (async()=>{
    const [T,{GLTFLoader}]=await Promise.all([import('../vendor/three/three.module.js'),import('../vendor/three/GLTFLoader.js')]);if(disposed)return;
    const renderer=new T.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0,0);renderer.toneMapping=T.ACESFilmicToneMapping;
    const canvas=renderer.domElement;canvas.style.cssText='display:block;width:100%;height:100%;';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',text.name||'');if(interactive)canvas.tabIndex=0;else canvas.style.pointerEvents='none';host.prepend(canvas);
    const scene=new T.Scene(),pivot=new T.Group(),camera=new T.PerspectiveCamera(32,1,.001,100);scene.add(pivot);scene.add(new T.HemisphereLight(0xffefd5,0x574331,2.6));for(const[x,y,z,power]of [[2,3,4,3],[-3,1,1,1.4]]){const light=new T.DirectionalLight(0xffffff,power);light.position.set(x,y,z);scene.add(light);}
    let model=null,center=null,size=null,zoom=1,yaw=0,pitch=0,ground=null,supportY=null;
    // Shelf placement is independent of the shared, front-facing inventory inspection profile.
    const resting = !interactive && shelfPose;
    if(resting){renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.localClippingEnabled=true;}
    const dir=new T.Vector3(...cameraDirection).normalize();
    const draw=()=>{
      if(disposed||!size)return;
      const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;
      const radius=size.length()/2,halfFov=Math.min(T.MathUtils.degToRad(16),Math.atan(Math.tan(T.MathUtils.degToRad(16))*camera.aspect)),distance=radius/Math.sin(halfFov)*1.08/zoom;
      camera.clearViewOffset();camera.zoom=1;camera.position.copy(dir).multiplyScalar(distance);camera.near=Math.max(.001,distance-radius*1.2);camera.far=distance+radius*4;camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);pivot.rotation.set(pitch,yaw,0,'YXZ');scene.updateMatrixWorld(true);
      const box=new T.Box3().setFromObject(pivot),corners=[];if(supportY!==null)box.min.y=supportY;for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])corners.push(new T.Vector3(x,y,z));
      const screenBounds=()=>{let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;const point=new T.Vector3(),include=v=>{v.project(camera);minX=Math.min(minX,v.x);maxX=Math.max(maxX,v.x);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);};if(resting){pivot.traverse(o=>{const a=o.geometry?.attributes?.position;if(!a)return;for(let i=0;i<a.count;i++){point.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);if(supportY===null||point.y>=supportY-1e-6)include(point);}});}else for(const p of corners)include(point.copy(p));return{minX,maxX,minY,maxY};};
      if(fitBounds&&!interactive){const b=screenBounds(),maxX=Math.max(Math.abs(b.minX),Math.abs(b.maxX)),maxY=Math.max(Math.abs(b.minY),Math.abs(b.maxY));camera.zoom=Math.min(.92/maxX,.92/maxY);camera.updateProjectionMatrix();
        if(verticalAlign==='bottom'){const bottom=screenBounds().minY;camera.setViewOffset(w,h,0,(-.98-bottom)*h/2,w,h);}
      }
      const b=screenBounds();host.dataset.projectedBounds=JSON.stringify({left:(b.minX+1)*w/2,right:(b.maxX+1)*w/2,top:(1-b.maxY)*h/2,bottom:(1-b.minY)*h/2,width:w,height:h});
      renderer.render(scene,camera);host.dataset.renders=String(Number(host.dataset.renders||0)+1);host.dataset.triangles=String(renderer.info.render.triangles);host.dataset.yaw=String(yaw);host.dataset.pitch=String(pitch);host.dataset.zoom=String(zoom);
    };
    const observer=new ResizeObserver(draw);observer.observe(host);
    const controls=interactive?mountInspectionControls(canvas,state=>{({yaw,pitch,zoom}=state);draw();}):null;
    if(interactive)host.dataset.inspectionProfile=INSPECTION_PROFILE.id;
    const lost=e=>{e.preventDefault();host.dataset.modelState='error';status.textContent=text.unavailable||'';onError();};
    canvas.addEventListener('webglcontextlost',lost);
    const disposeModel=root=>{const materials=new Set(),textures=new Set();root?.traverse(o=>{o.geometry?.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]).filter(Boolean))materials.add(m);});for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}for(const t of textures){t.source?.data?.close?.();t.dispose();}};
    release=()=>{observer.disconnect();controls?.dispose();canvas.removeEventListener('webglcontextlost',lost);disposeModel(model);disposeModel(ground);renderer.dispose();renderer.forceContextLoss();};
    try{const gltf=await new GLTFLoader().loadAsync(modelUrl);if(disposed){disposeModel(gltf.scene);return;}model=gltf.scene;
      if(resting)model.rotation.set(...shelfPose.rotation,'YXZ');
      const box=new T.Box3().setFromObject(model);
      if(resting&&shelfPose.supportMesh){const body=model.getObjectByName(shelfPose.supportMesh);if(!body)throw Error('Missing support body');box.min.y=new T.Box3().setFromObject(body).min.y;}
      center=box.getCenter(new T.Vector3());size=box.getSize(new T.Vector3());if(!Number.isFinite(size.length())||size.length()<=0)throw Error('Empty prop');model.position.sub(center);pivot.add(model);
      if(resting){
        const radius=size.length()/2, floorY=-size.y/2;supportY=floorY;
        // The shelf hides straps that would otherwise hang through its supporting surface.
        const clip=new T.Plane(new T.Vector3(0,1,0),-floorY);
        model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;for(const m of(Array.isArray(o.material)?o.material:[o.material])){m.clippingPlanes=[clip];m.clipShadows=true;}}});
        ground=new T.Mesh(new T.PlaneGeometry(size.x*1.35,size.z*1.35),new T.ShadowMaterial({opacity:.32,depthWrite:false}));ground.rotation.x=-Math.PI/2;ground.position.y=floorY-.001;ground.receiveShadow=true;scene.add(ground);
        const light=new T.DirectionalLight(0xffe4bd,1.2);light.position.set(-radius,radius*4,radius*3);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-radius*2,right:radius*2,top:radius*2,bottom:-radius*2,near:.001,far:radius*12});light.shadow.bias=-.0001;light.shadow.normalBias=.002;scene.add(light);
        host.dataset.shelfPose=JSON.stringify(shelfPose);host.dataset.supportPlane=String(floorY);host.dataset.supportGap='0';
      }
      host.dataset.modelState='ready';status.textContent='';draw();onReady();}
    catch(error){if(!disposed){host.dataset.modelState='error';host.dataset.modelError=error.message;status.textContent=text.unavailable||'';onError();}}
  })().catch(()=>{if(!disposed){host.dataset.modelState='error';status.textContent=text.unavailable||'';onError();}});
  return {dispose(){disposed=true;release();}};
}
