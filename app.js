(() => {
  "use strict";

  const STORAGE_KEY_ROOMS = "furnitureSim.rooms";
  const STORAGE_KEY_CATALOG = "furnitureSim.catalog";

  const MAX_ROOM_PX_WIDTH = 900;
  const MAX_ROOM_PX_HEIGHT = 620;

  const roomEl = document.getElementById("room");
  const roomDimsLabel = document.getElementById("room-dims-label");
  const roomWidthInput = document.getElementById("room-width");
  const roomDepthInput = document.getElementById("room-depth");
  const applyRoomSizeBtn = document.getElementById("apply-room-size-btn");

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
  const rotateBtn = document.getElementById("rotate-btn");
  const deletePlacementBtn = document.getElementById("delete-placement-btn");

  let state = {
    room: { width: 400, depth: 300 },
    placements: [], // {id, furnitureId, x, y, rotation}
  };

  let catalog = []; // {id, name, width, depth, color}
  let scale = 1; // px per cm
  let selectedPlacementId = null;
  let idCounter = 1;

  function uid() {
    return "id" + Date.now().toString(36) + (idCounter++).toString(36);
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

  // ---------- Rendering ----------

  function computeScale() {
    const scaleX = MAX_ROOM_PX_WIDTH / state.room.width;
    const scaleY = MAX_ROOM_PX_HEIGHT / state.room.depth;
    scale = Math.min(scaleX, scaleY, 4);
  }

  function renderRoomFrame() {
    computeScale();
    roomEl.style.width = state.room.width * scale + "px";
    roomEl.style.height = state.room.depth * scale + "px";
    roomDimsLabel.textContent = `${state.room.width}cm × ${state.room.depth}cm`;
    roomWidthInput.value = state.room.width;
    roomDepthInput.value = state.room.depth;
  }

  function findFurniture(furnitureId) {
    return catalog.find((f) => f.id === furnitureId);
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

      const rotated = p.rotation % 180 !== 0;
      const wCm = rotated ? furn.depth : furn.width;
      const dCm = rotated ? furn.width : furn.depth;

      el.style.width = wCm * scale + "px";
      el.style.height = dCm * scale + "px";
      el.style.left = p.x * scale + "px";
      el.style.top = p.y * scale + "px";
      el.style.background = furn.color;
      el.textContent = furn.name;

      el.addEventListener("pointerdown", (e) => startDragPlacement(e, p.id));
      roomEl.appendChild(el);
    });
    updateSelectedToolsVisibility();
  }

  function updateSelectedToolsVisibility() {
    selectedTools.hidden = selectedPlacementId === null;
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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Placement logic ----------

  function addPlacementAt(furnitureId, xCm, yCm) {
    const furn = findFurniture(furnitureId);
    if (!furn) return;
    const clampedX = clamp(xCm, 0, Math.max(0, state.room.width - furn.width));
    const clampedY = clamp(yCm, 0, Math.max(0, state.room.depth - furn.depth));
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
    const x = (state.room.width - furn.width) / 2;
    const y = (state.room.depth - furn.depth) / 2;
    addPlacementAt(furnitureId, x, y);
  }

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function selectPlacement(id) {
    selectedPlacementId = id;
    renderPlacements();
  }

  function startDragPlacement(e, placementId) {
    e.preventDefault();
    selectPlacement(placementId);
    const placement = state.placements.find((p) => p.id === placementId);
    if (!placement) return;
    const furn = findFurniture(placement.furnitureId);
    const rotated = placement.rotation % 180 !== 0;
    const wCm = rotated ? furn.depth : furn.width;
    const dCm = rotated ? furn.width : furn.depth;

    const roomRect = roomEl.getBoundingClientRect();
    const startPointerX = e.clientX;
    const startPointerY = e.clientY;
    const startX = placement.x;
    const startY = placement.y;

    function onMove(ev) {
      const dxCm = (ev.clientX - startPointerX) / scale;
      const dyCm = (ev.clientY - startPointerY) / scale;
      placement.x = clamp(startX + dxCm, 0, Math.max(0, state.room.width - wCm));
      placement.y = clamp(startY + dyCm, 0, Math.max(0, state.room.depth - dCm));
      renderPlacements();
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    void roomRect;
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
    const xCm = (e.clientX - rect.left) / scale - furn.width / 2;
    const yCm = (e.clientY - rect.top) / scale - furn.depth / 2;
    addPlacementAt(furnitureId, xCm, yCm);
  });

  roomEl.addEventListener("pointerdown", (e) => {
    if (e.target === roomEl) {
      selectPlacement(null);
    }
  });

  rotateBtn.addEventListener("click", () => {
    if (!selectedPlacementId) return;
    const placement = state.placements.find((p) => p.id === selectedPlacementId);
    if (!placement) return;
    placement.rotation = (placement.rotation + 90) % 360;
    const furn = findFurniture(placement.furnitureId);
    const rotated = placement.rotation % 180 !== 0;
    const wCm = rotated ? furn.depth : furn.width;
    const dCm = rotated ? furn.width : furn.depth;
    placement.x = clamp(placement.x, 0, Math.max(0, state.room.width - wCm));
    placement.y = clamp(placement.y, 0, Math.max(0, state.room.depth - dCm));
    renderPlacements();
  });

  deletePlacementBtn.addEventListener("click", () => {
    if (!selectedPlacementId) return;
    state.placements = state.placements.filter((p) => p.id !== selectedPlacementId);
    selectedPlacementId = null;
    renderPlacements();
  });

  // ---------- Room size ----------

  applyRoomSizeBtn.addEventListener("click", () => {
    const w = Number(roomWidthInput.value);
    const d = Number(roomDepthInput.value);
    if (!(w > 0) || !(d > 0)) {
      alert("正しい部屋の寸法を入力してください");
      return;
    }
    state.room.width = w;
    state.room.depth = d;
    state.placements.forEach((p) => {
      const furn = findFurniture(p.furnitureId);
      if (!furn) return;
      const rotated = p.rotation % 180 !== 0;
      const wCm = rotated ? furn.depth : furn.width;
      const dCm = rotated ? furn.width : furn.depth;
      p.x = clamp(p.x, 0, Math.max(0, state.room.width - wCm));
      p.y = clamp(p.y, 0, Math.max(0, state.room.depth - dCm));
    });
    renderRoomFrame();
    renderPlacements();
  });

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
    state.room = { ...data.room };
    state.placements = (data.placements || []).map((p) => ({ ...p }));
    selectedPlacementId = null;
    roomNameInput.value = name;
    renderRoomFrame();
    renderPlacements();
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
    state = { room: { width: 400, depth: 300 }, placements: [] };
    selectedPlacementId = null;
    roomNameInput.value = "";
    savedRoomsSelect.value = "";
    renderRoomFrame();
    renderPlacements();
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
  }

  init();
})();
