import {mountInspectionControls} from './InspectionControls.js';
// Every inventory object has a readable inspection, even without a native model.
export function mountItemImageView(host,{imageUrl,text}){
 if(!imageUrl){const label=document.createElement('p');label.textContent=text.name;host.append(label);host.dataset.modelState='ready';host.dataset.inspectionType='text';return{dispose(){label.remove();}};}
 const image=document.createElement('img');image.src=imageUrl;image.alt=text.name;image.tabIndex=0;image.className='inventory-inspection-image';
 host.style.overflow='hidden';image.style.cssText='display:block;width:100%;height:100%;object-fit:contain;transform-origin:center;';host.append(image);
 const controls=mountInspectionControls(image,({zoom})=>{image.style.transform=`scale(${zoom})`;host.dataset.zoom=String(zoom);});
 image.onload=()=>{host.dataset.modelState='ready';host.dataset.inspectionType='image';};
 image.onerror=()=>{host.dataset.modelState='error';const label=document.createElement('p');label.textContent=text.name;host.append(label);};
 return{dispose(){controls.dispose();image.remove();}};
}
