
// (4.22208334636).fixed(n) will return fixed point value to n places, default n = 3
Number.prototype.fixed = function(n) { n = n || 3; return parseFloat(this.toFixed(n)); };
//copies a 2d vector like object from one to another
module.exports.pos = function(a) { return {x:a.x,y:a.y}; };
//Add a 2d vector with another one and return the resulting vector
module.exports.v_add = function(a,b) { return { x:(a.x+b.x).fixed(), y:(a.y+b.y).fixed() }; };
//Subtract a 2d vector with another one and return the resulting vector
module.exports.v_sub = function(a,b) { return { x:(a.x-b.x).fixed(),y:(a.y-b.y).fixed() }; };
//Multiply a 2d vector with a scalar value and return the resulting vector
module.exports.v_mul_scalar = function(a,b) { return {x: (a.x*b).fixed() , y:(a.y*b).fixed() }; };
//For the server, we need to cancel the setTimeout that the polyfill creates
module.exports.stop_update = function() {  window.cancelAnimationFrame( this.updateid );  };
//Simple linear interpolation
module.exports.lerp = function(p, n, t) { var _t = Number(t); _t = (Math.max(0, Math.min(1, _t))).fixed(); return (p + _t * (n - p)).fixed(); };
//Simple linear interpolation between 2 vectors
module.exports.v_lerp = function(v,tv,t) { return { x: this.lerp(v.x, tv.x, t), y:this.lerp(v.y, tv.y, t) }; };

module.exports.get_rotation = function(from, to)
{
var angle = Math.atan2(to.x - from.x, to.y - from.y) * 180/ Math.PI;
if(angle < 0)
{
angle+= 360;
}
return angle;
}

module.exports.physics_movement_vector_from_direction = function(x, y, speed) {
        //Must be fixed step, at physics sync speed.
    return {
        x : (x * (speed * 0.015)).fixed(3),
        y : (y * (speed * 0.015)).fixed(3)
    };

};
