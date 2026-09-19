const express=require('express');
const http=require('http');
const path=require('path');
const {Server}=require('socket.io');
const app=express(), server=http.createServer(app);
const io=new Server(server,{cors:{origin:true,credentials:false}});
app.get('/',(_,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.get('/health',(_,res)=>res.json({ok:true,app:'TelaShare V3'}));

const rooms=new Map();
function clean(v,n=32){return String(v||'').replace(/[^A-Z0-9-]/gi,'').slice(0,n).toUpperCase()}
io.on('connection',s=>{
 s.on('join-room',({room,role,password})=>{
   room=clean(room); if(!room||!['host','viewer'].includes(role))return;
   if(role==='host'){
     const existing=rooms.get(room);
     if(existing && existing.host && existing.host!==s.id){
       return s.emit('join-error','Esta sala já possui um transmissor.');
     }
     rooms.set(room,{host:s.id,password:String(password||'').slice(0,64)});
   } else {
     const r=rooms.get(room);
     if(!r) return s.emit('join-error','Sala não encontrada. Inicie a transmissão primeiro.');
     if(r.password && r.password!==String(password||'')) return s.emit('join-error','Senha incorreta.');
   }
   s.join(room); s.data={room,role};
   s.to(room).emit('peer-ready',{id:s.id,role});
   const size=io.sockets.adapter.rooms.get(room)?.size||1;
   io.to(room).emit('room-count',Math.max(0,size-1));
   s.emit('join-ok');
 });
 s.on('signal',({room,target,data})=>{
   if(!room||!data)return;
   target?io.to(target).emit('signal',{from:s.id,data}):s.to(room).emit('signal',{from:s.id,data});
 });
 s.on('disconnect',()=>{
   const {room,role}=s.data||{}; if(!room)return;
   if(role==='host'){rooms.delete(room);s.to(room).emit('host-left');}
   else s.to(room).emit('peer-left',{id:s.id});
   const size=io.sockets.adapter.rooms.get(room)?.size||0;
   io.to(room).emit('room-count',Math.max(0,size-1));
 });
});
const PORT=process.env.PORT||3000;
server.listen(PORT,'0.0.0.0',()=>console.log(`TelaShare V3 iniciado na porta ${PORT}`));
