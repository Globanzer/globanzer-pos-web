/* Globanzer POS — ficha de instalación en línea
   Validación en el navegador, cajeros repetibles, Turnstile y envío a /api/ficha.
   No se guarda nada en localStorage ni en sessionStorage. */
(function () {
  "use strict";

  var form = document.getElementById("ficha");
  if (!form) return;

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var MAX_CASHIERS = 6;
  var ENDPOINT = "/api/ficha";
  var submitBtn = $("#submit-btn");
  var btnLabel = $(".btn-label", submitBtn);
  var summary = $("#form-errors");
  var sendError = $("#send-error");
  var sendErrorMsg = $("#send-error-msg");
  var defaultSendError = sendErrorMsg.textContent;
  var success = $("#form-success");

  /* ---------- Fecha de hoy por defecto ---------- */
  (function () {
    var f = $("#fecha");
    if (f && !f.value) {
      var d = new Date();
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      f.value = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }
  })();

  /* ---------- Bloques condicionales ---------- */
  var conds = $$("[data-show-when]");
  function checkedValue(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }
  function updateConds() {
    conds.forEach(function (box) {
      var rule = box.getAttribute("data-show-when");
      var i = rule.indexOf("=");
      var show = checkedValue(rule.slice(0, i)) === rule.slice(i + 1);
      box.hidden = !show;
    });
  }
  form.addEventListener("change", updateConds);
  updateConds();

  /* ---------- Cajeros (hasta 6) ---------- */
  var list = $("#cashiers");
  var tpl = $("#cashier-tpl");
  var addBtn = $("#add-cashier");
  var uid = 0;

  function renumber() {
    var rows = $$(".cashier", list);
    rows.forEach(function (row, i) { $("[data-n]", row).textContent = String(i + 1); });
    addBtn.hidden = rows.length >= MAX_CASHIERS;
    rows.forEach(function (row) { $("[data-remove]", row).hidden = rows.length <= 1; });
  }

  function addCashier(focus) {
    if ($$(".cashier", list).length >= MAX_CASHIERS) return;
    uid += 1;
    var frag = tpl.content.cloneNode(true);
    var row = frag.querySelector(".cashier");
    $$("[data-k]", row).forEach(function (input) {
      var id = "cajero" + uid + "_" + input.getAttribute("data-k");
      input.id = id;
      var label = $('label[data-for="' + input.getAttribute("data-k") + '"]', row);
      if (label) label.setAttribute("for", id);
      var err = $('[data-err="' + input.getAttribute("data-k") + '"]', row);
      if (err) { err.id = id + "-err"; input.setAttribute("aria-describedby", err.id); }
    });
    $("[data-remove]", row).addEventListener("click", function () {
      row.remove();
      renumber();
      addBtn.focus();
    });
    list.appendChild(frag);
    renumber();
    if (focus) $("input", row).focus();
  }
  addBtn.addEventListener("click", function () { addCashier(true); });
  addCashier(false);

  /* ---------- Turnstile (solo si hay site key real) ---------- */
  var tsBox = $("#turnstile");
  var siteKey = tsBox ? (tsBox.getAttribute("data-sitekey") || "") : "";
  var tsEnabled = siteKey && siteKey.indexOf("__") !== 0;
  var tsWidget = null;
  var tsErr = $("#turnstile-err");

  if (tsEnabled) {
    window.onGlobanzerTurnstile = function () {
      if (!window.turnstile) return;
      tsWidget = window.turnstile.render(tsBox, {
        sitekey: siteKey,
        theme: "dark",
        language: "es",
        action: "ficha",
        callback: function () { tsErr.textContent = ""; },
        "error-callback": function () {
          tsErr.textContent = "No pudimos cargar la verificación de seguridad. Recarga la página o escríbenos por WhatsApp.";
        },
        "expired-callback": function () { window.turnstile.reset(tsWidget); }
      });
    };
    var sc = document.createElement("script");
    sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onGlobanzerTurnstile";
    sc.async = true;
    sc.defer = true;
    document.head.appendChild(sc);
  }

  function turnstileToken() {
    if (!tsEnabled || !window.turnstile || tsWidget === null) return "";
    return window.turnstile.getResponse(tsWidget) || "";
  }

  /* ---------- Validación ---------- */
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var RIF = /^[VEJPGC][-\s.]?\d{5,9}[-\s.]?\d?$/i;

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
  function digits(s) { return (s.match(/\d/g) || []).length; }

  var textRules = [
    { id: "razon_social", label: "Razón social", msg: "Escribe la razón social como aparece en el RIF." },
    { id: "rif", label: "RIF", msg: "Escribe el RIF del negocio.", test: function (v) { return RIF.test(v); }, bad: "Revisa el RIF. Debe verse así: J-12345678-9." },
    { id: "nombre_comercial", label: "Nombre comercial", msg: "Escribe el nombre comercial que saldrá en el ticket." },
    { id: "direccion", label: "Dirección fiscal", msg: "Escribe la dirección fiscal." },
    { id: "telefono_negocio", label: "Teléfono del negocio", msg: "Escribe el teléfono del negocio.", test: function (v) { return digits(v) >= 7 && digits(v) <= 15; }, bad: "Revisa el teléfono del negocio (ej.: 0414-1234567)." },
    { id: "correo_negocio", label: "Correo del negocio", msg: "Escribe el correo del negocio.", test: function (v) { return EMAIL.test(v); }, bad: "Revisa el correo del negocio (ej.: tienda@correo.com)." },
    { id: "dueno_nombre", label: "Nombre del dueño", msg: "Escribe el nombre completo del dueño." },
    { id: "dueno_telefono", label: "Teléfono del dueño", msg: "Escribe el teléfono del dueño.", test: function (v) { return digits(v) >= 7 && digits(v) <= 15; }, bad: "Revisa el teléfono del dueño (ej.: 0414-1234567)." },
    { id: "dueno_correo", label: "Correo del dueño", msg: "Escribe el correo del dueño.", test: function (v) { return EMAIL.test(v); }, bad: "Revisa el correo del dueño (ej.: nombre@correo.com)." }
  ];

  function setError(el, errEl, msg) {
    if (errEl) errEl.textContent = msg || "";
    if (el) {
      if (msg) el.setAttribute("aria-invalid", "true");
      else el.removeAttribute("aria-invalid");
    }
  }

  function validate() {
    var errors = []; // { id, label, msg }
    textRules.forEach(function (r) {
      var el = document.getElementById(r.id);
      var v = el.value.trim();
      var msg = "";
      if (!v) msg = r.msg;
      else if (r.test && !r.test(v)) msg = r.bad;
      setError(el, document.getElementById(r.id + "-err"), msg);
      if (msg) errors.push({ id: r.id, label: r.label, msg: msg });
    });

    // Cajeros: si escriben un correo, que sea válido
    $$(".cashier", list).forEach(function (row, i) {
      var mail = $('[data-k="correo"]', row);
      var v = mail.value.trim();
      var msg = v && !EMAIL.test(v) ? "Revisa el correo del cajero " + (i + 1) + "." : "";
      setError(mail, document.getElementById(mail.id + "-err"), msg);
      if (msg) errors.push({ id: mail.id, label: "Cajero " + (i + 1), msg: msg });
    });

    // 25 Respaldo
    var respaldo = checkedValue("respaldo");
    var rOpts = $("#respaldo-opts");
    var rMsg = respaldo ? "" : "Elige si quieres el respaldo semanal automático (punto 25).";
    setError(rOpts, $("#respaldo-err"), rMsg);
    $$(".opt", rOpts).forEach(function (o) { o.classList.toggle("is-invalid", !!rMsg); });
    if (rMsg) errors.push({ id: rOpts.querySelector("input").id || "respaldo-opts", focusEl: rOpts.querySelector("input"), label: "Punto 25", msg: rMsg });

    var acks = [];
    if (respaldo === "No") acks.push({ id: "respaldo_riesgo", label: "Punto 25", msg: "Marca que entiendes que, sin respaldo, puedes perder tus datos si el servidor falla." });
    else setError(document.getElementById("respaldo_riesgo"), $("#respaldo_riesgo-err"), "");
    acks.push({ id: "uso_asistente", label: "Punto 27", msg: "Marca «Entendido» en el punto 27." });
    acks.push({ id: "seguridad", label: "Punto 28", msg: "Marca «Entendido» en el punto 28." });
    acks.push({ id: "declaracion", label: "Declaración", msg: "Marca la declaración para poder enviar la ficha." });
    acks.forEach(function (a) {
      var el = document.getElementById(a.id);
      var msg = el.checked ? "" : a.msg;
      setError(el, document.getElementById(a.id + "-err"), msg);
      el.closest(".opt").classList.toggle("is-invalid", !!msg);
      if (msg) errors.push(a);
    });

    if (tsEnabled && !turnstileToken()) {
      var tMsg = "Completa la verificación de seguridad antes de enviar.";
      tsErr.textContent = tMsg;
      errors.push({ id: "turnstile", label: "Verificación", msg: tMsg });
    } else if (tsEnabled) {
      tsErr.textContent = "";
    }
    return errors;
  }

  function showSummary(errors) {
    if (!errors.length) { summary.hidden = true; summary.innerHTML = ""; return; }
    var html = "<h2>Revisa " + (errors.length === 1 ? "este dato" : "estos " + errors.length + " datos") + "</h2><ul>";
    errors.forEach(function (e) {
      html += '<li><a href="#' + e.id + '" data-target="' + e.id + '">' + escapeHtml(e.msg) + "</a></li>";
    });
    html += "</ul>";
    summary.innerHTML = html;
    summary.hidden = false;
  }
  summary.addEventListener("click", function (ev) {
    var a = ev.target.closest("a[data-target]");
    if (!a) return;
    ev.preventDefault();
    var el = document.getElementById(a.getAttribute("data-target"));
    if (el) {
      el.scrollIntoView({ block: "center" });
      if (el.focus) el.focus({ preventScroll: true });
    }
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Limpia el error de un campo cuando la persona lo corrige
  form.addEventListener("input", function (ev) {
    var el = ev.target;
    if (el.getAttribute("aria-invalid") === "true") {
      setError(el, document.getElementById(el.id + "-err"), "");
    }
  });
  form.addEventListener("change", function (ev) {
    var el = ev.target;
    if (el.type === "checkbox" && el.checked) {
      setError(el, document.getElementById(el.id + "-err"), "");
      var o = el.closest(".opt"); if (o) o.classList.remove("is-invalid");
    }
    if (el.name === "respaldo") {
      setError($("#respaldo-opts"), $("#respaldo-err"), "");
      $$("#respaldo-opts .opt").forEach(function (o) { o.classList.remove("is-invalid"); });
    }
  });

  /* ---------- Datos a enviar ---------- */
  function collect() {
    var data = {};
    var visible = function (el) { return !el.closest("[hidden]"); };
    $$("input, textarea", form).forEach(function (el) {
      if (!el.name || !visible(el)) return;
      if (el.type === "radio") {
        if (el.checked) data[el.name] = el.value;
      } else if (el.type === "checkbox") {
        if (el.name === "tienda_adicional_tipo") {
          data[el.name] = data[el.name] || [];
          if (el.checked) data[el.name].push(el.value);
        } else {
          data[el.name] = el.checked;
        }
      } else {
        var v = el.value.trim();
        if (v) data[el.name] = v;
      }
    });
    data.rif = (data.rif || "").toUpperCase();
    data.cajeros = $$(".cashier", list).map(function (row) {
      return {
        nombre: $('[data-k="nombre"]', row).value.trim(),
        correo: $('[data-k="correo"]', row).value.trim(),
        caja: $('[data-k="caja"]', row).value.trim()
      };
    }).filter(function (c) { return c.nombre || c.correo || c.caja; });
    data.turnstile_token = turnstileToken();
    return data;
  }

  /* ---------- Envío ---------- */
  var sending = false;
  function setSending(on) {
    sending = on;
    submitBtn.disabled = on;
    submitBtn.setAttribute("aria-busy", on ? "true" : "false");
    submitBtn.classList.toggle("is-sending", on);
    btnLabel.textContent = on ? "Enviando…" : "Enviar ficha";
  }

  function showSendError(msg) {
    sendErrorMsg.textContent = msg || defaultSendError;
    sendError.hidden = false;
    sendError.focus();
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (sending) return;
    sendError.hidden = true;

    var errors = validate();
    showSummary(errors);
    if (errors.length) {
      summary.focus();
      summary.scrollIntoView({ block: "start" });
      return;
    }

    setSending(true);
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 25000) : null;

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(collect()),
      signal: ctrl ? ctrl.signal : undefined,
      credentials: "same-origin"
    })
      .then(function (res) {
        return res.json().catch(function () { return { ok: false }; }).then(function (body) {
          return { status: res.status, body: body };
        });
      })
      .then(function (r) {
        if (r.status >= 200 && r.status < 300 && r.body && r.body.ok) {
          form.hidden = true;
          success.hidden = false;
          success.scrollIntoView({ block: "start" });
          success.focus();
          return;
        }
        var msg = r.body && typeof r.body.error === "string" && r.body.error.length < 300 ? r.body.error : "";
        showSendError(msg ? msg + " Si el problema sigue, escríbenos por WhatsApp." : "");
        if (tsEnabled && window.turnstile && tsWidget !== null) window.turnstile.reset(tsWidget);
      })
      .catch(function () {
        showSendError("");
        if (tsEnabled && window.turnstile && tsWidget !== null) window.turnstile.reset(tsWidget);
      })
      .then(function () {
        if (timer) clearTimeout(timer);
        setSending(false);
      });
  });
})();
