    var
        gameport        = process.env.PORT || 3000,

        io              = require('socket.io'),
        express         = require('express'),
        UUID            = require('node-uuid'),
        verbose         = false,
        http            = require('http'),
        app             = express(),
        server          = http.createServer(app);
    app.set('view engine', 'jade')
    server.listen(gameport)
    console.log('\t :: Express :: Listening on port ' + gameport );
    app.get( '/', function( req, res ){
        res.render('game', {});
    });
    app.get( '/*' , function( req, res, next ) {
        var file = req.params[0];
        if(verbose) console.log('\t :: Express :: file requested : ' + file);
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
        client.emit('onconnected', { id: client.userid, players:game.gamecore.server_getCurrentPlayers(), time:String(game.gamecore.local_time).replace('.','-') } );
        var player = game.gamecore.players[client.userid];
        client.broadcast.emit('player_joined', {id:client.userid, pos:player.pos, speed:player.speed, rotation:player.rotation});
        console.log('\t socket.io:: player ' + client.userid + ' connected');
        client.on('message', function(m) {
            game_server.onMessage(client, m);
        });
        client.on('disconnect', function () {
            if(client.game && client.game.id) {
            }
        });
    });
