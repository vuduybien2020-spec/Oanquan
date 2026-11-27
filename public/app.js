const socket=io();
const $=id=>document.getElementById(id);
let myPlayer=0, roomCode="", current=null, audioOn=false;
const topRow=$("topRow"), bottomRow=$("bottomRow");
function buildPits(){
  // Top runs right-to-left in board geometry; bottom runs left-to-right.
  [5,4,3,2,1].forEach(i=>topRow.appendChild(makePit(i)));
  [7,8,9,10,11].forEach(i=>bottomRow.appendChild(makePit(i)));
}
function makePit(i){const b=document.createElement("button");b.className="pit";b.dataset.index=i;b.innerHTML=`<span id="pit${i}">5</span><small>Ô dân</small>`;b.addEventListener("click",()=>socket.emit("selectPit",{index:i}));return b}
buildPits();
function say(s){$("notice").textContent=s}
function render(s){
 current=s; const g=s.game;
 $("roomLabel").textContent=`PHÒNG DÂN GIAN · ${s.code}`;
 $("onlineCount").textContent=`${s.players.filter(Boolean).length}/2 ONLINE`;
 $("p1name").textContent=s.players[0]?.name||"Chủ phòng";
 $("p2name").textContent=s.players[1]?.name||"Đối thủ";
 $("score1").textContent=g.scores[0];$("score2").textContent=g.scores[1];
 for(let i=0;i<12;i++){const el=$(`pit${i}`);if(el)el.textContent=g.pits[i]}
 document.querySelectorAll(".pitrow .pit").forEach(b=>{b.classList.toggle("selected",Number(b.dataset.index)===g.selected)});
 $("turnLabel").textContent=g.status==="finished"?"🏆 VÁN CHƠI ĐÃ KẾT THÚC":`🌼 LƯỢT CỦA ${g.turn===1?"CHỦ PHÒNG":"ĐỐI THỦ"} 🌼`;
 $("logText").textContent=g.message;
 const can=myPlayer===g.turn && g.selected!==null && g.status==="playing" && s.players.every(Boolean);
 $("reverse").disabled=!can;$("forward").disabled=!can;
 $("start").disabled=myPlayer!==1;
 if(s.players[1]&&roomCode){$("qr").src=`/qr/${s.code}`;$("qr").hidden=false;$("inviteText").textContent=`Mã phòng: ${s.code}`;}
 else {$("qr").hidden=true;$("inviteText").textContent="Chờ người chơi thứ hai tham gia."}
}
socket.on("joined",d=>{roomCode=d.code;myPlayer=d.player;$("code").value=d.code;$("inviteText").textContent=`Mã phòng: ${d.code}`;say(`Bạn đã vào phòng ${d.code}.`);});
socket.on("state",render);socket.on("notice",say);
$("createTop").onclick=()=>socket.emit("createRoom",{name:$("name").value.trim()||"Chủ phòng"});
$("start").onclick=()=>socket.emit("restart");
$("join").onclick=()=>socket.emit("joinRoom",{code:$("code").value,name:$("name").value.trim()||"Người chơi"});
$("reverse").onclick=()=>sow("reverse");$("forward").onclick=()=>sow("forward");
function sow(direction){if(!current)return;const g=current.game;const index=g.selected;const el=document.querySelector(`[data-index="${index}"]`);if(el){const r=el.getBoundingClientRect(),h=$("hand");h.style.left=(r.left+r.width/2-15)+"px";h.style.top=(r.top-24)+"px";h.classList.remove("show");void h.offsetWidth;h.classList.add("show")}socket.emit("sow",{direction});}
$("copy").onclick=async()=>{if(!roomCode)return say("Bạn cần tạo phòng trước.");try{await navigator.clipboard.writeText(roomCode);say("Đã sao chép mã phòng "+roomCode)}catch{say("Mã phòng: "+roomCode)}};
$("music").onclick=()=>{audioOn=!audioOn;$("music").textContent=audioOn?"♫ Nhạc: Bật":"♫ Nhạc: Tắt";say(audioOn?"Đã bật trạng thái nhạc.":"Đã tắt nhạc.")};
const params=new URLSearchParams(location.search);if(params.get("room")){$("code").value=params.get("room").toUpperCase();setTimeout(()=>$("join").click(),400)}
