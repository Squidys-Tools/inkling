// Boot shims for the frozen demo bundle: Safari added requestIdleCallback in
// 18.4 and Promise.withResolvers in 17.4, and the entry chunk calls both while
// the module evaluates, so they must exist before it loads.
(function () {
  if (typeof window.requestIdleCallback !== "function") {
    window.requestIdleCallback = function (callback) {
      return setTimeout(function () {
        callback({
          didTimeout: false,
          timeRemaining: function () {
            return 50;
          },
        });
      }, 1);
    };
    window.cancelIdleCallback = clearTimeout;
  }
  if (typeof Promise.withResolvers !== "function") {
    Promise.withResolvers = function () {
      var resolve, reject;
      var promise = new Promise(function (res, rej) {
        resolve = res;
        reject = rej;
      });
      return { promise: promise, resolve: resolve, reject: reject };
    };
  }
})();
