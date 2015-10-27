/*  Copyright (c) 2012 Sven "FuzzYspo0N" Bergström

    written by : http://underscorediscovery.com
    written for : http://buildnewgames.com/real-time-multiplayer/

    MIT Licensed.
*/

    var
        game_server = module.exports = {},
        UUID        = require('node-uuid'),
        verbose     = true;

        //Since we are sharing code with the browser, we
        //are going to include some values to handle that.
    global.window = global.document = global;

        //Import shared game library code.
    require('./game.core.js');

        //A simple wrapper for logging so we can toggle it,
        //and augment it for clarity.
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

    game_server.onMessage = function(client,message) {

        if(this.fake_latency && message.split('_')[0].substr(0,1) == 'i') {

                //store all input message
            game_server.messages.push({client:client, message:message});

            setTimeout(function(){
                if(game_server.messages.length) {
                    game_server._onMessage( game_server.messages[0].client, game_server.messages[0].message );
                    game_server.messages.splice(0,1);
                }
            }.bind(this), this.fake_latency);

        } else {
            game_server._onMessage(client, message);
        }
    };

    game_server._onMessage = function(client,message) {

            //Cut the message up into sub components
        var message_parts = message.split('_');
            //The first is always the type of message
        var message_type = message_parts[0];

        if(message_type == 'i') {
                //Input handler will forward this
            this.onInput(client, message_parts);
        } else if(message_type == 'p') {
            client.send('s.p.' + message_parts[1]);
        } else if(message_type == 'l') {    //A client is asking for lag simulation
            this.fake_latency = parseFloat(message_parts[1]);
        }

    }; //game_server.onMessage

    game_server.onInput = function(client, parts) {
            //The input commands come in like u#l,
            //so we split them up into separate commands,
            //and then update the players
        var input_commands = parts[1].split('#');
        var input_time = parts[2].replace('-','_');
        var input_seq = parts[3];

            //the client should be in a game, so
            //we can tell that game to handle the input
        if(client && this.game && this.game.gamecore) {
            this.game.gamecore.handle_server_input(client, input_commands, input_time, input_seq);
        }

    };
    game_server.createGame = function() {
        var thegame = {
                id : UUID(),                //generate a new id for the game
            };
        thegame.gamecore = new game_core( thegame );
        thegame.gamecore.update( new Date().getTime() );
        this.game = thegame;
        return thegame;

    }; //game_server.createGame
