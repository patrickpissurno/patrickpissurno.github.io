$(document).ready(function(){
    var extras = $('.item-image-extra');
    extras = extras.filter(function(i){ return $(extras[i]).is(':visible') });

    extras.each(function(i){
        var v = $(extras[i]);
        if(v.children()[0].hasAttribute('data-src'))
            v.children().attr('src', v.children().attr('data-src'));
    });

    extras.children().hover(function start(e){
        if(e.target.play != null)
            e.target.play();
    }, function end(e){
        if(e.target.pause != null)
            e.target.pause();
    });

    $('.genie-thumb').on('loadeddata', function(){
        $('.genie-thumb').removeClass('genie-thumb').on('loadeddata', null);
    });

    if($('.floating-button').is(':visible'))
    {
        $(window).scroll(function() {
            if ($(this).scrollTop() + window.innerHeight > $(".talk-cta").offset().top)
                $('.floating-button').fadeOut(200);
            else
                $('.floating-button').fadeIn(200);
        });
    }
});