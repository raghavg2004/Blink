
let onlineUsers = 0;

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Queue for waiting users
const waitingQueue = [];
// Active rooms
const rooms = {};

// Helper function to find a match based on interests
function findMatch(newUser) {
    if (waitingQueue.length === 0) return null;
    
    const newUserInterests = newUser.interests || [];
    
    // Try to find a match with overlapping interests
    for (let i = 0; i < waitingQueue.length; i++) {
        const existingUser = waitingQueue[i];
        const existingInterests = existingUser.interests || [];
        
        // Check for interest overlap
        const commonInterests = newUserInterests.filter(interest => 
            existingInterests.includes(interest)
        );
        
        if (commonInterests.length > 0 || waitingQueue.length >= 1) {
            return waitingQueue.splice(i, 1)[0];
        }
    }
    return null;
}

io.on('connection', (socket) => {
    onlineUsers++;
    io.emit('user-count', onlineUsers);
    console.log('New user connected:', socket.id);
    
    socket.on('join-queue', (data) => {
        console.log('User joined queue:', socket.id, 'with interests:', data.interests);
        
        const user = {
            socketId: socket.id,
            interests: data.interests || []
        };
        
        const match = findMatch(user);
        
        if (match) {
            const roomId = `${socket.id}-${match.socketId}`;
            rooms[roomId] = {
                users: [socket.id, match.socketId],
                createdAt: new Date()
            };

            socket.join(roomId);
            const matchSocket = io.sockets.sockets.get(match.socketId);
            if (matchSocket) {
                matchSocket.join(roomId);
            }

            // First user is the caller
            socket.emit('paired', { roomId, isCaller: true });
            if (matchSocket) {
                matchSocket.emit('paired', { roomId, isCaller: false });
            }

            console.log('Paired users:', socket.id, 'and', match.socketId, 'in room', roomId);
        } else {
            // No match found, add to queue
            waitingQueue.push(user);
        }
    });
    
    socket.on('offer', (data) => {
        socket.to(data.roomId).emit('offer', data.offer);
    });
    
    socket.on('answer', (data) => {
        socket.to(data.roomId).emit('answer', data.answer);
    });
    
    socket.on('ice-candidate', (data) => {
        socket.to(data.roomId).emit('ice-candidate', data.candidate);
    });
    
    socket.on('message', (data) => {
        socket.to(data.roomId).emit('message', data.message);
    });
    
    socket.on('next', (data) => {
        // Leave the current room
        socket.leave(data.roomId);
        
        // Notify the other user
        socket.to(data.roomId).emit('stranger-disconnected');
        
        // Clean up room if empty
        if (rooms[data.roomId]) {
            const otherUserId = rooms[data.roomId].users.find(id => id !== socket.id);
            if (otherUserId) {
                // Other user is still in the room
                delete rooms[data.roomId];
            } else {
                // Both users left
                delete rooms[data.roomId];
            }
        }
    });
    
    socket.on('leave', (data) => {
        // Leave the current room
        socket.leave(data.roomId);
        
        // Notify the other user
        socket.to(data.roomId).emit('stranger-disconnected');
        
        // Clean up room
        if (rooms[data.roomId]) {
            delete rooms[data.roomId];
        }
    });
    
    socket.on('disconnect', () => {
        onlineUsers--;
        io.emit('user-count', onlineUsers);
        console.log('User disconnected:', socket.id);
        
        // Remove from waiting queue if present
        const queueIndex = waitingQueue.findIndex(user => user.socketId === socket.id);
        if (queueIndex !== -1) {
            waitingQueue.splice(queueIndex, 1);
        }
        
        // Notify roommates if in a room
        for (const roomId in rooms) {
            if (rooms[roomId].users.includes(socket.id)) {
                socket.to(roomId).emit('stranger-disconnected');
                delete rooms[roomId];
                break;
            }
        }
    });
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
