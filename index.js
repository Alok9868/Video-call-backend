require('dotenv').config();
const express = require("express");
const http = require("http");
const app = express();
const { v4: uuidv4 } = require('uuid')
const server = http.createServer(app);
const cors = require("cors");
const { log } = require("console");
const twilio = require("twilio");
const io = (require('socket.io')(server, {
    cors: {
        origin: 'http://localhost:3000',
    }
}));
app.use(cors());
let connectedUsers = [];
let rooms = [];
const socketToRoom = {};

app.get('/api/room-exists/:roomID', function (req, res) {
    const { roomID } = req.params;
    const room = rooms.find((room) => room.id === roomID);
    if (room) {

        if (room.connectedUsers.length > 3) {
            return res.send({ roomExists: true, full: true })
        }

        else {
            res.send({ roomExists: true, full: false })

        }


        // res.status(200);

    }
    else {
        // res.status(400);
        res.send({ roomExists: false });
    }
});
app.get('/api/get-turn-credentials', (req, res)=>{
    const accountSid=process.env.ACCOUNT_SID;
    const authToken=process.env.AUTH_TOKEN;
    const client=twilio(accountSid, authToken);
    let responseToken = null;
    try {
        client.tokens.create().then(token =>{
            responseToken=token;
            res.send({token})
        });

    }
    catch(err){
        console.log('error occured when fetching turn server credentials');
        console.log(err);
        res.send({token:null});
    }
});

io.on('connection', socket => {



    socket.on('create-new-room', data => {
        // console.log('host is creating new room', data);
        createNewRoomHandler(socket, data);

    });
    socket.on('join-room', data => {

        joinRoomHandler(socket, data);
    });
    socket.on('disconnect', () => {
        disconnectHandler(socket);
    });
    socket.on('conn-signal', (data) => {
        signallingHandler(socket, data);
    });
    socket.on('conn-init', (data) => {

          initializeConnectionHandler(socket, data);
    });
    socket.on('send-message', (data) => {
        messageHandler(socket, data);
    })

});
const createNewRoomHandler = (socket, data) => {


    const roomId = uuidv4();
    const { identity } = data;
    const newuser = {
        id: uuidv4(),
        identity: identity,
        socketId: socket.id,
        roomId,

    };
    connectedUsers = [...connectedUsers, newuser];
    //create new room
    const newroom = {
        id: roomId,
        connectedUsers: [newuser]
    }
    // join socket io room

    socket.join(roomId);
    rooms = [...rooms, newroom];
    // emit to the client new room is created
    socket.emit('room-id', { roomId });
    // socket.emit('newRoom-created', roomID);
    socket.emit('room-update', { connectedUsers: newroom.connectedUsers });
}
const joinRoomHandler = (socket, { identity, roomId }) => {
    const room = rooms.find((room) => room.id === roomId);
    if (room) {
        if (room.connectedUsers.length > 3) {
            // console.log('room is full');
            socket.emit('room-full');
        }
        else {
            const newuser = {
                id: uuidv4(),
                identity: identity,
                socketId: socket.id,
                roomId
            }
            room.connectedUsers = [...room.connectedUsers, newuser];
            socket.join(roomId);
            connectedUsers = [...connectedUsers, newuser];
            //establishing peer connection

            room.connectedUsers.forEach((user) => {
                if (user.socketId !== socket.id) {
                    const data = {
                        connUserSocketId: socket.id,
                    };
                    io.to(user.socketId).emit('conn-prepare', data);
                }

            });


            io.to(roomId).emit('room-update', { connectedUsers: room.connectedUsers });
        }

    }
    else {
        console.log('no such room found');
    }

}
const disconnectHandler = (socket) => {
    const user = connectedUsers.find(user => user.socketId === socket.id);
    if (user) {
        const room = rooms.find(room => room.id === user.roomId);
        room.connectedUsers = room.connectedUsers.filter(user => user.socketId !== socket.id);

        //leave socket io room

        socket.leave(user.roomId);
        //emit an event to rest of users that this user have left the room

        if (room.connectedUsers.length > 0) {
            io.to(room.id).emit('user-disconnected',{socketId: socket.id})
            io.to(room.id).emit('room-update', {
                connectedUsers: room.connectedUsers
            });
        }
        else {
            rooms = rooms.filter((r) => r.id !== room.id);
        }
    }

}
const signallingHandler = (socket, data) => {
    const { connUserSocketId, signal } = data;
    const signalingData = { signal, connUserSocketId: socket.id };
    io.to(connUserSocketId).emit('conn-signal', signalingData);

}
const initializeConnectionHandler = (socket,data) => {
    const {connUserSocketId}=data;
    const initData ={connUserSocketId:socket.id};
     io.to(connUserSocketId).emit('conn-init', initData);

}
const messageHandler = (socket,data) => {
    const user = connectedUsers.find(user => user.socketId === socket.id);
    if(user)
    {
        io.to(user.roomId).emit('new-message', data);
    }
    

}

server.listen(process.env.PORT || 8000, () => console.log('server is running on port 8000'));


