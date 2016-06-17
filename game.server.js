var game_server = module.exports = {};
var UUID = require('node-uuid');
var verbose = true;

//Since we are sharing code with the browser
global.window = global.document = global;
require('./game.core.js');
game_server.log = function() {
  if(verbose) console.log.apply(this,arguments);
};

game_server.fake_latency = 0;
game_server.local_time = 0;
game_server._dt = new Date().getTime();
game_server._dte = new Date().getTime();
//a local queue of messages we delay if faking latency
game_server.messages = [];

setInterval(function(){
    game_server._dt = new Date().getTime() - game_server._dte;
    game_server._dte = new Date().getTime();
    game_server.local_time += game_server._dt/1000.0;
}, 4);

game_server.onMessage = function(client,message){
  if(this.fake_latency && message.split('_')[0].substr(0,1) == 'i') {
    game_server.fakeLatency(client, message);
  } else{
    game_server.handleMessage(client, message);
  }
}

game_server.fakeLatency = function(client,message) {
  game_server.messages.push({client:client, message:message});
  setTimeout(function(){
    if(game_server.messages.length) {
      game_server.handleMessage( game_server.messages[0].client, game_server.messages[0].message );
      game_server.messages.splice(0,1);
    }
  }.bind(this), this.fake_latency);
}

game_server.handleMessage = function(client,message) {
  var message_parts = message.split('_');
  var message_type = message_parts[0];
  if(message_type == 'i') {
    this.handleInput(client, message_parts);
  } else if(message_type == 'p') {
    client.send('s.p.' + message_parts[1]);
  } else if(message_type == 'l') {    //A client is asking for lag simulation
    this.fake_latency = parseFloat(message_parts[1]);
  }
};

game_server.handleInput = function(client, parts) {
  //The input commands come in like u#l,
  //so we split them up into separate commands,
  //and then update the players
  var input_commands = parts[1].split('#');
  var input_time = parts[2].replace('-','_');
  var input_seq = parts[3];
  //the client should be in a game, so
  //we can tell that game to handle the input
  if(client && this.game && this.game.gamecore) {
    this.game.gamecore.server_handle_input(client, input_commands, input_time, input_seq);
  }
};

game_server.createGame = function() {
  var thegame = { id : UUID()};
  thegame.gamecore = new GameCore( thegame );
  thegame.gamecore.update( new Date().getTime() );
  this.game = thegame;
  return thegame;
};
