const DEBUG_MODE = false;

var Slider = function(e)
{
	this.canvas = e;
	this.canvas.mouse = new function(){this.x = 0; this.y = 0; this.pressed = false;};
	this.context = e.getContext("2d");
	e.setAttribute("width", e.offsetWidth);
	e.setAttribute("height", e.offsetHeight);
	this.sprites = [];
	this.isPlaying = true;
	this.isShowBig = -1;
	
	this.canvas.addEventListener('mousemove', function(e) {
		var rect = e.srcElement.getBoundingClientRect();
		this.mouse.x = e.clientX - rect.left;
		this.mouse.y = e.clientY - rect.top;
	}, false);
	
	this.canvas.onmousedown = function(e){
		e.srcElement.mouse.pressed = true;
	}
	
	this.canvas.onmouseup = function(e){
		e.srcElement.mouse.pressed = false;
	}
	
	this.started = false;
	this.awr = 10;
	this.hSlideOffset = 0;
	
	//START
	for(var i=0; i<30; i++)
	{
		var sprite = new Image();
		sprite.src = e.getAttribute("name")+"/"+i+".png";
		sprite.slider = this;
		sprite.onload = function(){
			/*var sX = 0;
			for(var i=0; i<this.slider.sprites.length; i++)
				sX += GetImageRealSize(this.slider.sprites[i]).width + 1;
			this.pos = {x:sX, y:this.slider.canvas.height/2 - GetImageRealSize(this).height/2};*/
			this.size = GetImageRealSize(this);
			this.slider.sprites.push(this);
			this.slider.awr = 10;
			
			if(!DEBUG_MODE)
				setTimeout(function(){console.clear();},30);
		};
	}
	
	//START METHOD
	this.start = function(_this)
	{
		_this.hSlideOffset = _this.sprites.length <= 4 ? ((_this.canvas.width - _this.sprites[0].size.width * (_this.sprites.length - 1)) / _this.sprites.length) : 1;
		
		var sX = 0;
		for(var i=0; i<_this.sprites.length; i++)
		{
			var spr = _this.sprites[i];
			spr.pos = {x:sX, y:_this.canvas.height/2 - GetImageRealSize(spr).height/2};
			sX += GetImageRealSize(spr).width + _this.hSlideOffset;
		}
	}
	
	//LOOP METHOD
	this.loop = function(_this)
	{
		if(_this.isShowBig != -1)
		{
			_this.ShowBig(_this.isShowBig);
			_this.isShowBig = -1;
		}
		
		_this.context.clearRect(0,0,_this.canvas.width, _this.canvas.height);
		
		if(!_this.started){
			_this.start(_this);
			_this.started = true;
		}
			
		
		for(var i=0; i<_this.sprites.length; i++)
		{
			//Update Each Sprite
			var spr = _this.sprites[i];

			var _w = _this.hSlideOffset;
			
			DrawImage(_this.context, spr, spr.pos.x, spr.pos.y);
			if(spr.pos.x > _this.canvas.width)
			{
				if(i != _this.sprites.length - 1)
					spr.pos.x = _this.sprites[i+1].pos.x - spr.size.width - _w;
				else
					spr.pos.x = _this.sprites[0].pos.x - spr.size.width - (_w + 1);
			}
			
			var mouse = _this.canvas.mouse;
			if(mouse.pressed)
			{
				if(mouse.x > spr.pos.x && mouse.x < spr.pos.x + spr.size.width)
				{
					_this.isShowBig = i;
					_this.canvas.mouse.pressed = false;
				}
			}
			
			if(_this.isPlaying)
				spr.pos.x += 1;
		}
		setTimeout(_this.loop, 50, _this);
	}

	this.delayedAwake = function(_this)
	{
		if(_this.awr > 0)
		{
			_this.awr --;
			setTimeout(_this.delayedAwake, 50, _this);
		}
		else
			setTimeout(_this.loop, 50, _this);
	}
	setTimeout(this.delayedAwake, 50, this);
	
	//Methods
	this.Play = function(){
		this.isPlaying = true;
	}
	
	this.Pause = function(){
		this.isPlaying = false;
	}
	
	this.ShowBig = function(i){
		this.Pause();
		
		var bigImage = document.createElement("canvas");
		bigImage.setAttribute("style","background: rgba(0, 0, 0, 0.5); height: 100%; left: 0; line-height: 100%; position: fixed; top: 0; width: 100%; z-index: 10000;");
		bigImage.setAttribute("id", "bigImage");
		bigImage = document.body.appendChild(bigImage);
		bigImage.setAttribute("width", bigImage.offsetWidth);
		bigImage.setAttribute("height", bigImage.offsetHeight);
		var ctx = bigImage.getContext("2d");
		
		if(bigImage.offsetWidth > bigImage.offsetHeight)
			var mSize = bigImage.offsetHeight*.85;
		else
			var mSize = bigImage.offsetWidth*.85;
			
		bigImage.slider = this;
		//bigImage.onmousedown = function(){ this.slider.CloseBig()};
		var imageY = bigImage.offsetHeight/2 - GetImageRealSize(this.sprites[i], mSize).height/2;
		DrawImage(ctx, this.sprites[i], bigImage.offsetWidth/2 - GetImageRealSize(this.sprites[i], mSize).width/2, imageY, mSize);
		ctx.font="20px Source Sans Pro";
		ctx.fillStyle = "#FFF";
		ctx.textAlign = "center";
		var txt;
		switch(language){
			case "br":
				txt = "Clique em qualquer lugar para fechar";
				break;
			default:
				txt = "Click anywhere to close";
				break;
		}
		ctx.fillText(txt,bigImage.offsetWidth/2, bigImage.offsetHeight/2 + GetImageRealSize(this.sprites[i], mSize).height/2 + 20);
		console.log(bigImage.offsetWidth/84);
		
		bigImage.style.opacity = 0;
		
		setTimeout(this.fadeInBig, 5, [bigImage, this]);
		
		//Disable Scroll
		$('body').addClass('stop-scrolling').css('margin-right', bigImage.offsetWidth/84);
		$('body').bind('touchmove', function(e){e.preventDefault()});
	}
	
	this.fadeInBig = function(args)
	{
		bigImage = args[0];
		_this = args[1];
		var alpha = parseFloat(bigImage.style.opacity);
		alpha += .05;
		if(alpha > 1)
			alpha = 1;
		bigImage.style.opacity = alpha;
		if(bigImage.style.opacity < 1)
			setTimeout(_this.fadeInBig, 5, [bigImage, _this]);
		else
			bigImage.onmousedown = function(){ setTimeout(_this.fadeOutBig, 5, [bigImage, _this]) };
	}
	
	this.fadeOutBig = function(args)
	{
		bigImage = args[0];
		_this = args[1];
		var alpha = parseFloat(bigImage.style.opacity);
		alpha -= .05;
		if(alpha < 0)
			alpha = 0;
		bigImage.style.opacity = alpha;
		if(bigImage.style.opacity > 0)
			setTimeout(_this.fadeOutBig, 5, [bigImage, _this]);
		else
			 _this.CloseBig();
	}
	
	this.CloseBig = function(){
		//Re-enable Scroll
		$('body').removeClass('stop-scrolling').css('margin-right', 0);
		$('body').unbind('touchmove');
		var bigImage = document.getElementById("bigImage");
		if(bigImage != null)
			bigImage.remove();
		this.Play();
	}
	
	//kkk = this;
}




var DrawImage = function(ctx, img, x, y, maxSize)
{
	if(maxSize == null)
		maxSize = 300;
	if(img.width > img.height)
		ctx.drawImage(img,x,y, maxSize,(img.height/img.width)*maxSize);
	else
		ctx.drawImage(img,x,y, (img.height/img.width)*maxSize, maxSize);
}

var GetImageRealSize = function(img, maxSize)
{
	if(maxSize == null)
		maxSize = 300;
	if(img.width > img.height)
		return {width:maxSize, height:(img.height/img.width)*maxSize};
	else
		return {width:(img.height/img.width)*maxSize, height:maxSize};
}

function IsImageLoaded(img) {
    if (!img.complete) {
        return false;
    }
    if (typeof img.naturalWidth !== "undefined" && img.naturalWidth === 0) {
        return false;
    }
    return true;
}

//EVENTs

window.onload = function()
{
	var slider = new Slider(document.getElementById("slider"));
}

function getMousePos(canvas, evt) {
	var rect = canvas.getBoundingClientRect();
	return {
	  x: evt.clientX - rect.left,
	  y: evt.clientY - rect.top
	};
}

/*(function(){
	new function(){
		this.loop = function(_this)	{
			console.log("A");
			setTimeout(_this.loop,1,_this);
		}
		setTimeout(this.loop,1,this);
	}
})();*/