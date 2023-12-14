var regex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
var blackList = [];

function getBlackList(){
    $.ajax('https://raw.githubusercontent.com/andreis/disposable-email-domains/master/domains.json', { success: function(response) { blackList = JSON.parse(response) } })
}

function showError(el, message){
    el.toggleClass('is-invalid', true).siblings('.invalid-feedback').html(message);
}

function submitEmail(){
    var $email = window.matchMedia('(max-width: 575px)').matches ? $('#email') : $('#email2');
    var email = $email.val().trim();
    if(email.length == 0)
        showError($email, 'Por favor digite seu e-mail');
    else if(!regex.test(email))
        showError($email, 'Tente outro. Este e-mail não é válido');
    else if(blackList.filter(function(x) { return email.indexOf(x) != -1 }).length > 0 )
        showError($email, 'Tente outro. Este e-mail não é suportado');
    else
        alert('Valid');
}

getBlackList();