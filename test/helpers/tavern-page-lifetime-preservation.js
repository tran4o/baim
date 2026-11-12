import {stripPortraitClothesR48} from './portrait-clothes-r48-preservation.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=s=>createHash('sha256').update(s).digest('hex');
const original='f6c6642058a7cf606e74a77436f8679a211f5e75359f2c7ef1696cc635304b4c';
const candidate='855bc128d687a386f878afc68c28fa2ab6e095562ec10e89cba5437d62663b58';
const observed='55946112ea960229974e488529db2ecbfa34115cce273062cc2317f982d14e9f';
const painted='313158d754d45ec761907a0980ac2c4a12ff8edfc7f1239a1e55a7605cd6892a';
const paintWait="   // Network quiet does not mean asynchronous startup decodes/first rendering finished.\n   // Observe actual normal-game paint, without a harness, forced draw, sleep or decode retry.\n   await normal.waitForFunction(()=>{const c=document.querySelector('#game');return c?.width>600&&c.height>350&&c.getContext('2d').getImageData(600,350,1,1).data[3]>0;});\n";
const addition="   // The harness has finished. Release its decoded atlases before booting another game;\n   // keep the context so the normal page still uses the exact earned save.\n   await page.waitForLoadState('networkidle');await page.close();assert.equal(page.isClosed(),true);\n";
export function stripTavernPageLifetime(source){
 source=String(source).replaceAll('\r\n','\n');
 source=stripPortraitClothesR48('test/tavern-cleanup-browser.test.js',source);
 if(sha(source)===painted){source=source.replace(paintWait,'');assert.equal(sha(source),observed,'exact first-render readiness inverse');}
 if(sha(source)===observed){
  source=source.replace('   await diagnostic.installLifecycle();\n','').replace("    }catch(error){evidence.error={name:error.name,message:error.message};if(im){try{const c=document.createElement('canvas');c.width=2;c.height=2;c.getContext('2d').drawImage(im,0,0,2,2);evidence.afterFailureDraw={pixels:Array.from(c.getContext('2d').getImageData(0,0,2,2).data)};}catch(drawError){evidence.afterFailureDraw={error:{name:drawError.name,message:drawError.message}};}}throw error;}","    }catch(error){evidence.error={name:error.name,message:error.message};throw error;}");
  assert.equal(sha(source),candidate,'exact diagnostic inverse; original error still thrown');
 }
 if(sha(source)===original)return source;
 assert.equal(sha(source),candidate,'exact tavern page-lifetime follow-up');
 assert.equal(source.split(addition).length,2);const before=source.replace(addition,'');
 assert.equal(sha(before),original,'unchanged historical diagnostic source/assertions');return before;
}
