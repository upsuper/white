/* Constants */

var HTTP_PORT = 8080;
var TIME_BASE = (new Date()).getTime();
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
    events = require('events'),
    crypto = require('crypto'),
    mkdirp = require('mkdirp'),
    rimraf = require('rimraf'),
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

    socket.on('debug', function (info) {
        console.log('debug', info);
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
            graphics: [],
            history: [],
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
    mkdirp(cacheDir, function (err) {
        fs.readdir(cacheDir, function (err, files_) {
            var existsFiles = {};
            for (var i = 0; i < files_.length; ++i) {
                var filename = files_[i],
                    fileLoc = cacheDir + '/' + filename,
                    extname = path.extname(filename),
                    fileId = timeString() + '-' + md5(filename);
                if (filename.charAt(0) === '.')
                    continue;
                if (/^\.\w+$/.test(extname))
                    fileId += extname;
                var newLoc = cacheDir + '/file-' + fileId;
                existsFiles[fileId] = files[fileId] = {
                    filename: filename,
                    finished: true,
                    length: fs.statSync(fileLoc).size,
                    location: newLoc
                };
                fs.symlink(fileLoc, newLoc);
            }
            socket.emit('files found', existsFiles);
        });
    });

    // Broadcast
    function broadcastEvents(evt, args) {
        // convert args to array
        args = args ? Array.prototype.slice.call(args) : [];
        //console.log(evt, args);
        args.unshift(evt);
        var audience = broadcast.audience;
        for (var audId in audience)
            audience[audId].emit.apply(audience[audId], args);
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
        var fileId = timeString() + '-' + md5(filename),
            extname = path.extname(filename);
        if (/^\.\w+$/.test(extname))
            fileId += extname;
        var secret = randomString();
        files[fileId] = {
            filename: filename,
            secret: secret,
            finished: false,
            location: cacheDir + '/file-' + fileId,
            startEvent: new events.EventEmitter
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
            canvas.graphics.push(drawing);
            canvas.drawing = null;
            canvas.history = [];
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
        if (canvas.graphics.length > 0) {
            canvas.history.push(canvas.graphics.pop());
            return true;
        }
        return false;
    });
    socket.onEvent('draw redo', function () {
        if (canvas.history.length > 0) {
            canvas.graphics.push(canvas.history.pop());
            return true;
        }
        return false;
    });

    // White mode
    socket.onEvent('mode white', function () {
        broadcast.mode = 'white';
        canvas.graphics = [];
        canvas.history = [];
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
                            slideFail('extract: ' + stdout.trim());
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
        slide.step = null;

        // clean canvas
        broadcast.mode = 'slide';
        canvas.graphics = [];
        canvas.history = [];
        canvas.drawing = null;
        
        return true;
    });
    socket.onEvent('slide step', function (step, pagechanged) {
        slide.step = step;
        if (pagechanged) {
            canvas.graphics = [];
            canvas.history = [];
            canvas.drawing = null;
        }
        return true;
    });

    // Disconnect
    socket.on('disconnect', function () {
        delete broadcast.host;
        console.log('broadcast ' + id + ' finished');
        broadcastEvents('host disconnected');

        var cleanCount = 0;
        function increase() {
            cleanCount += 1;
        }
        function decrease() {
            cleanCount -= 1;
            if (!cleanCount)
                fs.rmdir(cacheDir);
        }
        increase();
        // clean up cache files
        var ids = Object.keys(files);
        for (var i = 0; i < ids.length; ++i) {
            var fileId = ids[i],
                file = files[fileId];
            if (!file.finished)
                continue;
            increase();
            fs.unlink(file.location, decrease);
        }
        // clean up extracted slides
        ids = Object.keys(slides);
        for (var i = 0; i < ids.length; ++i) {
            increase();
            rimraf(cacheDir + '/slide-' + ids[i], decrease);
        }
        decrease();

        delete broadcasts[id];
    });

    // Audience change
    broadcast.addAudience = function (audId, audSocket) {
        broadcast.audience[audId] = audSocket;
        socket.emit('audience changed', Object.keys(broadcast.audience));
    };
    broadcast.removeAudience = function (audId) {
        delete broadcast.audience[audId];
        socket.emit('audience changed', Object.keys(broadcast.audience));
    };

    // Broadcast ready
    console.log('broadcast ' + id + ' ready');
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
        console.log('audience ' + audId + ' left ' + id);
    });
    
    console.log('audience ' + audId + ' joined ' + id);
    socket.emit('initialize', (function() {
        var video = broadcast.video;
        var slide = broadcast.slide;
        var data = {
            mode: broadcast.mode,
            canvas: broadcast.canvas,
            video: {
                fileid: video.fileid,
                status: video.status,
                position: video.position + 
                    (video.status === 'playing' ?
                     (now() - video.lastupdate) / 1000 : 0)
            },
            slide: {
                slideid: slide.slideid,
                step: slide.step
            }
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
    var fileId = req.params.fileid,
        fileInfo = broadcast.files[fileId];
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
    if (fileInfo.length === undefined)
        return res.send(411);
    var stream = fileInfo.stream = new StreamCache(req, partFile);
    stream.on('finish', function () {
        fs.rename(partFile, fileInfo.location, function () {
            fileInfo.finished = true;
            delete fileInfo.stream;
        });
    });

    // notify others uploading started
    fileInfo.startEvent.emit('started');
    broadcast.host.emit('upload start', fileId);
    delete fileInfo.startEvent;
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
    else if (fileInfo.length === undefined) {
        fileInfo.startEvent.on('started', function () {
            downloadFile(req, res);
        });
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
        var stream = s.stream.createNewStream(opts);
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
        audience: Object.keys(broadcast.audience).length
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

function md5(data) {
    return crypto.createHash('md5').update(data).digest('hex');
}
