var game_player = function( game) {
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

};

game_player.prototype.draw = function(){
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
    //draw a gun type thing to mark rotation
    game.ctx.rect(centerX - 3, y-3, 6, 3);
    game.ctx.stroke();
    game.ctx.closePath();
    game.ctx.restore();

};
