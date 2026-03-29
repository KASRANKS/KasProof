(function(){const d=document.getElementById('cur'),r=document.getElementById('cur-r');if(!d||!r||window.innerWidth<768)return;let mx=0,my=0,rx=0,ry=0;
document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;d.style.left=mx+'px';d.style.top=my+'px';});
(function loop(){rx+=(mx-rx)*.12;ry+=(my-ry)*.12;r.style.left=rx+'px';r.style.top=ry+'px';requestAnimationFrame(loop)})();
document.querySelectorAll('a,button,.tab,.dz,.btn').forEach(el=>{el.addEventListener('mouseenter',()=>{r.style.width='48px';r.style.height='48px';r.style.borderColor='rgba(73,234,203,.6)';});el.addEventListener('mouseleave',()=>{r.style.width='32px';r.style.height='32px';r.style.borderColor='rgba(73,234,203,.35)';});});
})();
