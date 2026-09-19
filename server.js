const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: false } });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_, res) => res.json({ok:true, app:'TelaShare V2'}));

io.on('connection', socket => {
  socket.on('join-room', ({room, role}) => {
    room = String(room || '').replace(/[^A-Z0-9-]/gi,'').slice(0,32).toUpperCase();
    if (!room || !['host','viewer'].includes(role)) return;
    socket.join(room);
    socket.data.room = room;
    socket.data.role = role;
    socket.to(room).emit('peer-ready', {id:socket.id, role});
    const size = io.sockets.adapter.rooms.get(room)?.size || 1;
    io.to(room).emit('room-count', Math.max(0,size-1));
  });

  socket.on('signal', ({room, target, data}) => {
    if (!room || !data) return;
    if (target) io.to(target).emit('signal', {from:socket.id, data});
    else socket.to(room).emit('signal', {from:socket.id, data});
  });

  socket.on('disconnect', () => {
    const room=socket.data.room;
    if (!room) return;
    socket.to(room).emit('peer-left', {id:socket.id});
    const size=io.sockets.adapter.rooms.get(room)?.size || 0;
    io.to(room).emit('room-count', Math.max(0,size-1));
  });
});

const PORT=process.env.PORT || 3000;
server.listen(PORT,'0.0.0.0',()=>console.log(`TelaShare V2: http://localhost:${PORT}`));
