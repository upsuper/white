var CACHE_DIR = '/cache';

// state variables
var mode, canvas, video, slide;

// size
var width, height;

// elements
var $$canvas, $$drawing, $$graphics, $$video, $$slide;
var $canvas, $drawing, $graphics, $video, $slide;
var ctxGraphics, ctxDrawing;
var slideControl;

function initElements() {
    $$canvas = $('#canvas'),
    $$drawing = $('#drawing'),
    $$graphics = $('#graphics'),
    $$video = $('#video'),
    $$slide = $('#slide');
    $canvas = $$canvas[0],
    $drawing = $$drawing[0],
    $graphics = $$graphics[0],
    $video = $$video[0],
    $slide = $$slide[0];
    ctxGraphics = $graphics.getContext('2d'),
    ctxDrawing = $drawing.getContext('2d');
}

// drawing functions
function redrawGraphics() {
    var ctx = ctxGraphics;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    for (var i = canvas.graphics.length - 1; i >= 0; --i) {
        var graph = canvas.graphics[i];
        if (graph.type === 'clear')
            break;
        else if (graph.type === 'path')
            drawPath(ctx, graph);
    }
    ctx.restore();
}
function redrawDrawing() {
    ctxDrawing.clearRect(0, 0, width, height);
    if (!canvas.drawing)
        return;
    drawPath(ctxDrawing, canvas.drawing);
}
function drawPath(ctx, graph) {
    var path = graph.points;
    if (path.length <= 1)
        return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = graph.width * width;
    ctx.strokeStyle = graph.color;

    ctx.beginPath();
    ctx.moveTo(path[0].x * width, path[0].y * height);
    // TODO using bezier smooth
    for (var i = 1; i < path.length; ++i)
        ctx.lineTo(path[i].x * width, path[i].y * height);
    ctx.stroke();

    ctx.restore();
}

function humanReadablizeSize(size) {
    if (size < 1024)
        return size + ' B';
    if (size < 1024 * 1024)
        return Math.round(size / 1024).toFixed(2) + ' KB';
    if (size < 1024 * 1024 * 1024)
        return Math.round(size / 1024 / 1024).toFixed(2) + ' MB';
    return Math.round(size / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function getFilePath(id, fileId) {
    return '/file/' + id + '/' + fileId;
}

function cleanWhite() { $$canvas.hide(); }
function cleanVideo() {
    $$video.hide().empty()
           .attr('src', '').removeAttr('src');
}
function cleanSlide() { $$slide.hide().attr('src', 'about:blank'); }
