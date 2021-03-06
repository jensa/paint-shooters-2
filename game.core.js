//The main update loop runs on requestAnimationFrame,
//Which falls back to a setTimeout loop on the server
require('./gamePlayer.js');
calc = require('./math.js');
var frame_time = 60/1000; // run the local game at 16ms/ 60hz
if('undefined' != typeof(global)) frame_time = 45; //on server we run at 45ms, 22hz

var lastTime = 0;
var vendors = [ 'ms', 'moz', 'webkit', 'o' ];

for ( var x = 0; x < vendors.length && !window.requestAnimationFrame; ++ x ) {
  window.requestAnimationFrame = window[ vendors[ x ] + 'RequestAnimationFrame' ];
  window.cancelAnimationFrame = window[ vendors[ x ] + 'CancelAnimationFrame' ] || window[ vendors[ x ] + 'CancelRequestAnimationFrame' ];
}

if ( !window.requestAnimationFrame ) {
  window.requestAnimationFrame = function ( callback, element ) {
    var currTime = Date.now(), timeToCall = Math.max( 0, frame_time - ( currTime - lastTime ) );
    var id = window.setTimeout( function() { callback( currTime + timeToCall ); }, timeToCall );
    lastTime = currTime + timeToCall;
    return id;
  };
}

if (!window.cancelAnimationFrame ) {
  window.cancelAnimationFrame = function ( id ) { clearTimeout( id ); };
}

var GameCore = function(game_instance){
  //Store the instance, if any
  this.instance = game_instance;
  //Store a flag if we are the server
  this.server = this.instance !== undefined;
  //Used in collision etc.
  this.world = {
    width : 1000,
    height : 1000
  };
  this.players =  {};
  this.ghosts = {};

  //Set up some physics integration values
  this._pdt = 0.0001;                 //The physics update delta time
  this._pdte = new Date().getTime();  //The physics update last delta time
  //A local timer for precision on server and client
  this.local_time = 0.016;            //The local timer
  this._dt = new Date().getTime();    //The local timer delta
  this._dte = new Date().getTime();   //The local timer last frame time

  //Start a physics loop, this is separate to the rendering
  //as this happens at a fixed frequency
  this.create_physics_simulation();

  //Start a fast paced timer for measuring time easier
  this.create_timer();
  //Client specific initialisation
  if(!this.server) {
    this.keyboard = new THREEx.KeyboardState();
    this.mouse = new THREEx.MouseState();
    this.client_create_configuration();
    //A list of recent server updates we interpolate across
    //This is the buffer that is the driving factor for our networking
    this.server_updates = [];

    this.client_connect_to_server();
    //We start pinging the server to determine latency
    this.client_create_ping_timer();
  } else {
    this.server_time = 0;
    this.laststate = {};
  }
};

module.exports = global.GameCore = GameCore;
Number.prototype.fixed = function(n) { n = n || 3; return parseFloat(this.toFixed(n)); };

//shared functions
GameCore.prototype.create_physics_simulation = function() {
  setInterval(function(){
    this._pdt = (new Date().getTime() - this._pdte)/1000.0;
    this._pdte = new Date().getTime();
    this.update_physics();
  }.bind(this), 15);
};

GameCore.prototype.update = function(t) {
  //Work out the delta time
  this.dt = this.lastframetime ? ( (t - this.lastframetime)/1000.0).fixed() : 0.016;
  //Store the last frame time
  this.lastframetime = t;
  //Update the game specifics
  if(!this.server) {
    this.client_update();
  } else {
    this.server_update();
  }
  this.updateid = window.requestAnimationFrame( this.update.bind(this), this.viewport );
};

GameCore.prototype.check_collision = function( item ) {
    //Left wall.
  if(item.pos.x <= item.pos_limits.x_min) {
    item.pos.x = item.pos_limits.x_min;
  }
  //Right wall
  if(item.pos.x >= item.pos_limits.x_max ) {
    item.pos.x = item.pos_limits.x_max;
  }
  //Roof wall.
  if(item.pos.y <= item.pos_limits.y_min) {
    item.pos.y = item.pos_limits.y_min;
  }
  //Floor wall
  if(item.pos.y >= item.pos_limits.y_max ) {
    item.pos.y = item.pos_limits.y_max;
  }
  //Fixed point helps be more deterministic
  item.pos.x = item.pos.x.fixed(4);
  item.pos.y = item.pos.y.fixed(4);
};

GameCore.prototype.update_physics = function() {
    if(this.server) {
        this.server_update_physics();
    } else {
        this.client_update_physics();
    }
};

//specific functions
GameCore.prototype.server_addPlayer = function(socket){
  this.players[socket.userid] = new GamePlayer(this);
  this.players[socket.userid].id = socket.userid;
  this.players[socket.userid].instance = socket;
}

//Updated at 15ms , simulates the world state
GameCore.prototype.server_update_physics = function() {
    for(var playerKey in this.players){
      var player = this.players[playerKey];
      player.old_state.pos = calc.pos( player.pos );
      var other_new_dir = player.process_input();
      player.pos = calc.v_add( player.old_state.pos, other_new_dir);
      if(other_new_dir.lookingAt.x !== undefined) //update rotation
        player.rotation = calc.get_rotation(player.pos, other_new_dir.lookingAt)
      player.inputs = [];
    }
    for(var playerKey in this.players){
      var player = this.players[playerKey];
      this.check_collision(player);
    }
};

GameCore.prototype.server_update = function(){
    this.server_time = this.local_time;
    var positions = {};
    var inputs = {};
    var rotations = {};
    for(var playerKey in this.players){
      positions[playerKey] = this.players[playerKey].pos;
      inputs[playerKey] = this.players[playerKey].last_input_seq;
      rotations[playerKey] = this.players[playerKey].rotation;
    }
    this.laststate = {
        p : positions,
        r : rotations,
        i : inputs,
        t : this.server_time
    };

    for(var playerKey in this.players){
      this.players[playerKey].instance.emit( 'onserverupdate', this.laststate );
    }
};

GameCore.prototype.server_getCurrentPlayers = function(){
  var currentPlayers = {};
  for(var playerKey in this.players){
    var player = this.players[playerKey];
    currentPlayers[playerKey] = {pos:player.pos, rotation:player.rotation, speed:player.speed};
  }
  return currentPlayers;
}

GameCore.prototype.server_handle_input = function(client, input, input_time, input_seq) {
   this.players[client.userid].inputs.push({inputs:input, time:input_time, seq:input_seq});
};

GameCore.prototype.client_handle_input = function(){
        //This takes input from the client and keeps a record,
        //It also sends the input information to the server immediately
        //as it is pressed. It also tags each input with a sequence number.

    var x_dir = 0;
    var y_dir = 0;
    var input = [];
    this.client_has_input = false;

    if( this.keyboard.pressed('A') ||
        this.keyboard.pressed('left')) {
            x_dir = -1;
            input.push('l');
        } //left
    if( this.keyboard.pressed('D') ||
        this.keyboard.pressed('right')) {
            x_dir = 1;
            input.push('r');
        } //right
    if( this.keyboard.pressed('S') ||
        this.keyboard.pressed('down')) {
            y_dir = 1;
            input.push('d');
        } //down
    if( this.keyboard.pressed('W') ||
        this.keyboard.pressed('up')) {
            y_dir = -1;
            input.push('u');
        } //up
    if(this.mouse.moved() && this.viewport.map_corner !== undefined){
      var mPos = this.mouse.position();
      var rect = this.viewport.getBoundingClientRect();
      var viewportPos = {x:mPos.x - this.viewport.offsetLeft, y:mPos.y - this.viewport.offsetTop};
      //translate viewport position to map position and we'll be all good
      mPos.x = viewportPos.x + this.viewport.map_corner.x;
      mPos.y = viewportPos.y + this.viewport.map_corner.y;
      input.push('m~' + mPos.x + '~' + mPos.y);
    }
    if(input.length) {
            //Update what sequence we are on now
        this.input_seq += 1;
            //Store the input state as a snapshot of what happened.
        this.localPlayer.inputs.push({
            inputs : input,
            time : this.local_time.fixed(3),
            seq : this.input_seq
        });
            //Send the packet of information to the server.
            //The input packets are labelled with an 'i' in front.
        var server_packet = 'i_';
            server_packet += input.join('#') + '_';
            server_packet += this.local_time.toFixed(3).replace('.','#') + '_';
            server_packet += this.input_seq;
            //Go
        this.socket.send(  server_packet  );

            //Return the direction if needed
        return calc.physics_movement_vector_from_direction( x_dir, y_dir );

    } else {
        return {x:0,y:0};
    }

};

GameCore.prototype.client_process_net_prediction_correction = function() {

        //No updates...
  if(!this.server_updates.length || this.localPlayer === undefined) return;

      //The most recent server update
  var latest_server_data = this.server_updates[this.server_updates.length-1];

      //Our latest server position
  var my_server_pos = latest_server_data.p[this.localPlayer.id];
    //here we handle our local input prediction ,
    //by correcting it with the server and reconciling its differences

    var my_last_input_on_server = latest_server_data.i[this.localPlayer.id];
    if(my_last_input_on_server) {
      //The last input sequence index in my local input list
      var lastinputseq_index = -1;
      //Find this input in the list, and store the index
      for(var i = 0; i < this.localPlayer.inputs.length; ++i) {
          if(this.localPlayer.inputs[i].seq == my_last_input_on_server) {
              lastinputseq_index = i;
              break;
          }
      }

      //Now we can crop the list of any updates we have already processed
      if(lastinputseq_index != -1) {
        //so we have now gotten an acknowledgement from the server that our inputs here have been accepted
        //and that we can predict from this known position instead

        //remove the rest of the inputs we have confirmed on the server
        var number_to_clear = Math.abs(lastinputseq_index - (-1));
        this.localPlayer.inputs.splice(0, number_to_clear);
            //The player is now located at the new server position, authoritive server
        this.localPlayer.cur_state.pos = calc.pos(my_server_pos);
        this.localPlayer.last_input_seq = lastinputseq_index;
            //Now we reapply all the inputs that we have locally that
            //the server hasn't yet confirmed. This will 'keep' our position the same,
            //but also confirm the server position at the same time.
        this.client_update_physics();
        this.client_update_local_position();
      } // if(lastinputseq_index != -1)
    } //if my_last_input_on_server

};

GameCore.prototype.client_process_net_updates = function() {
        //No updates...
    if(!this.server_updates.length) return;
    //First : Find the position in the updates, on the timeline
    //We call this current_time, then we find the past_pos and the target_pos using this,
    //searching throught the server_updates array for current_time in between 2 other times.
    // Then :  other player position = lerp ( past_pos, target_pos, current_time );

    //Find the position in the timeline of updates we stored.
    var current_time = this.client_time;
    var count = this.server_updates.length-1;
    var target = null;
    var previous = null;

        //We look from the 'oldest' updates, since the newest ones
        //are at the end (list.length-1 for example). This will be expensive
        //only when our time is not found on the timeline, since it will run all
        //samples. Usually this iterates very little before breaking out with a target.
    for(var i = 0; i < count; ++i) {
        var point = this.server_updates[i];
        var next_point = this.server_updates[i+1];
            //Compare our point in time with the server times we have
        if(current_time > point.t && current_time < next_point.t) {
            target = next_point;
            previous = point;
            break;
        }
    }
    //With no target we store the last known
    //server position and move to that instead
    if(!target) {
        target = this.server_updates[0];
        previous = this.server_updates[0];
    }
    //Now that we have a target and a previous destination,
    //We can interpolate between then based on 'how far in between' we are.
    //This is simple percentage maths, value/target = [0,1] range of numbers.
    //lerp requires the 0,1 value to lerp to? thats the one.

     if(target && previous) {
        this.target_time = target.t;

        var difference = this.target_time - current_time;
        var max_difference = (target.t - previous.t).fixed(3);
        var time_point = (difference/max_difference).fixed(3);

        //Because we use the same target and previous in extreme cases
        //It is possible to get incorrect values due to division by 0 difference
        //and such. This is a safe guard and should probably not be here. lol.
        if( isNaN(time_point) ) time_point = 0;
        if(time_point == -Infinity) time_point = 0;
        if(time_point == Infinity) time_point = 0;
        //The most recent server update
        var latest_server_data = this.server_updates[ this.server_updates.length-1 ];
        for(var playerKey in this.players){
          if(playerKey == this.localPlayer.id)
            continue;
          var player = this.players[playerKey];
          var other_server_pos = latest_server_data.p[playerKey];
          //The other players positions in this timeline, behind us and in front of us
          var other_target_pos = target.p[playerKey];
          var other_past_pos = previous.p[playerKey];
          if(other_past_pos == undefined || other_target_pos == undefined)
            continue;
          //update the dest block, this is a simple lerp
          //to the target from the previous point in the server_updates buffer
          this.ghosts[playerKey].pos = calc.v_lerp(other_past_pos, other_target_pos, time_point);

          var rotation = latest_server_data.r[playerKey];
          player.pos = calc.v_lerp( player.pos, this.ghosts[playerKey].pos, this._pdt*this.client_smooth)
          player.rotation = rotation;
        }
    }
};

GameCore.prototype.client_onserverupdate_recieved = function(data){

  //Store the server time (this is offset by the latency in the network, by the time we get it)
  this.server_time = data.t;
  //Update our local offset time from the last server update
  this.client_time = this.server_time - (this.net_offset/1000);
  this.server_updates.push(data);
  //we limit the buffer in seconds worth of updates
  //60fps*buffer seconds = number of samples
  if(this.server_updates.length >= ( 60*this.buffer_size )) {
    this.server_updates.splice(0,1);
  }
  this.oldest_tick = this.server_updates[0].t;
  //Handle the latest positions from the server
  //and make sure to correct our local predictions, making the server have final say.
  this.client_process_net_prediction_correction();
};

GameCore.prototype.client_update_local_position = function(){

  if(this.localPlayer !== undefined) {
    //Work out the time we have since we updated the state
    var t = (this.local_time - this.localPlayer.state_time) / this._pdt;
    //Make sure the visual position matches the states we have stored
    this.localPlayer.pos = this.localPlayer.cur_state.pos;
    this.localPlayer.rotation = this.localPlayer.cur_state.rotation;

    var centerX = this.localPlayer.pos.x+this.localPlayer.size.hx;
    var centerY = this.localPlayer.pos.y+this.localPlayer.size.hy;
    this.viewport.map_corner = {x:centerX - this.viewport.width/2, y:centerY - this.viewport.height/2};
    //We handle collision on client
    this.check_collision( this.localPlayer );
  }
};

GameCore.prototype.client_update_physics = function() {
  //Fetch the new direction from the input buffer,
  //and apply it to the state so we can smooth it in the visual state
  if(this.localPlayer !== undefined) {
    this.localPlayer.old_state.pos = calc.pos( this.localPlayer.cur_state.pos );
    var nd = this.localPlayer.process_input();
    this.localPlayer.cur_state.pos = calc.v_add( this.localPlayer.old_state.pos, nd);
    if(nd.lookingAt.x !== undefined) //update rotation
    {
      this.localPlayer.cur_state.rotation = calc.get_rotation(this.localPlayer.cur_state.pos, nd.lookingAt)
    }
    this.localPlayer.state_time = this.local_time;
  }
};

GameCore.prototype.client_update = function() {
  if(this.localPlayer === undefined)
    return;
  //Clear the screen area
  this.ctx.clear(false)
  this.ctx.clearRect(0,0,720,480);
  //Capture inputs from the player
  this.client_handle_input();
  //Network players just gets drawn normally, with interpolation from
  //the server updates, smoothing out the positions from the past.
  //Note that if we don't have prediction enabled - this will also
  //update the actual local client position on screen as well.
  this.client_process_net_updates();
  //Now they should have updated, we can draw the entities
  for(var playerKey in this.players){
    if(playerKey == this.localPlayer.id)
      continue;
    this.players[playerKey].draw();
  }
  //we smooth out our position across frames using local input states we have stored.
  this.client_update_local_position();
  //And then we finally draw
  this.localPlayer.draw();
  //Work out the fps average
  this.client_refresh_fps();

};

GameCore.prototype.create_timer = function(){
  setInterval(function(){
    this._dt = new Date().getTime() - this._dte;
    this._dte = new Date().getTime();
    this.local_time += this._dt/1000.0;
  }.bind(this), 4);
}

GameCore.prototype.client_create_ping_timer = function() {
  //Set a ping timer to 1 second, to maintain the ping/latency between
  //client and server and calculated roughly how our connection is doing
  setInterval(function(){
    this.last_ping_time = new Date().getTime() - this.fake_lag;
    this.socket.send('p.' + (this.last_ping_time) );
  }.bind(this), 1000);
};

GameCore.prototype.client_create_configuration = function() {

  this.show_help = false;             //Whether or not to draw the help text
  this.naive_approach = false;        //Whether or not to use the naive approach
  this.show_server_pos = false;       //Whether or not to show the server position
  this.show_dest_pos = false;         //Whether or not to show the interpolation goal
  this.input_seq = 0;                 //When predicting client inputs, we store the last input as a sequence number
  this.client_smoothing = true;       //Whether or not the client side prediction tries to smooth things out
  this.client_smooth = 25;            //amount of smoothing to apply to client update dest

  this.net_latency = 0.001;           //the latency between the client and the server (ping/2)
  this.net_ping = 0.001;              //The round trip time from here to the server,and back
  this.last_ping_time = 0.001;        //The time we last sent a ping
  this.fake_lag = 0;                //If we are simulating lag, this applies only to the input client (not others)
  this.fake_lag_time = 0;

  this.net_offset = 100;              //100 ms latency between server and client interpolation for other clients
  this.buffer_size = 2;               //The size of the server history to keep for rewinding/interpolating.
  this.target_time = 0.01;            //the time where we want to be in the server timeline
  this.oldest_tick = 0.01;            //the last time tick we have available in the buffer

  this.client_time = 0.01;            //Our local 'clock' based on server time - client interpolation(net_offset).
  this.server_time = 0.01;            //The time the server reported it was at, last we heard from it

  this.dt = 0.016;                    //The time that the last frame took to run
  this.fps = 0;                       //The current instantaneous fps (1/this.dt)
  this.fps_avg_count = 0;             //The number of samples we have taken for fps_avg
  this.fps_avg = 0;                   //The current average fps displayed in the debug UI
  this.fps_avg_acc = 0;               //The accumulation of the last avgcount fps samples

  this.lit = 0;
  this.llt = new Date().getTime();

};

GameCore.prototype.client_playerJoined = function(data){
  this.players[data.id] = new GamePlayer(this);
  this.players[data.id].pos = data.pos;
  this.players[data.id].speed = data.speed;
  this.players[data.id].rotation = data.rotation;
  this.ghosts[data.id] = new GamePlayer(this);
  this.ghosts[data.id].pos = data.pos;
  this.ghosts[data.id].speed = data.speed;
  this.ghosts[data.id].rotation = data.rotation;
}

GameCore.prototype.client_connect_to_server = function() {
  //Store a local reference to our connection to the server
  this.socket = io.connect();
  //When we connect, we are not 'connected' until we have a server id
  //and are placed in a game by the server. The server sends us a message for that.

  //Sent each tick of the server simulation. This is our authoritive update
  this.socket.on('onserverupdate', this.client_onserverupdate_recieved.bind(this));
  //Handle when we connect to the server, showing state and storing id's.
  this.socket.on('onconnected', this.client_onconnected.bind(this));
  //On message from the server, we parse the commands and send it to the handlers
  this.socket.on('message', this.client_onnetmessage.bind(this));
  this.socket.on('player_joined', this.client_playerJoined.bind(this));

};

GameCore.prototype.client_addObjectFromServer = function(data){
}

GameCore.prototype.client_handshake = function(data){
    var server_time = parseFloat(data.replace('-','_'));
    this.local_time = server_time + this.net_latency;
}

GameCore.prototype.client_onconnected = function(data) {

  //The server responded that we are now in a game,
  //this lets us store the information about ourselves and set the colors
  //to show we are now ready to be playing.
  var server_time = parseFloat(data.time.replace('-','_'));
  this.local_time = server_time + this.net_latency;

  this.localPlayer = new GamePlayer(this);
  this.localPlayer.id = data.id;
  this.localPlayer.info_color = '#cc0000';
  this.localPlayer.state = 'connected';
  this.localPlayer.online = true;
  for(var playerId in data.players){
    this.players[playerId] = new GamePlayer(this);
    this.players[playerId].pos = data.players[playerId].pos;
    this.ghosts[playerId] = new GamePlayer(this)
    this.ghosts[playerId].pos = this.players[playerId].pos;
  }

};


GameCore.prototype.client_onping = function(data) {
  this.net_ping = new Date().getTime() - parseFloat( data );
  this.net_latency = this.net_ping/2;
};

GameCore.prototype.client_onnetmessage = function(data) {
  var commands = data.split('_');
  var command = commands[0];
  var subcommand = commands[1] || null;
  var commanddata = commands[2] || null;

  switch(command) {
    case 's': //server message
    switch(subcommand) {
      case 's' : this.client_handshake(commanddata); break;
      case 'p' : this.client_onping(commanddata); break;
      case 'n': this.client_addObjectFromServer(commanddata); break;
    } break;
  }
};

GameCore.prototype.client_refresh_fps = function() {
  //We store the fps for 10 frames, by adding it to this accumulator
  this.fps = 1/this.dt;
  this.fps_avg_acc += this.fps;
  this.fps_avg_count++;
  //When we reach 10 frames we work out the average fps
  if(this.fps_avg_count >= 10) {
    this.fps_avg = this.fps_avg_acc/10;
    this.fps_avg_count = 1;
    this.fps_avg_acc = this.fps;
  } //reached 10 frames
};
