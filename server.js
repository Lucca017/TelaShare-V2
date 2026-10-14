const express=require('express');
const http=require('http');
const path=require('path');
const QRCode=require('qrcode');
const {Server}=require('socket.io');
const app=express(),server=http.createServer(app);
const io=new Server(server,{cors:{origin:true,credentials:false}});

app.get('/',(_,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.get('/health',(_,res)=>res.json({ok:true,app:'TelaShare V2.6.3'}));
app.get('/api/qr',async(req,res)=>{try{const text=String(req.query.text||'').slice(0,2048);if(!text)return res.status(400).send('missing text');const png=await QRCode.toBuffer(text,{type:'png',width:300,margin:1});res.type('png').send(png)}catch(e){res.status(500).send('qr error')}});
app.get('/api/ice',(_,res)=>{
 const iceServers=[
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:stun1.l.google.com:19302'}
 ];
 const urls=(process.env.TURN_URLS||'').split(',').map(x=>x.trim()).filter(Boolean);
 const username=process.env.TURN_USERNAME||'',credential=process.env.TURN_CREDENTIAL||'';
 if(urls.length&&username&&credential) iceServers.push({urls,username,credential});
 res.json({iceServers,turnEnabled:!!(urls.length&&username&&credential)});
});

const rooms=new Map();
function clean(v,n=32){return String(v||'').replace(/[^A-Z0-9-]/gi,'').slice(0,n).toUpperCase()}
function emitCount(room){
 const state=rooms.get(room);
 if(state)io.to(room).emit('room-count',state.viewers.size);
}
function leaveRoom(s){
 const {room,role}=s.data||{};
 if(!room)return;
 const state=rooms.get(room);
 if(state){
  if(role==='host'&&state.host===s.id){
   rooms.delete(room);
   s.to(room).emit('host-left');
   for(const id of state.viewers){
    const v=io.sockets.sockets.get(id);
    if(v){v.leave(room);v.data={};}
   }
  }else if(role==='viewer'){
   state.viewers.delete(s.id);
   s.to(room).emit('peer-left',{id:s.id});
  }
 }
 s.leave(room);s.data={};
 emitCount(room);
}
io.on('connection',s=>{
 s.data={};
 s.on('join-room',({room,role,password}={})=>{
  room=clean(room);
  if(!room||!['host','viewer'].includes(role))return s.emit('join-error','Dados da sala inválidos.');
  const requestedPassword=String(password||'').slice(0,64);
  let state=rooms.get(room);
  if(role==='host'){
   if(state?.host&&state.host!==s.id)return s.emit('join-error','Esta sala já possui um transmissor.');
  }else{
   if(!state)return s.emit('join-error','Sala não encontrada. Confira o código.');
   if(state.password!==requestedPassword)return s.emit('join-error','Senha incorreta.');
  }
  // Sair da sala anterior sem manter conexões/contagens antigas.
  leaveRoom(s);
  if(role==='host'){
   state={host:s.id,password:requestedPassword,viewers:new Set()};
   rooms.set(room,state);
  }else{
   state=rooms.get(room);
   if(!state)return s.emit('join-error','O transmissor encerrou a sala.');
   state.viewers.add(s.id);
  }
  s.join(room);s.data={room,role};
  s.emit('join-ok',{room,role});
  if(role==='viewer')io.to(state.host).emit('peer-ready',{id:s.id,role:'viewer'});
  emitCount(room);
 });
 s.on('leave-room',()=>leaveRoom(s));
 s.on('signal',({room,target,data}={})=>{
  const current=s.data?.room;
  if(!current||current!==clean(room)||!data||!target)return;
  const state=rooms.get(current);
  if(!state)return;
  const permitted=s.data.role==='host'?state.viewers.has(target):state.host===target;
  if(permitted)io.to(target).emit('signal',{from:s.id,data});
 });
 s.on('disconnect',()=>leaveRoom(s));
});
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('TelaShare V2.6 Lite online'));
