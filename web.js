// Strativis web app: the parts that only the website version needs.
// Added to index.html by build_site.R; the Android and iOS apps do not load it.
(function () {
  var apple = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var installed = navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

  // Offline use ####
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* the app still works online */ });
    });
  }

  // Keep the saved sections: ask the browser never to clear them ####
  if (installed && navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () { /* not supported: home screen apps keep their data anyway */ });
  }

  if (!apple || window.AndroidBridge) { return; }

  // Install guide on iPhone and iPad ####
  // Shown when the page is open in Safari and not yet on the home screen.
  var SHARE_ICON = '<svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true" style="vertical-align:-4px">' +
    '<path d="M9 1v13M4.5 5.5 9 1l4.5 4.5M5.5 9H2.5v11.5h13V9h-3" fill="none" stroke="#1f6fd1" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var MORE_ICON = '<span style="display:inline-block;border:1.5px solid #1f6fd1;border-radius:11px;' +
    'padding:0 6px;color:#1f6fd1;font-weight:700;line-height:16px;letter-spacing:1px">&middot;&middot;&middot;</span>';

  function showInstallGuide() {
    try { if (sessionStorage.getItem('strativis.installGuide') === 'later') { return; } } catch (e) { /* show it */ }
    var box = document.createElement('div');
    box.id = 'install-guide';
    box.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.45);display:flex;' +
      'align-items:flex-end;justify-content:center;font:16px/1.45 -apple-system,system-ui,sans-serif;color:#1d2730';
    box.innerHTML =
      '<div style="background:#fff;width:100%;max-width:520px;border-radius:16px 16px 0 0;' +
      'padding:18px 18px calc(18px + env(safe-area-inset-bottom))">' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">' +
      '<img src="apple-touch-icon.png" width="52" height="52" style="border-radius:12px" alt="">' +
      '<div><b style="font-size:19px">Install Strativis</b><br>' +
      '<span style="color:#5b6670;font-size:14px">Free. Works offline. Stays on your iPhone or iPad.</span></div></div>' +
      '<ol style="margin:8px 0 12px;padding-inline-start:22px">' +
      '<li style="margin-bottom:8px">Tap ' + MORE_ICON + ' next to the address bar, then tap <b>Share</b>.<br>' +
      '<span style="color:#5b6670;font-size:14px">No ' + MORE_ICON + '? Tap the Share button ' + SHARE_ICON + ' instead.</span></li>' +
      '<li style="margin-bottom:8px">Scroll down and tap <b>Add to Home Screen</b>.</li>' +
      '<li style="margin-bottom:8px">Tap <b>Add</b> (leave &ldquo;Open as Web App&rdquo; on).</li>' +
      '<li>Close Safari and open <b>Strativis</b> from your home screen.</li></ol>' +
      '<p style="margin:0 0 14px;color:#5b6670;font-size:14px">Opened this link from Mail, WhatsApp or another app? ' +
      'Open it in <b>Safari</b> first: only Safari can add it to the home screen.</p>' +
      '<button type="button" style="width:100%;padding:12px;border:0;border-radius:10px;background:#eef1f4;' +
      'color:#1d2730;font-size:16px">Just try it in Safari</button></div>';
    box.querySelector('button').addEventListener('click', function () {
      try { sessionStorage.setItem('strativis.installGuide', 'later'); } catch (e) { /* no storage */ }
      box.remove();
    });
    document.body.appendChild(box);
  }
  if (!installed) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showInstallGuide);
    } else {
      showInstallGuide();
    }
  }

  // Compass on iPhone and iPad ####
  // Safari gives the orientation relative to an arbitrary direction, plus the
  // magnetic heading of the top of the device (webkitCompassHeading). While the
  // phone is held roughly flat, the heading fixes that arbitrary direction; the
  // gyroscope then keeps it while the phone lies on a steep surface. The app
  // receives the result as 'deviceorientationabsolute' events, as from Chrome
  // on Android, and applies the magnetic declination itself.
  var FLAT = 35;
  var rad = Math.PI / 180;
  function compassFeeder(handler) {
    var samples = [];
    var offset = null;
    return function (e) {
      if (e.alpha === null || e.beta === null || e.gamma === null) { return; }
      var h = e.webkitCompassHeading;
      var acc = e.webkitCompassAccuracy;
      if (typeof h === 'number' && h >= 0 && !(acc < 0) && Math.abs(e.beta) < FLAT && Math.abs(e.gamma) < FLAT) {
        var d = (360 - h - e.alpha) * rad;
        samples.push([Math.sin(d), Math.cos(d)]);
        if (samples.length > 30) { samples.shift(); }
        var s = 0;
        var c = 0;
        for (var i = 0; i < samples.length; i++) { s += samples[i][0]; c += samples[i][1]; }
        offset = Math.atan2(s, c) / rad;
      }
      if (offset === null) { return; }
      var a = ((e.alpha + offset) % 360 + 360) % 360;
      handler({ type: 'deviceorientationabsolute', alpha: a, beta: e.beta, gamma: e.gamma, absolute: true });
    };
  }
  var feeders = [];
  var addListener = window.addEventListener;
  var removeListener = window.removeEventListener;
  window.addEventListener = function (type, fn, options) {
    if (type === 'deviceorientationabsolute' && typeof fn === 'function' && !('ondeviceorientationabsolute' in window)) {
      var f = compassFeeder(fn);
      feeders.push([fn, f]);
      return addListener.call(window, 'deviceorientation', f, options);
    }
    return addListener.call(window, type, fn, options);
  };
  window.removeEventListener = function (type, fn, options) {
    if (type === 'deviceorientationabsolute') {
      for (var i = 0; i < feeders.length; i++) {
        if (feeders[i][0] === fn) {
          removeListener.call(window, 'deviceorientation', feeders[i][1], options);
          feeders.splice(i, 1);
          return undefined;
        }
      }
    }
    return removeListener.call(window, type, fn, options);
  };
  window.__strativisCompassFeeder = compassFeeder;

  // Saving files on iPhone and iPad ####
  // A web app on the home screen cannot download files, so the file goes to
  // the share sheet ("Save to Files", AirDrop, Mail).
  if (typeof navigator.canShare !== 'function' || typeof File !== 'function') { return; }

  function done(msg) { if (window.onAndroidSaved) { window.onAndroidSaved(msg); } }

  function share(file) {
    return navigator.share({ files: [file] })
      .then(function () { done('Saved ' + file.name); })
      .catch(function (e) {
        if (e && e.name === 'AbortError') { done('Not saved'); return; }
        ask(file);
      });
  }

  // The share sheet opens only straight after a tap: when the file took a
  // while to make (a long PDF), ask for one more tap.
  function ask(file) {
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.45);display:flex;' +
      'align-items:center;justify-content:center;padding:24px';
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:14px;padding:18px;max-width:340px;width:100%;text-align:center';
    var name = document.createElement('p');
    name.textContent = file.name;
    name.style.cssText = 'margin:0 0 14px;word-break:break-all';
    var save = document.createElement('button');
    save.textContent = 'Save';
    save.className = 'accent';
    var cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.style.marginInlineStart = '10px';
    save.addEventListener('click', function () {
      box.remove();
      navigator.share({ files: [file] })
        .then(function () { done('Saved ' + file.name); })
        .catch(function () { done('Not saved'); });
    });
    cancel.addEventListener('click', function () { box.remove(); done('Not saved'); });
    card.appendChild(name);
    card.appendChild(save);
    card.appendChild(cancel);
    box.appendChild(card);
    document.body.appendChild(box);
  }

  function download(name, mime, bytes) {
    var url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // The page saves through window.AndroidBridge.saveFile when it exists.
  window.AndroidBridge = {
    saveFile: function (name, mime, base64) {
      var bin = atob(base64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
      var file = new File([bytes], name, { type: mime || 'application/octet-stream' });
      if (navigator.canShare({ files: [file] })) { share(file); } else { download(name, mime, bytes); }
    }
  };
})();
