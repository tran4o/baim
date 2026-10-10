// The scene remains 2D. Load the 3D dependencies only for an inspected item.
export function mountItemModelViewer(host, { modelUrl, fallbackUrl, text }) {
  let disposed = false, cleanup = () => {}, resetView = () => {};
  const status = document.createElement('span');
  status.className = 'item-model-status'; status.textContent = text.loading;
  status.setAttribute('role', 'status'); host.append(status);
  const fallback = () => {
    if (disposed) return;
    cleanup(); cleanup = () => {};
    host.dataset.modelState = 'fallback';
    host.querySelector('canvas')?.remove();
    const image = document.createElement('img'); image.src = fallbackUrl; image.alt = text.name;
    host.append(image); status.textContent = text.unavailable;
  };
  host.dataset.modelState = 'loading';
  (async () => {
    const [T, { GLTFLoader }, { mergeGeometries }] = await Promise.all([
      import('../vendor/three/three.module.js'), import('../vendor/three/GLTFLoader.js'),
      import('../vendor/three/BufferGeometryUtils.js')
    ]);
    if (disposed) return;
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(32, 1, .001, 5);
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.setClearColor(0x221b16, 0);
    const canvas = renderer.domElement; canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', text.controls);
    host.prepend(canvas);
    const pivot = new T.Group(); pivot.position.y = .113; scene.add(pivot);
    const target = new T.Vector3(0,.113,0);
    const render = () => {
      if (disposed) return;
      renderer.render(scene, camera);
      host.dataset.renders = String(Number(host.dataset.renders || 0) + 1);
      host.dataset.drawCalls = renderer.info.render.calls;
      host.dataset.triangles = renderer.info.render.triangles;
      host.dataset.orientation = pivot.quaternion.toArray().map(n=>n.toFixed(4)).join(',');
      host.dataset.zoom = camera.zoom.toFixed(4);
      host.dataset.distance = camera.position.distanceTo(target).toFixed(3);
      host.dataset.upY = new T.Vector3(0,1,0).applyQuaternion(pivot.quaternion).y.toFixed(3);
    };
    resetView = () => { pivot.quaternion.identity(); camera.position.set(0,.135,.46); camera.lookAt(target); render(); };
    resetView();
    scene.add(new T.HemisphereLight(0xfff5dd, 0x645240, 2.2));
    for (const [x,y,z,power] of [[.3,.4,.3,2.3],[-.3,.2,.1,1.4],[0,.3,-.3,3]]) {
      const light = new T.DirectionalLight(0xffffff, power); light.position.set(x,y,z); scene.add(light);
    }
    // Studio reflection bands make curved glass readable without an external HDR file.
    const studio = document.createElement('canvas'); studio.width = 512; studio.height = 256;
    const ctx = studio.getContext('2d'); ctx.fillStyle = '#151a17'; ctx.fillRect(0,0,512,256);
    ctx.fillStyle = '#fff7e8'; ctx.fillRect(35,15,16,225); ctx.fillRect(335,25,36,205);
    ctx.fillStyle = '#8d9f95'; ctx.fillRect(190,35,18,185);
    const env = new T.CanvasTexture(studio); env.mapping = T.EquirectangularReflectionMapping; env.colorSpace = T.SRGBColorSpace;
    const pmrem = new T.PMREMGenerator(renderer), envTarget = pmrem.fromEquirectangular(env);
    scene.environment = envTarget.texture; env.dispose(); pmrem.dispose();
    let model = null;
    const releaseModel = root => {
      const materials = new Set(), textures = new Set();
      root?.traverse(o => { if (!o.isMesh) return; o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); });
      for (const m of materials) { for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); m.dispose(); }
      for (const t of textures) { t.source?.data?.close?.(); t.dispose(); }
    };
    // Transmission needs the window background inside the 3D pass as well as behind the canvas.
    const backdrop = document.createElement('canvas'); backdrop.width=512; backdrop.height=256;
    const backdropTexture = new T.CanvasTexture(backdrop); backdropTexture.colorSpace=T.SRGBColorSpace;
    scene.background=backdropTexture;
    const paintBackdrop = () => {
      const box=host.getBoundingClientRect(), panel=host.closest('.received-item-screen').getBoundingClientRect();
      const cx=panel.width*.5,cy=panel.height*.38,rx=Math.max(cx,panel.width-cx)*Math.SQRT2,ry=Math.max(cy,panel.height-cy)*Math.SQRT2;
      const context=backdrop.getContext('2d'),pixels=context.createImageData(512,256);
      for(let y=0;y<256;y++)for(let x=0;x<512;x++){
        const dx=(box.left-panel.left+x/511*box.width-cx)/rx,dy=(box.top-panel.top+y/255*box.height-cy)/ry;
        const t=Math.min(1,Math.hypot(dx,dy)/.72),i=(y*512+x)*4;
        pixels.data[i]=59+(29-59)*t; pixels.data[i+1]=45+(23-45)*t; pixels.data[i+2]=32+(18-32)*t; pixels.data[i+3]=255;
      }
      context.putImageData(pixels,0,0);backdropTexture.needsUpdate=true;
    };
    const resize = () => { const {width,height} = host.getBoundingClientRect();
      if (!width || !height || disposed) return;
      paintBackdrop(); camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width,height,false); render(); };
    const observer = new ResizeObserver(resize); observer.observe(host);
    // Small front-facing inspection tilt. Repeated drags cannot accumulate past the limits.
    const limit = Math.PI / 12;
    let pointer = null, origin = null, pitch = 0, yaw = 0;
    const down = event => {
      if (event.button !== 0 || pointer !== null) return;
      pointer = event.pointerId;
      origin = { x:event.clientX, y:event.clientY, pitch, yaw };
      canvas.setPointerCapture(pointer); canvas.focus(); event.preventDefault();
    };
    const move = event => {
      if (event.pointerId !== pointer) return;
      const radius = Math.max(1, Math.min(canvas.clientWidth, canvas.clientHeight) / 2);
      yaw = T.MathUtils.clamp(origin.yaw + (event.clientX-origin.x)/radius*limit, -limit, limit);
      pitch = T.MathUtils.clamp(origin.pitch + (event.clientY-origin.y)/radius*limit, -limit, limit);
      pivot.rotation.set(pitch,yaw,0,'YXZ');
      host.dataset.pitch = pitch.toFixed(6); host.dataset.yaw = yaw.toFixed(6); render();
    };
    const up = event => {
      if (event.pointerId !== pointer) return;
      const id=pointer; pointer=null; origin=null;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
    canvas.addEventListener('pointerdown',down); canvas.addEventListener('pointermove',move);
    canvas.addEventListener('pointerup',up); canvas.addEventListener('pointercancel',up); canvas.addEventListener('lostpointercapture',up);
    const wheel = event => {
      event.preventDefault(); event.stopPropagation();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
      const next = T.MathUtils.clamp(camera.zoom * Math.exp(-T.MathUtils.clamp(pixels,-200,200)*.0015),1,1.5);
      if (next === camera.zoom) return;
      camera.zoom = next; camera.updateProjectionMatrix(); render();
    };
    canvas.addEventListener('wheel',wheel,{passive:false});
    const lost = event => { event.preventDefault(); fallback(); };
    canvas.addEventListener('webglcontextlost',lost);
    cleanup = () => { observer.disconnect();
      canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);
      canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('lostpointercapture',up);
      canvas.removeEventListener('wheel',wheel);
      canvas.removeEventListener('webglcontextlost',lost); releaseModel(model); model = null;
      backdropTexture.dispose(); envTarget.dispose(); renderer.dispose(); renderer.forceContextLoss(); };
    resize();
    const gltf = await new GLTFLoader().loadAsync(modelUrl);
    if (disposed || host.dataset.modelState === 'fallback') { releaseModel(gltf.scene); return; }
    gltf.scene.updateMatrixWorld(true);
    const flattened = new T.Group(), opaque = new Map();
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      let geometry = o.geometry.clone().applyMatrix4(o.matrixWorld); let m = o.material;
      if (!Array.isArray(m) && !m.transparent) {
        // Untextured cap primitives have mixed UV/index layouts; retain position
        // and normals, then normalize indexing before batching their exact triangles.
        for (const name of Object.keys(geometry.attributes)) if (!['position','normal'].includes(name)) geometry.deleteAttribute(name);
        if (geometry.index) { const old=geometry; geometry=old.toNonIndexed(); old.dispose(); }
        if (!opaque.has(m)) opaque.set(m, []); opaque.get(m).push(geometry);
      } else {
        const mesh = new T.Mesh(geometry,m);
        if (m.name.includes('glass')) {
          const original=m;
          m = new T.MeshPhysicalMaterial({name:original.name,color:0xffffff,metalness:0,roughness:.065,
            transmission:.98,ior:1.5,thickness:.003,attenuationColor:0xd5e6d9,attenuationDistance:.35,
            opacity:1,transparent:false,depthWrite:false,side:T.FrontSide,envMapIntensity:1.1});
          // The source already has a thick, rounded foot. Give its lower18mm
          // a separate optical thickness instead of treating it as a3mm wall.
          const foot = m.clone(); foot.name='Thick molded glass foot';
          foot.thickness=.014; foot.roughness=.035; foot.envMapIntensity=5;
          foot.envMap=envTarget.texture; foot.envMapRotation.x=Math.PI/2;
          foot.attenuationColor.set(0xe5eee8); foot.attenuationDistance=.5;
          const position=geometry.getAttribute('position'),index=geometry.index;
          const bodyIndices=[],footIndices=[];
          const count=index?index.count:position.count;
          for(let i=0;i<count;i+=3){
            const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
            const y=(position.getY(a)+position.getY(b)+position.getY(c))/3;
            (y<.018?footIndices:bodyIndices).push(a,b,c);
          }
          geometry.setIndex(bodyIndices.concat(footIndices));geometry.clearGroups();
          geometry.addGroup(0,bodyIndices.length,0);geometry.addGroup(bodyIndices.length,footIndices.length,1);
          mesh.material=[m,foot]; original.dispose(); mesh.renderOrder=3;
        }
        else if (m.name.includes('paper')) { m.alphaTest=.12; m.transparent=false; m.depthWrite=true; m.side=T.FrontSide; mesh.renderOrder=4; }
        else { m.transparent=false; m.opacity=1; m.depthWrite=true; m.side=T.FrontSide; m.forceSinglePass=true; m.envMapIntensity=.3; m.roughness=.2; m.color.set('#b77c00'); mesh.renderOrder=2; }
        flattened.add(mesh);
      }
    });
    for (const [material, geometries] of opaque) {
      const merged = mergeGeometries(geometries);
      if (merged) { flattened.add(new T.Mesh(merged,material)); geometries.forEach(g=>g.dispose()); }
      else geometries.forEach(g=>flattened.add(new T.Mesh(g,material)));
    }
    // Materials/textures are now owned by flattened; dispose only old geometries.
    gltf.scene.traverse(o=>{ if(o.isMesh) o.geometry.dispose(); });
    model = flattened; const centre=new T.Box3().setFromObject(model).getCenter(new T.Vector3()); model.position.sub(centre); pivot.add(model); host.dataset.modelState='ready'; status.hidden=true; render();
  })().catch(fallback);
  return { dispose: () => { disposed=true; cleanup(); } };
}
