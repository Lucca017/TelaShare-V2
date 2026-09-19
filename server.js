const express=require('express');
const http=require('http');
const path=require('path');
const {Server}=require('socket.io');
const app=express(), server=http.createServer(app);
const io=new Server(server,{cors:{origin:true},pingInterval:10000,pingTimeout:20000});
app.use(express.json());
app.get('/',(_,r)=>r.sendFile(path.join(__dirname,'index.html')));
app.get('/health',(_,r)=>r.json({ok:true,app:'TelaShare V4.1'}));

/*
 TURN configuration:
 Set TURN_URLS, TURN_USERNAME and TURN_CREDENTIAL as Render environment variables.
 Example TURN_URLS:
 turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp
*/
app.get('/api/ice',(_,res)=>{
 const ice=[
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:stun1.l.google.com:19302'}
 ];
 const urls=(process.env.TURN_URLS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL){
   ice.push({urls,username:process.env.TURN_USERNAME,credential:process.env.TURN_CREDENTIAL});
 }
 res.json({iceServers:ice,turnEnabled:urls.length>0});
});

const rooms=new Map(), clean=v=>String(v||'').replace(/[^A-Z0-9-]/gi,'').slice(0,32).toUpperCase();
const emitCount=r=>io.to(r).emit('room-count',Math.max(0,(io.sockets.adapter.rooms.get(r)?.size||0)-1));
io.on('connection',s=>{
 s.on('join-room',({room,role,password})=>{
  room=clean(room); if(!room||!['host','viewer'].includes(role))return s.emit('join-error','Sala inválida.');
  if(role==='host'){
   const old=rooms.get(room); if(old?.host&&old.host!==s.id)return s.emit('join-error','Sala já possui transmissor.');
   rooms.set(room,{host:s.id,password:String(password||'').slice(0,64)});
  }else{
   const r=rooms.get(room); if(!r)return s.emit('join-error','Sala não encontrada.');
   if(r.password&&r.password!==String(password||''))return s.emit('join-error','Senha incorreta.');
  }
  s.join(room);s.data={room,role};s.to(room).emit('peer-ready',{id:s.id,role});s.emit('join-ok');emitCount(room);
 });
 s.on('signal',({room,target,data})=>{if(!room||!data)return;target?io.to(target).emit('signal',{from:s.id,data}):s.to(room).emit('signal',{from:s.id,data})});
 s.on('disconnect',()=>{const {room,role}=s.data||{};if(!room)return;if(role==='host'){rooms.delete(room);s.to(room).emit('host-left')}else s.to(room).emit('peer-left',{id:s.id});emitCount(room)});
});
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('TelaShare V4.1 online'));
