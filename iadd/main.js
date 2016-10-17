var body = document.getElementsByTagName("body")[0];
body.addEventListener("ontouchmove", function(e){ e.preventDefault(); });
var add = document.getElementById("add-t");
var num = 0;
add.addEventListener("ontouchdown", function(e){
    num++;
    add.innerText = num + "";
    add.text = num + "";
});