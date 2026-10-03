const express = require('express');
const fs = require('node:fs');
const { createServer } = require('node:http');
const path = require('node:path');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, 'public')));
const abuseWords = new Map();

fs.readFile(
  path.join(__dirname, 'public', 'abuse.txt'),
  'utf-8',
  (err, data) => {
    if (err) {
      console.error('Error reading abuse.txt:', err);
      return;
    }

    data.split('\n').forEach((line) => {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        abuseWords.set(trimmedLine.toLowerCase(), true);
      }
    });
  },
);

io.on('connection', (socket) => {
  socket.on('join-room', ({ room, username } = {}) => {
    const roomName = String(room ?? '')
      .trim()
      .slice(0, 50);
    const displayName = String(username ?? '')
      .trim()
      .slice(0, 30);

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
    const text = String(message ?? '')
      .trim()
      .slice(0, 1000);

    const sanitzedText = sanitzeText(text);
    if (!socket.data.room || !text) return;

    io.to(socket.data.room).emit('chat-message', {
      username: socket.data.username,
      message: sanitzedText,
    });
  });
});

httpServer.listen(3000, () => {
  console.log('Chat server is running at http://localhost:3000');
});

function sanitzeText(text) {
  const data = text.split(/\s+/).map((word) => {
    const lowerWord = word.toLowerCase();
    if (abuseWords.has(lowerWord)) {
      return '*'.repeat(word.length);
    }

    return word;
  });

  return data.join(' ');
}
