(function(){
  const c=document.getElementById('bgc');if(!c)return;
  const ctx=c.getContext('2d');
  const KAS='rgba(73,234,203,',GOLD='rgba(240,192,64,',BLUE='rgba(100,180,252,';
  const isMob='ontouchstart' in window;
  const CONN=210;
  let W=0,H=0,pts=[];
  function resize(){W=window.innerWidth;H=window.innerHeight;c.width=W;c.height=H;}
  class P{constructor(){this.reset();}
    reset(){this.x=Math.random()*W;this.y=Math.random()*H;this.vx=(Math.random()-.5)*.3;this.vy=(Math.random()-.5)*.3;this.ph=Math.random()*6.28;this.sp=.005+Math.random()*.012;const r=Math.random();if(r<.68){this.col=KAS;this.r=2+Math.random()*1.6;}else if(r<.86){this.col=GOLD;this.r=1.6+Math.random()*1.2;}else{this.col=BLUE;this.r=1.4+Math.random();}}
    update(){this.x+=this.vx;this.y+=this.vy;this.ph+=this.sp;if(this.x<-70||this.x>W+70||this.y<-70||this.y>H+70)this.reset();}
    draw(){const a=.38+.3*Math.sin(this.ph);ctx.beginPath();ctx.arc(this.x,this.y,this.r*4,0,6.28);ctx.fillStyle=this.col+(a*.12)+')';ctx.fill();ctx.beginPath();ctx.arc(this.x,this.y,this.r,0,6.28);ctx.fillStyle=this.col+a+')';ctx.fill();}
  }
  function mk(){const n=isMob?Math.min(20,Math.floor(W*H/25000)):Math.min(100,Math.floor(W*H/12000));pts=Array.from({length:n},()=>new P());}
  function conns(){for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy);if(d>=CONN)continue;const int=1-d/CONN;ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.strokeStyle=KAS+(int*.28)+')';ctx.lineWidth=int*1.6;ctx.stroke();}}
  function frame(){ctx.clearRect(0,0,W,H);conns();pts.forEach(p=>{p.update();p.draw();});requestAnimationFrame(frame);}
  resize();mk();window.addEventListener('resize',()=>{resize();mk();});frame();
})();
var obs=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)e.target.classList.add("vis")})},{threshold:.12});document.querySelectorAll(".rv").forEach(function(el){obs.observe(el)});
