import {mountObjectProp} from './ObjectPropView.js';
// Reusable modal for a content-defined interior and collectible item layers.
export function createObjectCloseup({ definition, text, backgroundSrc, items, onTake, onClose, scrollTop = 0, onScroll = () => {}, statusKey = null }) {
  const overlay = document.createElement('section');
  const propViews=[];
  const room=definition.presentation==='room';
  overlay.className = 'object-closeup-screen';
  overlay.style.cssText = 'position:absolute;inset:0;z-index:40;display:grid;place-items:center;background:#100c08dc;pointer-events:auto;padding:3%;box-sizing:border-box;';
  if(room){overlay.dataset.presentation='room';overlay.style.cssText='position:absolute;inset:0;z-index:40;background:#201912;pointer-events:auto;overflow:hidden;';}
  const panel = document.createElement('div');
  panel.className = 'object-closeup-panel';
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',text(definition.titleKey));
  panel.style.cssText='width:min(100%,600px);max-height:96%;overflow:auto;background:#302318;color:#f4e3bd;border:3px solid #a48a56;border-radius:12px;padding:14px;box-sizing:border-box;';
  if(room)panel.style.cssText='position:absolute;inset:0;overflow:hidden;background:#201912;color:#f4e3bd;';
  overlay.append(panel);
  const heading=document.createElement('h2');heading.textContent=text(definition.titleKey);heading.style.margin='0 0 8px';panel.append(heading);
  const description=document.createElement('p');description.textContent=text(definition.descriptionKey);panel.append(description);
  if(room)for(const label of [heading,description])label.style.cssText='position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;';
  if(backgroundSrc && (definition.propMode === 'separate-blender-prop-pending' || definition.propMode?.includes('test-only'))) {
    const pending=document.createElement('p');pending.className='object-closeup-prop-pending';pending.textContent=text(definition.propPendingKey);panel.append(pending);
  }
  const stage=document.createElement('div');stage.className='object-closeup-stage';
  const viewport=document.createElement('div');viewport.className='object-closeup-viewport';viewport.tabIndex=0;viewport.setAttribute('aria-label',text('wardrobe.scroll'));
  viewport.style.cssText='height:52vh;overflow-y:auto;overscroll-behavior:contain;';panel.append(viewport);
  if(room)viewport.style.cssText='position:absolute;inset:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;';
  const aspect=definition.contentAspect || {width:3,height:7};
  stage.style.cssText=`position:relative;aspect-ratio:${aspect.width}/${aspect.height};background:#201912;width:100%;`;viewport.append(stage);
  viewport.addEventListener('scroll',()=>onScroll(viewport.scrollTop));
  if(backgroundSrc){const image=document.createElement('img');image.src=backgroundSrc;image.alt='';image.style.cssText='width:100%;height:100%;object-fit:contain;display:block;';stage.append(image);}
  else {const label=document.createElement('p');label.textContent=text(definition.placeholderKey);label.style.cssText='margin:0;padding:18px;color:#e2cc91;';stage.append(label);stage.dataset.placeholder='true';}
  if(room)for(const zone of definition.exitZones||[]){const exit=document.createElement('button');exit.type='button';exit.className='object-closeup-exit';exit.dataset.exit=zone.side;exit.setAttribute('aria-label',text('wardrobe.back'));exit.title=text('wardrobe.back');exit.style.cssText=`position:absolute;left:${zone.x}%;top:0;width:${zone.w}%;height:100%;background:transparent;border:0;padding:0;cursor:default;`;exit.addEventListener('click',onClose);stage.append(exit);}
  for(const item of items){const button=document.createElement('button');button.type='button';button.dataset.itemId=item.id;button.title=text(item.actionKey || 'verb.take')+' '+text(item.nameKey);button.setAttribute('aria-label',button.title);button.dataset.propMode=definition.propMode || 'image';
    button.className='object-closeup-item';button.dataset.closeupAction=item.actionKey==='verb.use'?'use':'take';
    const r=item.rect;button.style.cssText=`position:absolute;left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;padding:0;border:0;background:transparent;cursor:pointer;`;
    if(item.modelUrl){button.disabled=true;const host=document.createElement('span');host.className='object-prop-view';host.style.cssText='display:block;width:100%;height:100%;';button.append(host);propViews.push(mountObjectProp(host,{modelUrl:item.modelUrl,cameraDirection:item.cameraDirection,fitBounds:item.fitBounds,verticalAlign:item.verticalAlign,shelfPose:item.shelfPose,text:{name:text(item.nameKey),loading:text('wardrobe.prop_loading'),unavailable:text('wardrobe.prop_unavailable')},onReady:()=>{button.disabled=false;},onError:()=>{button.disabled=true;}}));}
    else{const image=document.createElement('img');image.src=item.imageSrc;image.alt=text(item.nameKey);image.style.cssText='width:100%;height:100%;object-fit:contain;';button.append(image);}button.addEventListener('click',()=>onTake(item.id));stage.append(button);
  }
  for(const decoration of definition.decorations||[]){const image=document.createElement('img'),r=decoration.rect;image.className='object-closeup-decoration';image.src=decoration.imageUrl;image.alt='';image.draggable=false;image.style.cssText=`position:absolute;left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;object-fit:fill;pointer-events:none;`;stage.append(image);}
  if(backgroundSrc)for(const region of definition.foregroundRegions||[]){const mask=document.createElement('img');mask.className='object-closeup-foreground';mask.src=backgroundSrc;mask.alt='';mask.style.cssText=`position:absolute;inset:0;width:100%;height:100%;pointer-events:none;clip-path:${region};`;stage.append(mask);}
  const status=document.createElement('p');status.className='object-closeup-status';status.setAttribute('role','status');status.textContent=text(statusKey || (room?definition.roomHintKey:null) || definition.hintKey || (items.length?'wardrobe.take_hint':'wardrobe.no_accordion'));panel.append(status);
  const navigation=room?document.createElement('nav'):panel;if(room){navigation.setAttribute('aria-label',text(definition.titleKey));navigation.style.cssText='position:absolute;right:14px;bottom:12px;display:flex;gap:6px;z-index:2;';panel.append(navigation);status.style.cssText='position:absolute;left:14px;bottom:12px;margin:0;padding:8px 10px;max-width:62%;background:#201912df;font-size:14px;pointer-events:none;z-index:2;';}
  if(room)status.style.cssText='position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;';
  for(const [direction,delta]of [['up',-220],['down',220]]){const button=document.createElement('button');button.type='button';button.dataset.action=direction;button.textContent=text('wardrobe.'+direction);button.addEventListener('click',()=>viewport.scrollBy({top:delta,behavior:'auto'}));navigation.append(button);}
  const close=document.createElement('button');close.type='button';close.dataset.action='close';close.textContent=text(room?'wardrobe.back':'ui.inventory.close');close.addEventListener('click',onClose);navigation.append(close);
  const keydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}else if(event.key==='Tab'){const controls=[...panel.querySelectorAll('button,.object-closeup-viewport')].filter(c=>!c.disabled),i=controls.indexOf(document.activeElement);controls[(i+(event.shiftKey?-1:1)+controls.length)%controls.length]?.focus();event.preventDefault();}else if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key)){event.preventDefault();viewport.scrollTop=event.key==='Home'?0:event.key==='End'?viewport.scrollHeight:viewport.scrollTop+(['ArrowUp','PageUp'].includes(event.key)?-220:220);}};
  panel.addEventListener('keydown',keydown);
  queueMicrotask(()=>{if(panel.isConnected){viewport.scrollTop=scrollTop;viewport.focus({preventScroll:true});}});
  return {element:overlay,dispose(){panel.removeEventListener('keydown',keydown);for(const view of propViews)view.dispose();}};
}
