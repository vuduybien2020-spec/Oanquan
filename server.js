const express=require('express'),http=require('http'),{Server}=require('socket.io'),QRCode=require('qrcode'),crypto=require('crypto'),path=require('path');
const app=express();app.use(express.json());app.use(express.static(path.join(__dirname,'public')));const server=http.createServer(app),io=new Server(server),rooms=new Map(),id=()=>crypto.randomUUID(),PORT=process.env.PORT||8080;
function clean(s){return String(s||'').normalize('NFC').replace(/[<>]/g,'').trim().slice(0,22)}
function createRoom(name,key){let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(code));const hostId=id(),r={code,hostId,players:[{id:hostId,name,side:0,host:true,playerKey:key,connected:false,socketId:null}],status:'lobby',board:[],currentSide:0,scores:[0,0],notice:'Chờ người chơi thứ hai tham gia.',log:'Phòng đã tạo. Mời bạn cùng chơi!',moveCount:0};rooms.set(code,r);return r}
function state(r){return {code:r.code,status:r.status,players:r.players.map(({id,name,side,host,connected})=>({id,name,side,host,connected})),board:r.board,currentSide:r.currentSide,scores:r.scores,notice:r.notice,log:r.log}}
function broadcast(r){io.to(r.code).emit('room:state',state(r))}
function next(i,d){return (i+d+12)%12}
function start(r){if(r.players.length!==2)throw Error('Cần đủ 2 người chơi.');r.board=Array(12).fill(5);r.board[0]=r.board[6]=10;r.scores=[0,0];r.currentSide=0;r.status='playing';r.moveCount=0;r.notice='Bắt đầu! Bên 1 chọn một ô dân rồi chọn hướng rải.';r.log='Đã bày 5 quân dân ở mỗi ô và 10 quân ở mỗi ô quan.'}
app.get('/api/health',(_q,s)=>s.json({ok:true,rooms:rooms.size}));
app.post('/api/room/create',(q,s)=>{const name=clean(q.body?.name);if(name.length<2)return s.status(400).json({error:'Tên cần ít nhất 2 ký tự.'});const r=createRoom(name,String(q.body?.playerKey||''));s.json({code:r.code,hostId:r.hostId})});
app.get('/api/room/:code/qr',async(q,s)=>{const r=rooms.get(q.params.code.toUpperCase());if(!r)return s.status(404).json({error:'Không tìm thấy phòng.'});const url=`${process.env.PUBLIC_BASE_URL||q.protocol+'://'+q.get('host')}/?room=${r.code}`;s.json({url,qr:await QRCode.toDataURL(url,{width:360,margin:1})})});
io.on('connection',socket=>{
socket.on('room:join',d=>{const r=rooms.get(String(d.code||'').toUpperCase());if(!r)return socket.emit('game:error','Không tìm thấy phòng.');let p=d.hostId===r.hostId?r.players[0]:r.players.find(x=>!x.host&&x.playerKey===String(d.playerKey||''));
if(!p){if(r.players.length>=2)return socket.emit('game:error','Phòng đã đủ 2 người.');const name=clean(d.name);if(name.length<2)return socket.emit('game:error','Tên cần ít nhất 2 ký tự.');p={id:id(),name,side:1,host:false,playerKey:String(d.playerKey||''),connected:false,socketId:null};r.players.push(p)}
p.connected=true;p.socketId=socket.id;socket.data.room=r.code;socket.data.pid=p.id;socket.join(r.code);socket.emit('room:joined',{code:r.code,playerId:p.id});broadcast(r)});
socket.on('quan:start',()=>{const r=rooms.get(socket.data.room),p=r?.players.find(x=>x.id===socket.data.pid);if(!r||!p?.host)return socket.emit('game:error','Chỉ chủ phòng được bắt đầu.');try{start(r);broadcast(r)}catch(e){socket.emit('game:error',e.message)}});
socket.on('quan:move',d=>{const r=rooms.get(socket.data.room),p=r?.players.find(x=>x.id===socket.data.pid);if(!r||!p||r.status!=='playing')return;const pit=Number(d.pit),dir=Number(d.direction);if(p.side!==r.currentSide)return socket.emit('game:error','Chưa đến lượt bạn.');const owned=p.side===0?pit>=1&&pit<=5:pit>=7&&pit<=11;if(!owned||![-1,1].includes(dir)||!r.board[pit])return socket.emit('game:error','Hãy chọn ô dân hợp lệ còn quân.');
let stones=r.board[pit];r.board[pit]=0;let pos=pit;while(stones>0){pos=next(pos,dir);r.board[pos]++;stones--}
let log=`${p.name} rải quân từ ô ${pit} theo hướng ${dir===1?'thuận':'ngược'}.`;
if(r.board[pos]>1){stones=r.board[pos];r.board[pos]=0;while(stones>0){pos=next(pos,dir);r.board[pos]++;stones--}log+=' Bốc ô cuối và rải tiếp.'}
else {const capture=next(pos,dir);if(r.board[capture]>0){const captured=r.board[capture];r.board[capture]=0;r.scores[p.side]+=captured;log+=` Ăn ${captured} quân ở ô kế tiếp!`}}
r.currentSide=1-r.currentSide;r.moveCount++;if(r.moveCount>=80||[1,2,3,4,5].every(i=>r.board[i]===0)&&[7,8,9,10,11].every(i=>r.board[i]===0)){r.scores[0]+=r.board.slice(1,6).reduce((a,b)=>a+b,0)+r.board[0];r.scores[1]+=r.board.slice(7,12).reduce((a,b)=>a+b,0)+r.board[6];r.status='finished';r.notice=r.scores[0]===r.scores[1]?'Ván đấu hòa!':`🏆 ${r.players[r.scores[0]>r.scores[1]?0:1].name} thắng!`;log+=' Kết thúc ván.'}else r.notice=`${r.players.find(x=>x.side===r.currentSide)?.name||'Người chơi'} đến lượt.`;r.log=log;broadcast(r);if(r.status==='finished')io.to(r.code).emit('quan:result',{message:r.notice})});
socket.on('disconnect',()=>{const r=rooms.get(socket.data.room);if(!r)return;const p=r.players.find(x=>x.id===socket.data.pid);if(p){p.connected=false;broadcast(r)}});
});
server.listen(PORT,()=>console.log('Ô Ăn Quan Tết running on '+PORT));
