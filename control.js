var slideControl = window.slideControl = (function () {
  var stepCallback = [];
  document.addEventListener('slideenter', function (step) {
    stepCallback.map(function (func) {
      func(step.slideNumber, true);
    });
  });
  return {
    go: function (step) {
      curSlide = step - 1;
      updateSlides();
    },
    next: nextSlide,
    prev: prevSlide,
    stepchange: function (cb) {
      stepCallback.push(cb);
    },
    unbind: function (cb) {
      stepCallback = stepCallback.filter(function (e) {
        return e !== cb;
      });
    },
    resize: onresize
  };
})();

function onresize() {
  var height = window.innerHeight;
  var slides = document.querySelector('section.slides');
  if (slides)
    slides.style.webkitTransform = 'scale(' + (height / 750) + ')';
}
window.addEventListener('resize', onresize);
onresize();
