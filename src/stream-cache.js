var util = require('util'),
    fs = require('fs');
var assert = require('assert');
var Stream = require('stream').Stream,
    EventEmitter = require('events').EventEmitter;

var MAX_MEMCACHE = 4 * 1024 * 1024;

function ReadStream(parentStream, opts) {
    var self = this;
    if (!(self instanceof ReadStream))
        return new ReadStream(parentStream);
    Stream.call(self);

    self.parentStream = parentStream;
    self.readable = true;
    self.number = self.parentStream.readerNum += 1;
    self.paused = false;
    if (!opts.start)
        opts.start = 0;
    self.filepos = opts.start;
    if (!opts.end && opts.end !== 0)
        opts.end = -1;
    self.end = opts.end;

    // Check whether old data available
    process.nextTick(function () { self.checkOldData(); });

    self.on('data', function (data) { self.filepos += data.length; });
    self.on('end', function () { self.readable = false; });
    self.on('error', function (e) { self.readable = false; });
}
util.inherits(ReadStream, Stream);

function mergeBuffer(buffers) {
    var length = 0;
    for (var i = 0; i < buffers.length; ++i)
        length += buffers[i].length;
    var buffer = new Buffer(length);
    var pos = 0;
    for (var i = 0; i < buffers.length; ++i) {
        buffers[i].copy(buffer, pos);
        pos += buffers[i].length;
    }
    return buffer;
}

ReadStream.prototype.sendData = function (data) {
    if (this.end !== -1) {
        var diff = this.filepos + data.length - 1 - this.end;
        if (diff > 0)
            data = data.slice(0, diff);
    }
    this.emit('data', data);
    if (this.end !== -1 && this.filepos > this.end) {
        this.destroy();
        this.emit('end');
    }
};

ReadStream.prototype.checkOldData = function () {
    var self = this;
    if (self.paused || !self.readable) return;
    var par = self.parentStream;
    var lastpos = self.filepos;
    var filepos = self.parentStream.filepos;
    if (filepos > lastpos) {
        // old data in cache file available
        var fileStream = fs.createReadStream(par.cacheFile,
                {start: lastpos, end: filepos - 1});
        self.fileStream = fileStream;
        fileStream.on('data', function (data) { self.sendData(data); });
        fileStream.on('error', function (e) { self.emit('error', e); });
        fileStream.on('end', function () {
            self.fileStream = null;
            self.checkOldData();
        });
    }
    else {
        // old data in memory available
        if (par.membuf.length) {
            var buffer;
            if (par.membuf.length > 1) {
                buffer = mergeBuffer(par.membuf);
                par.membuf = [buffer];
            }
            else {
                buffer = par.membuf[0];
            }
            var diff = par.mempos - self.filepos;
            if (diff > 0)
                self.sendData(buffer.slice(buffer.length - diff));
        }
        if (!self.paused && self.readable) {
            // all old data have flushed
            if (par.error)
                self.emit('error', par.error);
            else if (par.readEnded)
                self.emit('end');
            else {
                par.followers[self.number] = self;
            }
        }
    }
};

ReadStream.prototype.pause = function () {
    var par = this.parentStream;
    this.paused = true;
    if (par.followers[this.number])
        delete par.followers[this.number];
    else if (this.fileStream)
        this.fileStream.pause();
};

ReadStream.prototype.resume = function () {
    var par = this.parentStream;
    this.paused = false;
    if (this.fileStream)
        this.fileStream.resume();
    else
        this.checkOldData();
};

ReadStream.prototype.destroy = function () {
    var par = this.parentStream;
    this.readable = false;
    if (this.fileStream) {
        this.fileStream.destroy();
        this.fileStream = null;
    }
    else if (par.followers[this.number] && !par.readEnded) {
        delete par.followers[this.number];
    }
};

ReadStream.prototype.destroySoon = function () {
    this.destroy();
};

function StreamCache(readable, cacheFile) {
    var self = this;
    if (!(self instanceof StreamCache))
        throw new Error();
    EventEmitter.call(self);

    self.sourceStream = readable;
    self.readerNum = 0;
    self.followers = {};
    self.filepos = 0;
    self.membuf = [];
    self.mempos = 0;
    self.readEnded = false;
    self.error = null;
    self.cacheFile = cacheFile;

    var cacheStream = fs.createWriteStream(self.cacheFile);

    cacheStream.on('drain', function () {
        var diff = self.mempos - self.filepos;
        self.filepos = self.mempos;
        self.membuf = [];
        if (diff > MAX_MEMCACHE)
            self.sourceStream.resume();
    });

    cacheStream.on('close', function () {
        self.emit('finish');
    });

    readable.on('data', function (data) {
        var posBefore = self.mempos;
        var keys = Object.keys(self.followers);
        for (var i = 0; i < keys.length; ++i) {
            var diff;
            var follower = self.followers[keys[i]];
            if (follower.filepos === posBefore)
                follower.sendData(data);
            else if ((diff = self.mempos - follower.filepos) >= 0)
                follower.sendData(data.slice(data.length - diff));
        }
        if (!cacheStream.write(data)) {
            self.membuf.push(data);
            self.mempos += data.length;
            if (self.mempos - self.filepos > MAX_MEMCACHE)
                self.sourceStream.pause();
        }
        else {
            self.mempos += data.length;
            self.filepos = self.mempos
        }
    });

    readable.on('error', function (e) {
        self.error = e;
        for (var i in self.followers)
            self.followers[i].emit('error', e);
        self.emit('error', e);
    });

    readable.on('end', function () {
        cacheStream.end();
        self.readEnded = true;
        self.followers = {};
    });
}
util.inherits(StreamCache, EventEmitter);

StreamCache.prototype.createNewStream = function (opts) {
    return new ReadStream(this, opts);
};

module.exports = StreamCache;
