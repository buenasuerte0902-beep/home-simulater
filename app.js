(() => {
  "use strict";

  const STORAGE_KEY_ROOMS = "furnitureSim.rooms";
  const STORAGE_KEY_CATALOG = "furnitureSim.catalog";

  const MAX_ROOM_PX_WIDTH = 900;
  const MAX_ROOM_PX_HEIGHT = 620;
  const ROOM_MARGIN_CM = 20;

  const roomEl = document.getElementById("room");
  const roomDimsLabel = document.getElementById("room-dims-label");

  const roomShapeTypeSelect = document.getElementById("room-shape-type");
  const rectControls = document.getElementById("rect-controls");
  const polygonControls = document.getElementById("polygon-controls");
  const roomWidthInput = document.getElementById("room-width");
  const roomDepthInput = document.getElementById("room-depth");
  const applyRoomSizeBtn = document.getElementById("apply-room-size-btn");

  const polygonUndoBtn = document.getElementById("polygon-undo-btn");
  const polygonClearBtn = document.getElementById("polygon-clear-btn");
  const polygonSnapCheckbox = document.getElementById("polygon-snap");
  const polygonPointsList = document.getElementById("polygon-points-list");
  const polygonAddPointBtn = document.getElementById("polygon-add-point-btn");

  const roomNameInput = document.getElementById("room-name");
  const saveRoomBtn = document.getElementById("save-room-btn");
  const newRoomBtn = document.getElementById("new-room-btn");
  const savedRoomsSelect = document.getElementById("saved-rooms-select");
  const loadRoomBtn = document.getElementById("load-room-btn");
  const deleteRoomBtn = document.getElementById("delete-room-btn");

  const furnNameInput = document.getElementById("furn-name");
  const furnWidthInput = document.getElementById("furn-width");
  const furnDepthInput = document.getElementById("furn-depth");
  const furnColorInput = document.getElementById("furn-color");
  const addFurnitureBtn = document.getElementById("add-furniture-btn");
  const furnitureListEl = document.getElementById("furniture-list");

  const selectedTools = document.getElementById("selected-tools");
  const rotateSlider = document.getElementById("rotate-slider");
  const rotateNumber = document.getElementById("rotate-number");
  const rotate90Btn = document.getElementById("rotate-90-btn");
  const deletePlacementBtn = document.getElementById("delete-placement-btn");

  let state = {
    room: { shapeType: "rect", points: rectPoints(400, 300) },
    placements: [], // {id, furnitureId, x, y, rotation}
  };

  let catalog = []; // {id, name, width, depth, color}
  let scale = 1; // px per cm
  let originX = 0; // cm, subtracted before scaling to px
  let originY = 0;
  let selectedPlacementId = null;
  let idCounter = 1;

  function uid() {
    return "id" + Date.now().toString(36) + (idCounter++).toString(36);
  }

  function rectPoints(w, d) {
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d },
    ];
  }

  // ---------- Persistence ----------

  function loadCatalog() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CATALOG);
      catalog = raw ? JSON.parse(raw) : [];
    } catch {
      catalog = [];
    }
  }

  function saveCatalog() {
    localStorage.setItem(STORAGE_KEY_CATALOG, JSON.stringify(catalog));
  }

  function loadRoomsIndex() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ROOMS);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveRoomsIndex(rooms) {
    localStorage.setItem(STORAGE_KEY_ROOMS, JSON.stringify(rooms));
  }

  function refreshSavedRoomsSelect() {
    const rooms = loadRoomsIndex();
    savedRoomsSelect.innerHTML = '<option value="">-- 保存済みの部屋 --</option>';
    Object.keys(rooms)
      .sort()
      .forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        savedRoomsSelect.appendChild(opt);
      });
  }

  // ---------- Geometry helpers ----------

  function boundingBox(points) {
    if (points.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function findFurniture(furnitureId) {
    return catalog.find((f) => f.id === furnitureId);
  }

  function rotatedHalfExtents(w, d, rotationDeg) {
    const rad = (rotationDeg * Math.PI) / 180;
    const halfW = (w * Math.abs(Math.cos(rad)) + d * Math.abs(Math.sin(rad))) / 2;
    const halfH = (w * Math.abs(Math.sin(rad)) + d * Math.abs(Math.cos(rad))) / 2;
    return { halfW, halfH };
  }

  // ---------- Rendering ----------

  function computeScale() {
    const box = boundingBox(state.room.points);
    const w = Math.max(box.maxX - box.minX, 1);
    const d = Math.max(box.maxY - box.minY, 1);
    const scaleX = MAX_ROOM_PX_WIDTH / w;
    const scaleY = MAX_ROOM_PX_HEIGHT / d;
    scale = Math.min(scaleX, scaleY, 4);
    originX = box.minX;
    originY = box.minY;
    return { w, d };
  }

  function toPx(pt) {
    return { x: (pt.x - originX) * scale, y: (pt.y - originY) * scale };
  }

  function toCm(pxX, pxY) {
    return { x: pxX / scale + originX, y: pxY / scale + originY };
  }

  function renderRoomFrame() {
    const { w, d } = computeScale();
    roomEl.style.width = w * scale + "px";
    roomEl.style.height = d * scale + "px";
    roomDimsLabel.textContent = `${Math.round(w)}cm × ${Math.round(d)}cm (面積の目安)`;
    roomWidthInput.value = Math.round(w);
    roomDepthInput.value = Math.round(d);
    renderRoomShapeSvg();
  }

  function renderRoomShapeSvg() {
    let svg = roomEl.querySelector(".room-svg");
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "room-svg");
      roomEl.insertBefore(svg, roomEl.firstChild);
    }
    svg.innerHTML = "";

    const isPolygonEditing =
      state.room.shapeType === "polygon" && polygonSnapCheckbox && !polygonControls.hidden;

    if (state.room.points.length >= 3) {
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      const pts = state.room.points.map((p) => {
        const px = toPx(p);
        return `${px.x},${px.y}`;
      });
      poly.setAttribute("points", pts.join(" "));
      poly.setAttribute("class", "room-shape-outline");
      svg.appendChild(poly);
    } else if (state.room.points.length >= 1) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      const pts = state.room.points.map((p) => {
        const px = toPx(p);
        return `${px.x},${px.y}`;
      });
      line.setAttribute("points", pts.join(" "));
      line.setAttribute("class", "room-shape-draft");
      svg.appendChild(line);
    }

    if (state.room.shapeType === "polygon" && isEditModeOn()) {
      state.room.points.forEach((p, idx) => {
        const px = toPx(p);
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", px.x);
        circle.setAttribute("cy", px.y);
        circle.setAttribute("r", 6);
        circle.setAttribute("class", "room-vertex");
        circle.dataset.index = String(idx);
        circle.addEventListener("pointerdown", (e) => startDragVertex(e, idx));
        svg.appendChild(circle);
      });
    }
    void isPolygonEditing;
  }

  function isEditModeOn() {
    return state.room.shapeType === "polygon";
  }

  function renderPlacements() {
    roomEl.querySelectorAll(".placement").forEach((el) => el.remove());
    state.placements.forEach((p) => {
      const furn = findFurniture(p.furnitureId);
      if (!furn) return;
      const el = document.createElement("div");
      el.className = "placement";
      if (p.id === selectedPlacementId) el.classList.add("selected");
      el.dataset.id = p.id;

      const px = toPx({ x: p.x, y: p.y });
      el.style.width = furn.width * scale + "px";
      el.style.height = furn.depth * scale + "px";
      el.style.left = px.x + "px";
      el.style.top = px.y + "px";
      el.style.transform = `rotate(${p.rotation}deg)`;
      el.style.background = furn.color;
      el.textContent = furn.name;

      el.addEventListener("pointerdown", (e) => startDragPlacement(e, p.id));
      roomEl.appendChild(el);
    });
    updateSelectedToolsVisibility();
  }

  function updateSelectedToolsVisibility() {
    selectedTools.hidden = selectedPlacementId === null;
    if (selectedPlacementId !== null) {
      const placement = state.placements.find((p) => p.id === selectedPlacementId);
      if (placement) {
        rotateSlider.value = String(placement.rotation);
        rotateNumber.value = String(placement.rotation);
      }
    }
  }

  function renderFurnitureList() {
    furnitureListEl.innerHTML = "";
    catalog.forEach((f) => {
      const li = document.createElement("li");
      li.draggable = true;
      li.dataset.furnitureId = f.id;

      const swatch = document.createElement("span");
      swatch.className = "furn-swatch";
      swatch.style.background = f.color;

      const info = document.createElement("span");
      info.className = "furn-info";
      info.innerHTML = `<span class="furn-name">${escapeHtml(f.name)}</span><span class="furn-size">${f.width}cm × ${f.depth}cm</span>`;

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-furniture-btn";
      removeBtn.textContent = "×";
      removeBtn.title = "リストから削除";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        catalog = catalog.filter((c) => c.id !== f.id);
        saveCatalog();
        renderFurnitureList();
      });

      li.appendChild(swatch);
      li.appendChild(info);
      li.appendChild(removeBtn);

      li.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/furniture-id", f.id);
        e.dataTransfer.effectAllowed = "copy";
      });

      li.addEventListener("dblclick", () => {
        addPlacementCentered(f.id);
      });

      furnitureListEl.appendChild(li);
    });
  }

  function renderPolygonPointsList() {
    polygonPointsList.innerHTML = "";
    state.room.points.forEach((pt, idx) => {
      const li = document.createElement("li");

      const xInput = document.createElement("input");
      xInput.type = "number";
      xInput.step = "1";
      xInput.value = Math.round(pt.x);
      xInput.title = "X (cm)";
      xInput.addEventListener("change", () => {
        pt.x = Number(xInput.value) || 0;
        renderRoomFrame();
        renderPlacements();
        renderPolygonPointsList();
      });

      const xLabel = document.createTextNode("X:");
      const yLabel = document.createTextNode("Y:");

      const yInput = document.createElement("input");
      yInput.type = "number";
      yInput.step = "1";
      yInput.value = Math.round(pt.y);
      yInput.title = "Y (cm)";
      yInput.addEventListener("change", () => {
        pt.y = Number(yInput.value) || 0;
        renderRoomFrame();
        renderPlacements();
        renderPolygonPointsList();
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "danger";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        if (state.room.points.length <= 3) {
          alert("頂点は3つ以上必要です");
          return;
        }
        state.room.points.splice(idx, 1);
        renderRoomFrame();
        renderPlacements();
        renderPolygonPointsList();
      });

      li.appendChild(xLabel);
      li.appendChild(xInput);
      li.appendChild(yLabel);
      li.appendChild(yInput);
      li.appendChild(removeBtn);
      polygonPointsList.appendChild(li);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Placement logic ----------

  function addPlacementAt(furnitureId, xCm, yCm) {
    const furn = findFurniture(furnitureId);
    if (!furn) return;
    const box = boundingBox(state.room.points);
    const clampedX = clamp(xCm, box.minX, Math.max(box.minX, box.maxX - furn.width));
    const clampedY = clamp(yCm, box.minY, Math.max(box.minY, box.maxY - furn.depth));
    const placement = {
      id: uid(),
      furnitureId,
      x: clampedX,
      y: clampedY,
      rotation: 0,
    };
    state.placements.push(placement);
    selectedPlacementId = placement.id;
    renderPlacements();
  }

  function addPlacementCentered(furnitureId) {
    const furn = findFurniture(furnitureId);
    if (!furn) return;
    const box = boundingBox(state.room.points);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    addPlacementAt(furnitureId, cx - furn.width / 2, cy - furn.depth / 2);
  }

  function selectPlacement(id) {
    selectedPlacementId = id;
    renderPlacements();
  }

  function clampCenterToRoom(cx, cy, halfW, halfH) {
    const box = boundingBox(state.room.points);
    const roomW = box.maxX - box.minX;
    const roomD = box.maxY - box.minY;
    const clampedCx =
      halfW * 2 > roomW ? (box.minX + box.maxX) / 2 : clamp(cx, box.minX + halfW, box.maxX - halfW);
    const clampedCy =
      halfH * 2 > roomD ? (box.minY + box.maxY) / 2 : clamp(cy, box.minY + halfH, box.maxY - halfH);
    return { cx: clampedCx, cy: clampedCy };
  }

  function applyRotation(placement, rotationDeg) {
    const furn = findFurniture(placement.furnitureId);
    if (!furn) return;
    const cx = placement.x + furn.width / 2;
    const cy = placement.y + furn.depth / 2;
    const { halfW, halfH } = rotatedHalfExtents(furn.width, furn.depth, rotationDeg);
    const clamped = clampCenterToRoom(cx, cy, halfW, halfH);
    placement.rotation = ((rotationDeg % 360) + 360) % 360;
    placement.x = clamped.cx - furn.width / 2;
    placement.y = clamped.cy - furn.depth / 2;
  }

  function startDragPlacement(e, placementId) {
    e.preventDefault();
    e.stopPropagation();
    selectPlacement(placementId);
    const placement = state.placements.find((p) => p.id === placementId);
    if (!placement) return;
    const furn = findFurniture(placement.furnitureId);
    const { halfW, halfH } = rotatedHalfExtents(furn.width, furn.depth, placement.rotation);

    const startPointerX = e.clientX;
    const startPointerY = e.clientY;
    const startCx = placement.x + furn.width / 2;
    const startCy = placement.y + furn.depth / 2;

    function onMove(ev) {
      const dxCm = (ev.clientX - startPointerX) / scale;
      const dyCm = (ev.clientY - startPointerY) / scale;
      const clamped = clampCenterToRoom(startCx + dxCm, startCy + dyCm, halfW, halfH);
      placement.x = clamped.cx - furn.width / 2;
      placement.y = clamped.cy - furn.depth / 2;
      renderPlacements();
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  roomEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  roomEl.addEventListener("drop", (e) => {
    e.preventDefault();
    const furnitureId = e.dataTransfer.getData("text/furniture-id");
    if (!furnitureId) return;
    const furn = findFurniture(furnitureId);
    if (!furn) return;
    const rect = roomEl.getBoundingClientRect();
    const cm = toCm(e.clientX - rect.left, e.clientY - rect.top);
    addPlacementAt(furnitureId, cm.x - furn.width / 2, cm.y - furn.depth / 2);
  });

  roomEl.addEventListener("click", (e) => {
    if (e.target !== roomEl) return;
    if (state.room.shapeType === "polygon") {
      const rect = roomEl.getBoundingClientRect();
      let cm = toCm(e.clientX - rect.left, e.clientY - rect.top);
      if (polygonSnapCheckbox.checked) {
        cm = { x: Math.round(cm.x / 10) * 10, y: Math.round(cm.y / 10) * 10 };
      }
      state.room.points.push(cm);
      renderRoomFrame();
      renderPlacements();
      renderPolygonPointsList();
      return;
    }
    selectPlacement(null);
  });

  function startDragVertex(e, index) {
    e.preventDefault();
    e.stopPropagation();
    const pt = state.room.points[index];
    const startPointerX = e.clientX;
    const startPointerY = e.clientY;
    const startX = pt.x;
    const startY = pt.y;

    function onMove(ev) {
      const dxCm = (ev.clientX - startPointerX) / scale;
      const dyCm = (ev.clientY - startPointerY) / scale;
      pt.x = startX + dxCm;
      pt.y = startY + dyCm;
      renderRoomFrame();
      renderPlacements();
      renderPolygonPointsList();
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  rotate90Btn.addEventListener("click", () => {
    if (!selectedPlacementId) return;
    const placement = state.placements.find((p) => p.id === selectedPlacementId);
    if (!placement) return;
    applyRotation(placement, placement.rotation + 90);
    renderPlacements();
  });

  function onRotateInputChange(value) {
    if (!selectedPlacementId) return;
    const placement = state.placements.find((p) => p.id === selectedPlacementId);
    if (!placement) return;
    applyRotation(placement, Number(value) || 0);
    renderPlacements();
  }

  rotateSlider.addEventListener("input", () => onRotateInputChange(rotateSlider.value));
  rotateNumber.addEventListener("input", () => onRotateInputChange(rotateNumber.value));

  deletePlacementBtn.addEventListener("click", () => {
    if (!selectedPlacementId) return;
    state.placements = state.placements.filter((p) => p.id !== selectedPlacementId);
    selectedPlacementId = null;
    renderPlacements();
  });

  // ---------- Room shape controls ----------

  roomShapeTypeSelect.addEventListener("change", () => {
    state.room.shapeType = roomShapeTypeSelect.value;
    rectControls.hidden = state.room.shapeType !== "rect";
    polygonControls.hidden = state.room.shapeType !== "polygon";
    if (state.room.shapeType === "rect") {
      const box = boundingBox(state.room.points);
      state.room.points = rectPoints(
        Math.max(10, Math.round(box.maxX - box.minX)),
        Math.max(10, Math.round(box.maxY - box.minY))
      );
    }
    renderRoomFrame();
    renderPlacements();
    renderPolygonPointsList();
  });

  applyRoomSizeBtn.addEventListener("click", () => {
    const w = Number(roomWidthInput.value);
    const d = Number(roomDepthInput.value);
    if (!(w > 0) || !(d > 0)) {
      alert("正しい部屋の寸法を入力してください");
      return;
    }
    state.room.points = rectPoints(w, d);
    reclampAllPlacements();
    renderRoomFrame();
    renderPlacements();
  });

  polygonUndoBtn.addEventListener("click", () => {
    state.room.points.pop();
    renderRoomFrame();
    renderPlacements();
    renderPolygonPointsList();
  });

  polygonClearBtn.addEventListener("click", () => {
    if (!confirm("部屋の形をクリアしますか？")) return;
    state.room.points = [];
    renderRoomFrame();
    renderPlacements();
    renderPolygonPointsList();
  });

  polygonAddPointBtn.addEventListener("click", () => {
    const box = boundingBox(state.room.points);
    state.room.points.push({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
    renderRoomFrame();
    renderPlacements();
    renderPolygonPointsList();
  });

  function reclampAllPlacements() {
    state.placements.forEach((p) => {
      const furn = findFurniture(p.furnitureId);
      if (!furn) return;
      applyRotation(p, p.rotation);
    });
  }

  // ---------- Furniture catalog form ----------

  addFurnitureBtn.addEventListener("click", () => {
    const name = furnNameInput.value.trim();
    const width = Number(furnWidthInput.value);
    const depth = Number(furnDepthInput.value);
    const color = furnColorInput.value;
    if (!name) {
      alert("家具の名前を入力してください");
      return;
    }
    if (!(width > 0) || !(depth > 0)) {
      alert("正しい家具のサイズを入力してください");
      return;
    }
    catalog.push({ id: uid(), name, width, depth, color });
    saveCatalog();
    renderFurnitureList();
    furnNameInput.value = "";
  });

  // ---------- Room save/load ----------

  saveRoomBtn.addEventListener("click", () => {
    const name = roomNameInput.value.trim();
    if (!name) {
      alert("部屋の名前を入力してください");
      return;
    }
    if (state.room.points.length < 3) {
      alert("部屋の形を先に作成してください(3点以上)");
      return;
    }
    const rooms = loadRoomsIndex();
    rooms[name] = {
      room: state.room,
      placements: state.placements,
    };
    saveRoomsIndex(rooms);
    refreshSavedRoomsSelect();
    savedRoomsSelect.value = name;
  });

  loadRoomBtn.addEventListener("click", () => {
    const name = savedRoomsSelect.value;
    if (!name) {
      alert("読み込む部屋を選択してください");
      return;
    }
    const rooms = loadRoomsIndex();
    const data = rooms[name];
    if (!data) return;
    state.room = {
      shapeType: data.room.shapeType || "rect",
      points: (data.room.points || []).map((p) => ({ ...p })),
    };
    state.placements = (data.placements || []).map((p) => ({ ...p, rotation: p.rotation || 0 }));
    selectedPlacementId = null;
    roomNameInput.value = name;
    roomShapeTypeSelect.value = state.room.shapeType;
    rectControls.hidden = state.room.shapeType !== "rect";
    polygonControls.hidden = state.room.shapeType !== "polygon";
    renderRoomFrame();
    renderPlacements();
    renderPolygonPointsList();
  });

  deleteRoomBtn.addEventListener("click", () => {
    const name = savedRoomsSelect.value;
    if (!name) {
      alert("削除する部屋を選択してください");
      return;
    }
    if (!confirm(`「${name}」を削除しますか？`)) return;
    const rooms = loadRoomsIndex();
    delete rooms[name];
    saveRoomsIndex(rooms);
    refreshSavedRoomsSelect();
  });

  newRoomBtn.addEventListener("click", () => {
    state = { room: { shapeType: "rect", points: rectPoints(400, 300) }, placements: [] };
    selectedPlacementId = null;
    roomNameInput.value = "";
    savedRoomsSelect.value = "";
    roomShapeTypeSelect.value = "rect";
    rectControls.hidden = false;
    polygonControls.hidden = true;
    renderRoomFrame();
    renderPlacements();
    renderPolygonPointsList();
  });

  // ---------- Init ----------

  function init() {
    loadCatalog();
    if (catalog.length === 0) {
      catalog = [
        { id: uid(), name: "ベッド", width: 140, depth: 200, color: "#8ec6ff" },
        { id: uid(), name: "ソファ", width: 180, depth: 80, color: "#ffb37a" },
        { id: uid(), name: "テーブル", width: 90, depth: 90, color: "#c9a3ff" },
      ];
      saveCatalog();
    }
    refreshSavedRoomsSelect();
    renderFurnitureList();
    renderRoomFrame();
    renderPlacements();
    renderPolygonPointsList();
  }

  init();
})();
