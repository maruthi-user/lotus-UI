/* ============================================================
   Lotus engine
   Builds the flower from procedural petals and renders a
   continuous 0 → 1 growth timeline. Colours, geometry, stem,
   stamens and water ripples are all derived from that value.
   ============================================================ */

(function (window) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var CX = 400;
  var WATER_Y = 780;

  var KEYFRAMES = [
    { t: 0.0, c: [52, 112, 86] },
    { t: 0.16, c: [79, 144, 105] },
    { t: 0.32, c: [164, 190, 148] },
    { t: 0.46, c: [232, 168, 172] },
    { t: 0.62, c: [238, 122, 156] },
    { t: 0.78, c: [228, 92, 144] },
    { t: 0.91, c: [243, 156, 158] },
    { t: 1.0, c: [247, 209, 170] }
  ];

  var LAYERS = [
    {
      angles: [-72, -54, -36, -18, 0, 18, 36, 54, 72],
      length: 196,
      width: 42,
      openStart: 0.3,
      openEnd: 0.74,
      baseMix: 0.52,
      midTint: 0.0,
      tipTint: 0.32,
      opacity: 0.92
    },
    {
      angles: [-50, -33.3, -16.7, 0, 16.7, 33.3, 50],
      length: 168,
      width: 38,
      openStart: 0.36,
      openEnd: 0.8,
      baseMix: 0.4,
      midTint: 0.05,
      tipTint: 0.5,
      opacity: 0.96
    },
    {
      angles: [-26, -13, 0, 13, 26],
      length: 134,
      width: 33,
      openStart: 0.42,
      openEnd: 0.86,
      baseMix: 0.3,
      midTint: 0.14,
      tipTint: 0.64,
      opacity: 1
    }
  ];

  var petals = [];
  var gradStops = [];
  var bloomEl = null;
  var stemEl = null;
  var stemHighlightEl = null;
  var ripplesEl = null;
  var coreEl = null;

  var ripples = [];
  var seeded = false;
  var lastRippleAt = 0;
  var lastColorAt = -999;
  var lastColorP = -1;
  var firstRender = true;
  var currentPhaseColor = "#f2d3a0";
  var ready = false;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function mix(a, b, t) {
    return [
      Math.round(lerp(a[0], b[0], t)),
      Math.round(lerp(a[1], b[1], t)),
      Math.round(lerp(a[2], b[2], t))
    ];
  }

  function shiftColor(rgb, amount) {
    return [
      Math.round(clamp(rgb[0] + amount, 0, 255)),
      Math.round(clamp(rgb[1] + amount, 0, 255)),
      Math.round(clamp(rgb[2] + amount, 0, 255))
    ];
  }

  function shadeColor(rgb, amount) {
    var factor = 1 - amount * 0.5;

    return [
      Math.round(rgb[0] * factor),
      Math.round(rgb[1] * factor),
      Math.round(rgb[2] * factor)
    ];
  }

  function toHex(rgb) {
    return (
      "#" +
      rgb
        .map(function (channel) {
          var hex = clamp(Math.round(channel), 0, 255).toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        })
        .join("")
    );
  }

  function colorAt(p) {
    var t = clamp(p, 0, 1);
    var i = 0;

    while (i < KEYFRAMES.length - 2 && t > KEYFRAMES[i + 1].t) {
      i += 1;
    }

    var from = KEYFRAMES[i];
    var to = KEYFRAMES[i + 1];
    var span = to.t - from.t || 1;
    var local = smoothstep(0, 1, (t - from.t) / span);

    return mix(from.c, to.c, local);
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(NS, tag);

    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        node.setAttribute(key, attrs[key]);
      });
    }

    return node;
  }

  function petalPath(width, length) {
    var w = width;
    var l = length;

    return [
      "M 0 0",
      "C", -w * 0.55, -l * 0.08, -w * 1.0, -l * 0.38, -w * 0.72, -l * 0.66,
      "C", -w * 0.42, -l * 0.86, -w * 0.18, -l * 0.985, 0, -l,
      "C", w * 0.18, -l * 0.985, w * 0.42, -l * 0.86, w * 0.72, -l * 0.66,
      "C", w * 1.0, -l * 0.38, w * 0.55, -l * 0.08, 0, 0,
      "Z"
    ].join(" ");
  }

  function veinPath(width, length) {
    var w = width;
    var l = length;

    return [
      "M 0", -l * 0.04,
      "C", w * 0.1, -l * 0.38, w * 0.05, -l * 0.7, 0, -l * 0.9
    ].join(" ");
  }

  function buildCore() {
    if (!coreEl) return;

    coreEl.innerHTML = "";

    var glow = svgEl("ellipse", {
      cx: 0,
      cy: -10,
      rx: 38,
      ry: 28,
      fill: "url(#coreGlow)"
    });

    var receptacle = svgEl("ellipse", {
      cx: 0,
      cy: -7,
      rx: 11,
      ry: 8,
      fill: "url(#coreGrad)"
    });

    coreEl.appendChild(glow);
    coreEl.appendChild(receptacle);

    var count = 17;

    for (var i = 0; i < count; i += 1) {
      var t = i / (count - 1);
      var angle = lerp(-74, 74, t) + (i % 2 === 0 ? -0.9 : 0.9);
      var rad = (angle * Math.PI) / 180;
      var length = 36 + ((i * 7) % 11) * 2.2;
      var baseX = Math.sin(rad) * 3;
      var baseY = -6;
      var tipX = Math.sin(rad) * length;
      var tipY = -8 - Math.cos(rad) * length;
      var ctrlX = tipX * 0.45;
      var ctrlY = (baseY + tipY) / 2 - 6;

      var filament = svgEl("path", {
        d: "M " + baseX + " " + baseY + " Q " + ctrlX + " " + ctrlY + " " + tipX + " " + tipY,
        fill: "none",
        stroke: "#d8a24b",
        "stroke-width": 1.2,
        "stroke-linecap": "round",
        opacity: 0.88
      });

      var halo = svgEl("circle", {
        cx: tipX,
        cy: tipY,
        r: 5.6,
        fill: "rgba(255, 223, 160, 0.16)"
      });

      var anther = svgEl("circle", {
        cx: tipX,
        cy: tipY,
        r: 2.4,
        fill: "#ffe8b9"
      });

      coreEl.appendChild(filament);
      coreEl.appendChild(halo);
      coreEl.appendChild(anther);
    }
  }

  function build() {
    bloomEl = document.getElementById("bloom");
    stemEl = document.getElementById("stem");
    stemHighlightEl = document.getElementById("stemHighlight");
    ripplesEl = document.getElementById("ripples");
    coreEl = document.getElementById("core");

    if (!bloomEl || !stemEl || !ripplesEl) return;

    [0, 1, 2].forEach(function (index) {
      var gradient = document.getElementById("petalGrad" + index);
      if (!gradient) return;

      gradStops[index] = [
        gradient.querySelector(".g-base"),
        gradient.querySelector(".g-mid"),
        gradient.querySelector(".g-tip")
      ];
    });

    LAYERS.forEach(function (layer, layerIndex) {
      var parent = document.getElementById("petals" + layerIndex);
      if (!parent) return;

      layer.angles.forEach(function (angle, petalIndex) {
        var group = svgEl("g", { class: "petal" });

        var petal = svgEl("path", {
          d: petalPath(layer.width, layer.length),
          fill: "url(#petalGrad" + layerIndex + ")",
          opacity: layer.opacity,
          stroke: "rgba(255, 255, 255, 0.13)",
          "stroke-width": 1.1,
          "stroke-linejoin": "round"
        });

        var vein = svgEl("path", {
          d: veinPath(layer.width, layer.length),
          fill: "none",
          stroke: "rgba(255, 255, 255, 0.2)",
          "stroke-width": 0.9,
          "stroke-linecap": "round"
        });

        group.appendChild(petal);
        group.appendChild(vein);
        parent.appendChild(group);

        petals.push({
          group: group,
          angle: angle,
          openStart: layer.openStart + (petalIndex % 3) * 0.006,
          openEnd: layer.openEnd + (petalIndex % 3) * 0.006,
          phase: petalIndex * 0.9 + layerIndex * 1.7
        });
      });
    });

    buildCore();
    applyColors(0, 0);
    ready = true;
  }

  function applyColors(p, time) {
    var baseColor = colorAt(p);
    var shimmer =
      p > 0.94
        ? Math.sin(time * 0.55) * 2.6 * smoothstep(0.94, 1, p)
        : 0;

    LAYERS.forEach(function (layer, index) {
      var stops = gradStops[index];
      if (!stops) return;

      var base = shadeColor(baseColor, layer.baseMix);
      var mid = shiftColor(mix(baseColor, [255, 246, 236], layer.midTint), shimmer);
      var tip = shiftColor(mix(baseColor, [255, 249, 240], layer.tipTint), shimmer * 0.7);

      if (stops[0]) stops[0].setAttribute("stop-color", toHex(base));
      if (stops[1]) stops[1].setAttribute("stop-color", toHex(mid));
      if (stops[2]) stops[2].setAttribute("stop-color", toHex(tip));
    });

    currentPhaseColor = toHex(mix(baseColor, [255, 242, 218], 0.22));
  }

  function rippleColor(p) {
    return toHex(mix(colorAt(p), [220, 245, 235], 0.55));
  }

  function spawnRipple(now, offset) {
    if (!ripplesEl) return;

    var born = now - (offset || 0);
    var duration = 3.4 + Math.random() * 1.2;
    var startRadius = 26 + Math.random() * 18;
    var endRadius = 250 + Math.random() * 130;

    var node = svgEl("ellipse", {
      cx: CX,
      cy: WATER_Y + (Math.random() * 10 - 5),
      rx: startRadius,
      ry: 4,
      fill: "none",
      stroke: rippleColor(currentProgress),
      "stroke-width": 1.1,
      opacity: 0
    });

    ripplesEl.appendChild(node);

    ripples.push({
      node: node,
      born: born,
      duration: duration,
      startRadius: startRadius,
      endRadius: endRadius,
      endRy: 16 + Math.random() * 10,
      alpha: 0.16 + Math.random() * 0.18
    });
  }

  var currentProgress = 0;

  function updateRipples(now, p) {
    if (!ripplesEl) return;

    if (!seeded) {
      seeded = true;

      for (var i = 0; i < 3; i += 1) {
        spawnRipple(now, (i + 1) * 0.9);
      }

      lastRippleAt = now;
    }

    var interval = 2.5 - 0.9 * p;

    if (now - lastRippleAt > interval) {
      spawnRipple(now, 0);
      lastRippleAt = now;
    }

    for (var j = ripples.length - 1; j >= 0; j -= 1) {
      var ripple = ripples[j];
      var t = (now - ripple.born) / ripple.duration;

      if (t >= 1) {
        if (ripple.node.parentNode) ripple.node.parentNode.removeChild(ripple.node);
        ripples.splice(j, 1);
        continue;
      }

      var eased = easeOut(t);
      var rx = lerp(ripple.startRadius, ripple.endRadius, eased);
      var ry = lerp(4, ripple.endRy, eased);
      var opacity = ripple.alpha * Math.pow(1 - t, 1.6);

      ripple.node.setAttribute("rx", rx.toFixed(1));
      ripple.node.setAttribute("ry", ry.toFixed(1));
      ripple.node.setAttribute("opacity", opacity.toFixed(3));
    }
  }

  function render(p, time, delta) {
    if (!ready) return;

    var progress = clamp(p, 0, 1);
    currentProgress = progress;

    var growth = easeInOut(clamp(progress / 0.86, 0, 1));
    var scale = 0.47 + 0.53 * growth;
    var baseY = 736 - 104 * growth;
    var swayStrength = 0.35 + 0.65 * smoothstep(0.04, 0.4, progress);
    var sway =
      (Math.sin(time * 0.55) * 0.34 + Math.sin(time * 0.23 + 1.2) * 0.2) *
      swayStrength;

    bloomEl.setAttribute(
      "transform",
      "translate(" + CX + " " + baseY.toFixed(2) + ") rotate(" + sway.toFixed(3) + ") scale(" + scale.toFixed(4) + ")"
    );

    for (var i = 0; i < petals.length; i += 1) {
      var petal = petals[i];
      var openT = clamp((progress - petal.openStart) / (petal.openEnd - petal.openStart), 0, 1);
      var open = easeInOut(openT);
      var angle = petal.angle * (0.045 + 0.955 * open);
      var flutter =
        progress > 0.88
          ? Math.sin(time * 0.6 + petal.phase) * 0.22 * open
          : 0;
      var widthScale = 0.38 + 0.62 * easeOut(open);
      var lengthScale = 0.9 + 0.1 * open;

      petal.group.setAttribute(
        "transform",
        "rotate(" + (angle + flutter).toFixed(2) + ") scale(" + widthScale.toFixed(3) + " " + lengthScale.toFixed(3) + ")"
      );
    }

    var topY = baseY + 2;
    var curve = Math.sin(time * 0.4) * 2.4;
    var stemPath =
      "M " + CX + " " + WATER_Y +
      " C " + (CX - 8 + curve) + " " + (WATER_Y - 30) +
      " " + (CX + 9 + curve * 0.4) + " " + ((WATER_Y + topY) / 2).toFixed(1) +
      " " + CX + " " + topY.toFixed(2);

    stemEl.setAttribute("d", stemPath);
    stemEl.setAttribute("stroke-width", (2.8 + 4 * clamp(progress * 1.3, 0, 1)).toFixed(2));

    if (stemHighlightEl) {
      stemHighlightEl.setAttribute(
        "d",
        stemPath.replace("M " + CX, "M " + (CX + 1.6))
      );
      stemHighlightEl.setAttribute(
        "stroke-width",
        (0.9 + 0.7 * progress).toFixed(2)
      );
      stemHighlightEl.setAttribute("stroke-opacity", (0.08 + 0.16 * progress).toFixed(2));
    }

    if (coreEl) {
      var coreOpacity = smoothstep(0.5, 0.86, progress);
      var coreScale =
        0.55 + 0.45 * smoothstep(0.55, 1, progress) +
        Math.sin(time * 1.15) * 0.012 * smoothstep(0.7, 1, progress);

      coreEl.setAttribute("opacity", coreOpacity.toFixed(3));
      coreEl.setAttribute("transform", "scale(" + coreScale.toFixed(3) + ")");
    }

    if (
      firstRender ||
      Math.abs(progress - lastColorP) > 0.0015 ||
      time - lastColorAt > 0.18
    ) {
      applyColors(progress, time);
      lastColorP = progress;
      lastColorAt = time;
    }

    updateRipples(time, progress);
    firstRender = false;
  }

  function init() {
    if (!ready) build();
    return ready;
  }

  window.LotusBloom = {
    init: init,
    render: render,
    colorAt: function (p) {
      return toHex(colorAt(p));
    },
    phaseColor: function () {
      return currentPhaseColor;
    }
  };
})(window);
