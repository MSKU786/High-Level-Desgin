const express = require('express');
const { createServer } = require('node:http');
const path = require('node:path');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  socket.on('join-room', ({ room, username } = {}) => {
    const roomName = String(room ?? '').trim().slice(0, 50);
    const displayName = String(username ?? '').trim().slice(0, 30);

    if (!roomName || !displayName) return;

    if (socket.data.room) {
      socket.leave(socket.data.room);
    }

    socket.join(roomName);
    socket.data.room = roomName;
    socket.data.username = displayName;

    socket.emit('room-joined', { room: roomName, username: displayName });
    io.to(roomName).emit('chat-message', {
      username: 'System',
      message: `${displayName} joined the room`,
    });
  });

  socket.on('chat-message', (message) => {
    const text = String(message ?? '').trim().slice(0, 1000);
    if (!socket.data.room || !text) return;

    io.to(socket.data.room).emit('chat-message', {
      username: socket.data.username,
      message: text,
    });
  });
});

httpServer.listen(3000, () => {
  console.log('Chat server is running at http://localhost:3000');
});
