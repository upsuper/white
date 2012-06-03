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

    var PENCIL_COLORS = [
            '#000000', '#ff0000', '#22b14c',
            '#80ffff', '#ff7f27', '#0000ff',
            '#919091', '#ffff00', '#a349a4'
        ],
        HIGHLIGHTER_COLORS = [
            'rgba(254, 254, 129, .2)', 'rgba(92, 250, 152, .2)', 
            'rgba(59, 232, 244, .2)', 'rgba(254, 170, 249, .2)'
        ],
        THICKNESSES = [
            0.007, 0.009, 0.012, 0.015, 0.02
        ];

    // elements;
    var $$body = $('body');
    var $$buttons = $('toolbar>button'),
        $$toolbars = $('toolbar');
    var $$palette = $('palette'),
        $$chooser = $('chooser');
    initElements();

    // size
    var canvasSpacing = 10,
        maxButtonSize = 80,
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
    var offsetX, offsetY;
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
        offsetX = left+ (origWidth - left - right - width) / 2;
        offsetY = top + (origHeight - top - bottom - height) / 2;
        function setPos(e) {
            e.width = width;
            e.height = height;
            e.style.left = offsetX + 'px';
            e.style.top = offsetY + 'px';
        }
        setPos($drawing);
        setPos($graphics);
        setPos($video);
        setPos($slide);
    
        // initial chooser
        // TODO
        for (var i = 0; i < THICKNESSES.length; ++i) {
            var $thickness = $('<thickness>')[0];
            $thickness.dataset.thick = THICKNESSES[i];
        }

        // redraw
        redrawGraphics();
        redrawDrawing();
    };
    window.onresize();

    var tool, color, thickness;
    var brushStyle = {};

    /* Tools */
    
    function setCurrentTool(elem) {
        $('#drawing_tools>button').removeClass('current');
        $(elem).addClass('current');
    }

    $('#pencil').click(function () {
        if (tool === 'pencil')
            return;
        // set current
        setCurrentTool(this);
        tool = 'pencil';
        // init palette & show chooser
        $('#color').show();
        $$palette.attr('class', '');
        $$palette.addClass('pencil-color');
        for (var i = 0; i < PENCIL_COLORS.length; ++i) {
            var $color = $('<color>')[0];
            $color.dataset.color = PENCIL_COLORS[i];
            $color.style.backgroundColor = PENCIL_COLORS[i];
            $$palette.append($color);
        }
        $('#thickness').show();
        // set brush style
        brushStyle.color = color = PENCIL_COLORS[0];
        brushStyle.thickness = thickness = THICKNESSES[0];
    });

    $('#eraser').click(function () {
        if (tool == 'eraser')
            return;
        // set current
        setCurrentTool(this);
        tool = 'eraser';
        // hide color & init chooser
        $('#color').hide();
        $('#thickness').show();
        // set brush style
        brushStyle.color = '#ffffff';
        brushStyle.thickness = thickness =
            THICKNESSES[THICKNESSES.length - 1];
    });

    $('#highlighter').click(function () {
        if (tool == 'highlighter')
            return;
        // set current
        setCurrentTool(this);
        tool = 'highlighter';
        // init palette & show chooser
        $('#color').show();
        $$palette.attr('class', '');
        $$palette.addClass('highlighter-color');
        for (var i = 0; i < HIGHLIGHTER_COLORS.length; ++i) {
            var $color = $('<color>')[0];
            $color.dataset.color = HIGHLIGHTER_COLORS[i];
            $color.style.backgroundColor = HIGHLIGHTER_COLORS[i];
            $$palette.append($color);
        }
        $('#thickness').show();
        // set brush style
        brushStyle.color = color = HIGHLIGHTER_COLORS[0];
        brushStyle.thickness = thickness = 
            THICKNESSES[THICKNESSES.length - 1];
    });

    // TODO disable of undo & redo
    $('#undo').click(function () {
        if (canvas.graphics.length > 0) {
            canvas.history.push(canvas.graphics.pop());
            redrawGraphics();
            socket.emit('draw undo');
        }
    });

    $('#redo').click(function () {
        if (canvas.history.length > 0) {
            var graph = canvas.history.pop();
            canvas.graphics.push(graph);
            drawPath(ctxGraphics, graph);
            socket.emit('draw redo');
        }
    });

    $('#clear').click(function () {
        canvas.graphics.push({type: 'clear'});
        canvas.history = [];
        redrawGraphics();
        socket.emit('draw clear');
    });

    /* Drawing */

    function getPoint(e) {
        var x, y;
        if (e.touches) {
            x = e.touches[0].clientX;
            y = e.touches[0].clientY;
        }
        else {
            x = e.clientX;
            y = e.clientY;
        }
        x -= offsetX; x /= width;
        y -= offsetY; y /= height;
        return {x: x, y: y};
    }

    function startDrawing(e) {
        e.preventDefault();
        var p = getPoint(e);
        canvas.drawing = {
            type: 'path',
            color: brushStyle.color,
            width: brushStyle.thickness,
            points: [p]
        };
        socket.emit('draw path', p.x, p.y,
                brushStyle.color, brushStyle.thickness);
    }

    function drawing(e) {
        e.preventDefault();
        var drawing = canvas.drawing;
        if (!drawing || drawing.type !== 'path')
            return;
        var p = getPoint(e);
        drawing.points.push(p);
        socket.emit('draw path add', p.x, p.y);
        redrawDrawing();
    }

    function endDrawing(e) {
        e.preventDefault();
        var drawing = canvas.drawing;
        if (!drawing || drawing.type !== 'path')
            return;
        if (!e.touches)
            drawing.points.push(getPoint(e));

        var length = drawing.points.length;
        var lastPoint = drawing.points[length - 1];
        canvas.graphics.push(drawing);
        canvas.history = [];
        drawPath(ctxGraphics, drawing);
        socket.emit('draw path end', lastPoint.x, lastPoint.y);
        canvas.drawing = null;
        redrawDrawing();
    }

    $drawing.addEventListener('mousedown', startDrawing);
    $drawing.addEventListener('mousemove', drawing);
    $drawing.addEventListener('mouseup', endDrawing);
    $drawing.addEventListener('touchstart', startDrawing);
    $drawing.addEventListener('touchmove', drawing);
    $drawing.addEventListener('touchend', endDrawing);

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
    
    /* Main process */

    $$body.addClass('host');

    socket.once('ready', function (_id) {
        id = _id;
        $$toolbars.show();
        $('#mode_white').click();
    });
    socket.on('files found', function (files_) {
        var ids = Object.keys(files_);
        for (var i = 0; i < ids.length; ++i) {
            var fileId = ids[i];
            files[fileId] = files_[fileId];
        }
    });
    socket.emit('create', opts);
}
