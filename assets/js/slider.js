var sprite = new Image();
sprite.src = "../images/slideremote/print1.png";

var Slider = function(e)
{
	this.canvas = e;
	this.context = e.getContext("2d");
	e.setAttribute("width", e.offsetWidth);
	e.setAttribute("height", e.offsetHeight);
	DrawImage(this.context, sprite, 0, 0);
}




var DrawImage = function(ctx, img, x, y)
{
	if(img.width > img.height)
		ctx.drawImage(img,x,y, 300,(img.height/img.width)*300);
	else
		ctx.drawImage(img,x,y, (img.height/img.width)*300, 300);
}

window.onload = function()
{
	var slider = new Slider(document.getElementById("slider"));
}