var game = {};
require('./game.core.js');
window.onload = function(){
	game = new GameCore();
	game.viewport = document.getElementById('viewport');
	game.viewport.offset_top = game.viewport.offsetTop;
	game.viewport.offset_left = game.viewport.offsetLeft;
	game.ctx = game.viewport.getContext('2d');
	game.ctx.font = '11px "Helvetica"';
	game.update( new Date().getTime() );
};
