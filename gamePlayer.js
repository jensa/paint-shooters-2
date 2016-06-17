var GamePlayer = function(game) {
  //Set up initial values for our state information
  this.pos = { x:(50 + (game.world.width - 50) * Math.random()), y:(50 + (game.world.height - 50) * Math.random()) };
  this.size = { x:16, y:16, hx:8, hy:8 };
  this.state = 'not-connected';
  this.color = 'rgba(255,255,255,0.1)';
  this.info_color = 'rgba(255,255,255,0.1)';
  this.id = '';

  //These are used in moving us around later
  this.old_state = {pos:{x:0,y:0}};
  this.cur_state = {pos:{x:0,y:0}};
  this.state_time = new Date().getTime();

  //Our local history of inputs
  this.inputs = [];

  //The world bounds we are confined to
  this.pos_limits = {
      x_min: this.size.hx,
      x_max: game.world.width - this.size.hx,
      y_min: this.size.hy,
      y_max: game.world.height - this.size.hy
  };
  this.speed = 200;
  this.game = game;
};

GamePlayer.prototype.draw = function(){
  var game = this.game;
  if(!game.viewport.map_corner || game.viewport.map_corner == null)
    return;
  var x = this.pos.x - game.viewport.map_corner.x;
  var y = this.pos.y - game.viewport.map_corner.y;

  var centerX = x+ this.size.hx;
  var centerY = y+ this.size.hy;

  game.ctx.save();
  game.ctx.translate(centerX, centerY);
  game.ctx.rotate(-(this.rotation - 180) * Math.PI / 180);
  game.ctx.translate(-centerX, -centerY);
  game.ctx.beginPath();
  game.ctx.rect(x,y,this.size.hx *2,this.size.hy * 2);
  //draw a gun type thing to mark direction
  game.ctx.rect(centerX - 3, y-3, 6, 3);
  game.ctx.stroke();
  game.ctx.closePath();
  game.ctx.restore();
};

GamePlayer.prototype.process_input = function() {
  //It's possible to have recieved multiple inputs by now,
  //so we process each one
  var x_dir = 0;
  var y_dir = 0;
  var mX, mY;
  var rotation = 0;
  var ic = this.inputs.length;
  if(ic) {
    for(var j = 0; j < ic; ++j) {
      //don't process ones we already have simulated locally
      if(this.inputs[j].seq <= this.last_input_seq) continue;

      var input = this.inputs[j].inputs;
      for(var i = 0; i < input.length; ++i) {
        var key = input[i];
        var parts = key.split('~');
        if(key == 'l') {
          x_dir -= 1;
        }
        if(key == 'r') {
          x_dir += 1;
        }
        if(key == 'd') {
          y_dir += 1;
        }
        if(key == 'u') {
          y_dir -= 1;
        }
        if(parts[0] == 'm'){ // mouse move
          mX = parseFloat(parts[1]);
          mY = parseFloat(parts[2]);
        }
      }
    }
  }
  //we have a direction vector now, so apply the same physics as the client
  var resulting_vector = calc.physics_movement_vector_from_direction(x_dir,y_dir, this.speed);
  resulting_vector.lookingAt = {x:mX, y:mY};

  if(this.inputs.length) {
    //we can now clear the array since these have been processed
    this.last_input_time = this.inputs[ic-1].time;
    this.last_input_seq = this.inputs[ic-1].seq;
  }
  return resulting_vector;
};

module.exports = global.GamePlayer = GamePlayer;
