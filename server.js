const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));
app.get("/qr/:room", async (req, res) => {
  const url = `${req.protocol}://${req.get("host")}/?room=${encodeURIComponent(req.params.room)}`;
  try { res.type("png").send(await QRCode.toBuffer(url, { width: 280, margin: 1 })); }
  catch { res.status(500).send("QR error"); }
});

const rooms = new Map();
const makeCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
function freshGame() {
  return { pits: [10,5,5,5,5,5,10,5,5,5,5,5], turn: 1, selected: null,
    status: "playing", message: "Chọn một ô dân bên bạn để bắt đầu.", scores: [0,0], lastMove: null };
}
function publicRoom(room) {
  return { code: room.code, players: room.players.map(p => p ? {name:p.name, connected:true} : null),
    game: room.game, host: room.host };
}
function emitRoom(room) { io.to(room.code).emit("state", publicRoom(room)); }
function sendError(socket, msg) { socket.emit("notice", msg); }
function step(idx, dir) { return (idx + dir + 12) % 12; }
function doMove(game, player, start, dir) {
  const own = player === 1 ? [7,8,9,10,11] : [1,2,3,4,5];
  if (!own.includes(start) || game.pits[start] <= 0) return {ok:false, message:"Hãy chọn ô dân có quân ở hàng của bạn."};
  let hand = game.pits[start]; game.pits[start] = 0;
  let pos = start;
  while (hand > 0) {
    pos = step(pos, dir); game.pits[pos]++; hand--;
  }
  // Capture consecutive empty-stop / occupied-next pattern, excluding quan.
  let captured = 0, cursor = step(pos, dir), guard = 0;
  while (guard++ < 12 && ![0,6].includes(cursor) && game.pits[cursor] === 0) {
    const target = step(cursor, dir);
    if ([0,6].includes(target) || game.pits[target] === 0) break;
    captured += game.pits[target]; game.pits[target] = 0;
    cursor = step(target, dir);
    if (game.pits[cursor] > 0) break;
  }
  game.scores[player-1] += captured;
  game.turn = player === 1 ? 2 : 1;
  game.selected = null;
  game.lastMove = {player, start, end:pos, dir};
  game.message = captured ? `Đã ăn ${captured} quân dân. Đến lượt ${game.turn === 1 ? "chủ phòng" : "đối thủ"}.` :
    `Đã rải quân. Đến lượt ${game.turn === 1 ? "chủ phòng" : "đối thủ"}.`;
  if (game.pits.slice(1,6).every(n=>n===0) || game.pits.slice(7,12).every(n=>n===0)) {
    // Sweep remaining dân to the other side's score.
    if (game.pits.slice(1,6).every(n=>n===0)) {
      game.scores[0] += game.pits.slice(7,12).reduce((a,b)=>a+b,0);
      game.pits.fill(0,7,12);
    } else {
      game.scores[1] += game.pits.slice(1,6).reduce((a,b)=>a+b,0);
      game.pits.fill(0,1,6);
    }
    game.status = "finished";
    game.message = game.scores[0] === game.scores[1] ? "Ván chơi hòa!" :
      `Kết thúc! ${game.scores[0] > game.scores[1] ? "Chủ phòng" : "Đối thủ"} chiến thắng!`;
  }
  return {ok:true};
}
io.on("connection", socket => {
  socket.on("createRoom", ({name}) => {
    let code; do { code = makeCode(); } while (rooms.has(code));
    const room = {code, host:socket.id, players:[{id:socket.id,name:(name||"Chủ phòng").slice(0,18)},null], game:freshGame()};
    rooms.set(code,room); socket.join(code); socket.data.room=code; socket.data.player=1;
    socket.emit("joined",{code,player:1}); emitRoom(room);
  });
  socket.on("joinRoom", ({code,name}) => {
    code=String(code||"").trim().toUpperCase(); const room=rooms.get(code);
    if(!room) return sendError(socket,"Không tìm thấy phòng. Kiểm tra lại mã phòng.");
    if(room.players[1] && room.players[1].id!==socket.id) return sendError(socket,"Phòng đã đủ 2 người chơi.");
    if(room.players[0].id===socket.id) return socket.emit("joined",{code,player:1});
    room.players[1]={id:socket.id,name:(name||"Đối thủ").slice(0,18)};
    socket.join(code); socket.data.room=code; socket.data.player=2;
    socket.emit("joined",{code,player:2}); room.game.message="Đã đủ 2 người. Chủ phòng bắt đầu ván chơi!";
    emitRoom(room);
  });
  socket.on("selectPit", ({index}) => {
    const room=rooms.get(socket.data.room); if(!room) return;
    const player=socket.data.player, g=room.game;
    if(!room.players[1]) return sendError(socket,"Đang chờ người chơi thứ hai tham gia.");
    if(g.status!=="playing" || g.turn!==player) return sendError(socket,"Chưa đến lượt của bạn.");
    const own=player===1?[7,8,9,10,11]:[1,2,3,4,5];
    if(!own.includes(index)||g.pits[index]<=0) return sendError(socket,"Chọn ô dân có quân ở hàng của bạn.");
    g.selected=index; g.message=`Đã chọn ô ${own.indexOf(index)+1}. Hãy chọn hướng rải.`;
    emitRoom(room);
  });
  socket.on("sow", ({direction}) => {
    const room=rooms.get(socket.data.room); if(!room) return;
    const player=socket.data.player, g=room.game;
    if(!room.players[1]) return sendError(socket,"Đang chờ người chơi thứ hai tham gia.");
    if(g.turn!==player || g.status!=="playing") return sendError(socket,"Chưa đến lượt của bạn.");
    if(g.selected===null) return sendError(socket,"Bạn cần chọn một ô dân trước.");
    const dir=direction==="reverse"?-1:1, start=g.selected;
    const result=doMove(g,player,start,dir);
    if(!result.ok) return sendError(socket,result.message);
    emitRoom(room);
  });
  socket.on("restart", () => {
    const room=rooms.get(socket.data.room); if(!room || room.host!==socket.id) return;
    room.game=freshGame(); room.game.message="Ván mới đã bắt đầu!";
    emitRoom(room);
  });
  socket.on("disconnect", () => {
    const room=rooms.get(socket.data.room); if(!room) return;
    const i=room.players.findIndex(p=>p&&p.id===socket.id);
    if(i>=0) room.players[i]=null;
    if(!room.players[0]&&!room.players[1]) rooms.delete(room.code);
    else { room.game.message="Một người chơi đã thoát phòng."; emitRoom(room); }
  });
});
server.listen(PORT,()=>console.log(`Ô Ăn Quan Tết 2027 running on ${PORT}`));
