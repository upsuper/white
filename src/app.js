/* Constants */

var HTTP_PORT = 8080;
var TIME_BASE = (new Date(2012, 4, 1)).getTime();
var DEFAULT_WIDTH = 1024,
    DEFAULT_HEIGHT = 768;
var PUBLIC_DIR = __dirname + '/public',
    CACHE_DIR = PUBLIC_DIR + '/cache';
var HEADER_PREFIX = 'webapp.white-';

/* Modules */

var fs = require('fs'),
    url = require('url'),
    http = require('http'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    express = require('express'),
    connect = require('connect'),
    socketio = require('socket.io'),
    child_process = require('child_process');

var StreamCache = require('./stream-cache.js');

/* Initialize */

// Initialize express app
var app = express.createServer();
app.listen(HTTP_PORT);
app.use(express.logger('dev'));
app.use(express.static(PUBLIC_DIR));
app.post('/upload/:id/:fileid', uploadFile);
app.get('/file/:id/:fileid/:filename?', downloadFile);

// Initialize socket.io
var io = socketio.listen(app, {
    'log level': 1,
    //'browser client minification': true,
    'browser client etag': true,
    'browser client gzip': true
});
io.sockets.on('connection', handleSocket);

/* Status variables */

var broadcasts = {};
var bcNumber = 0,
    audNumber = 0;

/* Socket handler */

function handleSocket(socket) {
    socket.emit('list', mapObject(broadcasts, filterBroadcastInfo));

    socket.once('create', function (opts) {
        bcNumber += 1;

        // Generate and store id
        var id = opts.id;
        id = typeof id == 'string' ? id.replace(/[^\w\.-]+/, '') : null;
        if (!id || broadcasts[id])
            id = timeString() + '-' + (bcNumber % 36).toString(36);
        socket.set('id', id, function () {
            handleHost(socket, id, opts);
        });
        
        // Remove other listeners
        socket.removeAllListeners('join');
    });
    
    socket.once('join', function (id) {
        var audId = audNumber += 1;
        socket.set('aud id', audId, function () {
            handleAudience(socket, audId, id);
        });

        // Remove other listeners
        socket.removeAllListeners('create');
    });
}

function handleHost(socket, id, opts) {
    // Initialize broadcast
    var broadcast = broadcasts[id] = {
        // Basic information
        title: opts.title,
        desc: opts.desc,
        time: new Date(),
        ratio: opts.ratio,
        // Sockets
        host: socket,
        audience: {},
        // Files
        files: {},
        // Status
        mode: 'white',
        canvas: {
            graphics: {0: []},
            history: {0: []},
            current: 0,
            drawing: null,
        },
        video: {
            fileid: null,
            status: null,
            position: null,
            lastupdate: null,
        },
        slide: {
            slideid: null,
            step: null,
            slides: {},
        }
    };

    // Status variables
    var files = broadcast.files,
        canvas = broadcast.canvas,
        video = broadcast.video,
        slide = broadcast.slide,
        slides = slide.slides;

    // Create cache directory
    var cacheDir = CACHE_DIR + '/' + id;
    mkdirp(cacheDir);

    // Broadcast
    function broadcastEvents(evt, args) {
        // Clone args
        args = Array.isArray(args) ? args.slice(0) : [];
        args.unshift(evt);
        var audience = broadcast.audience;
        for (var audId in audience)
            audience[audId].emit.applt(audience, args);
    }
    socket.onEvent = function (evt, func) {
        socket.on(evt, function () {
            // If func return true, broadcast it
            if (func.apply(this, arguments))
                broadcastEvents(evt, arguments);
        });
    };

    // Initialize socket for host
    
    // File upload
    socket.onEvent('file', function (filename) {
        filename = path.basename(filename);
        var fileId = timeString();
        var secret = randomString();
        files[fileId] = {
            filename: filename,
            secret: secret,
            finished: false,
            location: cacheDir + '/file-' + fileId
        };
        socket.emit('file ready', fileId, secret);
        return false;
    });

    // Draw path
    socket.onEvent('draw path', function (x, y, color, width) {
        canvas.drawing = {
            type: 'path',
            color: color,
            width: width,
            points: [{x: x, y: y}]
        };
        return true;
    });
    socket.onEvent('draw path add', function (x, y) {
        var drawing = canvas.drawing;
        if (drawing && drawing.type === 'path') {
            drawing.points.push({x: x, y: y});
            return true;
        }
        return false;
    });
    socket.onEvent('draw path end', function (x, y) {
        var drawing = canvas.drawing;
        if (drawing && drawing.type === 'path') {
            drawing.points.push({x: x, y: y});
            canvas.graphics[canvas.current].push(drawing);
            canvas.drawing = null;
            canvas.history[canvas.current] = [];
            return true;
        }
        return false;
    });
    // Draw text
    // TODO
    // Draw image
    // TODO
    // Drawing control
    socket.onEvent('draw clear', function () {
        canvas.graphics.push({type: 'clear'});
        return true;
    });
    socket.onEvent('draw undo', function () {
        if (canvas.graphics[canvas.current].length > 0) {
            canvas.history[canvas.current].push(
                canvas.graphics[canvas.current].pop());
            return true;
        }
        return false;
    });
    socket.onEvent('draw redo', function () {
        if (canvas.history[canvas.current].length > 0) {
            canvas.graphics[canvas.current].push(
                canvas.history[canvas.current].pop());
            return true;
        }
        return false;
    });

    // White mode
    socket.onEvent('mode white', function (canvasId) {
        broadcast.mode = 'white';
        canvas.current = canvasId;
        return true;
    });
    socket.onEvent('white switch', function (canvasId) {
        if (typeof canvas.graphics[canvasId] === 'undefined') {
            canvas.graphics[canvasId] = [];
            canvas.history[canvasId] = [];
        }
        canvas.current = canvasId;
        return true;
    });

    // Video mode
    socket.onEvent('mode video', function (fileid) {
        broadcast.mode = 'video';
        video.fileid = fileid;
        video.status = 'paused';
        video.position = 0;
        return true;
    });
    socket.onEvent('video play', function (pos) {
        video.status = 'playing';
        video.position = pos;
        video.lastupdate = now();
        return true;
    });
    socket.onEvent('video pause', function (pos) {
        video.status = 'paused';
        video.position = pos;
        return true;
    });
    socket.onEvent('video seek', function (pos) {
        video.position = pos;
        video.lastupdate = now();
        return true;
    });

    // Slide mode
    socket.onEvent('slide prepare', function (fileid) {
        var file = files[fileid];
        var slideid = fileid;
        if (slides[slideid]) {
            if (slides[slideid].ready)
                slideReady();
        }
        else if (file) {
            if (!file.finished)
                file.stream.on('finish', processSlide);
            else
                processSlide();
        }
        function slideReady() {
            slides[slideid].ready = true;
            socket.emit('slide ready', slideid);
        }
        function slideFail(err) {
            socket.emit('slide fail', slideid, err);
        }
        function processSlide() {
            slides[slideid] = {ready: false, step: null};
            var slideDir = cacheDir + '/slide-' + slideid;
            child_process.execFile(__dirname + '/extract_slide.py',
                    [file.location, slideDir],
                    function (error, stdout, stderr) {
                        if (error)
                            slideFail('extract: ' + stdout.strip());
                        else
                            slideReady();
                    });
        }
        return false;
    });
    socket.onEvent('mode slide', function (slideid) {
        if (!slides[slideid] || !slides[slideid].ready)
            return false;
        
        // set current slide
        if (slide.slideid)
            slides[slideid] = slide.step;
        slide.slideid = slideid;
        slide.step = slides[slideid];

        // clean canvas
        broadcast.mode = 'slide';
        canvas.current = 'slide';
        canvas.graphics.slide = [];
        canvas.history.slide = [];
        
        return true;
    });
    socket.onEvent('slide step', function (step, pagechanged) {
        slide.step = step;
        if (pagechanged) {
            canvas.graphics.slide = [];
            canvas.history.slide = [];
        }
        return true;
    });

    // Disconnect
    socket.on('disconnect', function () {
        delete broadcast.host;
        broadcastEvents('host disconnected');
        delete broadcasts[id];
    });

    // Audience change
    broadcast.addAudience = function (audId, audSocket) {
        broadcast.audience[audId] = audSocket;
        socket.emit('audience changed', broadcast.audience.keys());
    };
    broadcast.removeAudience = function (audId) {
        delete broadcast.audience[audId];
        socket.emit('audience changed', broadcast.audience.keys());
    };

    // Broadcast ready
    socket.emit('ready', id);
}

function handleAudience(socket, audId, id) {
    var broadcast = broadcasts[id];
    if (!broadcast) {
        socket.emit('broadcast notfound');
        return;
    }

    broadcast.addAudience(audId, socket);
    socket.on('disconnect', function () {
        if (broadcast.host)
            broadcast.removeAudience(audId);
    });
    
    socket.emit('initialize', (function() {
        var video = broadcast.video;
        var data = {
            mode: broadcast.mode,
            canvas: broadcast.canvas,
            video: {
                fileid: video.fileid,
                status: video.status,
                position: video.position + 
                    (video.status === 'playing' ? now() - video.lastupdate : 0)
            },
            slide: broadcast.slide
        };
        return data;
    })());
}

/* HTTP handlers */

function uploadFile(req, res) {
    // Vaild parameters
    var broadcast = broadcasts[req.params.id];
    if (!broadcast)
        return res.send(404);
    var fileInfo = broadcast.files[req.params.fileid];
    if (!fileInfo)
        return res.send(404);
    var secret = req.headers[HEADER_PREFIX + 'secret'];
    if (secret !== fileInfo.secret)
        return res.send(403);
    if (fileInfo.finished || fileInfo.stream)
        return res.send(409);

    // Create stream cache
    var partFile = fileInfo.location + '.part';
    fileInfo.length = req.headers['content-length'];
    var stream = fileInfo.stream = new StreamCache(req, partFile);
    stream.on('finish', function () {
        fs.rename(partFile, fileInfo.location, function () {
            fileInfo.finished = true;
            delete fileInfo.stream;
        });
    });
}

function downloadFile(req, res) {
    // Vaild parameters
    var broadcast = broadcasts[req.params.id];
    if (!broadcast)
        return res.send(404);
    var fileInfo = broadcast.files[req.params.fileid];
    if (!fileInfo)
        return res.send(404);
    
    // Start downloading
    if (fileInfo.finished) {
        res.download(fileInfo.location, fileInfo.filename);
    }
    else {
        var length = fileInfo.length;
        var ranges = req.headers.range;
        var opts = {};
        var offset;
        
        // Check ranges
        res.setHeader('Accept-Ranges', 'bytes');
        if (ranges)
            ranges = connect.utils.parseRange(length, ranges);
        if (!ranges) {
            res.statusCode = 200;
        }
        else {
            opts.start = ranges[0].start;
            opts.end = ranges[0].end;
            if (opts.start > length - 1) {
                res.setHeader('Content-Range', 'bytes */' + length);
                return res.send(416);
            }
            if (opts.end > length - 1)
                opts.end = length - 1;
            length = opts.end - opts.start + 1;
            res.statusCode = 206;
            res.setHeader('Content-Range',
                    'bytes ' + opts.start + '-' + opts.end +
                    '/' + s.length);
        }
        
        // Check method
        if (req.method === 'HEAD')
            return res.end();
        
        // Send file
        res.setHeader('Content-Length', length);
        var stream = s.cache.createNewStream(opts);
        req.on('close', function () { stream.destroy(); });
        stream.pipe(res);
    }
}

/* Misc functions */

function filterBroadcastInfo(broadcast) {
    return {
        title: broadcast.title,
        desc: broadcast.desc,
        ratio: broadcast.ratio,
        time: broadcast.time,
        audience: broadcast.audience.keys().length
    };
}

function now() {
    return (new Date()).getTime();
}

function timeString() {
    return (now() - TIME_BASE).toString(36);
}

function randomString() {
    return Math.random().toString(36).substring(2);
}

function mapObject(obj, func) {
    var ret = {};
    for (var k in obj)
        if (obj.hasOwnProperty(k))
            ret[k] = func(obj[k]);
    return ret;
}