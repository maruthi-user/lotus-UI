/* ============================================================
   Application shell
   Owns the growth clock, playback controls, phase readouts,
   pointer parallax and the ambient colour of the scene.
   ============================================================ */

(function (window, document) {
  "use strict";

  var PHASES = [
    { name: "Dormant", at: 0 },
    { name: "Budding", at: 0.16 },
    { name: "Emerging", at: 0.38 },
    { name: "Unfolding", at: 0.6 },
    { name: "Full bloom", at: 0.82 }
  ];

  var DURATION = 18;

  var progress = 0;
  var playing = true;
  var scrubbing = false;
  var lastPhase = -1;
  var lastTime = 0;
  var lastUi = 0;
  var jump = null;

  var reduced = false;
  var allowMotion = true;

  var targetX = 0;
  var targetY = 0;
  var targetRX = 0;
  var targetRY = 0;
  var parallaxX = 0;
  var parallaxY = 0;
  var tiltX = 0;
  var tiltY = 0;
  var appliedX = 0;
  var appliedY = 0;
  var appliedRX = 0;
  var appliedRY = 0;

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function pad(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function formatTime(seconds) {
    var whole = Math.max(0, Math.floor(seconds));
    return Math.floor(whole / 60) + ":" + pad(whole % 60);
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function hexToRgb(hex) {
    var value = parseInt(hex.replace("#", ""), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function phaseIndexFor(value) {
    for (var i = PHASES.length - 1; i >= 0; i -= 1) {
      if (value >= PHASES[i].at) return i;
    }
    return 0;
  }

  function activateMotion() {
    if (!allowMotion) {
      allowMotion = true;
      lastTime = window.performance.now();
    }
  }

  function syncPlayButton() {
    if (!els.playBtn) return;

    els.playBtn.classList.toggle("is-playing", playing);

    var label;
    if (playing) {
      label = "Pause growth";
    } else if (progress >= 0.999) {
      label = "Replay growth";
    } else {
      label = "Play growth";
    }

    els.playBtn.setAttribute("aria-label", label);
    els.playBtn.setAttribute("title", label);
  }

  function updateUI(force) {
    var pct = progress * 100;
    var index = phaseIndexFor(progress);

    if (els.scrub) {
      if (!scrubbing) {
        els.scrub.value = String(Math.round(progress * 1000));
      }
      els.scrub.style.setProperty("--fill", pct.toFixed(2) + "%");
      els.scrub.setAttribute(
        "aria-valuetext",
        Math.round(pct) + " percent, " + PHASES[index].name
      );
    }

    if (els.timeLabel) {
      els.timeLabel.textContent =
        formatTime(progress * DURATION) + " / " + formatTime(DURATION);
    }

    if (force || index !== lastPhase) {
      lastPhase = index;

      if (els.phaseName) {
        els.phaseName.textContent = PHASES[index].name;
      }

      if (els.phaseCount) {
        els.phaseCount.textContent = pad(index + 1) + " / " + pad(PHASES.length);
      }

      if (els.phaseItems) {
        els.phaseItems.forEach(function (item, itemIndex) {
          item.classList.toggle("is-active", itemIndex === index);
          item.classList.toggle("is-done", itemIndex < index);

          if (itemIndex === index) {
            item.setAttribute("aria-current", "step");
          } else {
            item.removeAttribute("aria-current");
          }
        });
      }
    }

    if (window.LotusBloom) {
      var rgb = hexToRgb(window.LotusBloom.colorAt(progress));
      var phaseColor = window.LotusBloom.phaseColor();

      document.documentElement.style.setProperty("--phase-color", phaseColor);

      if (els.glow) {
        els.glow.style.background =
          "radial-gradient(circle, rgba(" +
          rgb[0] + ", " + rgb[1] + ", " + rgb[2] +
          ", 0.27) 0%, rgba(" +
          rgb[0] + ", " + rgb[1] + ", " + rgb[2] +
          ", 0.05) 44%, transparent 66%)";
      }
    }
  }

  /* Glide the growth clock to the start of a phase. The camera follows
     the clock, so the move reads as a cut-free push in or pull back. */
  function jumpToPhase(index) {
    var phase = PHASES[clamp(index, 0, PHASES.length - 1)];

    activateMotion();
    lastTime = window.performance.now();

    if (reduced || Math.abs(phase.at - progress) < 0.002) {
      jump = null;
      progress = phase.at;
    } else {
      jump = {
        from: progress,
        to: phase.at,
        elapsed: 0,
        duration: 0.7 + 1.1 * Math.abs(phase.at - progress)
      };
    }

    syncPlayButton();
    updateUI(true);
  }

  function togglePlay() {
    activateMotion();
    jump = null;

    if (progress >= 0.999) {
      progress = 0;
      playing = true;
    } else {
      playing = !playing;
    }

    lastTime = window.performance.now();
    syncPlayButton();
    updateUI(true);
  }

  function replay() {
    activateMotion();
    jump = null;
    progress = 0;
    playing = true;
    lastTime = window.performance.now();
    syncPlayButton();
    updateUI(true);
  }

  function onScrubInput(event) {
    activateMotion();
    jump = null;
    progress = clamp(Number(event.target.value) / 1000, 0, 1);
    playing = false;
    lastTime = window.performance.now();
    syncPlayButton();
    updateUI(true);
  }

  function onKeyDown(event) {
    var tag = event.target && event.target.tagName;
    var interactive =
      tag === "INPUT" || tag === "BUTTON" || tag === "TEXTAREA" || tag === "SELECT" || tag === "A";

    if (event.code === "Space") {
      if (interactive) return;
      event.preventDefault();
      togglePlay();
      return;
    }

    if (event.key === "r" || event.key === "R") {
      if (tag === "INPUT") return;
      event.preventDefault();
      replay();
      return;
    }

    if (/^[1-5]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      event.preventDefault();
      jumpToPhase(Number(event.key) - 1);
      return;
    }

    if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && !interactive) {
      event.preventDefault();
      activateMotion();
      jump = null;
      progress = clamp(progress + (event.key === "ArrowRight" ? 0.02 : -0.02), 0, 1);
      playing = false;
      syncPlayButton();
      updateUI(true);
    }
  }

  function onPointerMove(event) {
    if (window.LotusBloom) {
      window.LotusBloom.setPointer(event.clientX, event.clientY, true);
    }

    if (event.pointerType === "touch") return;

    document.body.classList.add("has-pointer");

    if (els.cursorGlow) {
      els.cursorGlow.style.transform =
        "translate3d(" + event.clientX + "px, " + event.clientY + "px, 0) translate(-50%, -50%)";
    }

    var nx = event.clientX / window.innerWidth - 0.5;
    var ny = event.clientY / window.innerHeight - 0.5;

    targetX = nx * 18;
    targetY = ny * 12;
    targetRY = nx * 16;
    targetRX = -ny * 9;
  }

  function onPointerOut(event) {
    if (event.relatedTarget) return;

    document.body.classList.remove("has-pointer");
    targetX = 0;
    targetY = 0;
    targetRX = 0;
    targetRY = 0;

    if (window.LotusBloom) {
      window.LotusBloom.setPointer(0, 0, false);
    }
  }

  function onPointerRelease(event) {
    scrubbing = false;

    if (event.pointerType === "touch" && window.LotusBloom) {
      window.LotusBloom.setPointer(0, 0, false);
    }
  }

  function onPhaseClick(event) {
    var item = event.target.closest ? event.target.closest("[data-phase]") : null;
    if (!item) return;

    jumpToPhase(Number(item.getAttribute("data-phase")));
  }

  function bindEvents() {
    if (els.playBtn) {
      els.playBtn.addEventListener("click", togglePlay);
    }

    if (els.replayBtn) {
      els.replayBtn.addEventListener("click", replay);
    }

    if (els.scrub) {
      els.scrub.addEventListener("input", onScrubInput);
      els.scrub.addEventListener("pointerdown", function () {
        scrubbing = true;
        activateMotion();
      });
    }

    if (els.phaseList) {
      els.phaseList.addEventListener("click", onPhaseClick);
    }

    window.addEventListener("pointerup", onPointerRelease);
    window.addEventListener("pointercancel", onPointerRelease);

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("mouseout", onPointerOut);

    document.addEventListener("visibilitychange", function () {
      lastTime = window.performance.now();
      lastUi = 0;
    });
  }

  function loop(now) {
    var dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.05);
    lastTime = now;

    var clock = allowMotion ? now / 1000 : 0;

    if (jump) {
      jump.elapsed += dt;

      var k = clamp(jump.elapsed / jump.duration, 0, 1);
      progress = jump.from + (jump.to - jump.from) * easeInOutCubic(k);

      if (k >= 1) {
        progress = jump.to;
        jump = null;
      }
    } else if (playing) {
      progress = clamp(progress + dt / DURATION, 0, 1);

      if (progress >= 1) {
        progress = 1;
        playing = false;
        syncPlayButton();
      }
    }

    if (window.LotusBloom) {
      window.LotusBloom.render(progress, clock, dt);
    }

    if (window.Motes) {
      window.Motes.setBloom(progress);
    }

    if (!reduced) {
      parallaxX += (targetX - parallaxX) * 0.06;
      parallaxY += (targetY - parallaxY) * 0.06;
      tiltX += (targetRX - tiltX) * 0.05;
      tiltY += (targetRY - tiltY) * 0.05;

      if (
        Math.abs(parallaxX - appliedX) > 0.01 ||
        Math.abs(parallaxY - appliedY) > 0.01 ||
        Math.abs(tiltX - appliedRX) > 0.005 ||
        Math.abs(tiltY - appliedRY) > 0.005
      ) {
        appliedX = parallaxX;
        appliedY = parallaxY;
        appliedRX = tiltX;
        appliedRY = tiltY;

        if (els.wrap) {
          els.wrap.style.setProperty("--px", parallaxX.toFixed(2) + "px");
          els.wrap.style.setProperty("--py", parallaxY.toFixed(2) + "px");
          els.wrap.style.setProperty("--rx", tiltX.toFixed(3) + "deg");
          els.wrap.style.setProperty("--ry", tiltY.toFixed(3) + "deg");
        }
      }
    }

    if (now - lastUi > 60) {
      updateUI();
      lastUi = now;
    }

    window.requestAnimationFrame(loop);
  }

  function cacheElements() {
    els = {
      wrap: $("lotusWrap"),
      glow: $("lotusGlow"),
      cursorGlow: $("cursorGlow"),
      motes: $("motes"),
      playBtn: $("playBtn"),
      replayBtn: $("replayBtn"),
      scrub: $("scrub"),
      timeLabel: $("timeLabel"),
      phaseName: $("phaseName"),
      phaseCount: $("phaseCount"),
      phaseList: $("phaseList"),
      phaseItems: Array.prototype.slice.call(
        document.querySelectorAll("#phaseList li")
      )
    };
  }

  function init() {
    cacheElements();

    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    allowMotion = !reduced;

    if (window.LotusBloom) {
      window.LotusBloom.setReduced(reduced);
      window.LotusBloom.init();
    }

    if (window.Motes) {
      window.Motes.init(els.motes);
    }

    if (reduced) {
      progress = 1;
      playing = false;
    }

    bindEvents();
    syncPlayButton();
    updateUI(true);

    if (window.LotusBloom) {
      window.LotusBloom.render(progress, allowMotion ? lastTime / 1000 : 0, 0);
    }

    lastTime = window.performance.now();
    lastUi = 0;

    window.requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
