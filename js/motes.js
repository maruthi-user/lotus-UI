/* ============================================================
   Ambient motes
   A lightweight canvas layer of drifting fireflies and soft
   bokeh. It responds subtly to the flower's bloom progress.
   ============================================================ */

(function (window) {
  "use strict";

  var canvas = null;
  var ctx = null;
  var width = 0;
  var height = 0;
  var dpr = 1;
  var particles = [];
  var bokeh = [];
  var bloom = 0;
  var reduced = false;
  var raf = null;
  var lastTime = 0;
  var started = false;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function makeParticle() {
    var warm = Math.random() < 0.72;

    return {
      x: Math.random(),
      y: Math.random(),
      r: rand(0.55, 1.9),
      alpha: rand(0.12, 0.46),
      vy: rand(0.004, 0.014),
      twinkle: rand(0.18, 0.75),
      phase: rand(0, Math.PI * 2),
      driftSpeed: rand(0.06, 0.17),
      driftAmp: rand(0.0025, 0.008),
      warm: warm
    };
  }

  function build() {
    var count = clamp(Math.round((width * height) / 24000), 24, 68);

    particles = [];
    for (var i = 0; i < count; i += 1) {
      particles.push(makeParticle());
    }

    bokeh = [];
    for (var j = 0; j < 5; j += 1) {
      bokeh.push({
        x: Math.random(),
        y: Math.random(),
        r: rand(0.06, 0.16),
        alpha: rand(0.018, 0.045),
        driftSpeed: rand(0.01, 0.03),
        phase: rand(0, Math.PI * 2),
        warm: Math.random() < 0.6
      });
    }
  }

  function resize() {
    if (!canvas) return;

    var rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rgba(color, alpha) {
    return (
      "rgba(" +
      color[0] +
      ", " +
      color[1] +
      ", " +
      color[2] +
      ", " +
      alpha.toFixed(3) +
      ")"
    );
  }

  function drawBokeh(t) {
    var base = Math.min(width, height);

    ctx.globalCompositeOperation = "lighter";

    for (var i = 0; i < bokeh.length; i += 1) {
      var orb = bokeh[i];
      var x = (orb.x + Math.sin(t * orb.driftSpeed + orb.phase) * 0.02) * width;
      var y = (orb.y + Math.cos(t * orb.driftSpeed * 0.7 + orb.phase) * 0.015) * height;
      var radius = orb.r * base;
      var color = orb.warm ? [255, 214, 168] : [160, 224, 200];
      var gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);

      gradient.addColorStop(0, rgba(color, orb.alpha * (0.7 + bloom * 0.5)));
      gradient.addColorStop(0.55, rgba(color, orb.alpha * 0.35));
      gradient.addColorStop(1, rgba(color, 0));

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles(t) {
    ctx.globalCompositeOperation = "lighter";

    for (var i = 0; i < particles.length; i += 1) {
      var p = particles[i];
      var x = (p.x + Math.sin(t * p.driftSpeed + p.phase) * p.driftAmp) * width;
      var y = p.y * height;
      var twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * p.twinkle * 2 + p.phase));
      var alpha = p.alpha * twinkle * (0.65 + 0.35 * bloom);
      var color = p.warm ? [255, 221, 175] : [168, 230, 208];

      ctx.fillStyle = rgba(color, alpha * 0.16);
      ctx.beginPath();
      ctx.arc(x, y, p.r * 4.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rgba(color, alpha);
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function update(dt) {
    for (var i = 0; i < particles.length; i += 1) {
      var p = particles[i];
      p.y -= p.vy * dt;

      if (p.y < -0.03) {
        p.y = 1.03;
        p.x = Math.random();
        p.r = rand(0.55, 1.9);
        p.alpha = rand(0.12, 0.46);
      }
    }
  }

  function draw(t) {
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    drawBokeh(t);
    drawParticles(t);
  }

  function frame(now) {
    if (!lastTime) lastTime = now;

    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    update(dt);
    draw(now / 1000);

    raf = window.requestAnimationFrame(frame);
  }

  function init(canvasEl) {
    canvas = canvasEl;
    if (!canvas) return;

    ctx = canvas.getContext("2d");
    if (!ctx) return;

    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    resize();
    build();

    window.addEventListener("resize", function () {
      resize();

      if (reduced) {
        draw(2.4);
      }
    });

    document.addEventListener("visibilitychange", function () {
      lastTime = 0;
    });

    if (!started && !reduced) {
      started = true;
      raf = window.requestAnimationFrame(frame);
    } else {
      draw(2.4);
    }
  }

  function setBloom(value) {
    bloom = clamp(value, 0, 1);
  }

  window.Motes = {
    init: init,
    setBloom: setBloom
  };
})(window);
