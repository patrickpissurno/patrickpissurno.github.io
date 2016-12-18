language = "br";
var lang = localStorage.getItem("lang");
if(lang != null)
	language = lang;
localStorage.setItem("lang", language);
UpdatePage();
setTimeout(function(){UpdatePage();}, 50);
setTimeout(function(){UpdatePage();}, 100);
setTimeout(function(){UpdatePage();}, 150);
setTimeout(function(){UpdatePage();}, 500);

function UpdatePage()
{
	if(language != "en")
	{
		var a = document.getElementsByClassName("lang-en");
		for(var i=0; i<a.length; i++)
			ChangeVisibility(a[i], false);
	}
	else
	{
		var a = document.getElementsByClassName("lang-en");
		for(var i=0; i<a.length; i++)
			ChangeVisibility(a[i], true);
	}
	
	if(language != "br")
	{
		var a = document.getElementsByClassName("lang-br");
		for(var i=0; i<a.length; i++)
			ChangeVisibility(a[i], false);
	}
	else
	{
		var a = document.getElementsByClassName("lang-br");
		for(var i=0; i<a.length; i++)
			ChangeVisibility(a[i], true);
	}
}

function ChangeVisibility(e, bool)
{
	if(e != null)
	{
		if(bool)
		{
			if(e.className.indexOf("keepInline") == -1)
				e.style.display = "block";
			else
				e.style.display = "inline";
		}
		else
			e.style.display = "none";
	}
}

function ChangeLang(e)
{
	switch(e)
	{
		case "br":
			language = "br";
			break;
		default:
			language = "en";
			break;
	}
	localStorage.setItem("lang", language);
	UpdatePage();
}