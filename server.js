const express=require('express');
const http=require('http');
const path=require('path');
const {Server}=require('socket.io');

const app=express();
const server=http.createServer(app);
const io=new Server(server,{
  cors:{origin:true,credentials:false},
  pingInterval:10000,
  pingTimeout:20000
});

app.get('/',(_,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.get('/health',(_,res)=>res.json({ok:true,app:'TelaShare V4',version:'4.0.0'}));

const rooms=new Map();
const clean=(v,n=32)=>String(v||'').replace(/[^A-Z0-9-]/gi,'').slice(0,n).toUpperCase();

function roomCount(room){
  const size=io.sockets.adapter.rooms.get(room)?.size||0;
  return Math.max(0,size-1);
}
function emitCount(room){ io.to(room).emit('room-count',roomCount(room)); }

io.on('connection',s=>{
  s.on('join-room',({room,role,password})=>{
    room=clean(room);
    if(!room||!['host','viewer'].includes(role)) return s.emit('join-error','Dados da sala inválidos.');

    if(role==='host'){
      const old=rooms.get(room);
      if(old?.host && old.host!==s.id) return s.emit('join-error','Esta sala já possui um transmissor.');
      rooms.set(room,{host:s.id,password:String(password||'').slice(0,64),createdAt:Date.now()});
    }else{
      const r=rooms.get(room);
      if(!r) return s.emit('join-error','Sala não encontrada ou transmissor offline.');
      if(r.password && r.password!==String(password||'')) return s.emit('join-error','Senha incorreta.');
    }

    s.join(room);
    s.data.room=room;s.data.role=role;
    s.to(room).emit('peer-ready',{id:s.id,role});
    s.emit('join-ok',{room,role});
    emitCount(room);
  });

  s.on('signal',({room,target,data})=>{
    if(!room||!data)return;
    if(target) io.to(target).emit('signal',{from:s.id,data});
    else s.to(room).emit('signal',{from:s.id,data});
  });

  s.on('disconnect',()=>{
    const {room,role}=s.data||{};
    if(!room)return;
    if(role==='host'){
      const r=rooms.get(room);
      if(r?.host===s.id) rooms.delete(room);
      s.to(room).emit('host-left');
    } else s.to(room).emit('peer-left',{id:s.id});
    emitCount(room);
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,'0.0.0.0',()=>console.log(`TelaShare V4 iniciado na porta ${PORT}`));
