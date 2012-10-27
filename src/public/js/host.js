function initHost(socket, opts) {
    var id, cacheDir;
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
            '#ff0000', '#22b14c', '#80ffff',
            '#ff7f27', '#0000ff', '#919091',
            '#ffff00', '#a349a4', '#000000'
        ],
        HIGHLIGHTER_COLORS = [
            'rgba(254, 254, 129, .4)', 'rgba(92, 250, 152, .2)', 
            'rgba(59, 232, 244, .2)', 'rgba(254, 170, 249, .2)'
        ],
        THICKNESSES = [
            0.007, 0.009, 0.012, 0.015, 0.02
        ],
        SUPPORT_VIDEO = ['.mp4'],
        SUPPORT_SLIDE_ARCHIVE = ['.zip'];

    // elements;
    var $$body = $('body');
    var $$buttons = $('toolbar>button'),
        $$toolbars = $('toolbar'),
        $$enable = $('#enable_drawing'),
        $$undo = $('#undo'),
        $$redo = $('#redo'),
        $$clear = $('#clear'),
        $$colorShow = $('#color_show'),
        $$filelist = $('#filelist'),
        $$nofiles = $('#nofiles'),
        $$file = $('#file'),
        $$palette = $('palette'),
        $$chooser = $('chooser'),
        $$document = $(document);
    var $palette = $$palette[0],
        $chooser = $$chooser[0],
        $undo = $$undo[0],
        $redo = $$redo[0],
        $clear = $$clear[0],
        $colorShow = $$colorShow[0],
        $file = $$file[0];
    initElements();

    // size
    var canvasSpacing = 10,
        maxButtonSize = 80,
        buttonSpacing = 0.6,
        refWidth = 1000;
    var origWidth, origHeight;
    // ratio
    ratio = ratio.split(':');
    ratio = parseInt(ratio[0]) / parseInt(ratio[1]);
    // toolbar size
    var buttonCount = $$buttons.length,
        toolbarCount = $$toolbars.length,
        buttonSizeBase = 1 / (buttonCount +
                (toolbarCount - 1) * buttonSpacing),
        buttonSize;

    function setTransform($$elem, transform) {
        $$elem.css('-webkit-transform', transform);
        $$elem.css('-moz-transform', transform);
        $$elem.css('-o-transform', transform);
        $$elem.css('transform', transform);
    }

    // on window resize event
    var offsetX, offsetY;
    window.onresize = function () {
        var top, bottom, left, right;
        top = bottom = left = right = canvasSpacing;
        // get current size
        origWidth = window.innerWidth;
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
            e.style.width = width + 'px';
            e.style.height = height + 'px';
            e.style.left = offsetX + 'px';
            e.style.top = offsetY + 'px';
        }
        setPos($drawing);
        setPos($graphics);
        setPos($video);
        setPos($slideWrapper);
        if (slideControl && slideControl.resize)
            slideControl.resize();
    
        // set palette & chooser
        var widthScale = 'scale(' + (width / refWidth) + ')';
        setTransform($$palette, widthScale);
        relocPalette();
        setTransform($$chooser, widthScale);
        relocChooser();

        // redraw
        redrawGraphics();
        redrawDrawing();
    };
    window.onresize();

    var tool, color, thickness;
    var brushStyle = {};

    /* Tools */
    
    function initDrawing() {
        canvas.graphics = [];
        canvas.history = [];
        redrawGraphics();
    }

    function enableDrawing() {
        $('#drawing_tools>button, #brush_styler>button').each(function () {
            this.disabled = false;
        });
        $undo.disabled = canvas.graphics.length == 0;
        $redo.disabled = canvas.history.length == 0;
        $clear.disabled = $undo.disabled ||
            canvas.graphics[canvas.graphics.length - 1].type == 'clear';
        $$canvas.css('pointer-events', 'auto');
    }

    function disableDrawing() {
        $('#drawing_tools>button, #brush_styler>button').each(function () {
            this.disabled = true;
        });
        $$enable.attr('disabled', false);
        $$canvas.css('pointer-events', 'none');
    }

    $('#enable_drawing').click(function () {
        var $$t = $(this);
        if ($$t.hasClass('current')) {
            disableDrawing();
            $$t.removeClass('current');
        }
        else {
            enableDrawing();
            $$t.addClass('current');
        }
    });

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
        $$palette.empty().attr('class', '')
                 .addClass('pencil-color');
        for (var i = 0; i < PENCIL_COLORS.length; ++i) {
            var $color = $('<color>')[0];
            $color.dataset.color = PENCIL_COLORS[i];
            $color.style.backgroundColor = PENCIL_COLORS[i];
            $$palette.append($color);
        }
        $('#thickness').show();
        // set brush style
        $('color').eq(0).click();
        $('thickness').eq(0).click();
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
        $('thickness').eq(-1).click();
    });

    $('#highlighter').click(function () {
        if (tool == 'highlighter')
            return;
        // set current
        setCurrentTool(this);
        tool = 'highlighter';
        // init palette & show chooser
        $('#color').show();
        $$palette.empty().attr('class', '')
                 .addClass('highlighter-color');
        for (var i = 0; i < HIGHLIGHTER_COLORS.length; ++i) {
            var $color = $('<color>')[0];
            $color.dataset.color = HIGHLIGHTER_COLORS[i];
            $color.style.backgroundColor = HIGHLIGHTER_COLORS[i];
            $$palette.append($color);
        }
        $('#thickness').show();
        // set brush style
        $('color').eq(0).click();
        $('thickness').eq(-1).click();
    });

    $('#undo').click(function () {
        var graphics = canvas.graphics;
        if (graphics.length > 0) {
            var graph = graphics.pop();
            canvas.history.push(graph);
            $redo.disabled = false;
            if (graphics.length == 0) {
                $undo.disabled = true;
                $clear.disabled = true;
            }
            else if (graphics[graphics.length - 1].type === 'clear') {
                $clear.disabled = true;
            }
            else if (graph.type === 'clear') {
                $clear.disabled = false;
            }
            redrawGraphics();
            socket.emit('draw undo');
        }
    });

    $('#redo').click(function () {
        var history = canvas.history;
        if (history.length > 0) {
            var graph = history.pop();
            canvas.graphics.push(graph);
            $undo.disabled = false;
            if (history.length == 0)
                $redo.disabled = true;
            $clear.disabled = graph.type === 'clear';
            if (graph.type === 'path')
                drawPath(ctxGraphics, graph);
            else if (graph.type === 'clear')
                redrawGraphics();
            socket.emit('draw redo');
        }
    });

    $('#clear').click(function () {
        canvas.graphics.push({type: 'clear'});
        canvas.history = [];
        $undo.disabled = false;
        $redo.disabled = true;
        $clear.disabled = true;
        redrawGraphics();
        socket.emit('draw clear');
    });

    /* Palette */

    function relocPalette() {
        var scale = width / refWidth;
        if ($$body.hasClass('horizontal')) {
            $palette.style.left = buttonSize + 'px';
            $palette.style.top = $('#color').offset().top +
                buttonSize / 2 - $$palette.height() * scale / 2 + 'px';
        }
        else {
            $palette.style.top = origHeight - buttonSize -
                $$palette.height() * scale + 'px';
            $palette.style.left = $('#color').offset().left +
                buttonSize / 2 - $$palette.width() * scale / 2 + 'px';
        }
    }
    $('#color').click(function (e) {
        e.stopPropagation();
        if ($$palette.is(':visible')) {
            $$palette.hide();
        }
        else {
            relocPalette();
            $$document.click();
            $$palette.show();
        }
    });
    $$palette.click(function (e) {
        if (e.target.tagName !== 'COLOR')
            return;
        brushStyle.color = color = e.target.dataset.color;
        $colorShow.style.backgroundColor = color;
        $('color').removeClass('current');
        $(e.target).addClass('current');
    });

    /* Thickness */
    
    function relocChooser() {
        var scale = width / refWidth;
        if ($$body.hasClass('horizontal')) {
            $chooser.style.left = buttonSize + 'px';
            $chooser.style.top = $('#thickness').offset().top + buttonSize -
                $$chooser.height() * scale + 'px';
        }
        else {
            $chooser.style.top = origHeight - buttonSize -
                $$chooser.height() * scale + 'px';
            $chooser.style.left = $('#thickness').offset().left +
                buttonSize / 2 - $$chooser.width() * scale / 2 + 'px';
        }
    }
    for (var i = 0; i < THICKNESSES.length; ++i) {
        var $$thickness = $('<thickness>');
        $$thickness[0].dataset.thick = THICKNESSES[i];
        var thick = THICKNESSES[i] * refWidth;
        $$thickness.append(
                $('<div>').width(thick).height(thick)
                          .css('margin-left', -thick / 2 + 'px')
                          .css('margin-top', -thick / 2 + 'px')
                );
        $$chooser.append($$thickness);
    }
    $('#thickness').click(function (e) {
        e.stopPropagation();
        if ($$chooser.is(':visible')) {
            $$chooser.hide();
        }
        else {
            relocChooser();
            $$document.click();
            $$chooser.show();
        }
    });
    $$chooser.click(function (e) {
        if (e.target.tagName !== 'THICKNESS')
            return;
        brushStyle.thickness = thickness = e.target.dataset.thick;
        $('thickness').removeClass('current');
        $(e.target).addClass('current');
    });

    $(document).click(function (e) {
        $$palette.hide();
        $$chooser.hide();
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
        if (typeof e.button === 'number' && e.button !== 0)
            return;
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
        $undo.disabled = false;
        $redo.disabled = true;
        $clear.disabled = false;
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

    /* Video */

    $video.addEventListener('play', function () {
        function startPlay() {
            video.position = $video.currentTime;
            video.lastupdate = $.now() / 1000;
            video.status = 'playing';
            socket.emit('video play', video.position);
        }
        if ($video.readyState >= 1)
            startPlay();
        else
            $$video.one('loadedmetadata', startPlay);
    });

    $video.addEventListener('pause', function () {
        video.position = this.currentTime;
        video.lastupdate = $.now() / 1000;
        video.status = 'paused';
        socket.emit('video pause', video.position);
    });

    $video.addEventListener('timeupdate', function () {
        var newpos = this.currentTime,
            newtime = $.now() / 1000;
        var posdiff = newpos - video.position,
            timediff = newtime - video.lastupdate;
        video.position = this.currentTime;
        video.lastupdate = newtime;
        if (video.status === 'paused' || Math.abs(posdiff - timediff) > 1)
            socket.emit('video seek', video.position);
    });

    /* Choose File */

    $('#btn_upload').click(function () {
        // TODO
    });

    $('#choose_file').on('hidden', function () {
        $$filelist.empty();
        $$filelist.off('click', '>li');
    });

    function showChooseFile(supportTypes, canUseDirectly, itemChosen) {
        // list files
        var ids = Object.keys(files);
        var fileCount = 0;
        for (var i = 0; i < ids.length; ++i) {
            var fileId = ids[i],
                filename = files[fileId].filename;
            for (var j = 0; j < supportTypes.length; ++j) {
                var extname = supportTypes[j],
                    fileext = filename.substr(-extname.length);
                if (fileext.toLowerCase() !== extname)
                    continue;
                // TODO files been uploading
                var $$li = $('<li>').attr('id', 'file-' + fileId)
                    .append($('<filename>').text(filename))
                    .append($('<filesize>').text(
                            humanReadablizeSize(files[fileId].length)))
                    .appendTo($$filelist);
                $$li[0].dataset.fileid = fileId;
                ++fileCount;
                break;
            }
        }
        // set file uploader
        $file.dataset.filetypes = supportTypes.join(';');
        $file.dataset.canUseDirectly = canUseDirectly;
        // show choose file
        if (!fileCount) {
            $$nofiles.show();
        }
        else {
            $$nofiles.hide();
            $$filelist.unbind('click');
            $$filelist.one('click', 'li', function () {
                $('#choose_file').modal('hide');
                itemChosen(this.dataset.fileid);
            });
        }
        $('#choose_file').modal();
    }

    /* Waiting */

    function showWaiting() {
        $('#waiting').modal({
            keyboard: false,
            backdrop: 'static'
        });
    }
    function hideWaiting() {
        $('#waiting').modal('hide');
    }

    /* Mode switchers */

    $('#mode_white').click(function () {
        if (mode === 'white')
            return;

        // set current
        $('#mode_switcher>button').removeClass('current');
        $(this).addClass('current');
        $$body.addClass('white').removeClass('video slide');

        // components
        cleanVideo();
        cleanSlide();
        $$canvas.show();
        // switch button status
        initDrawing();
        enableDrawing();
        $('#enable_drawing').hide();

        // change mode
        mode = 'white';
        socket.emit('mode white');

        // default tool
        $('#pencil').click();
    });

    $('#mode_video').click(function () {
        showChooseFile(SUPPORT_VIDEO, true, function (fileId) {
            // set current
            $('#mode_switcher>button').removeClass('current');
            $('#mode_video').addClass('current');
            $$body.addClass('video').removeClass('white slide');

            // switch button status
            $('#drawing_tools>button, #brush_styler>button').each(function () {
                this.disabled = true;
            });

            // set video
            $video.controls = true;
            $$video.empty();
            $('<source>').attr('src', getFilePath(id, fileId))
                         .attr('type', 'video/mp4') // XXX support more type
                         .appendTo($video);
            cleanWhite();
            cleanSlide();
            $$video.show();
    
            // change mode
            mode = 'video';
            video.fileid = fileId;
            video.status = 'paused';
            video.position = 0;
            // send event
            socket.emit('mode video', fileId);
        });
    });

    $('#mode_slide').click(function () {
        showChooseFile(SUPPORT_SLIDE_ARCHIVE, false, function (fileId) {
            showWaiting();
            socket.emit('slide prepare', fileId);
        });
        socket.once('slide fail', function (slideId, err) {
            socket.removeAllListeners('slide ready');
            alert(err);
        });
        socket.once('slide ready', function (slideId) {
            // set current
            $('#mode_switcher>button').removeClass('current');
            $('#mode_slide').addClass('current');
            $$body.addClass('slide').removeClass('white video');

            // components
            cleanVideo();
            $$canvas.show();
            $slide.src = cacheDir + '/slide-' + slideId + '/';
            $$slide.one('load', function () {
                slideControl = $slide.contentWindow.slideControl;
                if (slideControl.resize)
                    slideControl.resize();
                slideControl.stepchange(function (step, pagechanged) {
                    if (pagechanged) {
                        initDrawing();
                        $$enable.toggleClass('current').click();
                    }
                    socket.emit('slide step', step, pagechanged);
                });
            });
            $$slideWrapper.show();
            // switch button status
            initDrawing();
            disableDrawing();
            $$enable.attr('disabled', false)
                    .show().removeClass('current');
            slide.slideid = slideId;
            slide.step = null;

            // change mode
            mode = 'slide';
            socket.emit('mode slide', slideId);

            hideWaiting();
        });
    });
    
    /* Main process */

    $$body.addClass('host');

    socket.once('ready', function (_id) {
        id = _id;
        cacheDir = CACHE_DIR + '/' + id;
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
