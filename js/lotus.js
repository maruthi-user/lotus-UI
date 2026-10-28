/* ============================================================
   Lotus engine
   Builds a pond of procedural lotuses and renders each one from
   a continuous 0 → 1 growth timeline. Colours, geometry, stem,
   stamens and water ripples are all derived from that value.

   On top of the growth the engine adds
     · a cinematic camera that eases in and out of the hero bloom
     · petals that lean toward the cursor on springs
   ============================================================ */

(function (window) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var CX = 400;
  var WATER_Y = 780;

  /* Framing of the svg when the camera sits at zoom 1. */
  var VIEW = { size: 560, homeX: 400, homeY: 640 };

  /* Camera zoom as a function of growth: close on the bud, pulling
     back as the flower opens and the pond comes into view. */
  var ZOOM_STOPS = [
    [0, 1.5],
    [0.16, 1.42],
    [0.38, 1.25],
    [0.6, 1.1],
    [0.82, 1.02],
    [1, 1]
  ];

  /* Turntable rotation: how far (degrees) the cursor can swing a bloom,
     and how far each layer sits in front of (+) or behind (−) the
     bloom's axis, which is what sells the turn as 3D parallax. */
  var MAX_YAW = 42;
  var LAYER_DEPTH = [-1, 0, 1];
  var CORE_DEPTH = 1.8;
  var PARALLAX_SPAN = 15;

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
      opacity: 0.92,
      follow: 1,
      stiffness: 40
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
      opacity: 0.96,
      follow: 0.9,
      stiffness: 56
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
      opacity: 1,
      follow: 0.8,
      stiffness: 76
    }
  ];

  /* The pond, back to front. `from`/`to` map the shared timeline onto
     each plant's own growth so the flowers bloom out of step, `stem`
     adds extra height, `depth` scales the parallax and `hideAbove`
     is the camera zoom beyond which a plant slips out of frame. */
  var PLANTS = [
    { x: 64, y: 764, scale: 0.3, from: 0.14, to: 0.98, stem: 34, depth: 0.2, alpha: 0.5, tint: [-6, 6, 14], hideAbove: 1.18, spin: 1.15, swing: 17 },
    { x: 742, y: 766, scale: 0.34, from: -0.12, to: 0.9, stem: 40, depth: 0.28, alpha: 0.55, tint: [4, -4, 10], hideAbove: 1.18, spin: 1.1, swing: 14 },
    { x: 214, y: 776, scale: 0.52, from: 0.08, to: 1, stem: 46, depth: 0.55, alpha: 0.82, tint: [-8, 4, 8], hideAbove: 1.9, spin: 0.85, swing: 9 },
    { x: 592, y: 782, scale: 0.44, from: -0.06, to: 0.94, stem: 54, depth: 0.65, alpha: 0.86, tint: [6, 0, -6], hideAbove: 1.9, spin: 0.8, swing: 7 },
    { x: 400, y: 780, scale: 1, from: 0, to: 1, stem: 0, depth: 1, alpha: 1, tint: [0, 0, 0], hideAbove: 99, hero: true, spin: 1, swing: 4 }
  ];

  var svg = null;
  var defsEl = null;
  var pondEl = null;
  var plants = [];
  var hero = null;

  var cam = { z: 1, x: VIEW.homeX, y: VIEW.homeY };
  var view = { x: VIEW.homeX - VIEW.size / 2, y: VIEW.homeY - VIEW.size / 2, size: VIEW.size };

  var ptr = { cx: 0, cy: 0, active: false, presence: 0, tnx: 0, tny: 0, nx: 0, ny: 0, rx: 0, ry: 0 };

  var currentPhaseColor = "#f2d3a0";
  var reduced = false;
  var firstRender = true;
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

  function tintColor(rgb, tint, amount) {
    return [
      Math.round(clamp(rgb[0] + tint[0] * amount, 0, 255)),
      Math.round(clamp(rgb[1] + tint[1] * amount, 0, 255)),
      Math.round(clamp(rgb[2] + tint[2] * amount, 0, 255))
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

  function zoomAt(p) {
    var t = clamp(p, 0, 1);
    var i = 0;

    while (i < ZOOM_STOPS.length - 2 && t > ZOOM_STOPS[i + 1][0]) {
      i += 1;
    }

    var from = ZOOM_STOPS[i];
    var to = ZOOM_STOPS[i + 1];
    var local = smoothstep(0, 1, (t - from[0]) / (to[0] - from[0] || 1));

    return lerp(from[1], to[1], local);
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

  function buildCore(coreEl) {
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

  function createPlant(cfg, index) {
    var plant = {
      cfg: cfg,
      index: index,
      petals: [],
      stops: [],
      ripples: [],
      seeded: false,
      lastRippleAt: 0,
      lastColorAt: -999,
      lastColorP: -1,
      timeOffset: index * 1.7,
      offX: 0,
      tilt: 0,
      yaw: 0,
      yawVelocity: 0,
      layers: [],
      p: 0
    };

    var outer = svgEl("g", { class: "plant" });
    var flower = svgEl("g", { id: "flower" + index });
    var stem = svgEl("path", {
      fill: "none",
      stroke: "url(#stemGrad)",
      "stroke-width": 4,
      "stroke-linecap": "round"
    });
    var stemHighlight = svgEl("path", {
      fill: "none",
      stroke: "#d7f0dd",
      "stroke-opacity": 0.16,
      "stroke-width": 1.2,
      "stroke-linecap": "round"
    });
    var bloom = svgEl("g");
    var core = svgEl("g", { opacity: 0 });
    var reflection = svgEl("g", {
      mask: "url(#reflectionMask)",
      filter: "url(#reflectionBlur)",
      opacity: 0.42,
      "pointer-events": "none"
    });
    var ripples = svgEl("g");

    LAYERS.forEach(function (layer, layerIndex) {
      var gradient = svgEl("linearGradient", {
        id: "petalGrad" + index + "_" + layerIndex,
        x1: 0,
        y1: 1,
        x2: 0,
        y2: 0
      });

      plant.stops[layerIndex] = [0, 0.55, 1].map(function (offset) {
        var stop = svgEl("stop", { offset: offset, "stop-color": "#4a8f6c" });
        gradient.appendChild(stop);
        return stop;
      });

      defsEl.appendChild(gradient);

      var layerGroup = svgEl("g");

      layer.angles.forEach(function (angle, petalIndex) {
        var group = svgEl("g", { class: "petal" });

        var petal = svgEl("path", {
          d: petalPath(layer.width, layer.length),
          fill: "url(#petalGrad" + index + "_" + layerIndex + ")",
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
        layerGroup.appendChild(group);

        var stiffness = layer.stiffness + (petalIndex % 3) * 6;

        plant.petals.push({
          group: group,
          angle: angle,
          layer: layer,
          openStart: layer.openStart + (petalIndex % 3) * 0.006,
          openEnd: layer.openEnd + (petalIndex % 3) * 0.006,
          phase: petalIndex * 0.9 + layerIndex * 1.7,
          stiffness: stiffness,
          damping: 2 * 0.42 * Math.sqrt(stiffness),
          lean: 0,
          velocity: 0
        });
      });

      bloom.appendChild(layerGroup);
      plant.layers.push(layerGroup);
    });

    buildCore(core);
    bloom.appendChild(core);

    flower.appendChild(stem);
    flower.appendChild(stemHighlight);
    flower.appendChild(bloom);

    reflection.appendChild(
      svgEl("use", {
        href: "#flower" + index,
        transform: "translate(0 1029.6) scale(1 -0.32)"
      })
    );

    outer.appendChild(flower);
    outer.appendChild(reflection);
    outer.appendChild(ripples);
    pondEl.appendChild(outer);

    plant.outer = outer;
    plant.stem = stem;
    plant.stemHighlight = stemHighlight;
    plant.bloom = bloom;
    plant.core = core;
    plant.ripplesEl = ripples;

    applyColors(plant, 0, 0);
    return plant;
  }

  function plantProgress(plant, p) {
    var cfg = plant.cfg;
    return clamp((p - cfg.from) / (cfg.to - cfg.from), 0, 1);
  }

  function applyColors(plant, p, time) {
    var baseColor = tintColor(colorAt(p), plant.cfg.tint, smoothstep(0.3, 0.5, p));
    var shimmer =
      p > 0.94
        ? Math.sin(time * 0.55 + plant.timeOffset) * 2.6 * smoothstep(0.94, 1, p)
        : 0;

    LAYERS.forEach(function (layer, index) {
      var stops = plant.stops[index];

      var base = shadeColor(baseColor, layer.baseMix);
      var mid = shiftColor(mix(baseColor, [255, 246, 236], layer.midTint), shimmer);
      var tip = shiftColor(mix(baseColor, [255, 249, 240], layer.tipTint), shimmer * 0.7);

      stops[0].setAttribute("stop-color", toHex(base));
      stops[1].setAttribute("stop-color", toHex(mid));
      stops[2].setAttribute("stop-color", toHex(tip));
    });

    if (plant.cfg.hero) {
      currentPhaseColor = toHex(mix(baseColor, [255, 242, 218], 0.22));
    }
  }

  function rippleColor(p) {
    return toHex(mix(colorAt(p), [220, 245, 235], 0.55));
  }

  function spawnRipple(plant, now, offset) {
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
      stroke: rippleColor(plant.p),
      "stroke-width": 1.1,
      opacity: 0
    });

    plant.ripplesEl.appendChild(node);

    plant.ripples.push({
      node: node,
      born: born,
      duration: duration,
      startRadius: startRadius,
      endRadius: endRadius,
      endRy: 16 + Math.random() * 10,
      alpha: 0.16 + Math.random() * 0.18
    });
  }

  function updateRipples(plant, now) {
    var gap = plant.cfg.hero ? 1 : 2;

    if (!plant.seeded) {
      plant.seeded = true;

      var seeds = plant.cfg.hero ? 3 : 1;
      for (var i = 0; i < seeds; i += 1) {
        spawnRipple(plant, now, (i + 1) * 0.9 + plant.index * 0.4);
      }

      plant.lastRippleAt = now;
    }

    var interval = (2.5 - 0.9 * plant.p) * gap;

    if (now - plant.lastRippleAt > interval) {
      spawnRipple(plant, now, 0);
      plant.lastRippleAt = now;
    }

    for (var j = plant.ripples.length - 1; j >= 0; j -= 1) {
      var ripple = plant.ripples[j];
      var t = Math.max(0, (now - ripple.born) / ripple.duration);

      if (t >= 1) {
        if (ripple.node.parentNode) ripple.node.parentNode.removeChild(ripple.node);
        plant.ripples.splice(j, 1);
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

  /* Pointer position in svg user space, from the last client position. */
  function updatePointer(dt) {
    var follow = 1 - Math.exp(-dt * 6);
    var target = ptr.active && !reduced ? 1 : 0;

    ptr.presence += (target - ptr.presence) * (1 - Math.exp(-dt * 3));
    ptr.nx += (ptr.tnx - ptr.nx) * follow;
    ptr.ny += (ptr.tny - ptr.ny) * follow;

    if (ptr.presence > 0.002) {
      var rect = svg.getBoundingClientRect();

      if (rect.width > 0 && rect.height > 0) {
        ptr.rx = view.x + ((ptr.cx - rect.left) / rect.width) * view.size;
        ptr.ry = view.y + ((ptr.cy - rect.top) / rect.height) * view.size;
      }
    }
  }

  function renderPlant(plant, globalProgress, time, dt) {
    var cfg = plant.cfg;
    var s = cfg.scale;
    var p = plantProgress(plant, globalProgress);
    var t = time > 0 ? time + plant.timeOffset : 0;

    plant.p = p;

    var growth = easeInOut(clamp(p / 0.86, 0, 1));
    var scale = 0.47 + 0.53 * growth;
    var baseY = 736 - (104 + cfg.stem) * growth;
    var swayStrength = 0.35 + 0.65 * smoothstep(0.04, 0.4, p);
    var sway =
      (Math.sin(t * 0.55) * 0.34 + Math.sin(t * 0.23 + 1.2) * 0.2) *
      swayStrength;

    /* Depth parallax: distant plants drift against the cursor. */
    var offTarget = reduced ? 0 : -ptr.nx * (1 - cfg.depth) * 18;
    plant.offX += (offTarget - plant.offX) * (1 - Math.exp(-dt * 4));

    plant.outer.setAttribute(
      "transform",
      "translate(" + (cfg.x + plant.offX - CX * s).toFixed(2) + " " + (cfg.y - WATER_Y * s).toFixed(2) + ") scale(" + s + ")"
    );

    /* Where the cursor sits relative to this bloom, in its own units. */
    var dx = (ptr.rx - (cfg.x + plant.offX)) / s;
    var dy = (ptr.ry - (cfg.y + (baseY - WATER_Y) * s)) / s;
    var dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
    var aim = clamp((Math.atan2(dx, -dy) * 180) / Math.PI, -80, 80);
    var above = smoothstep(-0.35, 0.35, -dy / dist);
    var nearness = 1 - 0.45 * smoothstep(150, 900, dist);
    var drive = ptr.presence * above * nearness;

    var tiltTarget = clamp(dx / 260, -1, 1) * 3.2 * drive;
    plant.tilt += (tiltTarget - plant.tilt) * (1 - Math.exp(-dt * 5));

    plant.bloom.setAttribute(
      "transform",
      "translate(" + CX + " " + baseY.toFixed(2) + ") rotate(" + (sway + plant.tilt).toFixed(3) + ") scale(" + scale.toFixed(4) + ")"
    );

    var step = Math.min(dt, 0.05);

    /* Turntable: sweeping the cursor left to right spins the bloom.
       Each plant chases the cursor on its own spring, so the pond
       turns in a staggered wave rather than in lockstep. */
    var yawTarget = reduced ? 0 : ptr.nx * MAX_YAW * cfg.spin * ptr.presence;
    var yawStiffness = 14 + cfg.swing;

    plant.yawVelocity +=
      (yawStiffness * (yawTarget - plant.yaw) - 2 * 0.55 * Math.sqrt(yawStiffness) * plant.yawVelocity) * step;
    plant.yaw += plant.yawVelocity * step;

    var yawRad = (plant.yaw * Math.PI) / 180;
    var yawSin = Math.sin(yawRad);
    var yawCos = Math.cos(yawRad);

    /* Seen at an angle the fan narrows, and the layers slide past
       one another: the back petals one way, the front ones the other. */
    var squash = 0.78 + 0.22 * yawCos;

    for (var l = 0; l < plant.layers.length; l += 1) {
      plant.layers[l].setAttribute(
        "transform",
        "translate(" + (yawSin * LAYER_DEPTH[l] * PARALLAX_SPAN).toFixed(2) + " 0)"
      );
    }

    for (var i = 0; i < plant.petals.length; i += 1) {
      var petal = plant.petals[i];
      var openT = clamp((p - petal.openStart) / (petal.openEnd - petal.openStart), 0, 1);
      var open = easeInOut(openT);
      var angle = petal.angle * (0.045 + 0.955 * open) * squash;
      var flutter =
        p > 0.88
          ? Math.sin(t * 0.6 + petal.phase) * 0.22 * open
          : 0;
      var widthScale = 0.38 + 0.62 * easeOut(open);
      var lengthScale = 0.9 + 0.1 * open;

      /* Petals nearest the cursor's bearing reach for it hardest;
         every petal leans a little, on its own spring. */
      var diff = aim - petal.angle;
      var focus = 0.35 + 0.65 * Math.exp(-(diff * diff) / 2888);
      var leanTarget = clamp(diff * 0.4, -20, 20) * focus * petal.layer.follow * drive * open;

      petal.velocity +=
        (petal.stiffness * (leanTarget - petal.lean) - petal.damping * petal.velocity) * step;
      petal.lean += petal.velocity * step;

      petal.group.setAttribute(
        "transform",
        "rotate(" + (angle + flutter + petal.lean).toFixed(2) + ") scale(" + widthScale.toFixed(3) + " " + lengthScale.toFixed(3) + ")"
      );
    }

    var topY = baseY + 2;
    var curve = Math.sin(t * 0.4) * 2.4;
    var stemPath =
      "M " + CX + " " + WATER_Y +
      " C " + (CX - 8 + curve) + " " + (WATER_Y - 30) +
      " " + (CX + 9 + curve * 0.4) + " " + ((WATER_Y + topY) / 2).toFixed(1) +
      " " + CX + " " + topY.toFixed(2);

    plant.stem.setAttribute("d", stemPath);
    plant.stem.setAttribute("stroke-width", (2.8 + 4 * clamp(p * 1.3, 0, 1)).toFixed(2));

    plant.stemHighlight.setAttribute("d", stemPath.replace("M " + CX, "M " + (CX + 1.6)));
    plant.stemHighlight.setAttribute("stroke-width", (0.9 + 0.7 * p).toFixed(2));
    plant.stemHighlight.setAttribute("stroke-opacity", (0.08 + 0.16 * p).toFixed(2));

    var coreOpacity = smoothstep(0.5, 0.86, p);
    var coreScale =
      0.55 + 0.45 * smoothstep(0.55, 1, p) +
      Math.sin(t * 1.15) * 0.012 * smoothstep(0.7, 1, p);

    plant.core.setAttribute("opacity", coreOpacity.toFixed(3));
    plant.core.setAttribute(
      "transform",
      "translate(" + (yawSin * CORE_DEPTH * PARALLAX_SPAN).toFixed(2) + " 0) scale(" + coreScale.toFixed(3) + ")"
    );

    if (
      firstRender ||
      Math.abs(p - plant.lastColorP) > 0.0015 ||
      time - plant.lastColorAt > 0.18
    ) {
      applyColors(plant, p, time);
      plant.lastColorP = p;
      plant.lastColorAt = time;
    }

    updateRipples(plant, time);

    /* Centre of the bloom in svg space, for the camera. */
    plant.focusY = cfg.y + (baseY - 78 * scale - WATER_Y) * s;
  }

  function updateCamera(progress, dt) {
    var targetZoom = reduced ? 1 : zoomAt(progress);
    var weight = clamp((targetZoom - 1) / 0.5, 0, 1);
    var targetX = lerp(VIEW.homeX, CX, weight);
    var targetY = lerp(VIEW.homeY, hero.focusY, weight);

    if (firstRender || reduced) {
      cam.z = targetZoom;
      cam.x = targetX;
      cam.y = targetY;
    } else {
      var k = 1 - Math.exp(-dt * 2.6);
      cam.z += (targetZoom - cam.z) * k;
      cam.x += (targetX - cam.x) * k;
      cam.y += (targetY - cam.y) * k;
    }

    var size = VIEW.size / cam.z;
    view.x = cam.x - size / 2;
    view.y = cam.y - size / 2;
    view.size = size;

    svg.setAttribute(
      "viewBox",
      view.x.toFixed(2) + " " + view.y.toFixed(2) + " " + size.toFixed(2) + " " + size.toFixed(2)
    );
  }

  function render(p, time, delta) {
    if (!ready) return;

    var progress = clamp(p, 0, 1);
    var dt = Math.min(Math.max(delta || 0, 0), 0.05);

    updatePointer(dt);

    /* The hero goes first: the camera and the pond's visibility
       both depend on where it ends up. */
    renderPlant(hero, progress, time, dt);
    updateCamera(progress, dt);

    for (var i = 0; i < plants.length; i += 1) {
      var plant = plants[i];
      if (plant === hero) continue;

      var reveal = 1 - smoothstep(plant.cfg.hideAbove - 0.25, plant.cfg.hideAbove, cam.z);

      if (reveal < 0.01) {
        plant.outer.setAttribute("display", "none");
        continue;
      }

      plant.outer.removeAttribute("display");
      plant.outer.setAttribute("opacity", (plant.cfg.alpha * reveal).toFixed(3));
      renderPlant(plant, progress, time, dt);
    }

    firstRender = false;
  }

  function build() {
    svg = document.getElementById("lotus");
    pondEl = document.getElementById("pond");

    if (!svg || !pondEl) return;

    defsEl = svg.querySelector("defs");
    if (!defsEl) return;

    PLANTS.forEach(function (cfg, index) {
      var plant = createPlant(cfg, index);
      plants.push(plant);
      if (cfg.hero) hero = plant;
    });

    ready = !!hero;
  }

  function init() {
    if (!ready) build();
    return ready;
  }

  /* Cursor position in client pixels; `active` is false once the
     pointer has left the page or a touch has ended. */
  function setPointer(clientX, clientY, active) {
    ptr.active = !!active;

    if (!active) {
      ptr.tnx = 0;
      ptr.tny = 0;
      return;
    }

    ptr.cx = clientX;
    ptr.cy = clientY;
    ptr.tnx = clamp((clientX / window.innerWidth) * 2 - 1, -1, 1);
    ptr.tny = clamp((clientY / window.innerHeight) * 2 - 1, -1, 1);
  }

  function setReduced(value) {
    reduced = !!value;
  }

  window.LotusBloom = {
    init: init,
    render: render,
    setPointer: setPointer,
    setReduced: setReduced,
    colorAt: function (p) {
      return toHex(colorAt(p));
    },
    phaseColor: function () {
      return currentPhaseColor;
    }
  };
})(window);
