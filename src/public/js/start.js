$(function () {
    var $bclist = $('#bclist');
    var socket = io.connect();
    socket.on('list', function (bcinfo) {
        $('>.broadcast', $bclist).remove();
        for (var k in bcinfo) {
            if (!bcinfo.hasOwnProperty(k))
                continue;
            var bc = bcinfo[k];
            $('<li>').attr('id', 'bc-' + k)
                     .addClass('broadcast')
                     .append(
                         $('<a>').text(bc.title)
                                 .attr('href', '#')
                                 .attr('title', bc.desc)
                                 .attr('data-id', k)
                                 .attr('data-ratio', bc.ratio)
                                 .addClass('btn btn-large')
                         )
                     .prependTo($bclist);
        }
    });

    // server disconnected
    socket.on('disconnect', function () {
        // reload page to exit
        window.location.reload();
    });

    // Select broadcast
    $bclist.click(function (e) {
        var t = e.target;
        if (t.tagName !== 'A')
            return;
        e.preventDefault();
        if (!t.dataset.id)
            return;
        // hide start
        $('#start').hide();
        // to audience
        initAudience(socket, t.dataset.id, t.dataset.ratio);
    });
    
    // Create new broadcast
    $('#btn_create').click(function (e) {
        var opts = {
            title: $('#new_title').val(),
            id: $('#new_id').val(),
            desc: $('#new_desc').val(),
            ratio: $('#new_ratio').val()
        };
        // hide start
        $('#create_new').modal('hide');
        $('#start').hide();
        // to host
        initHost(socket, opts);
    });
});
