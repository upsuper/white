此幻灯片使用了[一个 Google 的 HTML5 幻灯片模板](http://code.google.com/p/html5slides/)，对其进行了少量修改，并且添加了 control.js 文件以提供接口给 white 调用。

对幻灯片模板本体进行的修改：

	--- html5slides-read-only/slides.js	2013-08-05 16:00:41.000000000 +0800
	+++ slides.js	2012-06-06 22:40:10.000000000 +0800
	@@ -10,7 +10,7 @@
	   URL: http://code.google.com/p/html5slides/
	 */
	 
	-var PERMANENT_URL_PREFIX = 'http://html5slides.googlecode.com/svn/trunk/';
	+var PERMANENT_URL_PREFIX = '';
	 
	 var SLIDE_CLASSES = ['far-past', 'past', 'current', 'next', 'far-next'];
	 
	@@ -300,6 +300,7 @@
	 };
	 
	 function handleTouchMove(event) {
	+  event.preventDefault();
	   if (event.touches.length > 1) {
	     cancelTouch();
	   } else {
	@@ -477,7 +478,7 @@
	 };
	 
	 function updateHash() {
	-  location.replace('#' + (curSlide + 1));
	+  //location.replace('#' + (curSlide + 1));
	 };
	 
	 /* Event listeners */
