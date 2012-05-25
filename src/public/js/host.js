function initHost(socket, opts) {
    var id;
    var mode = 'white',
        files = {},
        ratio = opts.ratio,
        canvas = {
            graphics: [],
            history: [],
            drawing: null
        },
        video = {
            fileid: null,
            status: null,
            position: null
        },
        slide = {
            slideid: null,
            step: null,
            slides: {}
        };

    $('#mode_switcher, #drawing_tools').show();
    $('#canvas').show();

    window.onresize = function () {
        // TODO
    };
    window.onresize();

    socket.once('ready', function (_id) {
        id = _id;
    });
    socket.emit('create', opts);
}
