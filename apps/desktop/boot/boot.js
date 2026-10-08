// Tela de abertura: confere se o LifeOS publicado responde e então o abre.
// A URL vem do lado nativo (lib.rs → REMOTE_URL), fonte única da verdade.
(function () {
  "use strict";
  var REMOTE = (window.__LIFEOS_REMOTE_URL__ || "").replace(/\/$/, "");
  var loading = document.getElementById("loading");
  var offline = document.getElementById("offline");
  var retryTimer = null;

  function show(state) {
    loading.hidden = state !== "loading";
    offline.hidden = state !== "offline";
  }

  function check() {
    clearTimeout(retryTimer);
    show("loading");
    var ctrl = new AbortController();
    var timeout = setTimeout(function () { ctrl.abort(); }, 10000);
    // no-cors: só queremos saber se o servidor responde (resposta opaca basta).
    fetch(REMOTE + "/favicon.svg?boot=" + Date.now(), { mode: "no-cors", cache: "no-store", signal: ctrl.signal })
      .then(function () { window.location.replace(REMOTE + "/dashboard"); })
      .catch(function () {
        show("offline");
        retryTimer = setTimeout(check, 15000);
      })
      .finally(function () { clearTimeout(timeout); });
  }

  document.getElementById("retry").addEventListener("click", check);
  window.addEventListener("online", check);

  var ipc = window.__TAURI_INTERNALS__;
  if (ipc && ipc.invoke) {
    ipc.invoke("plugin:app|version").then(function (v) { document.getElementById("version").textContent = "Versão " + v; }).catch(function () {});
  }

  if (!REMOTE) {
    show("offline");
    return;
  }
  check();
})();
