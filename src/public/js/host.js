function initHost(socket, opts) {
    var id;
    var files = {},
        ratio = opts.ratio;
    canvas = {
        graphics: [],
        history: [],
        drawing: null
    };
    video = {
        fileid: null,
        status: null,
        position: null
    };
    slide = {
        slideid: null,
        step: null,
        slides: {}
    };

    // elements;
    var $$body = $('body');
    var $$buttons = $('toolbar>button'),
        $$toolbars = $('toolbar');
    initElements();

    // size
    var canvasSpacing = 10,
        maxButtonSize = 64,
        buttonSpacing = 0.6;
    // ratio
    var cWidth, cHeight; // width & height of canvas
    ratio = ratio.split(':');
    ratio = parseInt(ratio[0]) / parseInt(ratio[1]);
    // toolbar size
    var buttonCount = $$buttons.length,
        toolbarCount = $$toolbars.length,
        buttonSizeBase = 1 / (buttonCount +
                (toolbarCount - 1) * buttonSpacing),
        buttonSize;

    // on window resize event
    window.onresize = function () {
        var top, bottom, left, right;
        top = bottom = left = right = canvasSpacing;
        // get current size
        var origWidth = window.innerWidth,
            origHeight = window.innerHeight;
        width = origWidth;
        height = origHeight;
        if (width == 0 || height == 0)
            return;

        // computer toolbar size
        var curRatio = width / height;
        if (curRatio > ratio) {
            // horizontal
            // toolbar at left side
            buttonSize = height * buttonSizeBase;
            if (buttonSize > maxButtonSize)
                buttonSize = maxButtonSize;
            width -= buttonSize + canvasSpacing;
            height -= 2 * canvasSpacing;
            left = buttonSize;
        }
        else {
            // vertical
            // toolbar at bottom side
            buttonSize = width * buttonSizeBase;
            if (buttonSize > maxButtonSize)
                buttonSize = maxButtonSize;
            height -= buttonSize + canvasSpacing;
            width -= 2 * canvasSpacing;
            bottom = buttonSize;
        }
        // set toolbar
        var toolbarLength = buttonSize / buttonSizeBase;
        $$buttons.width(buttonSize).height(buttonSize);
        if (curRatio > ratio) {
            // horizontal
            $('body').removeClass('vertical').addClass('horizontal');
            var x = 0,
                y = (origHeight - toolbarLength) / 2;
            $$toolbars.each(function () {
                $('>button', $(this)).each(function () {
                    this.style.left = x + 'px';
                    this.style.top = y + 'px';
                    y += buttonSize;
                });
                y += buttonSize * buttonSpacing;
            });
        }
        else {
            // vertical
            $('body').removeClass('horizontal').addClass('vertical');
            var x = (origWidth - toolbarLength) / 2,
                y = origHeight - buttonSize;
            $$toolbars.each(function () {
                $('>button', $(this)).each(function () {
                    this.style.left = x + 'px';
                    this.style.top = y + 'px';
                    x += buttonSize;
                });
                x += buttonSize * buttonSpacing;
            });
        }

        // compute canvas size
        curRatio = width / height;
        if (curRatio > ratio)
            width = height * ratio;
        else if (curRatio < ratio)
            height = width / ratio;
        // resize canvases, video and slide
        function setPos(e) {
            e.width = width;
            e.height = height;
            e.style.left = left +
                (origWidth - left - right - width) / 2 + 'px';
            e.style.top = top +
                (origHeight - top - bottom - height) / 2 + 'px';
        }
        setPos($drawing);
        setPos($graphics);
        setPos($video);
        setPos($slide);
    
        // redraw
        redrawGraphics();
        redrawDrawing();
    };
    window.onresize();

    var brushStyle = {};

    $('#pencil').click(function () {
        // set current
        $('#drawing_tools>button').removeClass('current');
        $(this).addClass('current');
    });

    /* Mode switchers */

    $('#mode_white').click(function () {
        if (mode === 'white')
            return;

        // set current
        $('#mode_switcher>button').removeClass('current');
        $(this).addClass('current');
        $$body.addClass('white').removeClass('video slide');

        // components
        $$video.hide();
        $$slide.hide();
        $$canvas.show();
        // switch button status
        $('#drawing_tools>button').each(function () {
            this.disabled = false;
        });
        $('#enable_drawing').hide();

        // change mode
        mode = 'white';
        canvas.graphics = [];
        canvas.history = [];
        redrawGraphics();
        // send event
        socket.emit('mode white');

        // default tool
        $('#pencil').click();
    });

    $$body.addClass('host');

    socket.once('ready', function (_id) {
        id = _id;
        $$toolbars.show();
        $('#mode_white').click();
    });
    socket.emit('create', opts);
}
