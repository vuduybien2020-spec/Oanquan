const socket=io(),$=id=>document.getElementById(id);let me=null,room=null,selected=null,musicOn=false,ctx=null;
const qs=new URLSearchParams(location.search);let roomCode=qs.get('room')||'',hostId=qs.get('host')||'',playerKey=localStorage.getItem('quanPlayerKey');if(!playerKey){playerKey=crypto.randomUUID();localStorage.setItem('quanPlayerKey',playerKey)}
function toast(s){const t=$('toast');t.textContent=s;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2500)}
function name(){return String($('name').value||'').trim().slice(0,22)}
function join(){socket.emit('room:join',{code:roomCode,name:name(),hostId,playerKey})}
$('join').onclick=()=>{roomCode=$('code').value.trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(roomCode))return toast('Mã phòng gồm 6 ký tự.');if(name().length<2)return toast('Tên cần ít nhất 2 ký tự.');history.replaceState(null,'',`/?room=${roomCode}`);join()};
$('create').onclick=async()=>{if(name().length<2)return toast('Nhập tên ít nhất 2 ký tự.');try{const r=await fetch('/api/room/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name(),playerKey})});const d=await r.json();if(!r.ok)throw Error(d.error);roomCode=d.code;hostId=d.hostId;history.replaceState(null,'',`/?room=${roomCode}&host=${hostId}`);join()}catch(e){toast(e.message)}};
socket.on('connect',()=>{if(roomCode)join()});socket.on('connect_error',()=>toast('Không kết nối được máy chủ.'));
socket.on('room:joined',d=>{me=d.playerId;$('lobby').classList.add('hidden');$('game').classList.remove('hidden');$('roomLabel').textContent=d.code;fetch(`/api/room/${d.code}/qr`).then(x=>x.json()).then(q=>{$('qrBox').innerHTML=`<p>Quét QR để mời bạn chơi</p><img width="150" src="${q.qr}"><br><a href="${q.url}">${q.url}</a>`})});
socket.on('game:error',toast);socket.on('room:state',s=>{room=s;render()});socket.on('quan:result',d=>toast(d.message));
function render(){if(!room)return;room.board=Array.isArray(room.board)?room.board:[];const board=room.board;const players=room.players,my=players.find(p=>p.id===me),side=my?.side??0,other=players.find(p=>p.side!==side);$('online').textContent=players.filter(p=>p.connected).length+'/2';$('name0').textContent=my?.name||'Bạn';$('name1').textContent=other?.name||'Đối thủ';$('label0').textContent=my?.name||'BẠN';$('label1').textContent=other?.name||'ĐỐI THỦ';$('score0').textContent=room.scores[side]+' quân';$('score1').textContent=room.scores[1-side]+' quân';$('status').textContent=room.notice;$('quan0').textContent=Number(board[0]??10);$('quan1').textContent=Number(board[6]??10);$('pitsTop').innerHTML='';$('pitsBottom').innerHTML='';
for(let i=0;i<5;i++){$('pitsTop').append(makePit(11-i,1-side));$('pitsBottom').append(makePit(i+1,side))}
$('startGame').disabled=!my?.host||players.length<2||room.status==='playing';$('log').textContent=room.log||'Chúc may mắn!'}
function makePit(index,owner){const b=document.createElement('button');b.className='pit'+(selected===index?' selected':'')+(owner===room.currentSide?' mine':'');b.dataset.pitIndex=index;const count=Number(room.board?.[index]??5);b.innerHTML=`<span class="stones">${count}</span><small>Ô dân</small>`;b.disabled=owner!==room.currentSide||room.status!=='playing'||room.currentSide!==room.players.find(p=>p.id===me)?.side||count===0;b.onclick=()=>{selected=index;render()};return b}
let sowing=false;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function pitPosition(index){const pit=document.querySelector(`[data-pit-index="${index}"]`),frame=document.querySelector('.board-frame');if(!pit||!frame)return null;const a=pit.getBoundingClientRect(),b=frame.getBoundingClientRect();return {x:a.left-b.left+a.width/2,y:a.top-b.top+a.height/2};}
async function animateSowing(pit,dir){
  const frame=document.querySelector('.board-frame');if(!frame||!room)return;
  const board=room.board.slice(),hand=document.createElement('div');hand.className='sowing-hand';hand.textContent='🤚';frame.append(hand);
  let stones=board[pit];board[pit]=0;let pos=pit,route=[];
  const sow=()=>{while(stones>0){pos=(pos+dir+12)%12;board[pos]++;route.push(pos);stones--;}};
  sow();if(board[pos]>1){stones=board[pos];board[pos]=0;sow();}
  for(const index of route){const point=pitPosition(index);if(point){hand.style.left=`${point.x}px`;hand.style.top=`${point.y}px`;hand.classList.add('active');}await sleep(185);}
  hand.classList.add('finish');await sleep(140);hand.remove();
}
async function move(dir){if(selected===null)return toast('Hãy chọn một ô dân bên bạn.');if(sowing)return;sowing=true;const pit=selected;selected=null;render();document.querySelectorAll('.pit').forEach(b=>b.disabled=true);try{await animateSowing(pit,dir);socket.emit('quan:move',{pit,direction:dir});}finally{sowing=false;}}
$('left').onclick=()=>move(-1);$('right').onclick=()=>move(1);$('startGame').onclick=()=>socket.emit('quan:start');$('copyRoom').onclick=()=>{navigator.clipboard?.writeText(location.href);toast('Đã sao chép liên kết phòng.')};
function playMusic(){ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();const notes=[523,659,784,659,587,698,784,1047];let i=0;setInterval(()=>{if(!musicOn)return;const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=notes[i++%notes.length];g.gain.value=.025;o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.2)},350)}
$('musicToggle').onclick=()=>{musicOn=!musicOn;$('musicToggle').textContent=musicOn?'🎵 Nhạc: Bật':'🎵 Nhạc: Tắt';if(musicOn)playMusic()};
