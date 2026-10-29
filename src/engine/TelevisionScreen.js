// Original, silent fictional-news graphic. No media element, stream or audio player.
export function drawTelevisionScreen(ctx, screen, elapsedMs, text) {
  const {x,y,w,h}=screen,t=Math.max(0,elapsedMs||0)/1000;
  ctx.save();ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(w,h)*.19);ctx.clip();ctx.translate(x,y);ctx.scale(w/48,h/64);
  const glow=ctx.createLinearGradient(0,0,48,64);glow.addColorStop(0,'#304b49');glow.addColorStop(1,'#142c31');ctx.fillStyle=glow;ctx.fillRect(0,0,48,64);
  ctx.fillStyle='#b9c9b0';ctx.font='bold 6px Arial';ctx.textAlign='center';ctx.fillText(text('tv.news.title'),24,10,42);
  ctx.strokeStyle='#809487';ctx.lineWidth=.5;for(let a=14;a<40;a+=6){ctx.beginPath();ctx.moveTo(4,a);ctx.lineTo(44,a);ctx.stroke();}
  ctx.fillStyle='#536e65';ctx.fillRect(5,17,12,23);ctx.fillStyle='#a0afa1';ctx.fillRect(7,20,6,8);ctx.fillRect(10,30,6,6);
  ctx.fillStyle='#c9bb91';ctx.beginPath();ctx.ellipse(29,25,5,7,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#333a36';ctx.beginPath();ctx.ellipse(29,20,5,3,0,Math.PI,Math.PI*2);ctx.fill();ctx.fillRect(26,24,1,1);ctx.fillRect(31,24,1,1);ctx.fillRect(28,29,3,Math.sin(t*9)>.2?1.8:.6);
  ctx.fillStyle='#263c42';ctx.fillRect(21,32,17,12);ctx.fillStyle='#c6c6ad';ctx.beginPath();ctx.moveTo(25,32);ctx.lineTo(29,39);ctx.lineTo(32,32);ctx.fill();ctx.fillStyle='#71877d';ctx.fillRect(3,42,42,6);
  const page=Math.floor(t/6)%2;ctx.fillStyle='#c3c9ad';ctx.font='bold 4.2px Arial';ctx.fillText(text(page?'tv.news.line2':'tv.news.line1'),24,55,42);
  ctx.fillStyle='rgba(0,0,0,.15)';for(let row=0;row<64;row+=2)ctx.fillRect(0,row,48,.6);ctx.fillStyle='rgba(222,238,202,.09)';ctx.fillRect(0,(t*12)%64,48,1);ctx.restore();
}
