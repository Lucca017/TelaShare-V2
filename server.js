const express=require('express');
const http=require('http');
const path=require('path');
const QRCode=require('qrcode');
const {Server}=require('socket.io');
const app=express(),server=http.createServer(app);
const io=new Server(server,{cors:{origin:true,credentials:false}});

app.get('/',(_,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.get('/health',(_,res)=>res.json({ok:true,app:'TelaShare V2.4.1 Pro'}));
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
io.on('connection',s=>{
 s.on('join-room',({room,role,password})=>{
  room=clean(room);if(!room||!['host','viewer'].includes(role))return;
  if(role==='host'){
   const r=rooms.get(room);
   if(r?.host&&r.host!==s.id)return s.emit('join-error','Esta sala já possui um transmissor.');
   rooms.set(room,{host:s.id,password:String(password||'').slice(0,64)});
  }else{
   const r=rooms.get(room);
   if(!r)return s.emit('join-error','Sala não encontrada.');
   if(r.password&&r.password!==String(password||''))return s.emit('join-error','Senha incorreta.');
  }
  s.join(room);s.data={room,role};s.to(room).emit('peer-ready',{id:s.id,role});
  io.to(room).emit('room-count',Math.max(0,(io.sockets.adapter.rooms.get(room)?.size||1)-1));s.emit('join-ok');
 });
 s.on('signal',({room,target,data})=>{if(!room||!data)return;target?io.to(target).emit('signal',{from:s.id,data}):s.to(room).emit('signal',{from:s.id,data})});
 s.on('disconnect',()=>{const {room,role}=s.data||{};if(!room)return;if(role==='host'){rooms.delete(room);s.to(room).emit('host-left')}else s.to(room).emit('peer-left',{id:s.id});io.to(room).emit('room-count',Math.max(0,(io.sockets.adapter.rooms.get(room)?.size||0)-1))});
});
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('TelaShare V2.4.1 Pro online'));
