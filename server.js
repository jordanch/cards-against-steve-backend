require('dotenv').config({ path: __dirname + '/.env' });
const cors = require('cors');
var app = require('express')();
app.use(cors({origin: 'https://cards-against-steve.netlify.app'}));
var http = require('http').createServer(app);
var io = require('socket.io')(http);

var players = [];
var playersThatLeft = [];
var whiteCards = [];
var blackCards = [];
var submittedCards = [];
var timer;

const MAX_PLAYERS = 8;

io.on('connection', function(socket){
  if (io.engine.clientsCount > MAX_PLAYERS) {
    console.log('Disconnected...');
    socket.disconnect();
    return;
  }

  if (players.length < MAX_PLAYERS) {
    players.push({id: socket.id, name: 'NEW USER'});
  }

  console.log({players});

  console.log('a user connected! ', socket.id);

  // send state only to the newly connected user.
  io.to(socket.id).emit('new connection', {whiteCards, blackCards, players, submittedCards});

  // let everyone know that a new player has connected
  socket.broadcast.emit('user connected', players);

  // update the whiteCards on the server
  socket.on('update whiteCards', function({whiteCards: newWhiteCards, players: newPlayers}) {
    whiteCards = newWhiteCards;
    players = newPlayers;
    this.broadcast.emit('update players', players);
  });

  // update the whiteCards on the server
  socket.on('update submittedCards', function(newSubmittedCards) {
    submittedCards = newSubmittedCards;

    // let everyone else know
    this.broadcast.emit('update submittedCards', submittedCards);
  })

  // update the whiteCards on the server
  socket.on('submitted a card', function({submittedCards: newSubmittedCards, players: newPlayers}) {
    submittedCards = newSubmittedCards;
    players = newPlayers

    // let everyone else know
    this.broadcast.emit('submitted a card', {submittedCards, players});
  })

  // update the blackCards on the server
   socket.on('update blackCards', function(newBlackCards) {
    blackCards = newBlackCards;
  })

  // update the blackCards on the server
  socket.on('update players', function({players: newPlayers}) {
    console.log({newPlayers});
    players = newPlayers;
    this.broadcast.emit('update players', players);
  })

  // when someone drops a white card into their deck
  socket.on('dropped in my cards', function ({passedInCard: whiteCard, players: newPlayers, whiteCards: newWhiteCards}) {
    players = newPlayers;
    whiteCards = newWhiteCards;
    this.broadcast.emit('dropped in my cards', {whiteCard, players});
  });

  // when someone drops a black card into a player drop
  socket.on('dropped in player drop', function ({players: newPlayers, blackCards: newBlackCards}) {
    players = newPlayers;
    blackCards = newBlackCards;
    console.log({players});
    this.broadcast.emit('dropped in player drop', ({players, blackCards}));
  });

  // get the mouse coordinates from the client
  socket.on('dragged card', function ({type, text, x, y}) {
    // send the coordinates to everyone but client that sent it
    this.broadcast.emit('dragged card', {type, text, x, y});
  });

  // get the mouse coordinates from the client
  socket.on('let go card', function ({type, text}) {
    // send the coordinates to everyone but client that sent it
    this.broadcast.emit('let go card', {type, text});
  });

  socket.on('card is flipped', function ({isFlipped, text}) {
    this.broadcast.emit('card is flipped', {isFlipped, text});
  });

  // when someone changes their player name, 
  // update players name property and emit back
  socket.on('name change', function({id, name}) {
    if (players.length <= MAX_PLAYERS && players.find(player => player.id === id)) {
      players.find(player => player.id === id).name = name;
      this.broadcast.emit('name change', players);
    }
  });

  socket.on('name submit', function({players: newPlayers, myName, id}) {
    const matchedPlayerThatLeft = playersThatLeft.find(player => player.name === myName);
    if (myName !== 'NEW USER' && matchedPlayerThatLeft) {
      const playerIndex = players.findIndex(player => player.id === id);
      players[playerIndex] = matchedPlayerThatLeft;
      players[playerIndex].id = id;
      io.emit('player rejoins', players);
    } else {
      players = newPlayers;
      io.emit('update players', players);
    }
  });

  socket.on('restart game', ({whiteCards: newWhiteCards, blackCards: newBlackCards, players: newPlayers}) => {
    whiteCards = newWhiteCards;
    blackCards = newBlackCards;
    players = newPlayers;
    submittedCards.length = 0;
  });

  // when a specific player disconnects
  socket.on('disconnect', function(){

    // If everyone leaves, reset the game
    if (io.engine.clientsCount === 0) {
      players = [];
      playersThatLeft = [];
      whiteCards = [];
      blackCards = [];
      submittedCards = [];
      timer = undefined;

      return;
    }

    if (timer) {
      clearInterval(timer);
    }

    timer = setTimeout(() => {
      playersThatLeft.length = 0;
      console.log('cleared playersThatLeft ', playersThatLeft);
    }, 600000);

    const playerThatLeft = players.find(user => user.id === socket.id);

    const playerThatLeftIndex = playersThatLeft.findIndex(player => {
      return player.name === playerThatLeft.name
    });

    // if the player that left already left before, remove them from playersThatLeft
    if (playersThatLeft.find(player => player.name === playerThatLeft.name)) {
      playersThatLeft.splice(playerThatLeftIndex, 1);
    }
    // track the new player that left
    playersThatLeft.push(playerThatLeft);

    // update global players variable 
    players.splice(players.findIndex(user => user.id === socket.id), 1);

    io.emit('user disconnected', players);
    console.log('user disconnected: ', socket.id);
    console.log({players, playersThatLeft});
  });

});

http.listen(process.env.PORT, function() {
  console.log(`listening on port ${process.env.PORT}`);
});

process.stdin.resume();
process.stdin.setEncoding('utf8');

process.stdin.on('data', function (text) {
  if (text.trim() === 'restart') {
    io.emit('restart game', '');
  }

  if (text.trim().startsWith('kick')) {
    const socketID = text.trim().split(' ')[1];
    const matchedPlayerIndex = players.findIndex(player => player.id === socketID);
    
    if (matchedPlayerIndex !== -1) {
      io.sockets.sockets[socketID].disconnect();
      console.log(`kicked user: ${socketID}`)
    } else {  
      console.log('player doesn\'t exist');
    }
  }
});

