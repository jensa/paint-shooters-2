var port = process.env.PORT || 3000;
var io = require('socket.io');
var express = require('express');
var UUID = require('node-uuid');
var verbose = false;
var http = require('http');
var app = express();
var server = http.createServer(app);
app.set('view engine', 'jade')
server.listen(port)
console.log('Listening on port ' + port );
app.get( '/', function( req, res ){
  res.render('game', {});
});
app.get( '/*' , function( req, res, next ) {
  var file = req.params[0];
  if(verbose) {
    console.log('file requested : ' + file);
  }
  res.sendfile( __dirname + '/' + file );
});
var sio = io.listen(server);
sio.configure(function (){
  sio.set('log level', 0);
  sio.set('authorization', function (handshakeData, callback) {
    callback(null, true);
  });
});
game_server = require('./game.server.js');
game = game_server.createGame();
sio.sockets.on('connection', function (client) {
  client.userid = UUID();
  game.gamecore.server_addPlayer(client);
  game.active = true;
  client.emit('onconnected', {
    id: client.userid,
    players:game.gamecore.server_getCurrentPlayers(),
    time:String(game.gamecore.local_time).replace('.','-')
  });

  var player = game.gamecore.players[client.userid];
  client.broadcast.emit('player_joined', {
    id:client.userid,
    pos:player.pos,
    speed:player.speed,
    rotation:player.rotation
  });
  console.log('player ' + client.userid + ' connected');
  client.on('message', function(m) {
    game_server.onMessage(client, m);
  });
  client.on('disconnect', function () {
    if(client.game && client.game.id) {
    }
  });
});
