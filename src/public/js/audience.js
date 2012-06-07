function initAudience(socket, id, ratio) {
    var cacheDir = CACHE_DIR + '/' + id;

    // size
    ratio = ratio.split(':');
    ratio = parseInt(ratio[0]) / parseInt(ratio[1]);

    var $$body = $('body');
    initElements();

    // initialize audience
    socket.once('initialize', function (data) {
        console.log(data);
        mode = data.mode;
        canvas = data.canvas;
        video = data.video;
        slide = data.slide;

        // resize components and redraw canvases
        window.onresize();
        
        // initialize mode
        $$body.addClass(mode);
        switch (mode) {
            case 'white':
                $$canvas.show();
                break;
            case 'video':
                initVideo();
                $$video.show();
                break;
            case 'slide':
                initSlide();
                $$canvas.show();
                $$slideWrapper.show();
                break;
            default:
                // XXX Error!!!
        }
    });

    // on window resize event
    window.onresize = function () {
        if (!canvas)
            return;
        // get current size
        width = window.innerWidth;
        height = window.innerHeight;
        if (width == 0 || height == 0)
            return;
        // set video size
        $video.width = width;
        $video.height = height;
        // compute size
        var curRatio = width / height;
        if (curRatio > ratio)
            width = height * ratio;
        else if (curRatio < ratio)
            height = width / ratio;
        // resize canvases and slide
        function setPos(e) {
            e.width = width;
            e.height = height;
            e.style.width = width + 'px';
            e.style.height = height + 'px';
            e.style.left = (window.innerWidth - width) / 2 + 'px';
            e.style.top = (window.innerHeight - height) / 2 + 'px';
        }
        setPos($drawing);
        setPos($graphics);
        setPos($slideWrapper);
        if (slideControl && slideControl.resize)
            slideControl.resize();
        
        // redraw
        redrawGraphics();
        redrawDrawing();
    };

    // other mode change
    function initVideo() {
        cleanVideo();
        $('<source>').attr('src', getFilePath(id, video.fileid))
                     .attr('type', 'video/mp4') // XXX support more type
                     .appendTo($video);
        setVideoPos(video.position);
        if (video.status === 'playing')
            $video.play();
        else
            $video.pause();
    }
    function initSlide() {
        $slide.src = cacheDir + '/slide-' + slide.slideid + '/';
        $$slide.one('load', function () {
            slideControl = $slide.contentWindow.slideControl;
            if (slideControl.resize)
                slideControl.resize();
            if (slide.step)
                slideControl.go(slide.step);
        });
    }

    /* Events */

    // Draw path
    socket.on('draw path', function (x, y, color, width) {
        canvas.drawing = {
            type: 'path',
            color: color,
            width: width,
            points: [{x: x, y: y}]
        };
    });
    socket.on('draw path add', function (x, y) {
        var drawing = canvas.drawing;
        if (drawing && drawing.type === 'path') {
            drawing.points.push({x: x, y: y});
            // redraw
            redrawDrawing();
        }
    });
    socket.on('draw path end', function (x, y) {
        var drawing = canvas.drawing;
        if (drawing && drawing.type === 'path') {
            drawing.points.push({x: x, y: y});
            canvas.graphics.push(drawing);
            drawPath(ctxGraphics, drawing);
            canvas.drawing = null;
            canvas.history = [];
            redrawDrawing();
        }
    });
    // Drawing control
    socket.on('draw clear', function () {
        canvas.graphics.push({type: 'clear'});
        redrawGraphics();
    });
    socket.on('draw undo', function () {
        if (canvas.graphics.length > 0) {
            canvas.history.push(canvas.graphics.pop());
            redrawGraphics();
        }
    });
    socket.on('draw redo', function () {
        if (canvas.history.length > 0) {
            var graph = canvas.history.pop();
            canvas.graphics.push(graph);
            if (graph.type === 'path')
                drawPath(ctxGraphics, graph);
            else if (graph.type === 'clear')
                redrawGraphics();
        }
    });

    // White mode
    socket.on('mode white', function () {
        mode = 'white';
        $$body.addClass('white').removeClass('video slide');
        // clean
        canvas.graphics = [];
        canvas.history = [];
        redrawGraphics();
        redrawDrawing();
        // display
        $$canvas.show();
        cleanVideo();
        cleanSlide();
    });

    // Video mode
    socket.on('mode video', function (fileid) {
        mode = 'video';
        $$body.addClass('video').removeClass('white slide');
        video.fileid = fileid;
        video.status = 'paused';
        video.position = 0;
        initVideo();
        // display
        $$video.show();
        cleanWhite();
        cleanSlide();
    });
    function setVideoPos(pos) {
        if ($video.readyState >= 1) {
            $video.currentTime = video.position = pos;
        }
        else {
            $$video.one('loadedmetadata', function() {
                if (video.status === 'paused')
                    $video.pause();
                else if (video.status === 'playing')
                    $video.play();
                $video.currentTime = video.position = pos;
            });
            if ($video.paused)
                $video.play();
        }
    }
    socket.on('video play', function (pos) {
        video.status = 'playing';
        setVideoPos(pos);
        $video.play();
    });
    socket.on('video pause', function (pos) {
        video.status = 'paused';
        setVideoPos(pos);
        $video.pause();
    });
    socket.on('video seek', function (pos) {
        setVideoPos(pos);
    });

    // Slide mode
    socket.on('mode slide', function (slideid) {
        slide.slideid = slideid;
        slide.step = null;
        initSlide();

        // clean canvas
        mode = 'slide';
        $$body.addClass('slide').removeClass('white video');
        canvas.graphics = [];
        canvas.history = [];
        canvas.drawing = null;
        redrawGraphics();
        redrawDrawing();
        // display
        $$canvas.show();
        $$slideWrapper.show();
        cleanVideo();
    });
    socket.on('slide step', function (step, pagechanged) {
        slide.step = step;
        if (pagechanged) {
            canvas.graphics = [];
            canvas.history = [];
            canvas.drawing = null;
            redrawGraphics();
            redrawDrawing();
        }
        slideControl.go(step);
    });

    // Host disconnected
    socket.on('host disconnected', function () {
        // reload page to exit
        window.location.reload();
    });

    // start joining
    socket.emit('join', id);
}
