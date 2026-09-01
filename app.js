(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const STORAGE_KEY = "hexgrid-designer-state-v1";

  const DEFAULTS = {
    cols: 10,
    rows: 8,
    orientation: "flat", // 'flat' | 'pointy'
    size: 32,
    gap: 0.08,
    strokeWidth: 2,
    strokeColor: "#2b2b2b",
    bgColor: "#ffffff",
    showLabels: false,
    labelMode: "index", // 'index' | 'coord'
  };

  const PALETTE = [
    "#ffb703", "#fb8500", "#e63946", "#d62828",
    "#8ecae6", "#219ebc", "#023047", "#06d6a0",
    "#118ab2", "#ef476f", "#ffd166", "#073b4c",
    "#adb5bd", "#495057", "#ffffff", "#000000",
  ];

  /** @type {Record<string, string>} map "r,c" -> fill color */
  let cellFills = {};

  /** @type {Record<string, string>} map "r,c" -> word */
  let cellWords = {};

  let config = { ...DEFAULTS };
  let currentColor = "#ffb703";
  let eraseMode = false;
  let isPainting = false;
  let paintColorForStroke = null; // color used for the current drag stroke

  let swapMode = false;
  let wordDrag = null; // { sourceKey, word, sourcePoly }
  let hoveredHexKey = null;
  let wordGhostEl = null;

  const el = {
    container: document.getElementById("grid-container"),
    cols: document.getElementById("in-cols"),
    rows: document.getElementById("in-rows"),
    orientation: document.getElementById("in-orientation"),
    size: document.getElementById("in-size"),
    gap: document.getElementById("in-gap"),
    strokeWidth: document.getElementById("in-strokewidth"),
    strokeColor: document.getElementById("in-strokecolor"),
    bgColor: document.getElementById("in-bgcolor"),
    showLabels: document.getElementById("in-showlabels"),
    labelMode: document.getElementById("in-labelmode"),
    fillColor: document.getElementById("in-fillcolor"),
    eraseMode: document.getElementById("in-erasemode"),
    swatches: document.getElementById("swatches"),
    outCols: document.getElementById("out-cols"),
    outRows: document.getElementById("out-rows"),
    outSize: document.getElementById("out-size"),
    outGap: document.getElementById("out-gap"),
    outStrokeWidth: document.getElementById("out-strokewidth"),
    btnClear: document.getElementById("btn-clear"),
    btnReset: document.getElementById("btn-reset"),
    btnExportSvg: document.getElementById("btn-export-svg"),
    btnExportPng: document.getElementById("btn-export-png"),
    wordList: document.getElementById("in-wordlist"),
    shuffle: document.getElementById("in-shuffle"),
    swapMode: document.getElementById("in-swapmode"),
    outWordCount: document.getElementById("out-wordcount"),
    btnDistribute: document.getElementById("btn-distribute"),
    btnClearWords: document.getElementById("btn-clearwords"),
  };

  // ---------- Geometry ----------

  function hexCorners(cx, cy, size, orientation) {
    const corners = [];
    const startAngle = orientation === "flat" ? 0 : -30;
    for (let i = 0; i < 6; i++) {
      const angleDeg = startAngle + 60 * i;
      const angleRad = (Math.PI / 180) * angleDeg;
      corners.push([cx + size * Math.cos(angleRad), cy + size * Math.sin(angleRad)]);
    }
    return corners;
  }

  function hexCenter(row, col, size, gap, orientation) {
    const gapMult = 1 + gap;
    if (orientation === "flat") {
      const horiz = size * 1.5 * gapMult;
      const vert = size * Math.sqrt(3) * gapMult;
      const x = col * horiz;
      const y = row * vert + (col % 2 !== 0 ? vert / 2 : 0);
      return { x, y };
    } else {
      const horiz = size * Math.sqrt(3) * gapMult;
      const vert = size * 1.5 * gapMult;
      const x = col * horiz + (row % 2 !== 0 ? horiz / 2 : 0);
      const y = row * vert;
      return { x, y };
    }
  }

  // ---------- Rendering ----------

  function wordFontSize(word, size, orientation) {
    const availableWidth = (orientation === "flat" ? 1.5 : 1.7) * size;
    const estimate = availableWidth / Math.max(word.length, 1) / 0.58;
    return Math.max(8, Math.min(size * 0.42, estimate));
  }

  function buildGrid() {
    const { cols, rows, size, gap, orientation, strokeWidth, strokeColor, bgColor, showLabels, labelMode } = config;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("id", "hex-svg");

    const cellsGroup = document.createElementNS(SVG_NS, "g");
    cellsGroup.setAttribute("id", "hex-cells");

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const hexData = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const { x, y } = hexCenter(r, c, size, gap, orientation);
        const corners = hexCorners(x, y, size, orientation);
        for (const [px, py] of corners) {
          if (px < minX) minX = px;
          if (py < minY) minY = py;
          if (px > maxX) maxX = px;
          if (py > maxY) maxY = py;
        }
        hexData.push({ r, c, x, y, corners });
      }
    }

    const pad = Math.max(strokeWidth, 2) + 2;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const width = maxX - minX;
    const height = maxY - minY;

    svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
    svg.setAttribute("width", String(Math.round(width)));
    svg.setAttribute("height", String(Math.round(height)));

    const bgRect = document.createElementNS(SVG_NS, "rect");
    bgRect.setAttribute("x", String(minX));
    bgRect.setAttribute("y", String(minY));
    bgRect.setAttribute("width", String(width));
    bgRect.setAttribute("height", String(height));
    bgRect.setAttribute("fill", bgColor);
    svg.appendChild(bgRect);

    let index = 1;
    for (const hex of hexData) {
      const key = `${hex.r},${hex.c}`;
      const fill = cellFills[key] || bgColor;

      const poly = document.createElementNS(SVG_NS, "polygon");
      poly.setAttribute("points", hex.corners.map((p) => p.join(",")).join(" "));
      poly.setAttribute("fill", fill);
      poly.setAttribute("stroke", strokeColor);
      poly.setAttribute("stroke-width", String(strokeWidth));
      poly.setAttribute("stroke-linejoin", "round");
      poly.setAttribute("class", "hex-cell");
      poly.dataset.row = String(hex.r);
      poly.dataset.col = String(hex.c);
      cellsGroup.appendChild(poly);

      const word = cellWords[key];
      if (word) {
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", String(hex.x));
        text.setAttribute("y", String(hex.y));
        text.setAttribute("class", "hex-word-label");
        text.setAttribute("font-size", String(wordFontSize(word, size, orientation)));
        text.textContent = word;
        cellsGroup.appendChild(text);
      } else if (showLabels) {
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", String(hex.x));
        text.setAttribute("y", String(hex.y));
        text.setAttribute("class", "hex-label");
        text.textContent = labelMode === "coord" ? `${hex.r},${hex.c}` : String(index);
        cellsGroup.appendChild(text);
      }
      index++;
    }

    svg.appendChild(cellsGroup);
    return svg;
  }

  function render() {
    el.container.innerHTML = "";
    const svg = buildGrid();
    el.container.appendChild(svg);
    attachPaintHandlers(svg);
  }

  // ---------- Painting ----------

  function colorForKey(key) {
    return cellFills[key] || null;
  }

  function paintCell(poly, erase) {
    const key = `${poly.dataset.row},${poly.dataset.col}`;
    if (erase) {
      delete cellFills[key];
      poly.setAttribute("fill", config.bgColor);
    } else {
      cellFills[key] = currentColor;
      poly.setAttribute("fill", currentColor);
    }
    saveState();
  }

  function attachPaintHandlers(svg) {
    svg.addEventListener("contextmenu", (e) => {
      const target = e.target;
      if (!target.classList || !target.classList.contains("hex-cell")) return;
      e.preventDefault();
      if (swapMode) {
        clearWordAt(target);
      } else {
        paintCell(target, true);
      }
    });

    svg.addEventListener("pointerdown", (e) => {
      const target = e.target;
      if (!target.classList || !target.classList.contains("hex-cell")) return;
      if (e.button === 2) return; // handled by contextmenu

      if (swapMode) {
        const key = `${target.dataset.row},${target.dataset.col}`;
        const word = cellWords[key];
        if (!word) return;
        startWordDrag(key, word, target, e);
        return;
      }

      isPainting = true;
      const erase = eraseMode || e.button === 1 || e.shiftKey;
      paintColorForStroke = erase;
      paintCell(target, erase);
    });

    svg.addEventListener("pointerover", (e) => {
      const target = e.target;
      if (!target.classList || !target.classList.contains("hex-cell")) return;
      hoveredHexKey = `${target.dataset.row},${target.dataset.col}`;

      if (wordDrag) {
        updateWordDragTarget(target);
        return;
      }
      if (!isPainting || swapMode) return;
      paintCell(target, paintColorForStroke);
    });

    svg.addEventListener("pointerleave", () => {
      hoveredHexKey = null;
    });

    svg.addEventListener("dragstart", (e) => e.preventDefault());
  }

  window.addEventListener("pointerup", () => {
    isPainting = false;
    paintColorForStroke = null;
    if (wordDrag) finishWordDrag();
  });

  window.addEventListener("pointermove", (e) => {
    if (wordDrag) moveWordGhost(e.clientX, e.clientY);
  });

  // ---------- Word list ----------

  function ensureWordGhost() {
    if (wordGhostEl) return wordGhostEl;
    wordGhostEl = document.createElement("div");
    wordGhostEl.className = "word-drag-ghost";
    document.body.appendChild(wordGhostEl);
    return wordGhostEl;
  }

  function moveWordGhost(x, y) {
    const ghost = ensureWordGhost();
    ghost.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
  }

  function startWordDrag(key, word, poly, e) {
    wordDrag = { sourceKey: key, word, sourcePoly: poly, targetPoly: null };
    poly.classList.add("word-drag-source");
    const ghost = ensureWordGhost();
    ghost.textContent = word;
    moveWordGhost(e.clientX, e.clientY);
  }

  function updateWordDragTarget(poly) {
    if (!wordDrag) return;
    if (wordDrag.targetPoly && wordDrag.targetPoly !== poly) {
      wordDrag.targetPoly.classList.remove("word-drag-target");
    }
    if (poly !== wordDrag.sourcePoly) {
      poly.classList.add("word-drag-target");
      wordDrag.targetPoly = poly;
    } else {
      wordDrag.targetPoly = null;
    }
  }

  function finishWordDrag() {
    const { sourceKey, word, sourcePoly, targetPoly } = wordDrag;
    sourcePoly.classList.remove("word-drag-source");
    if (targetPoly) targetPoly.classList.remove("word-drag-target");

    if (targetPoly) {
      const targetKey = `${targetPoly.dataset.row},${targetPoly.dataset.col}`;
      const targetWord = cellWords[targetKey];
      if (targetWord) {
        cellWords[sourceKey] = targetWord;
      } else {
        delete cellWords[sourceKey];
      }
      cellWords[targetKey] = word;
      render();
      saveState();
    }

    if (wordGhostEl) {
      wordGhostEl.remove();
      wordGhostEl = null;
    }
    wordDrag = null;
  }

  function clearWordAt(poly) {
    const key = `${poly.dataset.row},${poly.dataset.col}`;
    if (!cellWords[key]) return;
    delete cellWords[key];
    render();
    saveState();
  }

  function parseWordList(text) {
    return text
      .split("\n")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
  }

  function shuffleArray(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function distributeWords() {
    const words = parseWordList(el.wordList.value);
    const { rows, cols } = config;
    let keys = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) keys.push(`${r},${c}`);
    }
    if (el.shuffle.checked) keys = shuffleArray(keys);

    cellWords = {};
    const count = Math.min(words.length, keys.length);
    for (let i = 0; i < count; i++) {
      cellWords[keys[i]] = words[i];
    }
    render();
    saveState();

    if (words.length > keys.length) {
      alert(
        `Only ${keys.length} of ${words.length} words fit on the grid. ` +
          `Add more rows/columns or trim the word list to place the rest.`
      );
    }
  }

  function clearWords() {
    cellWords = {};
    render();
    saveState();
  }

  // ---------- Controls wiring ----------

  function syncOutputs() {
    el.outCols.textContent = config.cols;
    el.outRows.textContent = config.rows;
    el.outSize.textContent = config.size;
    el.outGap.textContent = config.gap.toFixed(2);
    el.outStrokeWidth.textContent = config.strokeWidth;
  }

  function syncInputsFromConfig() {
    el.cols.value = config.cols;
    el.rows.value = config.rows;
    el.orientation.value = config.orientation;
    el.size.value = config.size;
    el.gap.value = config.gap;
    el.strokeWidth.value = config.strokeWidth;
    el.strokeColor.value = config.strokeColor;
    el.bgColor.value = config.bgColor;
    el.showLabels.checked = config.showLabels;
    el.labelMode.value = config.labelMode;
    syncOutputs();
  }

  function syncWordCount() {
    const count = parseWordList(el.wordList.value).length;
    el.outWordCount.textContent = count > 0 ? `(${count})` : "";
  }

  function buildSwatches() {
    el.swatches.innerHTML = "";
    for (const color of PALETTE) {
      const btn = document.createElement("button");
      btn.className = "swatch";
      btn.style.background = color;
      btn.title = color;
      btn.addEventListener("click", () => {
        currentColor = color;
        el.fillColor.value = rgbToHex(color) || color;
      });
      el.swatches.appendChild(btn);
    }
  }

  function rgbToHex(color) {
    // handles hex passthrough and named colors like #ffffff already
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    return null;
  }

  function bindControls() {
    el.cols.addEventListener("input", () => {
      config.cols = parseInt(el.cols.value, 10);
      syncOutputs();
      render();
      saveState();
    });
    el.rows.addEventListener("input", () => {
      config.rows = parseInt(el.rows.value, 10);
      syncOutputs();
      render();
      saveState();
    });
    el.orientation.addEventListener("change", () => {
      config.orientation = el.orientation.value;
      render();
      saveState();
    });
    el.size.addEventListener("input", () => {
      config.size = parseInt(el.size.value, 10);
      syncOutputs();
      render();
      saveState();
    });
    el.gap.addEventListener("input", () => {
      config.gap = parseFloat(el.gap.value);
      syncOutputs();
      render();
      saveState();
    });
    el.strokeWidth.addEventListener("input", () => {
      config.strokeWidth = parseFloat(el.strokeWidth.value);
      syncOutputs();
      render();
      saveState();
    });
    el.strokeColor.addEventListener("input", () => {
      config.strokeColor = el.strokeColor.value;
      render();
      saveState();
    });
    el.bgColor.addEventListener("input", () => {
      config.bgColor = el.bgColor.value;
      render();
      saveState();
    });
    el.showLabels.addEventListener("change", () => {
      config.showLabels = el.showLabels.checked;
      render();
      saveState();
    });
    el.labelMode.addEventListener("change", () => {
      config.labelMode = el.labelMode.value;
      render();
      saveState();
    });
    el.fillColor.addEventListener("input", () => {
      currentColor = el.fillColor.value;
    });
    el.eraseMode.addEventListener("change", () => {
      eraseMode = el.eraseMode.checked;
    });

    el.wordList.addEventListener("input", () => {
      syncWordCount();
      saveState();
    });
    el.shuffle.addEventListener("change", saveState);
    el.swapMode.addEventListener("change", () => {
      swapMode = el.swapMode.checked;
      isPainting = false;
    });

    el.btnDistribute.addEventListener("click", distributeWords);
    el.btnClearWords.addEventListener("click", () => {
      if (!confirm("Clear all placed words? This cannot be undone.")) return;
      clearWords();
    });

    el.btnClear.addEventListener("click", () => {
      if (!confirm("Clear all hex fills? This cannot be undone.")) return;
      cellFills = {};
      render();
      saveState();
    });

    el.btnReset.addEventListener("click", () => {
      if (!confirm("Reset grid to default settings and clear all fills?")) return;
      config = { ...DEFAULTS };
      cellFills = {};
      syncInputsFromConfig();
      render();
      saveState();
    });

    el.btnExportSvg.addEventListener("click", exportSVG);
    el.btnExportPng.addEventListener("click", exportPNG);
  }

  // ---------- Export ----------

  function getSerializedSvg() {
    const svg = document.getElementById("hex-svg");
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", SVG_NS);
    const serializer = new XMLSerializer();
    return serializer.serializeToString(clone);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportSVG() {
    const svgString = getSerializedSvg();
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    downloadBlob(blob, "hex-grid.svg");
  }

  function exportPNG() {
    const svg = document.getElementById("hex-svg");
    const width = parseInt(svg.getAttribute("width"), 10);
    const height = parseInt(svg.getAttribute("height"), 10);
    const scale = 2; // export at 2x for crisper output

    const svgString = getSerializedSvg();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, "hex-grid.png");
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert("Could not export PNG in this browser. Try Download SVG instead.");
    };
    img.src = url;
  }

  // ---------- Persistence ----------

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          config,
          cellFills,
          cellWords,
          wordListText: el.wordList.value,
          shuffle: el.shuffle.checked,
        })
      );
    } catch (e) {
      // storage unavailable or full; ignore silently
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.config) config = { ...DEFAULTS, ...parsed.config };
      if (parsed.cellFills) cellFills = parsed.cellFills;
      if (parsed.cellWords) cellWords = parsed.cellWords;
      if (typeof parsed.wordListText === "string") el.wordList.value = parsed.wordListText;
      if (typeof parsed.shuffle === "boolean") el.shuffle.checked = parsed.shuffle;
    } catch (e) {
      // corrupted state; start fresh
      config = { ...DEFAULTS };
      cellFills = {};
      cellWords = {};
    }
  }

  // ---------- Init ----------

  function init() {
    loadState();
    syncInputsFromConfig();
    syncWordCount();
    buildSwatches();
    bindControls();
    render();
  }

  init();
})();
