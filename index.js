//libs
const express = require("express");
const http = require("http");
var cors = require("cors");
const { Server } = require("socket.io");

const { SOCKET_EVENTS } = require("./constants");

// socket io setup
const app = express();
app.disable(cors());

const port = process.env.PORT || 8081;
const httpServer = http.createServer(app).listen(port, () => {
  console.log("✅ Listening to server...");
});

const io = new Server(httpServer);

app.get("/", () => {
  console.log("Oh hi");
});

io.engine.on("headers", (headers, req) => {
  headers["Access-Control-Allow-Origin"] = "*";
});

let roomAdminId;

const numClients = {};
const roomVsClients = {};

const roomHasClient = (roomId, socketId) =>
  roomVsClients[roomId].indexOf(socketId) !== -1;

const removeSocketFromAllRooms = (socketId) => {
  Object.keys(roomVsClients).map((room) => {
    roomVsClients[room] = (roomVsClients[room] ?? []).filter(
      (client) => client !== socketId
    );
  });
};

// main
io.sockets.on("connection", (socket) => {
  console.log("🌎 Socket connected: ", { socket: socket.id });
  const count = io.engine.clientsCount;
  console.log("Clients Count: ", count);

  socket.on(SOCKET_EVENTS.INCOMING.JOIN_ROOM, ({ fromId }, roomId) => {
    // if there are clients already present, add client to this room and notify all clients about this incoming client
    // else make a new room and add client

    console.log("fromId: ", fromId);
    console.log("socket id: ", socket.id);

    if (numClients[roomId]) {
      console.log("Client with sid: ", socket.id, " joined room: ", roomId);

      socket.join(roomId);

      //notify all clients about this new guest
      io.sockets
        .in(roomId)
        .emit(SOCKET_EVENTS.OUTGOING.NEW_GUEST_JOINED, fromId);

      //notify that client that they have joined the room
      io.to(socket.id).emit(
        SOCKET_EVENTS.OUTGOING.ROOM_JOINED,
        fromId,
        roomVsClients[roomId]
      );

      roomVsClients[roomId].push(socket.id);
      numClients[roomId] += 1;
    } else {
      // make this client as roomAdmin
      roomAdmin = socket.id;

      // make a new room and add client
      socket.join(roomId);

      // notify the client that a room has been created
      socket.emit(SOCKET_EVENTS.OUTGOING.ROOM_CREATED, socket.id);

      roomVsClients[roomId] = [socket.id];
      roomAdminId = socket.id;
      numClients[roomId] = 1;
    }
  });

  socket.on(
    SOCKET_EVENTS.INCOMING.SEND_OFFER,
    ({ toId, fromId, message: sessionDescription }) => {
      console.log(
        `Client: ${fromId} requested to send offer to client: ${toId}`
      );

      io.to(toId).emit(
        SOCKET_EVENTS.OUTGOING.OFFER,
        fromId,
        sessionDescription
      );
    }
  );

  socket.on(
    SOCKET_EVENTS.INCOMING.SEND_ANSWER,
    ({ toId, fromId, message: sessionDescription }) => {
      console.log(
        `Client: ${fromId} requested to send answer to client: ${toId}`
      );

      io.to(toId).emit(
        SOCKET_EVENTS.OUTGOING.ANSWER,
        fromId,
        sessionDescription
      );
    }
  );

  socket.on(
    SOCKET_EVENTS.INCOMING.SEND_ICE_CANDIDATE,
    ({ toId, fromId, message }) => {
      console.log(
        `Client: ${fromId} requested to send ice candidate to client: ${toId}`
      );

      io.to(toId).emit(
        SOCKET_EVENTS.OUTGOING.ADD_ICE_CANDIDATE,
        fromId,
        message
      );
    }
  );

  socket.on("disconnect", () => {
    const count = io.engine.clientsCount;
    console.log(`Client: ${socket.id} is disconnected`);
    console.log("Clients Count on disconnection: ", count);

    //for all rooms for this socket, tell everyone that this socket is disconnected
    Object.keys(roomVsClients).forEach((room) => {
      if (roomHasClient(room, socket.id)) {
        io.sockets.in(room).emit(SOCKET_EVENTS.OUTGOING.GUEST_LEFT, socket.id);
      }
    });

    removeSocketFromAllRooms(socket.id);
  });
});

io.of("/").adapter.on("create-room", (room) => {
  console.log(`room ${room} was created`);
});
