// ==== DEBUG BANNER ====
console.log("TKB app.js loaded: 2025-08-16 13:54:37");
window.__TKB_DEBUG__ = true;
(() => {
  // ===== CONFIG =====
  // ==== Account namespacing for storage keys ====
  const USERNAME = localStorage.getItem("auth_username") || "guest";
  const DEVICE_ID = localStorage.getItem("auth_device_id") || "unknown";
  const NS = (k) => `${USERNAME}::${k}`;
  const STORAGE_KEY = NS("tkb_pro_full_v7");
  const BACKUP_KEY = NS("tkb_pro_full_v7__backups");
  // ==== One-time migration from legacy (non-namespaced) keys ====
  (function migrateLegacy() {
    try {
      const legacyMain = localStorage.getItem("tkb_pro_full_v7");
      const legacyBk = localStorage.getItem("tkb_pro_full_v7__backups");
      const legacyLib = localStorage.getItem("tkb_archives_v1");
      const legacyCur = localStorage.getItem("tkb_archives_v1__cur");
      const hasNew = !!localStorage.getItem(STORAGE_KEY);
      if (!hasNew && legacyMain) {
        localStorage.setItem(STORAGE_KEY, legacyMain);
        if (legacyBk) localStorage.setItem(BACKUP_KEY, legacyBk);
        if (legacyLib) localStorage.setItem(LIB_KEY, legacyLib);
        if (legacyCur) localStorage.setItem(CUR_ID_KEY, legacyCur);
        console.log(
          "[MIGRATE] Copied legacy data into",
          USERNAME,
          "namespace."
        );
      }
    } catch (e) {
      console.warn("Migration failed:", e && e.message);
    }
  })();
  // ==== Cloud Sync (Google Apps Script) ====
  // NOTE: Keep these the same values as in form.js
  const API_URL =
    typeof window !== "undefined" && window.API_URL
      ? window.API_URL
      : "https://script.google.com/macros/s/AKfycbxwTfNX39wC26fw5imA8v...3TZS5fv0pJwsQpOQQEoJZYxRTd9G0yGxkA/exec";
  const API_SECRET =
    typeof window !== "undefined" && window.API_SECRET
      ? window.API_SECRET
      : "chuoi-bi-mat_cua-ban";

  const DEVICE_TYPE = (() => {
    const ua = navigator.userAgent.toLowerCase();
    if (/android|iphone|ipad|mobile/.test(ua)) return "mobile";
    if (/mac os x|macintosh/.test(ua)) return "mac";
    if (/windows/.test(ua)) return "windows";
    return "web";
  })();

  async function cloudRequest(payload) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          Accept: "application/json, text/plain, */*",
        },
        body: JSON.stringify({ secret: API_SECRET, ...payload }),
        credentials: "omit",
      });
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {}
      if (!res.ok)
        throw new Error(
          (data && (data.message || data.error)) || `HTTP ${res.status}`
        );
      return data || { ok: false };
    } catch (e) {
      console.warn("Cloud request failed:", e && e.message);
      return { ok: false, error: String(e && e.message) };
    }
  }

  let cloudTimer = null;
  function queueCloudSave() {
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(async () => {
      const state = getState();
      const payload = {
        action: "save_data",
        username: USERNAME,
        deviceId: DEVICE_ID,
        deviceType: DEVICE_TYPE,
        data: JSON.stringify(state),
        title: localStorage.getItem(STORAGE_KEY + "__title") || "",
        // archives: localStorage.getItem(LIB_KEY) || "[]", // enable if you also sync the vault
      };
      const rsp = await cloudRequest(payload);
      if (rsp && rsp.ok) {
        try {
          localStorage.setItem(NS("tkb_cloud_updatedAt"), String(Date.now()));
        } catch {}
      }
    }, 700);
  }

  // Flush when closing the tab (best-effort, non-blocking)
  window.addEventListener("beforeunload", () => {
    try {
      const payload = {
        secret: API_SECRET,
        action: "save_data",
        username: USERNAME,
        deviceId: DEVICE_ID,
        deviceType: DEVICE_TYPE,
        data: JSON.stringify(getState()),
        title: localStorage.getItem(STORAGE_KEY + "__title") || "",
      };
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], {
          type: "text/plain;charset=utf-8",
        });
        navigator.sendBeacon(API_URL, blob);
      }
    } catch {}
  });

  const MAX_BACKUPS = 20;
  let HEADERS = [
    "Thứ 2",
    "Thứ 3",
    "Thứ 4",
    "Thứ 5",
    "Thứ 6",
    "Thứ 7",
    "Chủ nhật",
  ];
  let COUNTS = { am: 5, pm: 5 };

  // ===== ARCHIVE (THƯ VIỆN LƯU TRỮ) =====
  const LIB_KEY = NS("tkb_archives_v1"); // mảng {id,title,ts,state}
  const CUR_ID_KEY = NS("tkb_archives_v1__cur"); // id bản đang mở
  const EMPTY_TITLE = "..."; // TIÊU ĐỀ MẶC ĐỊNH KHI TRỐNG

  // (MỚI) Giá trị đặc biệt cho option "Xoá hết"
  const DELETE_ALL_VALUE = "__DELETE_ALL__";

  function getLibrary() {
    try {
      return JSON.parse(localStorage.getItem(LIB_KEY)) || [];
    } catch {
      return [];
    }
  }
  function setLibrary(list) {
    localStorage.setItem(LIB_KEY, JSON.stringify(list || []));
  }
  function getCurrentArchiveId() {
    return localStorage.getItem(CUR_ID_KEY) || "";
  }
  function setCurrentArchiveId(id) {
    if (id) localStorage.setItem(CUR_ID_KEY, id);
    else localStorage.removeItem(CUR_ID_KEY);
  }

  // --- helper: reset dropdown về placeholder khi rỗng ---
  function resetVaultToPlaceholder() {
    const sel = document.getElementById("vaultSelect");
    if (!sel) return;

    // Luôn có placeholder + separator + "Xoá hết"
    sel.innerHTML = "";
    sel.appendChild(new Option("— Chọn bảng đã lưu —", ""));

    // separator
    const sep = document.createElement("option");
    sep.disabled = true;
    sep.textContent = "──────────";
    sel.appendChild(sep);

    // option xoá hết
    const delAll = document.createElement("option");
    delAll.value = DELETE_ALL_VALUE;
    delAll.textContent = "🗑️ Xoá hết bảng lưu";
    sel.appendChild(delAll);

    sel.value = "";
    setCurrentArchiveId("");
    updateVaultTitleAttr && updateVaultTitleAttr();
  }

  function archiveAdd(state, title) {
    const normalizedTitle = (title || "").trim() || EMPTY_TITLE;
    const rec = {
      id: String(Date.now()),
      title: normalizedTitle,
      ts: Date.now(),
      state,
    };
    const list = getLibrary();
    list.unshift(rec);
    setLibrary(list);
    populateVaultDropdown();
    return rec.id;
  }

  function archiveRemove(id) {
    const list = getLibrary().filter((x) => x.id !== id);
    setLibrary(list);
    if (getCurrentArchiveId() === id) setCurrentArchiveId("");
    if (list.length === 0) {
      resetVaultToPlaceholder(); // rỗng → về placeholder (vẫn có mục xoá tất cả)
    } else {
      populateVaultDropdown();
    }
  }

  // --- rename đúng 1 bản theo id, không đụng bản khác ---
  function archiveRename(id, newTitle) {
    const list = getLibrary();
    const i = list.findIndex((x) => x.id === id);
    if (i !== -1) {
      list[i].title = (newTitle || "").trim() || EMPTY_TITLE;
      list[i].ts = Date.now();
      setLibrary(list);
      populateVaultDropdown();
    }
  }

  function populateVaultDropdown() {
    const sel = document.getElementById("vaultSelect");
    if (!sel) return;

    // MIGRATE NHẸ: đồng bộ các bản cũ về "..."
    const migrated = getLibrary().map((r) => {
      const t = (r?.title || "").trim();
      if (!t || t === "." || t === "Không tiêu đề") {
        return { ...r, title: EMPTY_TITLE };
      }
      return r;
    });
    setLibrary(migrated);

    const cur = sel.value;

    // Build lại toàn bộ: placeholder + (danh sách nếu có) + separator + "Xoá hết"
    sel.innerHTML = "";
    sel.appendChild(new Option("— Chọn bảng đã lưu —", ""));

    migrated.forEach((rec) => {
      const opt = document.createElement("option");
      opt.value = rec.id;
      opt.textContent = rec.title || EMPTY_TITLE;
      sel.appendChild(opt);
    });

    // separator
    const sep = document.createElement("option");
    sep.disabled = true;
    sep.textContent = "──────────";
    sel.appendChild(sep);

    // option xoá hết
    const delAll = document.createElement("option");
    delAll.value = DELETE_ALL_VALUE;
    delAll.textContent = "🗑️ Xoá hết bảng lưu";
    sel.appendChild(delAll);

    if (cur && migrated.some((x) => x.id === cur)) sel.value = cur;
    updateVaultTitleAttr && updateVaultTitleAttr();
  }

  // gọi sau populateVaultDropdown()
  const vault = document.getElementById("vaultSelect");
  function updateVaultTitleAttr() {
    const t = vault.options[vault.selectedIndex]?.text || "";
    vault.title = t; // hover để xem full title
  }

  // Bắt sự kiện change để xử lý mục đặc biệt
  vault.addEventListener("change", () => {
    const v = vault.value;
    if (v === DELETE_ALL_VALUE) {
      // Chặn cập nhật title/tooltip cho option đặc biệt
      // Xác nhận xoá sạch thư viện
      if (
        confirm(
          "Bạn chắc chắn muốn XOÁ TẤT CẢ bảng đã lưu? Hành động này không thể hoàn tác."
        )
      ) {
        setLibrary([]); // xoá hết
        setCurrentArchiveId(""); // bỏ id đang mở
        resetVaultToPlaceholder(); // dựng lại dropdown với mục đặc biệt
        setStatus && setStatus("Đã xoá hết bảng lưu");
      } else {
        // nếu huỷ, về placeholder để tránh giữ state chọn vào option đặc biệt
        resetVaultToPlaceholder();
      }
      return;
    }
    updateVaultTitleAttr();
  });
  updateVaultTitleAttr();

  /**
   * Tạo mới hoặc cập nhật tên CHỈ THEO ID HIỆN TẠI, KHÔNG gộp/truy theo title:
   * - Nếu chưa có id -> tạo mới (title rỗng thì = "…")
   * - Nếu đã có id -> chỉ rename đúng bản đang mở (title rỗng thì = "…")
   */
  function autoCreateOrUpdateByTitle(title) {
    const raw = (title || "").trim();
    const t = raw || EMPTY_TITLE;

    let id = getCurrentArchiveId();
    if (!id) {
      id = archiveAdd(getState(), t); // tạo một bản mới
      setCurrentArchiveId(id);
      if (typeof archiveUpdate === "function") {
        archiveUpdate(id, getState(), t); // nếu có hàm này thì cập nhật state
      }
    } else {
      archiveRename(id, t); // chỉ rename đúng bản đang mở
      if (typeof archiveUpdate === "function") {
        archiveUpdate(id, getState(), t); // giữ nhịp autosave state nếu cần
      }
    }
    populateVaultDropdown();
  }

  // ===== TITLE EDIT =====
  const titleBtn = document.getElementById("titleBtn");
  const titleText = document.getElementById("titleText");

  // khóa placeholder: lưu/persist qua localStorage
  const PH_LOCK_KEY = STORAGE_KEY + "__title_ph_locked";

  // Helpers an toàn cho placeholder (không side-effects lưu)
  function showTitlePlaceholder() {
    if (!titleBtn || !titleText) return;
    titleText.textContent = ""; // rỗng thật sự
    titleBtn.classList.remove("ph-locked"); // mở khoá
    localStorage.removeItem(PH_LOCK_KEY); // bỏ cờ khoá
    titleBtn.setAttribute("data-ph", "Nhập tiêu đề ..."); // hiện placeholder
  }

  function clearTitleCache() {
    localStorage.removeItem(STORAGE_KEY + "__title"); // xoá cache tiêu đề
    localStorage.removeItem(PH_LOCK_KEY); // xoá cờ khoá
  }

  // --- Helper: đảm bảo title rỗng thật sự để placeholder hiện ngay (safe)
  function ensureTitleEmptyAndPlaceholder() {
    if (!titleText) return;
    titleText.innerHTML = "";
    titleText.textContent = "";
    try {
      titleText.setAttribute("data-placeholder", "Nhập tiêu đề ...");
    } catch (e) {}
    // chỉ xử lý UI, không lưu/bắt autosave để tránh ghi tiêu đề rỗng
    showTitlePlaceholder();
    if (typeof lockTitleMinHeight === "function") lockTitleMinHeight();
    void titleText.offsetHeight; // force reflow
  }

  // Đảm bảo placeholder đúng yêu cầu
  try {
    titleText?.setAttribute("data-placeholder", "Nhập tiêu đề ...");
  } catch (e) {}

  // Đặt placeholder chuẩn cho vùng tiêu đề (init)
  if (titleText) {
    try {
      titleText.setAttribute("data-placeholder", "Nhập tiêu đề ...");
    } catch (e) {}
  }

  // Xoá nhanh tiêu đề bằng phím Delete và hiện lại placeholder
  function isAllTitleSelected() {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const r = sel.getRangeAt(0);
    if (!titleText) return false;
    // nếu vùng chọn bao trọn nội dung tiêu đề
    return (
      r &&
      (r.startContainer === titleText ||
        titleText.contains(r.startContainer)) &&
      (r.endContainer === titleText || titleText.contains(r.endContainer)) &&
      r.toString().trim().length >= (titleText.textContent || "").trim().length
    );
  }

  titleText?.addEventListener("keydown", (e) => {
    if (e.key === "Delete") {
      const hasText = (titleText.textContent || "").length > 0;
      // Nếu đã chọn hết, hoặc nội dung còn rất ít (<=1 ký tự), hoặc giữ Ctrl/Cmd để "xoá sạch"
      if (
        isAllTitleSelected() ||
        e.ctrlKey ||
        e.metaKey ||
        (hasText && (titleText.textContent || "").trim().length <= 1)
      ) {
        e.preventDefault();
        clearTitleCache();
        ensureTitleEmptyAndPlaceholder(); // KHÔNG saveTitle tại đây
        if (typeof syncTitlePlaceholder === "function") syncTitlePlaceholder();
        if (typeof lockTitleMinHeight === "function") lockTitleMinHeight();
      }
    }
  });

  // --- Giữ vị trí dòng nhập tiêu đề, tránh bị "tụt xuống" khi xoá hết ---
  function lockTitleMinHeight() {
    if (!titleBtn) return;
    // Reset trước khi đo để tránh tăng dần
    titleBtn.style.minHeight = "";
    const h = Math.ceil(titleBtn.getBoundingClientRect().height);
    if (h > 0) titleBtn.style.minHeight = h + "px";
  }
  // Gọi lúc đầu
  requestAnimationFrame(lockTitleMinHeight);

  // --- Placeholder trên button + auto-fit một dòng ---
  function syncTitlePlaceholder() {
    // giữ vị trí placeholder ổn định
    lockTitleMinHeight();
    const has = !!titleText.textContent.trim();
    const locked = titleBtn.classList.contains("ph-locked");
    titleBtn.classList.toggle("has-text", has);

    // khi trống + không đang edit + không bị khóa -> hiện placeholder
    if (!has && !titleBtn.classList.contains("editing") && !locked) {
      titleBtn.setAttribute("data-ph", "Nhập tiêu đề ...");
    } else {
      titleBtn.removeAttribute("data-ph");
    }
  }

  // Khi trang vừa load xong, đặt placeholder nếu rỗng
  document.addEventListener("DOMContentLoaded", () => {
    if (!titleText.textContent.trim()) {
      showTitlePlaceholder();
    }
  });

  function autoFitTitleOneLine() {
    const MAX = 34; // cỡ tối đa
    const MIN = 14; // cỡ tối thiểu
    const SAFE = 12; // lề an toàn trước khi chạm hint

    if (!titleText.textContent.trim()) {
      titleText.style.removeProperty("font-size");
      return;
    }

    // bề rộng khả dụng = bề rộng nút - padding ngang - lề an toàn
    const btnStyle = window.getComputedStyle(titleBtn);
    const padX =
      parseFloat(btnStyle.paddingLeft) + parseFloat(btnStyle.paddingRight);
    const available = Math.max(
      0,
      Math.floor(titleBtn.clientWidth - padX - SAFE)
    );

    // phần tử đo với cùng font
    const meter = document.createElement("span");
    const textStyle = window.getComputedStyle(titleText);
    meter.style.visibility = "hidden";
    meter.style.whiteSpace = "nowrap";
    meter.style.fontFamily = textStyle.fontFamily;
    meter.style.fontWeight = textStyle.fontWeight;
    meter.style.letterSpacing = textStyle.letterSpacing;
    meter.textContent = titleText.textContent || "";
    document.body.appendChild(meter);

    // 1) nếu quá dài -> co xuống tới khi vừa hoặc chạm MIN
    let size = MAX;
    while (size > MIN) {
      meter.style.fontSize = size + "px";
      if (meter.offsetWidth <= available) break;
      size -= 1;
    }

    // 2) nếu còn thừa -> phóng lên dần tới khi vừa hoặc MAX
    while (size < MAX) {
      meter.style.fontSize = size + 1 + "px";
      if (meter.offsetWidth > available) break;
      size += 1;
    }

    document.body.removeChild(meter);
    titleText.style.fontSize = size + "px";
  }

  window.addEventListener("resize", autoFitTitleOneLine);

  // Click nút tiêu đề -> vào chế độ gõ (ẩn placeholder ngay)
  titleBtn.addEventListener("click", () => {
    titleBtn.classList.add("editing");
    titleBtn.removeAttribute("data-ph"); // ẩn placeholder tức thì
    titleText.contentEditable = "true";
    titleText.focus();
    placeCaretAtEnd(titleText);
  });

  // Gõ chữ -> auto-fit & cập nhật placeholder
  titleText.addEventListener("input", () => {
    autoFitTitleOneLine();
    syncTitlePlaceholder();
    onTitleTyping(); // chỉ autosave khi có text (xử lý trong onTitleTyping)
  });

  // Rời khỏi ô -> nếu có text thì lưu; nếu rỗng thì chỉ mở khóa + placeholder
  function debounce(fn, wait = 400) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), wait);
    };
  }

  // Auto-save tiêu đề ngay khi gõ, KHÔNG lưu nếu rỗng
  const onTitleTyping = debounce(() => {
    const t = titleText.textContent.trim();
    localStorage.setItem(STORAGE_KEY + "__title", t);

    if (!t) {
      // không tạo/xoá mục thư viện nếu đang gõ rỗng
      return;
    }

    const id = getCurrentArchiveId();
    if (!id && t) {
      // chưa có trong thư viện → thêm mới nhưng giữ nguyên state hiện tại
      const newId = archiveAdd(getState(), t || "Không tiêu đề");
      setCurrentArchiveId(newId);
    } else if (id) {
      // đã có → chỉ cập nhật tiêu đề
      const list = getLibrary();
      const rec = list.find((x) => x.id === id);
      if (rec) {
        rec.title = t;
        setLibrary(list);
      }
    }

    populateVaultDropdown();
    updateVaultTitleAttr();
  }, 350);

  titleText.addEventListener("blur", () => {
    titleText.contentEditable = "false";
    titleBtn.classList.remove("editing");

    const t = titleText.textContent.trim();
    if (t) {
      // có tiêu đề → lưu & giữ khoá
      saveTitle();
      autoFitTitleOneLine();
    } else {
      // rỗng → không lưu, mở khoá & hiện placeholder
      titleText.style.removeProperty("font-size");
      clearTitleCache();
      showTitlePlaceholder();
    }
    syncTitlePlaceholder();
  });

  // Tải tiêu đề từ localStorage
  function loadTitle() {
    const raw = localStorage.getItem(STORAGE_KEY + "__title") || "";
    const t = (raw || "").trim();

    if (t) {
      titleText.textContent = t;
      titleBtn.classList.add("ph-locked"); // có tiêu đề -> khoá placeholder
      localStorage.setItem(PH_LOCK_KEY, "1");
      titleBtn.removeAttribute("data-ph");
    } else {
      // KHÔNG có tiêu đề -> tuyệt đối không khoá; đảm bảo hiện placeholder
      showTitlePlaceholder();
    }
  }

  function saveTitle() {
    const t = titleText.textContent.trim();
    localStorage.setItem(STORAGE_KEY + "__title", t);

    const id = getCurrentArchiveId();
    if (!id) {
      // Chỉ tạo trong thư viện khi có tiêu đề rõ ràng
      if (t) {
        const newId = archiveAdd(getState(), t);
        setCurrentArchiveId(newId);
        populateVaultDropdown();
      }
    } else {
      // đã có mục đang mở → chỉ cập nhật tiêu đề
      const list = getLibrary();
      const rec = list.find((x) => x.id === id);
      if (rec && t) {
        rec.title = t;
        setLibrary(list);
        populateVaultDropdown();
      }
    }

    setStatus && setStatus("Đã lưu tiêu đề ✔️");
  }

  function placeCaretAtEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Enter: blur TRƯỚC rồi mới auto-fit, đồng thời KHÓA placeholder
  titleText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // nhấn Enter = xác nhận tiêu đề -> khóa placeholder
      titleBtn.classList.add("ph-locked");
      localStorage.setItem(PH_LOCK_KEY, "1");
      titleText.blur(); // thoát edit trước
      autoFitTitleOneLine(); // rồi mới đo & fit chính xác
      return;
    }
    if (e.key === " ") {
      const sel = window.getSelection?.();
      if (sel && sel.rangeCount && !sel.isCollapsed) {
        sel.collapseToEnd();
      }
    }
  });

  // Khởi tạo: load 1 lần, rồi fit + sync
  loadTitle();
  autoFitTitleOneLine();
  syncTitlePlaceholder();

  // ===== UNDO/REDO =====
  const HISTORY_LIMIT = 100;
  let UNDO = [],
    REDO = [],
    applyingHistory = false;
  function pushHistory(state) {
    if (applyingHistory) return;
    const snap = JSON.stringify(state),
      last = UNDO[UNDO.length - 1];
    if (last === snap) return;
    UNDO.push(snap);
    if (UNDO.length > HISTORY_LIMIT) UNDO.shift();
    REDO.length = 0;
  }
  const canUndo = () => UNDO.length > 1;
  const canRedo = () => REDO.length > 0;
  function undo() {
    if (!canUndo()) return;
    applyingHistory = true;
    const cur = UNDO.pop();
    REDO.push(cur);
    const prev = UNDO[UNDO.length - 1];
    const state = JSON.parse(prev);
    setState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    pushBackup(state, "Hoàn tác");
    setStatus("Hoàn tác (Ctrl+Z)");
    applyingHistory = false;
  }
  function redo() {
    if (!canRedo()) return;
    applyingHistory = true;
    const next = REDO.pop();
    UNDO.push(next);
    const state = JSON.parse(next);
    setState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    pushBackup(state, "Trở lại");
    setStatus("Làm lại (Ctrl+Shift+Z)");
    applyingHistory = false;
  }

  // ===== DOM =====
  const $ = (sel) => document.querySelector(sel);
  const thead = $("#thead"),
    tbody = $("#tbody"),
    statusEl = $("#status");
  const setStatus = (m) => {
    if (statusEl) statusEl.textContent = m;
  };

  // ===== TABLE BUILDERS =====
  function makeHeader() {
    const tr = document.createElement("tr");
    tr.appendChild(th("Tiết"));
    tr.appendChild(th("Giờ"));
    for (const d of HEADERS) tr.appendChild(th(d));
    thead.innerHTML = "";
    thead.appendChild(tr);
    function th(t) {
      const e = document.createElement("th");
      e.textContent = t;
      return e;
    }
  }
  function makeSectionRow(text) {
    const tr = document.createElement("tr");
    tr.className = "section-row";
    const td = document.createElement("td");
    td.colSpan = 2 + HEADERS.length;
    td.textContent = text;
    tr.appendChild(td);
    return tr;
  }
  function makePeriodRow(p, section) {
    const tr = document.createElement("tr");
    tr.dataset.section = section;
    tr.dataset.pindex = String(p);
    const c1 = document.createElement("th");
    c1.textContent = "Tiết " + p;
    tr.appendChild(c1);
    const time = document.createElement("td");
    time.contentEditable = "true";
    time.dataset.ph = "hh:mm–hh:mm";
    time.dataset.time = `${section}-${p}`;
    time.textContent = "";
    tr.appendChild(time);
    for (let d = 0; d < HEADERS.length; d++) {
      const td = document.createElement("td");
      td.contentEditable = "true";
      td.dataset.ph = "Nhập";
      td.dataset.cell = `${section}-${d}-${p}`;
      tr.appendChild(td);
    }
    return tr;
  }
  function buildTable() {
    // đảm bảo vùng tiêu đề không nhảy khi render bảng
    lockTitleMinHeight();
    makeHeader();
    tbody.innerHTML = "";
    tbody.appendChild(makeSectionRow("Buổi sáng"));
    for (let p = 1; p <= COUNTS.am; p++)
      tbody.appendChild(makePeriodRow(p, "am"));
    tbody.appendChild(makeSectionRow("Buổi chiều"));
    for (let p = 1; p <= COUNTS.pm; p++)
      tbody.appendChild(makePeriodRow(p, "pm"));
  }

  // ===== STATE =====
  function getState() {
    const state = {
      headers: [...HEADERS],
      counts: { ...COUNTS },
      times: { am: {}, pm: {} },
      cells: {},
    };
    for (const sec of ["am", "pm"]) {
      for (let p = 1; p <= COUNTS[sec]; p++) {
        const t = tbody.querySelector(`td[data-time="${sec}-${p}"]`);
        state.times[sec][p] = t ? t.textContent.trim() : "";
        for (let d = 0; d < HEADERS.length; d++) {
          const id = `${sec}-${d}-${p}`;
          const cell = tbody.querySelector(`td[data-cell="${id}"]`);
          state.cells[id] = cell ? cell.textContent.trim() : "";
        }
      }
    }
    return state;
  }
  function setState(state) {
    HEADERS = state?.headers?.length ? [...state.headers] : HEADERS;
    COUNTS = state?.counts ? { ...state.counts } : COUNTS;
    buildTable();
    requestAnimationFrame(() => {
      for (const sec of ["am", "pm"]) {
        for (let p = 1; p <= COUNTS[sec]; p++) {
          const t = tbody.querySelector(`td[data-time="${sec}-${p}"]`);
          if (t) t.textContent = state?.times?.[sec]?.[p] || "";
          for (let d = 0; d < HEADERS.length; d++) {
            const id = `${sec}-${d}-${p}`;
            const td = tbody.querySelector(`td[data-cell="${id}"]`);
            if (td) td.textContent = state?.cells?.[id] || "";
          }
        }
      }
    });
  }

  // ===== BACKUP =====
  function getBackups() {
    try {
      return JSON.parse(localStorage.getItem(BACKUP_KEY)) || [];
    } catch {
      return [];
    }
  }
  function pushBackup(state, label) {
    const backups = getBackups();
    const payload = { ts: Date.now(), label: label || "Tự lưu", state };
    const last = backups[0];
    const same = last && JSON.stringify(last.state) === JSON.stringify(state);
    if (same) return;
    backups.unshift(payload);
    while (backups.length > MAX_BACKUPS) backups.pop();
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
  }
  function showBackupPicker() {
    const backups = getBackups();
    if (!backups.length) {
      alert("Chưa có bản lưu nào để khôi phục.");
      return null;
    }
    const lines = backups
      .map((b, i) => `[${i}] ${b.label || "Tự lưu"}`)
      .join("\n");
    const ans = prompt(
      "Chọn số thứ tự bản lưu để khôi phục:\n" + lines + "\n\nMẹo: 0 = mới nhất"
    );
    if (ans === null) return null;
    const idx = parseInt(ans, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= backups.length) {
      alert("Số không hợp lệ.");
      return null;
    }
    return backups[idx];
  }
  function restoreFromBackup(backup) {
    if (!backup?.state) return;
    applyingHistory = true;
    setState(backup.state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(backup.state));
    pushBackup(backup.state, "Khôi phục");
    UNDO.push(JSON.stringify(backup.state));
    if (UNDO.length > HISTORY_LIMIT) UNDO.shift();
    REDO.length = 0;
    setStatus(
      "Đã khôi phục từ bản lưu: " + new Date(backup.ts).toLocaleString("vi-VN")
    );
    applyingHistory = false;
  }

  // ===== SAVE / LOAD =====
  let saveTimer = null,
    pendingLabel = null;
  const queueSave = (label) => {
    clearTimeout(saveTimer);
    pendingLabel = label || pendingLabel;
    saveTimer = setTimeout(() => {
      const l = pendingLabel;
      pendingLabel = null;
      save(l);
    }, 250);
  };
  function save(label) {
    const state = getState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    pushBackup(state, label);
    pushHistory(state);
    setStatus("Đã lưu lúc " + new Date().toLocaleTimeString("vi-VN"));
    const id = getCurrentArchiveId();
    if (id) {
      const list = getLibrary();
      const idx = list.findIndex((x) => x.id === id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          state,
          ts: Date.now(),
          title:
            localStorage.getItem(STORAGE_KEY + "__title") || list[idx].title,
        };
        setLibrary(list);
        populateVaultDropdown();
      }
    }

    try {
      queueCloudSave();
    } catch {}
  }
  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const state = JSON.parse(raw);
        setState(state);
        pushBackup(getState(), "Tải dữ liệu");
        UNDO = [JSON.stringify(getState())];
        REDO = [];
        setStatus("Đã tải ✔️");
        return;
      } catch {}
    }
    buildTable();
    const fresh = getState();
    pushBackup(fresh, "Tạo mới");
    UNDO = [JSON.stringify(fresh)];
    REDO = [];
    setStatus("Tạo mới ✨");
    // [Patch] Auto-save the initial fresh table to localStorage so it persists immediately.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    setStatus("Tạo mới ✨ (đã tự lưu)");
    ensureTitleEmptyAndPlaceholder();
  }

  // ===== TIME MASK (giữ caret) =====
  const TIME_SEP = "–";
  function clamp(n, min, max) {
    n = Number.isFinite(+n) ? +n : 0;
    return Math.min(Math.max(n, min), max);
  }
  function fmt2(n) {
    n = parseInt(n || 0, 10);
    if (Number.isNaN(n)) n = 0;
    return String(n).padStart(2, "0");
  }
  function digitsOnly(s) {
    return (s || "").normalize("NFKC").replace(/[^\d]/g, "").slice(0, 8);
  }
  function humanizeLive(d) {
    if (!d) return "";
    const HH1 = d.slice(0, 2),
      MM1 = d.slice(2, 4),
      HH2 = d.slice(4, 6),
      MM2 = d.slice(6, 8);
    if (d.length <= 2) return HH1;
    if (d.length === 3) return `${fmt2(clamp(HH1, 0, 23))}:${MM1[0]}`;
    if (d.length === 4)
      return `${fmt2(clamp(HH1, 0, 23))}:${fmt2(clamp(MM1, 0, 59))}`;
    if (d.length === 5)
      return `${fmt2(clamp(HH1, 0, 23))}:${fmt2(clamp(MM1, 0, 59))}${TIME_SEP}${
        HH2[0]
      }`;
    if (d.length === 6)
      return `${fmt2(clamp(HH1, 0, 23))}:${fmt2(
        clamp(MM1, 0, 59)
      )}${TIME_SEP}${fmt2(clamp(HH2, 0, 23))}`;
    if (d.length === 7)
      return `${fmt2(clamp(HH1, 0, 23))}:${fmt2(
        clamp(MM1, 0, 59)
      )}${TIME_SEP}${fmt2(clamp(HH2, 0, 23))}:${MM2[0]}`;
    return `${fmt2(clamp(HH1, 0, 23))}:${fmt2(
      clamp(MM1, 0, 59)
    )}${TIME_SEP}${fmt2(clamp(HH2, 0, 23))}:${fmt2(clamp(MM2, 0, 59))}`;
  }
  function countDigitsIn(s) {
    return (s.match(/\d/g) || []).length;
  }
  function digitIndexFromCaret(text, caret) {
    return countDigitsIn(text.slice(0, caret));
  }
  function caretFromDigitIndex(text, dIdx) {
    if (dIdx <= 0) return 0;
    let seen = 0;
    for (let i = 0; i < text.length; i++) {
      if (/\d/.test(text[i])) seen++;
      if (seen >= dIdx) return i + 1;
    }
    return text.length;
  }
  function getCaretOffset(el) {
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return 0;
    const r0 = sel.getRangeAt(0);
    const range = r0.cloneRange();
    range.selectNodeContents(el);
    range.setEnd(r0.endContainer, r0.endOffset);
    return range.toString().length;
  }
  function setCaretOffset(el, offset) {
    const range = document.createRange(),
      sel = getSelection();
    let cur = 0;
    function walk(n) {
      if (n.nodeType === Node.TEXT_NODE) {
        const next = cur + n.textContent.length;
        if (offset <= next) {
          range.setStart(n, offset - cur);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          throw 0;
        }
        cur = next;
      } else {
        for (const c of n.childNodes) walk(c);
      }
    }
    try {
      walk(el);
    } catch {}
  }
  function clampDigitIdx(el, dIdx) {
    const max = countDigitsIn(el.textContent);
    return Math.max(0, Math.min(dIdx, max));
  }
  function snapCaretToNearestDigit(el) {
    const text = el.textContent,
      caret = getCaretOffset(el);
    const diLeft = digitIndexFromCaret(text, caret);
    const prevPos = caretFromDigitIndex(text, diLeft);
    const nextPos = caretFromDigitIndex(
      text,
      Math.min(diLeft + 1, countDigitsIn(text))
    );
    const targetDI =
      Math.abs(caret - prevPos) <= Math.abs(nextPos - caret)
        ? diLeft
        : Math.min(diLeft + 1, countDigitsIn(text));
    setCaretOffset(el, caretFromDigitIndex(text, targetDI));
  }
  function reformatCellKeepingCaret(el) {
    const caretAfterDom = getCaretOffset(el);
    const afterDigitIdx = digitIndexFromCaret(el.textContent, caretAfterDom);
    let d = digitsOnly(el.textContent);
    if (d.length > 8) d = d.slice(0, 8);
    const formatted = humanizeLive(d);
    el.textContent = formatted;
    const newCaret = caretFromDigitIndex(
      formatted,
      Math.min(afterDigitIdx, d.length)
    );
    setCaretOffset(el, newCaret);
    el.dataset.prevDigits = d;
  }

  // ===== EDIT EVENTS =====
  tbody.addEventListener("input", (e) => {
    let label = null;
    if (e.target.matches('td[contenteditable="true"][data-time]')) {
      reformatCellKeepingCaret(e.target);
      const [sec, p] = (e.target.dataset.time || "").split("-");
      const secName = sec === "am" ? "sáng" : "chiều";
      label = `Sửa giờ (Tiết ${p} ${secName})`;
    }
    if (e.target.matches('td[contenteditable="true"][data-cell]')) {
      const [sec, d, p] = (e.target.dataset.cell || "").split("-");
      const dayName = HEADERS[+d] || `Cột ${+d + 1}`;
      label = `Sửa nội dung (${dayName}, Tiết ${p})`;
    }
    queueSave(label);
  });

  // Bắt click/focus cho mọi ô; ô Giờ sẽ bám digit gần nhất
  tbody.addEventListener("click", (e) => {
    const td = e.target.closest('td[contenteditable="true"]');
    if (!td) return;
    setActiveCell(td, { preserveCaret: true });
    if (td.hasAttribute("data-time"))
      requestAnimationFrame(() => snapCaretToNearestDigit(td));
  });
  tbody.addEventListener("focusin", (e) => {
    const td = e.target.closest('td[contenteditable="true"]');
    if (!td) return;
    setActiveCell(td, { preserveCaret: true });
    if (td.hasAttribute("data-time"))
      requestAnimationFrame(() => snapCaretToNearestDigit(td));
  });

  tbody.addEventListener("keydown", (e) => {
    if (!e.target.matches('td[contenteditable="true"]')) return;

    // Ô GIỜ
    if (e.target.hasAttribute("data-time")) {
      const el = e.target;
      const text = el.textContent;
      const di = digitIndexFromCaret(text, getCaretOffset(el));
      const maxDI = countDigitsIn(text);
      const allowedNav = [
        "Backspace",
        "Delete",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Tab",
        "Enter",
        "Home",
        "End",
      ];
      if (
        !(
          allowedNav.includes(e.key) ||
          e.ctrlKey ||
          e.metaKey ||
          e.key === ":" ||
          e.key === "-" ||
          e.key === "–" ||
          /^\d$/.test(e.key)
        )
      ) {
        e.preventDefault();
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setCaretOffset(el, caretFromDigitIndex(text, 0));
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setCaretOffset(el, caretFromDigitIndex(text, maxDI));
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (di <= 0) {
          moveCell("left");
        } else {
          const t = clampDigitIdx(el, di - 1);
          setCaretOffset(el, caretFromDigitIndex(text, t));
        }
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (di >= maxDI) {
          moveCell("right");
        } else {
          const t = clampDigitIdx(el, di + 1);
          setCaretOffset(el, caretFromDigitIndex(text, t));
        }
        return;
      }
      if (e.key === "Enter" && !e.ctrlKey) {
        e.preventDefault();
        moveCell(e.shiftKey ? "up" : "down");
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        moveCell(e.shiftKey ? "left" : "right");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveCell("up");
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveCell("down");
        return;
      }
      return;
    }

    // Ô THƯỜNG
    if (e.key === "Enter" && !e.ctrlKey) {
      e.preventDefault();
      moveCell(e.shiftKey ? "up" : "down");
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      moveCell(e.shiftKey ? "left" : "right");
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const el = e.target;
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) return; // đang bôi đen -> để mặc định
      const caret = getCaretOffset(el),
        len = (el.textContent || "").length;
      if (e.key === "ArrowLeft" && caret === 0) {
        e.preventDefault();
        moveCell("left");
      } else if (e.key === "ArrowRight" && caret === len) {
        e.preventDefault();
        moveCell("right");
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveCell("up");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveCell("down");
      return;
    }
  });

  // PASTE vào ô thời gian
  tbody.addEventListener("paste", (e) => {
    if (!e.target.matches('td[contenteditable="true"][data-time]')) return;
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData("text") || "";
    const only = (t || "").normalize("NFKC").replace(/[^\d]/g, "").slice(0, 8);
    const el = e.target;
    const caret = getCaretOffset(el);
    const di = digitIndexFromCaret(el.textContent, caret);
    const cur = (el.textContent || "").replace(/[^\d]/g, "").slice(0, 8);
    const left = cur.slice(0, di),
      right = cur.slice(di);
    const merged = (left + only + right).slice(0, 8);
    el.textContent = humanizeLive(merged);
    const newCaret = caretFromDigitIndex(
      el.textContent,
      Math.min(left.length + only.length, merged.length)
    );
    setCaretOffset(el, newCaret);
    el.dataset.prevDigits = merged;
    const [sec, p] = (el.dataset.time || "").split("-");
    const secName = sec === "am" ? "sáng" : "chiều";
    queueSave(`Sửa giờ (Tiết ${p} ${secName})`);
  });

  // ===== ROW HELPERS (smart) =====
  function renumberSection(section) {
    const rows = tbody.querySelectorAll(`tr[data-section="${section}"]`);
    rows.forEach((tr, i) => {
      const p = i + 1;
      tr.dataset.pindex = p;
      tr.querySelector("th").textContent = "Tiết " + p;
      const time = tr.querySelector("td[data-time]");
      if (time) time.dataset.time = `${section}-${p}`;
      tr.querySelectorAll("td[data-cell]").forEach((td, idx) => {
        td.dataset.cell = `${section}-${idx}-${p}`;
      });
    });
  }

  // NAV & ACTIVE CELL
  let currentCell = null;
  function setActiveCell(td, { preserveCaret = false } = {}) {
    if (currentCell && currentCell !== td)
      currentCell.classList.remove("is-active");
    currentCell = td;
    if (td) {
      td.classList.add("is-active");
      if (document.activeElement !== td) td.focus();
      if (!preserveCaret) {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(td);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }
  function clearActiveCell() {
    if (currentCell && currentCell.classList)
      currentCell.classList.remove("is-active");
    currentCell = null;
    if (
      document.activeElement &&
      document.activeElement.matches('td[contenteditable="true"]')
    )
      document.activeElement.blur();
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      clearActiveCell();
      setStatus("Đã thoát ô đang chọn (Esc)");
    }
  });
  document.addEventListener("mousedown", (e) => {
    const isCell = e.target.closest('td[contenteditable="true"]');
    // coi tất cả button và thanh công cụ là vùng “không xoá chọn”
    const isButton = e.target.closest("button, .btn");
    const isToolbar = e.target.closest(".bar"); // container của các nút trên cùng

    if (!isCell && !isButton && !isToolbar) {
      clearActiveCell();
    }
  });

  const editableCellsInRow = (tr) =>
    tr.querySelectorAll('td[contenteditable="true"]');
  function findSiblingRow(tr, dir) {
    let p = tr;
    while (p) {
      p = dir > 0 ? p.nextElementSibling : p.previousElementSibling;
      if (!p) return null;
      if (!p.classList.contains("section-row")) return p;
    }
    return null;
  }
  function moveCell(direction) {
    if (!currentCell || !tbody.contains(currentCell)) {
      const first = tbody.querySelector('td[contenteditable="true"]');
      if (first) setActiveCell(first);
      return;
    }
    const tr = currentCell.parentElement;
    const rowCells = Array.from(editableCellsInRow(tr));
    const colIndex = rowCells.indexOf(currentCell);
    if (colIndex === -1) return;
    if (direction === "left" || direction === "right") {
      const nextIndex = Math.max(
        0,
        Math.min(
          rowCells.length - 1,
          colIndex + (direction === "left" ? -1 : 1)
        )
      );
      setActiveCell(rowCells[nextIndex]);
      return;
    }
    if (direction === "up" || direction === "down") {
      const sib = findSiblingRow(tr, direction === "down" ? +1 : -1);
      if (!sib) return;
      const sibCells = Array.from(editableCellsInRow(sib));
      const target = sibCells[colIndex] || sibCells[sibCells.length - 1];
      if (target) setActiveCell(target);
    }
  }

  // Helpers để biết ô/hàng đang chọn
  function getActiveRowInfo() {
    if (!currentCell || !tbody.contains(currentCell)) return null;
    const tr = currentCell.closest("tr[data-section]");
    if (!tr) return null;
    const section = tr.dataset.section;
    const pIndex = parseInt(tr.dataset.pindex, 10) || 1;
    const cells = Array.from(tr.querySelectorAll('td[contenteditable="true"]'));
    const colIndex = Math.max(0, cells.indexOf(currentCell));
    return { tr, section, pIndex, colIndex };
  }

  // Chèn/xoá tại vị trí mong muốn
  function insertRowAt(section, anchorIndex, place = "after") {
    const rows = Array.from(
      tbody.querySelectorAll(`tr[data-section="${section}"]`)
    );
    // nếu chưa có hàng nào trong buổi → chèn ngay sau header buổi
    if (rows.length === 0) {
      const headers = Array.from(tbody.querySelectorAll(".section-row"));
      const header = section === "am" ? headers[0] : headers[1];
      const newRow = makePeriodRow(1, section);
      if (header) header.after(newRow);
      else tbody.appendChild(newRow);
      renumberSection(section);
      return newRow;
    }
    const safeAnchorIdx = Math.min(
      Math.max(anchorIndex - 1, 0),
      rows.length - 1
    );
    const anchor = rows[safeAnchorIdx] || rows[rows.length - 1];
    const newRow = makePeriodRow(anchorIndex, section);
    if (place === "before") anchor.before(newRow);
    else anchor.after(newRow);
    renumberSection(section);
    return newRow;
  }

  function removeRowAt(section, index1) {
    const rows = Array.from(
      tbody.querySelectorAll(`tr[data-section="${section}"]`)
    );
    if (!rows.length) return null;
    const idx = Math.min(Math.max(index1 - 1, 0), rows.length - 1);
    const removed = rows[idx];
    removed.remove();
    renumberSection(section);
    return idx + 1;
  }

  // API thông minh cho nút
  function addRowSmart(section, place = "after") {
    const info = getActiveRowInfo();
    const secName = section === "am" ? "sáng" : "chiều";
    if (!info || info.section !== section) {
      alert(`Hãy nhấp chọn 1 ô trong buổi ${secName} trước khi thêm hàng.`);
      return;
    }

    pushHistory(getState());
    COUNTS[section] = Math.max(0, COUNTS[section] || 0) + 1;

    const newRow = insertRowAt(section, info.pIndex, place);
    const whereTxt = place === "before" ? "trước" : "sau";
    save(`Thêm hàng ${secName} (${whereTxt} Tiết ${info.pIndex})`);
    setStatus(`Đã thêm hàng ${secName} ${whereTxt} Tiết ${info.pIndex} ➕`);

    const tds = newRow.querySelectorAll('td[contenteditable="true"]');
    setActiveCell(tds[info.colIndex] || tds[0]);
  }

  function delRowSmart(section, where = "at") {
    const info = getActiveRowInfo();
    const secName = section === "am" ? "sáng" : "chiều";

    if (!info || info.section !== section) {
      alert(`Hãy nhấp chọn 1 ô trong buổi ${secName} để xoá hàng.`);
      return;
    }

    const rows = Array.from(
      tbody.querySelectorAll(`tr[data-section="${section}"]`)
    );
    if (!rows.length) {
      alert(`Buổi ${secName} không còn hàng để xoá.`);
      return;
    }

    let delIndex = info.pIndex;
    if (where === "above") {
      if (info.pIndex === 1) {
        alert("Không có hàng ở trên để xoá.");
        return;
      }
      delIndex = info.pIndex - 1;
    }

    pushHistory(getState());
    const removedP = removeRowAt(section, delIndex);
    COUNTS[section] = Math.max(0, (COUNTS[section] || 0) - 1);
    save(`Xoá hàng ${secName} (Tiết ${removedP})`);

    // Đặt lại focus: giữ nguyên cột đang đứng
    const leftRows = Array.from(
      tbody.querySelectorAll(`tr[data-section="${section}"]`)
    );
    if (leftRows.length) {
      const targetIdx = Math.min(
        where === "at" ? info.pIndex : info.pIndex - 1,
        leftRows.length
      );
      const tr = leftRows[targetIdx - 1];
      const tds = tr.querySelectorAll('td[contenteditable="true"]');
      setActiveCell(tds[info.colIndex] || tds[0]);
    } else {
      clearActiveCell();
      setStatus(`Đã xoá hết hàng buổi ${secName}.`);
    }
  }

  // (Tuỳ chọn) Wrapper tương thích cũ
  function insertRow(section) {
    addRowSmart(section, "after");
  }
  function removeLastRow(section) {
    delRowSmart(section, "at");
  }

  // ===== EVENTS =====
  // ===== MODAL TẠO BẢNG =====
  const createModal = document.getElementById("createModal");
  const btnCreate = document.getElementById("createBtn");
  const btnRestore = document.getElementById("optRestoreBtn");
  const btnClear = document.getElementById("optClearBtn");

  function openCreateModal() {
    if (!createModal) return;
    createModal.classList.add("is-open");
    createModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open"); // thêm dòng này
    requestAnimationFrame(() => btnRestore?.focus());
    // [Patch] Heads-up to avoid many "Không tiêu đề" entries
    const t = (titleText.textContent || "").trim();
    if (!t) {
      setTimeout(
        () =>
          alert(
            "Mẹo: nhập tiêu đề trước khi tạo để lưu vào Thư viện gọn gàng hơn."
          ),
        0
      );
    }
  }
  function closeCreateModal() {
    if (!createModal) return;
    createModal.classList.remove("is-open");
    createModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open"); // thêm dòng này
  }

  // Giữ nguyên logic "tạo bảng trống" (đang có sẵn trong code cũ)
  function createFreshTable() {
    applyingHistory = true;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(BACKUP_KEY);
    UNDO = [];
    REDO = [];
    HEADERS = [
      "Thứ 2",
      "Thứ 3",
      "Thứ 4",
      "Thứ 5",
      "Thứ 6",
      "Thứ 7",
      "Chủ nhật",
    ];
    COUNTS = { am: 5, pm: 5 };
    buildTable();
    const fresh = getState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    pushBackup(fresh, "Tạo bảng");
    UNDO = [JSON.stringify(fresh)];
    REDO = [];
    const curTitle = (titleText.textContent || "").trim();
    if (curTitle) {
      const newId = archiveAdd(fresh, curTitle);
      setCurrentArchiveId(newId);
    } else {
      // Yêu cầu mới: lưu vào Thư viện với tiêu đề "..."
      const newId = archiveAdd(fresh, "...");
      setCurrentArchiveId(newId);
    }
    ensureTitleEmptyAndPlaceholder();
    if (typeof syncTitlePlaceholder === "function") syncTitlePlaceholder();
    if (typeof onTitleTyping === "function") onTitleTyping();
    if (typeof saveTitle === "function") saveTitle();
    ensureTitleEmptyAndPlaceholder();
    if (typeof syncTitlePlaceholder === "function") syncTitlePlaceholder();
    if (typeof onTitleTyping === "function") onTitleTyping();
    if (typeof saveTitle === "function") saveTitle();
    setStatus("Đã tạo bảng trống mới ✨ (đã tự lưu)");
    lockTitleMinHeight();
    applyingHistory = false;
  }

  // Mở modal khi bấm "🧩 Tạo bảng"
  btnCreate.addEventListener("click", openCreateModal);

  // === 1) Lấy lại giá trị bảng cũ (tạo BẢNG MỚI từ state hiện hành) ===
  btnRestore?.addEventListener("click", () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        closeCreateModal();
        setTimeout(() => alert("Chưa có dữ liệu cũ để lấy lại."), 0);
        return;
      }
      const oldState = JSON.parse(raw);

      applyingHistory = true;
      // reset lịch sử cho bản mới
      localStorage.removeItem(BACKUP_KEY);
      UNDO = [];
      REDO = [];

      // đổ lại dữ liệu cũ vào DOM
      setState(oldState);

      // ghi state này làm bản mới hiện hành
      localStorage.setItem(STORAGE_KEY, JSON.stringify(oldState));

      // tạo một mục mới trong thư viện (không đè bản cũ)
      const curTitle = (titleText.textContent || "").trim();
      if (curTitle) {
        const newId = archiveAdd(oldState, curTitle);
        setCurrentArchiveId(newId);
      } else {
        // Yêu cầu mới: luôn lưu một mục với tiêu đề "..." khi tạo từ dữ liệu cũ
        const newId = archiveAdd(oldState, "...");
        setCurrentArchiveId(newId);
      }

      ensureTitleEmptyAndPlaceholder();
      if (typeof syncTitlePlaceholder === "function") syncTitlePlaceholder();
      if (typeof onTitleTyping === "function") onTitleTyping();
      if (typeof saveTitle === "function") saveTitle();

      ensureTitleEmptyAndPlaceholder();
      if (typeof syncTitlePlaceholder === "function") syncTitlePlaceholder();
      if (typeof onTitleTyping === "function") onTitleTyping();
      if (typeof saveTitle === "function") saveTitle();

      // bắt đầu lịch sử cho bản mới
      pushBackup(oldState, "Tạo bảng (từ dữ liệu cũ)");
      UNDO = [JSON.stringify(oldState)];
      REDO = [];

      setStatus("Đã tạo bảng MỚI từ dữ liệu cũ ✔️");
      closeCreateModal();
      // Thông báo kiểu alert như bạn yêu cầu
      setTimeout(
        () => alert("Đã lấy lại giá trị bảng cũ (đã tạo bảng mới)."),
        0
      );
    } catch (e) {
      console.error(e);
      closeCreateModal();
      setTimeout(
        () => alert("Không thể lấy lại dữ liệu cũ. Vui lòng thử lại."),
        0
      );
    } finally {
      applyingHistory = false;
    }
  });

  // === 2) Xoá hết dữ liệu bảng cũ (tạo bảng trống) ===
  btnClear?.addEventListener("click", () => {
    createFreshTable();
    closeCreateModal();
    // Thông báo kiểu alert
    setTimeout(() => alert("Đã xoá hết dữ liệu cũ và tạo bảng trống mới."), 0);
  });

  // Đóng khi click nền tối hoặc nhấn ESC
  createModal?.addEventListener("click", (e) => {
    if (e.target.matches("[data-close]")) closeCreateModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && createModal?.classList.contains("is-open")) {
      e.preventDefault();
      closeCreateModal();
    }
  });

  $("#clearBtn").addEventListener("click", () => {
    if (!confirm("Xoá toàn bộ dữ liệu?")) return;
    pushHistory(getState());
    localStorage.removeItem(STORAGE_KEY);
    buildTable();
    save("Xoá dữ liệu");
    ensureTitleEmptyAndPlaceholder();
    if (typeof syncTitlePlaceholder === "function") syncTitlePlaceholder();
    if (typeof onTitleTyping === "function") onTitleTyping();
    if (typeof saveTitle === "function") saveTitle();
    setStatus("Đã xoá");
    lockTitleMinHeight();
  });

  // Thêm/Xoá hàng (smart)
  $("#addRowAmBtn").addEventListener("click", (e) => {
    addRowSmart("am", e.shiftKey ? "before" : "after");
  });
  $("#addRowPmBtn").addEventListener("click", (e) => {
    addRowSmart("pm", e.shiftKey ? "before" : "after");
  });
  $("#delRowAmBtn").addEventListener("click", (e) => {
    delRowSmart("am", e.shiftKey ? "above" : "at");
  });
  $("#delRowPmBtn").addEventListener("click", (e) => {
    delRowSmart("pm", e.shiftKey ? "above" : "at");
  });

  $("#exportDocBtn").addEventListener("click", () => {
    exportWord();
    pushBackup(getState(), "Xuất Word");
    setStatus("Đã xuất Word 📄");
  });
  $("#exportXlsBtn").addEventListener("click", () => {
    exportExcelHtml();
    pushBackup(getState(), "Xuất Excel");
    setStatus("Đã xuất Excel 📊");
  });

  $("#restoreBtn").addEventListener("click", () => {
    const b = showBackupPicker();
    if (!b) return;
    if (
      !confirm("Khôi phục bản lưu này? Mọi thay đổi chưa lưu sẽ bị thay thế.")
    )
      return;
    restoreFromBackup(b);
  });

  $("#undoBtn").addEventListener("click", () => undo());
  $("#redoBtn").addEventListener("click", () => redo());
  $("#purgeHistoryBtn").addEventListener("click", () => {
    if (!confirm("Xoá toàn bộ lịch sử Undo/Redo và khôi phục?")) return;
    localStorage.removeItem(BACKUP_KEY);
    UNDO = [JSON.stringify(getState())];
    REDO = [];
    setStatus("Đã xoá lịch sử khôi phục & Undo/Redo");
  });

  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.key.toLowerCase() === "z" && e.shiftKey) {
      e.preventDefault();
      redo();
    }
  });

  $("#printBtn").addEventListener("click", () => {
    const oldTitle = document.title;
    document.title = sanitizeFileName(getCurrentTitle());
    const restore = () => {
      document.title = oldTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
    pushBackup(getState(), "In / PDF");
    setStatus("Đang in (A4 ngang) 🖨️");
  });

  // Theme
  const themeBtn = $("#themeBtn");
  const savedTheme = localStorage.getItem("tkb_theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  themeBtn.setAttribute(
    "aria-pressed",
    savedTheme === "light" ? "true" : "false"
  );
  themeBtn.addEventListener("click", () => {
    const light =
      document.documentElement.getAttribute("data-theme") === "light";
    const next = light ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("tkb_theme", next);
    themeBtn.setAttribute("aria-pressed", next === "light" ? "true" : "false");
    setStatus(
      next === "dark"
        ? "Đã chuyển sang giao diện tối 🌙"
        : "Đã chuyển sang giao diện sáng ☀️"
    );
    const label =
      next === "dark" ? "Chuyển giao diện (tối)" : "Chuyển giao diện (sáng)";
    pushBackup(getState(), label);
  });

  // ===== VAULT UI =====
  populateVaultDropdown();
  $("#openVaultBtn").addEventListener("click", () => {
    const id = $("#vaultSelect").value;
    if (!id) return alert("Hãy chọn một mục trong lưu trữ.");
    const rec = getLibrary().find((x) => x.id === id);
    if (!rec) return;
    applyingHistory = true;
    setState(rec.state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec.state));
    localStorage.setItem(STORAGE_KEY + "__title", rec.title || "");
    if ((rec.title || "").trim()) {
      titleText.textContent = rec.title;
      if (typeof syncTitlePlaceholder === "function") syncTitlePlaceholder();
    } else {
      ensureTitleEmptyAndPlaceholder();
    }
    if (typeof lockTitleMinHeight === "function") lockTitleMinHeight();
    pushBackup(getState(), "Mở từ lưu trữ");
    UNDO = [JSON.stringify(getState())];
    REDO = [];
    setCurrentArchiveId(id);
    setStatus("Đã mở từ lưu trữ: " + (rec.title || ""));
    applyingHistory = false;
  });
  $("#deleteVaultBtn").addEventListener("click", () => {
    const id = $("#vaultSelect").value;
    if (!id) return alert("Chọn mục cần xoá.");
    if (!confirm("Xoá mục này khỏi lưu trữ?")) return;
    archiveRemove(id);
    setStatus("Đã xoá khỏi lưu trữ");
  });

  // ===== EXPORT (Word/Excel HTML) =====
  function getCurrentTitle() {
    return (titleText.textContent || "").trim() || "Không tiêu đề";
  }
  function sanitizeFileName(name) {
    let safe = (name || "")
      .normalize("NFKC")
      .replace(/[\/\\:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!safe) safe = "Không tiêu đề";
    return safe.slice(0, 80);
  }
  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  const PAGE_MM = { width: 297, height: 210, margin: 0 }; // A4 ngang
  const COL_MM = { tiet: 20, gio: 40 };
  function dayColumnWidthMm() {
    const usable = PAGE_MM.width - 2 * PAGE_MM.margin;
    const rest = usable - (COL_MM.tiet + COL_MM.gio);
    return +(rest / 7).toFixed(3);
  }

  function exportWord() {
    const s = getState();
    const title = getCurrentTitle();
    const head = ["Tiết", "Giờ", ...s.headers];

    // Tính độ rộng cột ngày theo khổ Letter + margin Narrow
    const usable = PAGE_MM.width - 2 * PAGE_MM.margin;
    const rest = usable - (COL_MM.tiet + COL_MM.gio);
    const W_DAY = +(rest / 7).toFixed(3);

    // CSS + XML cho Word (Letter, Landscape, Narrow margin)
    const style = `<style>
      @page Section1 {
        size: 11.0in 8.5in;          /* Letter ngang */
        mso-page-orientation: landscape;
        margin: 0.5in;               /* Narrow margin */
      }
      div.Section1 { page: Section1; }
  
      html, body {
        margin:0 !important; padding:0 !important;
        background:#fff !important; color:#000 !important;
        font-family:"Times New Roman", Times, serif !important;
      }
  
      .title-wrap { text-align:center !important; margin:0 0 1.4pt 0 !important; }
      .title-text {
        display:block !important; width:100% !important; text-align:center !important;
        font-weight:900 !important; font-size:30px !important; color:#000 !important;
        text-transform:uppercase; letter-spacing:0.4pt;
      }
  
      table{
        width:100% !important; margin:0 !important;
        border-collapse:collapse !important; table-layout:fixed !important;
        background:#fff !important;
        font-size:18px !important; line-height:1.3 !important;
        border:1.2pt solid #000 !important;
      }
      thead th{
        background:transparent !important; color:#000 !important;
        font-weight:800 !important; border:1.2pt solid #000 !important;
        padding:6pt 8pt !important; font-size:18px !important;
        text-align:center !important; vertical-align:middle !important;
        white-space:nowrap !important;
      }
      th,td{
        border:1.2pt solid #000 !important; color:#000 !important;
        background:transparent !important; padding:6pt 8pt !important;
        text-align:center !important; vertical-align:middle !important;
        white-space:normal !important; word-break:keep-all !important;
        hyphens:none !important; font-size:18px !important;
      }
  
      col.c-tiet { width:${COL_MM.tiet}mm !important; }
      col.c-gio  { width:${COL_MM.gio}mm !important;  }
      col.c-day  { width:${W_DAY}mm !important;       }
  
      .section-row td{
        background:transparent !important; color:#000 !important;
        font-weight:900 !important; text-transform:uppercase !important;
        text-align:center !important; vertical-align:middle !important;
        padding:6pt 8pt !important; font-size:18px !important;
      }
    </style>
  
    <!--[if gte mso 9]><xml>
      <w:WordDocument>
        <w:View>Print</w:View>
        <w:DoNotOptimizeForBrowser/>
        <w:PaperSize>Letter</w:PaperSize>
        <w:Orientation>Landscape</w:Orientation>
        <w:PageMargins w:top="720" w:right="720" w:bottom="720" w:left="720"
                       w:header="0" w:footer="0" w:gutter="0"/>
      </w:WordDocument>
    </xml><![endif]-->`;

    const colgroup = `<colgroup>
      <col class="c-tiet"><col class="c-gio">
      ${Array.from({ length: 7 }, () => `<col class="c-day">`).join("")}
    </colgroup>`;

    const thead = "<tr>" + head.map((h) => `<th>${h}</th>`).join("") + "</tr>";

    function line(sec, p, st) {
      const L = [`Tiết ${p}`, st.times[sec][p] || ""];
      for (let d = 0; d < st.headers.length; d++)
        L.push(st.cells[`${sec}-${d}-${p}`] || "");
      return L;
    }
    const mk = (sec, p) =>
      "<tr>" +
      line(sec, p, s)
        .map((x) => `<td>${(x || "").toString().replace(/</g, "&lt;")}</td>`)
        .join("") +
      "</tr>";

    const html = `<!DOCTYPE html>
    <html><head><meta charset="utf-8">${style}</head><body>
      <div class="Section1">
        <div class="title-wrap"><div class="title-text">${title}</div></div>
        <table>${colgroup}
          <thead>${thead}</thead>
          <tbody>
            <tr class="section-row"><td colspan="${
              2 + s.headers.length
            }">Buổi sáng</td></tr>
            ${Array.from({ length: s.counts.am }, (_, i) =>
              mk("am", i + 1)
            ).join("")}
            <tr class="section-row"><td colspan="${
              2 + s.headers.length
            }">Buổi chiều</td></tr>
            ${Array.from({ length: s.counts.pm }, (_, i) =>
              mk("pm", i + 1)
            ).join("")}
          </tbody>
        </table>
      </div>
    </body></html>`;

    const fname = sanitizeFileName(title) + ".doc";
    download(fname, new Blob([html], { type: "application/msword" }));
  }

  function exportExcelHtml() {
    const s = getState();
    const title = getCurrentTitle();
    const head = ["Tiết", "Giờ", ...s.headers];

    const usable = PAGE_MM.width - 2 * PAGE_MM.margin; // 279.4mm
    const rest = usable - (COL_MM.tiet + COL_MM.gio); // 279.4 - (24+30)
    const W_DAY = +(rest / 7).toFixed(3);

    const style = `<style>
      @page { size: 11.0in 8.5in; margin: 0; mso-page-orientation: landscape; }
      html, body {
        margin:0 !important; padding:0 !important;
        background:#fff !important; color:#000 !important;
        font-family:"Times New Roman", Times, serif !important;
      }
      .title-wrap { text-align:center !important; margin:0 0 1.4pt 0 !important; }
      .title-text {
        display:block !important; width:100% !important; text-align:center !important;
        font-weight:900 !important; font-size:30px !important; color:#000 !important;
        text-transform:uppercase; letter-spacing:0.4pt;
      }
  
      table{
        border-collapse:collapse; table-layout:fixed; width:100%;
        background:#fff !important; border:1.2pt solid #000 !important;
        font-size:18px !important; line-height:1.3 !important;
        mso-table-lspace:0pt; mso-table-rspace:0pt;
      }
      thead th{
        font-weight:800 !important; border:1.2pt solid #000 !important;
        padding:6pt 8pt !important; text-align:center !important; vertical-align:middle !important;
        white-space:nowrap !important; font-size:18px !important;
      }
      th,td{
        border:1.2pt solid #000 !important; padding:6pt 8pt !important;
        text-align:center !important; vertical-align:middle !important;
        color:#000 !important; font-size:18px !important;
        mso-number-format:"\\@"; /* giữ nguyên text */
      }
      col.c-tiet { width:${COL_MM.tiet}mm !important; mso-width-source:userset; }
      col.c-gio  { width:${COL_MM.gio}mm !important;  mso-width-source:userset; }
      col.c-day  { width:${W_DAY}mm !important;       mso-width-source:userset; }
  
      .section-row td{
        font-weight:900 !important; text-transform:uppercase !important;
        text-align:center !important; padding:6pt 8pt !important; font-size:18px !important;
      }
    </style>`;

    const colgroup = `<colgroup>
      <col class="c-tiet"><col class="c-gio">
      ${Array.from({ length: 7 }, () => `<col class="c-day">`).join("")}
    </colgroup>`;

    const thead = "<tr>" + head.map((h) => `<th>${h}</th>`).join("") + "</tr>";

    function line(sec, p, st) {
      const L = [`Tiết ${p}`, st.times[sec][p] || ""];
      for (let d = 0; d < st.headers.length; d++)
        L.push(st.cells[`${sec}-${d}-${p}`] || "");
      return L;
    }
    const mk = (sec, p) =>
      "<tr>" +
      line(sec, p, s)
        .map((x) => `<td>${(x || "").toString().replace(/</g, "&lt;")}</td>`)
        .join("") +
      "</tr>";

    const html = `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>
      <div class="title-wrap"><div class="title-text">${title}</div></div>
      <table>
        ${colgroup}
        <thead>${thead}</thead>
        <tbody>
          <tr class="section-row"><td colspan="${
            2 + s.headers.length
          }">Buổi sáng</td></tr>
          ${Array.from({ length: s.counts.am }, (_, i) => mk("am", i + 1)).join(
            ""
          )}
          <tr class="section-row"><td colspan="${
            2 + s.headers.length
          }">Buổi chiều</td></tr>
          ${Array.from({ length: s.counts.pm }, (_, i) => mk("pm", i + 1)).join(
            ""
          )}
        </tbody>
      </table>
    </body></html>`;

    const fname = sanitizeFileName(title) + ".xls";
    download(fname, new Blob([html], { type: "application/vnd.ms-excel" }));
  }

  // Copy: nếu không bôi đen thì copy cả ô
  document.addEventListener("copy", (e) => {
    const active = document.activeElement;
    if (active && active.matches('td[contenteditable="true"]')) {
      const sel = window.getSelection && window.getSelection();
      const hasSelection =
        sel &&
        sel.rangeCount &&
        !sel.isCollapsed &&
        active.contains(sel.getRangeAt(0).commonAncestorContainer);
      if (hasSelection) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", active.textContent || "");
    }
  });

  // Delete: xoá sạch nội dung ô
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Delete" || e.ctrlKey || e.metaKey) return;
    const el = document.activeElement;
    if (!el || !el.matches('td[contenteditable="true"]')) return;
    e.preventDefault();
    pushHistory(getState());
    let labelExtra = "";
    if (el.hasAttribute("data-cell")) {
      const [sec, dayIdx, period] = el.dataset.cell.split("-");
      const dayName = HEADERS[+dayIdx] || `Cột ${+dayIdx + 1}`;
      labelExtra = `(Tiết ${period}, ${dayName})`;
    } else if (el.hasAttribute("data-time")) {
      const [sec, period] = el.dataset.time.split("-");
      const secName = sec === "am" ? "Buổi sáng" : "Buổi chiều";
      labelExtra = `(Tiết ${period}, ${secName})`;
    }
    el.textContent = "";
    if (el.hasAttribute("data-time")) el.dataset.prevDigits = "";
    const label = `Xoá nội dung ô ${labelExtra}`;
    save(label);
    setStatus(label);
  });

  // === PRINT: SCALE-TO-FIT ONE PAGE (A4 landscape) ===
  (function () {
    const PX_PER_MM = 96 / 25.4,
      PAGE_HEIGHT_MM = 210,
      MARGIN_MM = 0,
      SAFETY = 0.98;
    function getContentHeightPx() {
      const title = document.querySelector(".bar");
      const table = document.querySelector("table");
      let h = 0;
      if (title) h += title.getBoundingClientRect().height;
      if (table) h += table.getBoundingClientRect().height;
      return h;
    }
    function applyPrintScale() {
      const availablePx = (PAGE_HEIGHT_MM - 2 * MARGIN_MM) * PX_PER_MM,
        contentPx = getContentHeightPx();
      let scale = availablePx / contentPx;
      if (!isFinite(scale) || scale <= 0) scale = 1;
      scale = Math.min(1, scale * SAFETY);
      let tag = document.getElementById("printScaleStyle");
      if (!tag) {
        tag = document.createElement("style");
        tag.id = "printScaleStyle";
        document.head.appendChild(tag);
      }
      tag.textContent = `@media print { html, body { zoom: ${scale}; } }`;
    }
    function removePrintScale() {
      const tag = document.getElementById("printScaleStyle");
      if (tag) tag.remove();
    }
    window.addEventListener("beforeprint", applyPrintScale);
    window.addEventListener("afterprint", removePrintScale);
  })();

  // ===== IMPORT (modal) =====
  const importBtn = document.getElementById("importBtn");
  const importFileInput = document.getElementById("importFile");
  const imodOverlay = document.getElementById("imod-overlay");
  const imodCard = document.getElementById("imod-card");
  const imodClose = document.getElementById("imod-close");

  const IMPORT_ACCEPT_MAP = {
    pdf: ".pdf",
    word: ".doc,.docx",
    excel: ".xls,.xlsx,.csv",
  };

  function openImportModal() {
    imodOverlay.hidden = false;
    imodCard.hidden = false;
    const first = imodCard.querySelector(".imod-btn");
    first && first.focus();
  }
  function closeImportModal() {
    imodOverlay.hidden = true;
    imodCard.hidden = true;
  }

  function openImportPicker(kind) {
    if (!IMPORT_ACCEPT_MAP[kind]) return alert("Định dạng không hợp lệ.");
    importFileInput.value = "";
    importFileInput.setAttribute("accept", IMPORT_ACCEPT_MAP[kind]);
    importFileInput.dataset.kind = kind;
    importFileInput.click();
  }

  importBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    openImportModal();
  });
  imodOverlay?.addEventListener("click", closeImportModal);
  imodClose?.addEventListener("click", closeImportModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !imodCard.hidden) closeImportModal();
  });

  // Click 3 lựa chọn
  imodCard?.addEventListener("click", (e) => {
    const btn = e.target.closest(".imod-btn");
    if (!btn) return;
    const kind = btn.dataset.kind;
    closeImportModal();
    openImportPicker(kind);
  });

  // Khi người dùng chọn file
  importFileInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const kind = importFileInput.dataset.kind || "";

    try {
      setStatus && setStatus(`Đang đọc ${file.name} …`);
      if (kind === "excel") await handleExcelFile(file);
      else if (kind === "word") await handleWordFile(file);
      else if (kind === "pdf") await handlePdfFile(file);
      else return alert("Chưa chọn định dạng hợp lệ.");
      setStatus && setStatus(`Đã import: ${file.name}`);
    } catch (err) {
      console.error(err);
      alert(
        "Không thể import file này. Kiểm tra định dạng & cấu trúc bảng nhé."
      );
      setStatus && setStatus("Import lỗi");
    }
  });

  async function importWord(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    const rows = result.value.split("\n").map((r) => r.split(/\t/));
    fillTableFromArray(rows);
  }
  // --- Excel / CSV ---
  async function importExcel(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    let A = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

    // 1) chuẩn hoá: bỏ hàng trống hoàn toàn + cắt cột trống đầu/cuối
    A = (A || [])
      .map((row) => {
        const r = Array.isArray(row) ? row : [row];
        // bỏ cột trống đầu/cuối
        let L = 0,
          R = r.length - 1;
        while (
          L <= R &&
          (r[L] === null || r[L] === undefined || String(r[L]).trim() === "")
        )
          L++;
        while (
          R >= L &&
          (r[R] === null || r[R] === undefined || String(r[R]).trim() === "")
        )
          R--;
        return r.slice(L, R + 1);
      })
      .filter((r) => r.join("").trim().length > 0);

    // 2) tìm hàng header (có "Tiết" và "Giờ") trong 10 hàng đầu
    let headerRow = -1,
      idxTiet = -1,
      idxGio = -1;
    for (let i = 0; i < Math.min(10, A.length); i++) {
      const row = A[i].map((x) => String(x || "").trim());
      idxTiet = row.findIndex((x) => /^tiết\b/i.test(x));
      idxGio = row.findIndex((x) => /^giờ\b/i.test(x));
      if (idxTiet !== -1 && idxGio !== -1) {
        headerRow = i;
        break;
      }
    }
    if (headerRow !== -1) {
      // bỏ header
      A = A.slice(headerRow + 1);
    }

    // helper: convert excel time serial (e.g., 0.5 -> 12:00)
    function excelTimeNumToHHMM(n) {
      if (typeof n !== "number" || !isFinite(n)) return "";
      // n có thể là 0..1 (thời gian) hoặc ngày+giờ. Lấy phần ngày thập phân.
      const dayFrac = n - Math.floor(n);
      const totalMin = Math.round(dayFrac * 24 * 60);
      const hh = String(Math.floor(totalMin / 60)).padStart(2, "0");
      const mm = String(totalMin % 60).padStart(2, "0");
      return `${hh}:${mm}`;
    }

    // 3) build rows theo cấu trúc: [ "Tiết X", "hh:mm–hh:mm", col2..col8 ]
    const rows = [];
    for (const raw of A) {
      const r = raw.map((x) => (x == null ? "" : x));

      // lấy tiết
      let tiet = String(r[0] || "").trim();
      if (/^\d+$/.test(tiet)) tiet = `Tiết ${tiet}`;
      // nếu cột 0 không phải "Tiết", thử ghép với cột 1
      if (
        !/^tiết\s*\d+/i.test(tiet) &&
        r.length > 1 &&
        /^\d+$/.test(String(r[1]).trim())
      ) {
        tiet = `Tiết ${String(r[1]).trim()}`;
      }
      if (!/^tiết\s*\d+/i.test(tiet)) continue; // bỏ hàng không phải tiết

      // lấy giờ: nhiều file để 1 cột "08:00–08:45", hoặc 2 cột Start/End,
      // hoặc số seri excel ở 1 hoặc 2 cột.
      let gio = "";
      // ưu tiên cột ngay sau "Tiết"
      let afterTietIdx = 1;
      // nếu cột tiếp theo là số seri hoặc text giờ
      const v1 = r[afterTietIdx];
      const v2 = r[afterTietIdx + 1];

      const asText = (v) => String(v || "").trim();
      const isExcelNum = (v) => typeof v === "number" && isFinite(v);
      const timeText = (v) => {
        const t = asText(v);
        if (/^\d{1,2}:\d{2}$/.test(t)) return t;
        return "";
      };

      if (/^\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}$/.test(asText(v1))) {
        gio = asText(v1);
      } else if (
        (timeText(v1) && timeText(v2)) ||
        (isExcelNum(v1) && isExcelNum(v2))
      ) {
        const t1 = timeText(v1) || excelTimeNumToHHMM(v1);
        const t2 = timeText(v2) || excelTimeNumToHHMM(v2);
        gio = t1 && t2 ? `${t1}–${t2}` : "";
      } else if (isExcelNum(v1)) {
        // 1 ô số seri → coi như giờ bắt đầu, không có giờ kết thúc
        gio = excelTimeNumToHHMM(v1);
      } else {
        // fallback: quét toàn hàng tìm 2 ô dạng hh:mm
        const times = r.map(timeText).filter(Boolean);
        if (times.length >= 2) gio = `${times[0]}–${times[1]}`;
        else if (times.length === 1) gio = times[0];
      }

      // 7 cột ngày tiếp theo (có file xếp ngay sau giờ; có file lệch vài cột)
      // Tìm vị trí bắt đầu cột ngày: lấy index của ô đầu tiên sau giờ có chữ (hoặc để sauTietIdx+1)
      let startCol = 2;
      // nếu đã bắt cặp v1,v2 là giờ thì ngày bắt đầu từ sau 2 cột
      if ((timeText(v1) && timeText(v2)) || (isExcelNum(v1) && isExcelNum(v2)))
        startCol = afterTietIdx + 2;
      else if (/^\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}$/.test(asText(v1)))
        startCol = afterTietIdx + 1;

      const days = [];
      for (let d = 0; d < 7; d++) {
        days.push(asText(r[startCol + d] || ""));
      }

      rows.push([tiet, gio, ...days]);
    }

    if (!rows.length) {
      alert(
        "Không đọc được bảng từ Excel này. Bạn kiểm tra lại sheet/ô gộp hoặc gửi mình file để xem nhé!"
      );
      return;
    }

    // đổ vào bảng (hàm này của bạn sẽ tự co/giãn số hàng)
    fillTableFromArray(rows);
  }

  // --- PDF ---
  // --- PDF robust: parse theo toạ độ x,y để khôi phục bảng ---
  async function importPDF(file) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

    // gom toàn bộ items (text + x,y) của tất cả trang
    const itemsAll = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      for (const it of content.items) {
        const str = (it.str || "").trim();
        if (!str) continue;
        const [, , , , x, y] = it.transform;
        itemsAll.push({ str, x, y });
      }
    }

    // gom theo dòng (gần nhau về y)
    const LINES = [];
    const Y_EPS = 2.0;
    itemsAll.sort((a, b) => b.y - a.y || a.x - b.x); // top→down, left→right
    for (const it of itemsAll) {
      let line = LINES.find((l) => Math.abs(l.y - it.y) <= Y_EPS);
      if (!line) {
        line = { y: it.y, cells: [] };
        LINES.push(line);
      }
      line.cells.push(it);
    }
    LINES.forEach((l) => l.cells.sort((a, b) => a.x - b.x));
    const lineText = (l) =>
      l.cells
        .map((c) => c.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

    // tìm header (có Tiết, Giờ, Thứ 2)
    const headerIdx = LINES.findIndex(
      (l) =>
        /Tiết/i.test(lineText(l)) &&
        /Giờ/i.test(lineText(l)) &&
        /Thứ 2/i.test(lineText(l))
    );
    if (headerIdx === -1) {
      alert(
        "Không tìm thấy dòng tiêu đề trong PDF. Bạn thử file Excel/Word nhé?"
      );
      return;
    }

    // lấy mốc x cho 9 cột từ dòng header
    const hdr = LINES[headerIdx];
    const labels = [
      "Tiết",
      "Giờ",
      "Thứ 2",
      "Thứ 3",
      "Thứ 4",
      "Thứ 5",
      "Thứ 6",
      "Thứ 7",
      "Chủ nhật",
    ];
    const colX = labels
      .map((lb) => {
        const hit = hdr.cells.find((c) =>
          c.str.toLowerCase().includes(lb.toLowerCase())
        );
        return hit ? hit.x : null;
      })
      .filter((x) => x != null);
    if (colX.length < 9) {
      alert("Không xác định đủ cột từ PDF này. Bạn thử file Excel/Word nhé?");
      return;
    }
    const whichCol = (x) =>
      colX.reduce(
        (best, i, idx) =>
          Math.abs(x - i) < Math.abs(x - colX[best]) ? idx : best,
        0
      );

    // duyệt các dòng xung quanh header, ưu tiên sau header; nếu rỗng thì quét ngược lên trên
    const collectRows = (startIndex, step) => {
      const rows = [];
      const TIME_RE = /(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/;
      for (let i = startIndex; i >= 0 && i < LINES.length; i += step) {
        const ltxt = lineText(LINES[i]);
        if (!/^\s*Tiết\s*\d+/i.test(ltxt)) continue; // chỉ lấy dòng bắt đầu bằng "Tiết"
        if (/BUỔI SÁNG|BUỔI CHIỀU/i.test(ltxt)) continue; // bỏ dòng section

        const cols = Array.from({ length: 9 }, () => []);
        for (const c of LINES[i].cells) cols[whichCol(c.x)].push(c.str);

        const merged = cols.map((a) => a.join(" ").replace(/\s+/g, " ").trim());
        if (!/^\s*Tiết\s*\d+/i.test(merged[0])) {
          const fix = ltxt.match(/Tiết\s*\d+/i)?.[0] || "";
          merged[0] = fix || merged[0];
        }
        const time = merged[1].match(TIME_RE)?.[0] || merged[1] || "";
        rows.push([merged[0], time, ...merged.slice(2, 9)]);
      }
      return rows;
    };

    // 1) Thử quét từ sau header xuống dưới
    let rows = collectRows(headerIdx + 1, +1);
    // 2) Nếu vẫn rỗng (trường hợp header nằm cuối PDF) -> quét ngược lên
    if (!rows.length) rows = collectRows(headerIdx - 1, -1);
    if (!rows.length) {
      alert("Không đọc được bảng từ PDF này. Bạn thử file Excel/Word nhé?");
      return;
    }

    fillTableFromArray(rows);
    save("Import PDF");
    setStatus("Đã import từ PDF ✔️");
  }
  // --- Đổ dữ liệu vào bảng hiện tại (tự thêm/giảm hàng) ---
  // --- Helpers chuẩn hóa & phân buổi theo thời gian (AUTO-IMPORT) ---
  function pad2(n) {
    n = parseInt(n, 10);
    return (n < 10 ? "0" : "") + n;
  }
  function normalizeTimeRange(raw) {
    if (!raw) return "";
    let s = String(raw)
      .replace(/[–—-]/g, "-")
      .replace(/[hH]/g, ":")
      .replace(/\s+/g, " ")
      .trim();
    const m = s.match(/(\d{1,2})[:hH]?(\d{2})?\s*-\s*(\d{1,2})[:hH]?(\d{2})?/);
    if (!m) return raw.toString().trim();
    const h1 = pad2(m[1]),
      m1 = pad2(m[2] ?? "00");
    const h2 = pad2(m[3]),
      m2 = pad2(m[4] ?? "00");
    return `${h1}:${m1}–${h2}:${m2}`;
  }
  function parseStartHour(timeRange) {
    const m = String(timeRange).match(/(\d{2}):(\d{2})\s*[–-]/);
    if (!m) return NaN;
    return parseInt(m[1], 10);
  }
  function classifyAmPmByTime(rows) {
    // rows: mảng dòng chuẩn [Tiet, Time, Thu2..CN]
    const amRows = [],
      pmRows = [],
      unknown = [];
    for (const r of rows) {
      const t = normalizeTimeRange(r[1] || "");
      const hh = parseStartHour(t);
      const row = [r[0], t, ...r.slice(2)];
      if (Number.isNaN(hh)) unknown.push(row);
      else if (hh < 12) amRows.push(row);
      else pmRows.push(row);
    }
    for (const r of unknown) {
      (amRows.length <= pmRows.length ? amRows : pmRows).push(r);
    }
    return { amRows, pmRows };
  }

  // --- Đổ dữ liệu vào bảng hiện tại (tự thêm/giảm hàng & phân buổi theo giờ) ---
  function fillTableFromArray(arr) {
    // 1) Chuẩn hoá mảng: giữ dòng có nội dung
    let rows = (arr || [])
      .map((r) => (Array.isArray(r) ? r : [r]))
      .filter((r) => r.join("").trim().length > 0);

    // 2) Nếu hàng đầu là header (có "Tiết" & "Giờ") thì bỏ
    if (
      rows.length &&
      /tiết/i.test(String(rows[0][0])) &&
      /giờ/i.test(rows[0].slice(0, 2).join(" "))
    ) {
      rows.shift();
    }

    // 3) Chuẩn hoá cột 1 về "Tiết X"
    rows = rows.map((r) => {
      const copy = [...r];
      if (copy[0] != null && /^\d+$/.test(String(copy[0]).trim())) {
        copy[0] = "Tiết " + String(copy[0]).trim();
      }
      return copy;
    });

    // 4) Phân buổi theo thời gian (chuẩn hoá time về hh:mm–hh:mm)
    const { amRows, pmRows } = classifyAmPmByTime(rows);

    // 5) Cập nhật số hàng & dựng lại bảng
    COUNTS.am = amRows.length;
    COUNTS.pm = pmRows.length;
    buildTable(); // dùng buildTable() như hiện tại để tạo đúng dataset

    // 6) Hàm đổ 1 dòng an toàn theo dataset
    const putLine = (sec, pIndex1, line) => {
      console.log("[FILL] putLine", sec, pIndex1, line);
      if (!line) return;
      const time = String(line[1] || "").trim(); // đã normalize
      const timeTd = tbody.querySelector(`td[data-time="${sec}-${pIndex1}"]`);
      if (!timeTd) {
        console.warn("[FILL] timeTd not found", sec, pIndex1);
      }

      if (timeTd) timeTd.textContent = time;

      for (let d = 0; d < HEADERS.length; d++) {
        const val = String(line[d + 2] || "").trim();
        const td = tbody.querySelector(
          `td[data-cell="${sec}-${d}-${pIndex1}"]`
        );
        if (!td && val) {
          console.warn("[FILL] td not found", sec, d, pIndex1);
        }
        if (td) td.textContent = val;
      }
    };

    // 7) Đổ phần sáng & chiều
    for (let i = 0; i < amRows.length; i++) putLine("am", i + 1, amRows[i]);
    for (let i = 0; i < pmRows.length; i++) putLine("pm", i + 1, pmRows[i]);

    save("Import dữ liệu");
    setStatus("Đã import dữ liệu vào bảng ✔️");
  }

  // INIT
  load();
  populateVaultDropdown();
})();

// --- Wrapper tên hàm import để khớp event file picker (nếu chưa có) ---
if (
  typeof handleExcelFile !== "function" &&
  typeof importExcel === "function"
) {
  async function handleExcelFile(file) {
    return importExcel(file);
  }
}
if (typeof handleWordFile !== "function" && typeof importWord === "function") {
  async function handleWordFile(file) {
    return importWord(file);
  }
}
if (typeof handlePdfFile !== "function" && typeof importPdf === "function") {
  async function handlePdfFile(file) {
    return importPdf(file);
  }
}

// --- Wrapper bổ sung cho PDF (nếu có importPDF) ---
if (typeof handlePdfFile !== "function" && typeof importPDF === "function") {
  async function handlePdfFile(file) {
    return importPDF(file);
  }
}

// ===== // ===== PDF.js loader & text extractor (fallback universal) =====
async function ensurePdfJs() {
  if (window.pdfjsLib) return true;
  return await new Promise((resolve) => {
    const s = document.createElement("script");
    // CDN ổn định cho pdfjs-dist v3
    s.src = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js";
    s.onload = () => {
      try {
        // worker từ CDN (tránh lỗi cross-origin)
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
          resolve(true);
        } else resolve(false);
      } catch {
        resolve(false);
      }
    };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

// Đọc toàn bộ text từ PDF thành mảng dòng (string per line)
async function extractTextFromPdf(file) {
  try {
    await ensurePdfJs();
    if (!window.pdfjsLib) throw new Error("pdfjsLib not loaded");
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Gộp các item theo dòng (y gần nhau)
      const rows = [];
      const Y_TH = 2.0;
      for (const i of content.items) {
        const y = Math.round(i.transform[5]);
        const text = (i.str || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        let row = rows.find((r) => Math.abs(r.y - y) <= Y_TH);
        if (!row) {
          row = { y, parts: [] };
          rows.push(row);
        }
        row.parts.push({ x: i.transform[4], str: text });
      }
      rows.sort((a, b) => b.y - a.y); // từ trên xuống
      for (const r of rows) {
        r.parts.sort((a, b) => a.x - b.x);
        lines.push(
          r.parts
            .map((t) => t.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
        );
      }
    }
    return lines;
  } catch (e) {
    console.warn("extractTextFromPdf error:", e);
    return [];
  }
}
//  UNIVERSAL PDF IMPORT (đa chiến lược) =====
async function importPdfUniversal(file) {
  const okRows = (rows) =>
    Array.isArray(rows) && rows.length && rows.every((r) => Array.isArray(r));
  const TIME_RGX = /(\d{1,2})[:hH]?(\d{2})?\s*[–—-]\s*(\d{1,2})[:hH]?(\d{2})?/;
  const isTietCell = (s) => /\btiết\b/i.test(String(s || ""));
  const isTimeCell = (s) => TIME_RGX.test(String(s || ""));

  // helper: normalize table rows & filter garbage
  function cleanRows(rows) {
    if (!okRows(rows)) return [];
    // remove pure empty lines
    rows = rows.filter((r) => r.join("").trim().length > 0);
    // ensure "Tiết X" format
    rows = rows.map((r) => {
      const rr = [...r];
      if (rr[0] == null) rr[0] = "";
      const t0 = String(rr[0]).trim();
      if (/^\d+$/.test(t0)) rr[0] = "Tiết " + t0;
      else if (/^\s*tiết\s*\d+/i.test(t0)) {
        rr[0] = t0.replace(/^\s*tiết\s*/i, "Tiết ");
      }
      // normalize time
      rr[1] = normalizeTimeRange(rr[1] || "");
      return rr;
    });
    return rows;
  }

  // STRATEGY A: dùng importPDF/importPdf sẵn có
  try {
    if (typeof importPDF === "function") {
      const before = getState();
      await importPDF(file); // hàm sẵn có sẽ gọi fillTableFromArray
      // kiểm tra xem times có thay đổi
      const after = getState();
      const changed = JSON.stringify(before) !== JSON.stringify(after);
      if (changed) {
        setStatus("PDF: Strategy A (importPDF) ✅");
        return;
      }
    } else if (typeof importPdf === "function") {
      const before = getState();
      await importPdf(file);
      const after = getState();
      const changed = JSON.stringify(before) !== JSON.stringify(after);
      if (changed) {
        setStatus("PDF: Strategy A (importPdf) ✅");
        return;
      }
    }
  } catch (e) {
    console.warn("Strategy A failed:", e);
  }

  // Parse thô bằng pdf.js (nếu app đã có loader sẵn tên parsePdfToLines)
  // YÊU CẦU: app của bạn đã có function parsePdfToLines(file): Promise<[{cells:[{x,y,str}]}...]>
  let LINES = null;
  try {
    if (typeof parsePdfToLines === "function") {
      LINES = await parsePdfToLines(file);
    }
  } catch (e) {
    console.warn("parsePdfToLines failed", e);
  }

  // Nếu có được LINES, triển khai các chiến lược dựa vào toạ độ
  if (Array.isArray(LINES) && LINES.length) {
    const lineText = (ln) =>
      (ln?.cells || [])
        .map((c) => c.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    const whichCol = (x, grid) => {
      let idx = 0,
        best = 1e9;
      for (let i = 0; i < grid.length; i++) {
        const d = Math.abs(x - grid[i]);
        if (d < best) {
          best = d;
          idx = i;
        }
      }
      return idx;
    };
    // Tìm header ở bất cứ đâu chứa "Tiết" và "Giờ"
    let headerIdx = -1;
    for (let i = 0; i < LINES.length; i++) {
      const t = lineText(LINES[i]);
      if (/\btiết\b/i.test(t) && /\bgiờ\b/i.test(t)) {
        headerIdx = i;
        break;
      }
    }
    // Chiến lược B: có header → lấy tâm cột từ header
    if (headerIdx !== -1) {
      // gom tâm x bằng trung bình x từng ô header (9 cột: Tiết, Giờ, Thứ 2..CN)
      const header = LINES[headerIdx];
      const colsX = [];
      if (header && header.cells) {
        // 9 cột kỳ vọng, nhưng nếu PDF thiếu, dùng cluster đơn giản
        const xs = header.cells.map((c) => c.x).sort((a, b) => a - b);
        // cluster khoảng cách > threshold => col mới
        const grid = [];
        const TH = 10; // px
        for (const xv of xs) {
          if (!grid.length || Math.abs(xv - grid[grid.length - 1]) > TH)
            grid.push(xv);
        }
        // pad tới 9 cột bằng cách nội suy (an toàn)
        while (grid.length < 9) {
          grid.push(grid[grid.length - 1] + (grid[1] - grid[0] || 40));
        }
        // truncate nếu thừa
        while (grid.length > 9) grid.pop();

        const collectRows = (start, step) => {
          const out = [];
          for (let i = start; i >= 0 && i < LINES.length; i += step) {
            const t = lineText(LINES[i]);
            if (/BUỔI SÁNG|BUỔI CHIỀU/i.test(t)) continue;
            // bắt buộc phải là dòng dữ liệu (có Tiết hoặc giờ)
            if (!/\btiết\b/i.test(t) && !TIME_RGX.test(t)) continue;
            const cols = Array.from({ length: 9 }, () => []);
            for (const c of LINES[i].cells)
              cols[whichCol(c.x, grid)].push(c.str);
            const merged = cols.map((a) =>
              a.join(" ").replace(/\s+/g, " ").trim()
            );
            const row0 = merged[0] || t.match(/Tiết\s*\d+/i)?.[0] || "";
            const time = normalizeTimeRange(
              merged[1] || t.match(TIME_RGX)?.[0] || ""
            );
            out.push([row0, time, ...merged.slice(2, 9)]);
          }
          return out;
        };
        let rows = collectRows(headerIdx + 1, +1);
        if (!rows.length) rows = collectRows(headerIdx - 1, -1);
        rows = cleanRows(rows);
        if (rows.length) {
          fillTableFromArray(rows);
          setStatus("PDF: Strategy B (header grid) ✅");
          return;
        }
      }
    }

    // Chiến lược C: không có header → tự cluster x từ các dòng có 'Tiết' hoặc có giờ
    const candIdx = [];
    for (let i = 0; i < LINES.length; i++) {
      const t = lineText(LINES[i]);
      if (/\btiết\b/i.test(t) || TIME_RGX.test(t)) candIdx.push(i);
    }
    if (candIdx.length) {
      // Gom tất cả x của các dòng ứng viên -> cluster 9 cột
      const xs = [];
      for (const i of candIdx) {
        for (const c of LINES[i].cells) xs.push(c.x);
      }
      xs.sort((a, b) => a - b);
      const grid = [];
      const TH = 10;
      for (const xv of xs) {
        if (!grid.length || Math.abs(xv - grid[grid.length - 1]) > TH)
          grid.push(xv);
      }
      while (grid.length < 9) {
        grid.push(grid[grid.length - 1] + (grid[1] - grid[0] || 40));
      }
      while (grid.length > 9) grid.pop();

      const rows = [];
      for (const i of candIdx) {
        const cols = Array.from({ length: 9 }, () => []);
        for (const c of LINES[i].cells) cols[whichCol(c.x, grid)].push(c.str);
        const merged = cols.map((a) => a.join(" ").replace(/\s+/g, " ").trim());
        const t = lineText(LINES[i]);
        const row0 = merged[0] || t.match(/Tiết\s*\d+/i)?.[0] || "";
        const time = normalizeTimeRange(
          merged[1] || t.match(TIME_RGX)?.[0] || ""
        );
        // validate: phải có tiết hoặc giờ
        if (isTietCell(row0) || isTimeCell(time)) {
          rows.push([row0, time, ...merged.slice(2, 9)]);
        }
      }
      const cleaned = cleanRows(rows);
      if (cleaned.length) {
        console.log("[PDF] fill with rows:", cleaned.slice(0, 3));
        fillTableFromArray(cleaned);
        setStatus("PDF: Strategy C (cluster headerless) ✅");
        return;
      }
    }
  }

  // Chiến lược D: fallback text (split theo khoảng trắng nhiều/tabs)
  try {
    if (typeof extractTextFromPdf === "function") {
      const lines = await extractTextFromPdf(file); // mảng chuỗi
      const rows = [];
      for (const raw of lines) {
        const s = String(raw || "")
          .replace(/\t/g, "  ")
          .replace(/\s{2,}/g, " | ");
        // kỳ vọng 9 ô (Tiết | Giờ | 7 ngày) — nếu ít hơn thì pad
        let arr = s.split("|").map((x) => x.trim());
        if (arr.length >= 2 && (isTietCell(arr[0]) || isTimeCell(arr[1]))) {
          while (arr.length < 9) arr.push("");
          arr = arr.slice(0, 9);
          rows.push([arr[0], arr[1], ...arr.slice(2, 9)]);
        }
      }
      const cleaned = cleanRows(rows);
      if (cleaned.length) {
        console.log("[PDF] fill with rows:", cleaned.slice(0, 3));
        fillTableFromArray(cleaned);
        setStatus("PDF: Strategy D (text fallback) ✅");
        return;
      }
    }
  } catch (e) {
    console.warn("Strategy D failed", e);
  }

  alert(
    "Không thể nhận dạng bảng PDF ở mọi chiến lược. Thử Excel/Word hoặc chia sẻ file để check nhé."
  );
}

// Ưu tiên universal
if (typeof handlePdfFile !== "function") {
  async function handlePdfFile(file) {
    return importPdfUniversal(file);
  }
} else {
  // Nếu đã có, override nhẹ để luôn ưu tiên universal
  const __origHandlePdf = handlePdfFile;
  async function handlePdfFile(file) {
    try {
      return await importPdfUniversal(file);
    } catch (e) {
      console.warn("Universal failed, fallback to original", e);
      return __origHandlePdf(file);
    }
  }
}

// ===== STRONG PDF IMPORT (2-buổi, mọi định dạng) =====
async function importPdfStrong(file) {
  console.log(
    "[PDF] importPdfStrong start",
    file && file.name,
    file && file.type
  );
  setStatus("Đang đọc PDF (strong)…");
  try {
    await ensurePdfJs();
  } catch (e) {
    console.warn("ensurePdfJs error", e);
  }
  if (!window.pdfjsLib) {
    setStatus("Không thể nạp pdf.js để đọc PDF (offline?). Thử lại sau.");
    return;
  }
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;

  const lines = [];
  const Y_TH = 2.5;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = [];
    for (const i of content.items) {
      const y = Math.round(i.transform[5]);
      const x = i.transform[4];
      const text = (i.str || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      let row = rows.find((r) => Math.abs(r.y - y) <= Y_TH);
      if (!row) {
        row = { y, parts: [] };
        rows.push(row);
      }
      row.parts.push({ x, str: text });
    }
    rows.sort((a, b) => b.y - a.y);
    rows.forEach((r) => r.parts.sort((a, b) => a.x - b.x));
    lines.push(...rows);
    console.log("[PDF] page lines:", rows.length);
  }

  const TIME_RGX =
    /(\d{1,2})[:hH]?(\d{1,2})?\s*[–—-]\s*(\d{1,2})[:hH]?(\d{1,2})?/;
  const interesting = lines.filter((r) => {
    const t = r.parts.map((p) => p.str).join(" ");
    return /\\btiết\\b/i.test(t) || TIME_RGX.test(t);
  });
  let xs = [];
  interesting.forEach((r) => r.parts.forEach((p) => xs.push(p.x)));
  xs.sort((a, b) => a - b);
  if (!xs.length) {
    setStatus("Không tìm thấy cấu trúc cột trong PDF.");
    return;
  }
  const TH = Math.max(8, Math.min(24, (xs[xs.length - 1] - xs[0]) / 40));
  const grid = [];
  for (const xv of xs) {
    if (!grid.length || Math.abs(xv - grid[grid.length - 1]) > TH)
      grid.push(xv);
  }
  function toNine(arr) {
    if (arr.length === 9) return arr;
    if (arr.length < 9) {
      const out = arr.slice();
      while (out.length < 9) {
        const step =
          (out[out.length - 1] - out[0]) / (out.length - 1 || 1) || 40;
        out.push(out[out.length - 1] + step);
      }
      return out.slice(0, 9);
    } else {
      const out = [];
      for (let i = 0; i < 9; i++) {
        const idx = Math.round((i * (arr.length - 1)) / 8);
        out.push(arr[idx]);
      }
      return out;
    }
  }
  const GRID = toNine(grid);
  console.log("[PDF] GRID cols:", GRID.length, GRID);

  function whichCol(x) {
    let best = 0,
      bd = Infinity;
    for (let i = 0; i < GRID.length; i++) {
      const d = Math.abs(x - GRID[i]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  const rows = [];
  for (const ln of lines) {
    const cols = Array.from({ length: 9 }, () => []);
    for (const p of ln.parts) {
      cols[whichCol(p.x)].push(p.str);
    }
    const merged = cols.map((a) => a.join(" ").replace(/\\s+/g, " ").trim());
    const lineText = merged.join(" ");
    if (!/\\btiết\\b/i.test(lineText) && !TIME_RGX.test(lineText)) continue;

    let tiet = merged[0];
    const mTiet = lineText.match(/Tiết\\s*\\d+/i);
    if (!/^\\s*Tiết/i.test(tiet) && mTiet)
      tiet = mTiet[0].replace(/\\s+/g, " ").trim();

    let gio = merged[1];
    const mTime = lineText.match(TIME_RGX);
    if (!TIME_RGX.test(gio) && mTime) {
      gio = mTime[0].replace(/[—-]/g, "-").replace(/[hH]/g, ":");
    }
    rows.push([tiet, gio, ...merged.slice(2, 9)]);
  }

  function pad2(n) {
    n = parseInt(n || "0", 10);
    return (n < 10 ? "0" : "") + n;
  }
  function normTime(s) {
    if (!s) return "";
    const m = String(s)
      .replace(/[–—-]/g, "-")
      .replace(/[hH]/g, ":")
      .match(/(\\d{1,2})[:]?(\\d{1,2})?\\s*-\\s*(\\d{1,2})[:]?(\\d{1,2})?/);
    if (!m) return "";
    const h1 = pad2(m[1]),
      m1 = pad2(m[2] || "00");
    const h2 = pad2(m[3]),
      m2 = pad2(m[4] || "00");
    return `${h1}:${m1}–${h2}:${m2}`;
  }
  let cleaned = rows
    .map((r) => {
      const rr = [...r];
      if (/^\\d+$/.test(String(rr[0]).trim())) rr[0] = "Tiết " + rr[0].trim();
      if (/^\\s*tiết/i.test(rr[0]))
        rr[0] = rr[0].replace(/^\\s*tiết\\s*/i, "Tiết ");
      rr[1] = normTime(rr[1]);
      return rr;
    })
    .filter(
      (r) =>
        /\\bTiết\\s*\\d+/i.test(r[0]) &&
        /\\d{2}:\\d{2}–\\d{2}:\\d{2}/.test(r[1])
    );

  function startHhMm(r) {
    const m = r[1].match(/(\\d{2}):(\\d{2})/);
    if (!m) return 0;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }
  cleaned.sort((a, b) => startHhMm(a) - startHhMm(b));

  if (!cleaned.length) {
    setStatus("Không trích xuất được dòng 'Tiết + Giờ' từ PDF.");
    return;
  }

  try {
    console.log("[PDF] fill with rows:", cleaned.slice(0, 3));
    fillTableFromArray(cleaned);
    save("Import PDF (Strong)");
    setStatus("Đã import PDF (2 buổi) ✔️");
  } catch (e) {
    console.error("fillTableFromArray error", e);
    setStatus("Không thể đổ dữ liệu vào bảng.");
  }
}

if (typeof handlePdfFile !== "function") {
  async function handlePdfFile(file) {
    return importPdfStrong(file);
  }
} else {
  const __oldHandlePdf = handlePdfFile;
  async function handlePdfFile(file) {
    try {
      return await importPdfStrong(file);
    } catch (e) {
      console.warn("Strong import failed, fallback original", e);
      return __oldHandlePdf(file);
    }
  }
}

// ===== STRONG PDF IMPORT (2-buổi, universal) =====
async function importPdfStrong(file) {
  console.log(
    "[PDF] importPdfStrong start",
    file && file.name,
    file && file.type
  );
  setStatus("Đang đọc PDF (strong)…");
  try {
    await ensurePdfJs();
  } catch (e) {
    console.warn("ensurePdfJs error", e);
  }
  if (!window.pdfjsLib) {
    if (typeof setStatus === "function")
      setStatus("Không thể nạp pdf.js (offline?).");
    return;
  }
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;

  const lines = [];
  const Y_TH = 2.5;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = [];
    for (const i of content.items) {
      const y = Math.round(i.transform[5]);
      const x = i.transform[4];
      const text = (i.str || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      let row = rows.find((r) => Math.abs(r.y - y) <= Y_TH);
      if (!row) {
        row = { y, parts: [] };
        rows.push(row);
      }
      row.parts.push({ x, str: text });
    }
    rows.sort((a, b) => b.y - a.y);
    rows.forEach((r) => r.parts.sort((a, b) => a.x - b.x));
    lines.push(...rows);
    console.log("[PDF] page lines:", rows.length);
  }

  const TIME_RGX =
    /(\d{1,2})[:hH]?(\d{1,2})?\s*[–—-]\s*(\d{1,2})[:hH]?(\d{1,2})?/;
  const interesting = lines.filter((r) => {
    const t = r.parts.map((p) => p.str).join(" ");
    return /\btiết\b/i.test(t) || TIME_RGX.test(t);
  });
  let xs = [];
  interesting.forEach((r) => r.parts.forEach((p) => xs.push(p.x)));
  xs.sort((a, b) => a - b);
  if (!xs.length) {
    if (typeof setStatus === "function")
      setStatus("Không thấy cấu trúc cột trong PDF.");
    return;
  }
  const TH = Math.max(8, Math.min(24, (xs[xs.length - 1] - xs[0]) / 40));
  const grid = [];
  for (const xv of xs) {
    if (!grid.length || Math.abs(xv - grid[grid.length - 1]) > TH)
      grid.push(xv);
  }
  function toNine(arr) {
    if (arr.length === 9) return arr;
    if (arr.length < 9) {
      const out = arr.slice();
      while (out.length < 9) {
        const step =
          (out[out.length - 1] - out[0]) / (out.length - 1 || 1) || 40;
        out.push(out[out.length - 1] + step);
      }
      return out.slice(0, 9);
    } else {
      const out = [];
      for (let i = 0; i < 9; i++) {
        const idx = Math.round((i * (arr.length - 1)) / 8);
        out.push(arr[idx]);
      }
      return out;
    }
  }
  const GRID = toNine(grid);
  console.log("[PDF] GRID cols:", GRID.length, GRID);
  const whichCol = (x) => {
    let best = 0,
      bd = 1e9;
    for (let i = 0; i < GRID.length; i++) {
      const d = Math.abs(x - GRID[i]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };

  const rows = [];
  for (const ln of lines) {
    const cols = Array.from({ length: 9 }, () => []);
    for (const p of ln.parts) cols[whichCol(p.x)].push(p.str);
    const merged = cols.map((a) => a.join(" ").replace(/\s+/g, " ").trim());
    const text = merged.join(" ");
    if (!/\btiết\b/i.test(text) && !TIME_RGX.test(text)) continue;

    let tiet = merged[0];
    const mTiet = text.match(/Tiết\s*\d+/i);
    if (!/^\s*Tiết/i.test(tiet) && mTiet)
      tiet = mTiet[0].replace(/\s+/g, " ").trim();

    let gio = merged[1];
    const mTime = text.match(TIME_RGX);
    if (!TIME_RGX.test(gio) && mTime) {
      gio = mTime[0].replace(/[—-]/g, "-").replace(/[hH]/g, ":");
    }
    rows.push([tiet, gio, ...merged.slice(2, 9)]);
  }

  const pad2 = (n) => {
    n = parseInt(n || "0", 10);
    return (n < 10 ? "0" : "") + n;
  };
  const normTime = (s) => {
    if (!s) return "";
    const m = String(s)
      .replace(/[–—-]/g, "-")
      .replace(/[hH]/g, ":")
      .match(/(\d{1,2})[:]?(\d{1,2})?\s*-\s*(\d{1,2})[:]?(\d{1,2})?/);
    if (!m) return "";
    const h1 = pad2(m[1]),
      m1 = pad2(m[2] || "00"),
      h2 = pad2(m[3]),
      m2 = pad2(m[4] || "00");
    return `${h1}:${m1}–${h2}:${m2}`;
  };
  let cleaned = rows
    .map((r) => {
      const rr = [...r];
      if (/^\d+$/.test(String(rr[0]).trim())) rr[0] = "Tiết " + rr[0].trim();
      if (/^\s*tiết/i.test(rr[0]))
        rr[0] = rr[0].replace(/^\s*tiết\s*/i, "Tiết ");
      rr[1] = normTime(rr[1]);
      return rr;
    })
    .filter(
      (r) => /\bTiết\s*\d+/i.test(r[0]) && /\d{2}:\d{2}–\d{2}:\d{2}/.test(r[1])
    );

  const startMin = (r) => {
    const m = r[1].match(/(\d{2}):(\d{2})/);
    return m ? +m[1] * 60 + +m[2] : 0;
  };
  console.log("[PDF] cleaned rows before sort:", cleaned.length);
  cleaned.sort((a, b) => startMin(a) - startMin(b));

  if (!cleaned.length) {
    if (typeof setStatus === "function")
      setStatus("Không trích xuất được dòng 'Tiết + Giờ' từ PDF.");
    return;
  }

  try {
    if (typeof fillTableFromArray === "function") {
      console.log("[PDF] fill with rows:", cleaned.slice(0, 3));
      fillTableFromArray(cleaned);
    }
    if (typeof save === "function") save("Import PDF (Strong)");
    if (typeof setStatus === "function") setStatus("Đã import PDF (2 buổi) ✔️");
  } catch (e) {
    console.error(e);
    if (typeof setStatus === "function")
      setStatus("Không thể đổ dữ liệu vào bảng.");
  }
}

if (typeof handlePdfFile !== "function") {
  async function handlePdfFile(file) {
    return importPdfStrong(file);
  }
} else {
  const __oldHandlePdf = handlePdfFile;
  async function handlePdfFile(file) {
    try {
      return await importPdfStrong(file);
    } catch (e) {
      console.warn("Strong import failed, fallback original", e);
      return __oldHandlePdf(file);
    }
  }
}

// ===== Force-route PDF import & suppress legacy alert =====
(function hardenPdfImport() {
  // 1) Suppress legacy popup for PDF import failure
  const ALERT_TEXTS = [
    "Không thể import file này",
    "Không thể import file này. Kiểm tra định dạng & cấu trúc bảng nhé.",
  ];
  const __nativeAlert = window.alert;
  window.alert = function (msg) {
    try {
      const s = String(msg || "");
      if (ALERT_TEXTS.some((t) => s.includes(t))) {
        console.warn("Suppressed legacy alert:", s);
        if (typeof setStatus === "function")
          setStatus("Parser cũ báo lỗi — chuyển sang trình đọc PDF mạnh...");
        return; // swallow popup
      }
    } catch {}
    return __nativeAlert.apply(window, arguments);
  };

  // 2) Force all PDF import paths to go through importPdfStrong
  const callStrong = async (file) => {
    try {
      return await importPdfStrong(file);
    } catch (e) {
      console.error("importPdfStrong error", e);
      if (typeof setStatus === "function") setStatus("Import PDF lỗi.");
    }
  };

  // Route common entry points
  if (typeof handlePdfFile !== "function") {
    window.handlePdfFile = async (file) => callStrong(file);
  } else {
    const __old = handlePdfFile;
    window.handlePdfFile = async (file) => {
      try {
        return await callStrong(file);
      } catch (e) {
        return __old(file);
      }
    };
  }

  if (typeof importPDF === "function") {
    window.__origImportPDF = importPDF;
  }
  window.importPDF = async (file) => callStrong(file);
  window.importPdf = async (file) => callStrong(file);

  // Some apps use generic importFile(file) switch-case; we can't rewrite here safely,
  // but at least any PDF-specific path will hit the strong importer now.
})();

// ===== Defensive hook: force-route any <input type="file"> changes to PDF importer =====
(function hookAnyFileInputs() {
  document.addEventListener(
    "change",
    async (ev) => {
      const el = ev.target;
      if (!el || el.tagName !== "INPUT" || el.type !== "file") return;
      const f = el.files && el.files[0];
      if (!f) return;
      const name = (f.name || "").toLowerCase();
      const isPdf = f.type === "application/pdf" || name.endsWith(".pdf");
      if (!isPdf) return; // để code cũ xử lý Excel/Word
      try {
        setStatus && setStatus("Đang đọc PDF…");
      } catch {}
      try {
        if (typeof handlePdfFile === "function") {
          await handlePdfFile(f);
        } else if (typeof importPdfStrong === "function") {
          await importPdfStrong(f);
        }
      } catch (e) {
        console.error("PDF import failed from hook:", e);
      } finally {
        try {
          el.value = "";
        } catch {}
      }
    },
    true
  );
})();

try {
  if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      window.pdfjsLib.GlobalWorkerOptions.workerSrc ||
      "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }
} catch (e) {}

// ==== DEBUG: setStatus polyfill (no-op UI) ====
if (typeof setStatus !== "function") {
  window.setStatus = function (msg) {
    console.log("[STATUS]", msg);
  };
}

// ===== IMPORT PDF SCHEDULE (AUTO-PATCH) =====
(function () {
  // Safe status helper
  const setStatusSafe =
    typeof setStatus === "function"
      ? setStatus
      : (msg) => console && console.log("[IMPORT]", msg);

  // ---- PDF.js dynamic loader (no errors if missing network; fail gracefully)
  async function ensurePdfJs() {
    if (window.pdfjsLib && window.pdfjsLib.getDocument) return window.pdfjsLib;
    // Avoid re-adding scripts
    const addScript = (src, id) =>
      new Promise((resolve, reject) => {
        if (document.getElementById(id)) return resolve();
        const s = document.createElement("script");
        s.src = src;
        s.id = id;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Không tải được " + src));
        document.head.appendChild(s);
      });

    // Use a stable cdnjs version (UMD build -> window.pdfjsLib)
    const base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
    await addScript(base + "pdf.min.js", "pdfjs-lib");
    // Worker
    if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        base + "pdf.worker.min.js";
    }
    if (!window.pdfjsLib || !window.pdfjsLib.getDocument) {
      throw new Error(
        "Không khởi tạo được PDF.js. Vui lòng kiểm tra mạng hoặc CDN."
      );
    }
    return window.pdfjsLib;
  }

  // ---- Geometry / text-group helpers
  function roundTo(n, step = 1) {
    return Math.round(n / step) * step;
  }
  function normalizeSpaces(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }
  function textToLines(items, yTol = 2) {
    // Group by Y with small tolerance, sort by X inside each group
    const rows = [];
    for (const it of items) {
      const x = it.transform ? it.transform[4] : it.x || 0;
      const y = it.transform ? it.transform[5] : it.y || 0;
      const str = it.str != null ? String(it.str) : "";
      if (!str) continue;
      let grp = rows.find((r) => Math.abs(r.y - y) <= yTol);
      if (!grp) {
        grp = { y, items: [] };
        rows.push(grp);
      }
      grp.items.push({ x, y, str });
    }
    rows.sort((a, b) => a.y - b.y);
    for (const r of rows) r.items.sort((a, b) => a.x - b.x);
    return rows;
  }

  function detectHeaderColumns(line) {
    // Expect tokens like "Tiết", "Giờ", "Thứ 2".. "Chủ nhật"
    const wanted = [
      "Tiết",
      "Giờ",
      "Thứ 2",
      "Thứ 3",
      "Thứ 4",
      "Thứ 5",
      "Thứ 6",
      "Thứ 7",
      "Chủ nhật",
    ];
    const cols = [];
    for (const w of wanted) {
      const t = line.items.find((it) => normalizeSpaces(it.str) === w);
      cols.push(t ? { name: w, x: t.x } : null);
    }
    // If header not on single line, try fuzzy
    const present = cols.filter(Boolean).length;
    if (present < 5) return null;
    // Build x-intervals by midpoints
    const xs = cols.map((c) => (c ? c.x : null));
    // Get sorted existing
    const pairs = xs
      .map((x, i) => ({ i, x }))
      .filter((p) => p.x != null)
      .sort((a, b) => a.x - b.x);
    for (let k = 0; k < pairs.length; k++) {
      const i = pairs[k].i;
      const x = pairs[k].x;
      const prevX = k > 0 ? pairs[k - 1].x : x - 80;
      const nextX = k < pairs.length - 1 ? pairs[k + 1].x : x + 80;
      cols[i] = {
        name: wanted[i],
        xStart: (prevX + x) / 2,
        xMid: x,
        xEnd: (x + nextX) / 2,
      };
    }
    // For missing, interpolate roughly
    for (let i = 0; i < cols.length; i++) {
      if (!cols[i]) {
        // find nearest defined neighbors
        let l = i - 1;
        while (l >= 0 && !cols[l]) l--;
        let r = i + 1;
        while (r < cols.length && !cols[r]) r++;
        if (l >= 0 && r < cols.length && cols[l] && cols[r]) {
          const span = (cols[r].xMid - cols[l].xMid) / (r - l);
          const xMid = cols[l].xMid + span * (i - l);
          const xStart = cols[l].xEnd;
          const xEnd = cols[r].xStart;
          cols[i] = { name: wanted[i], xStart, xMid, xEnd };
        } else if (l >= 0 && cols[l]) {
          const xMid = cols[l].xMid + 80;
          cols[i] = {
            name: wanted[i],
            xStart: cols[l].xEnd,
            xMid,
            xEnd: xMid + 80,
          };
        } else if (r < cols.length && cols[r]) {
          const xMid = cols[r].xMid - 80;
          cols[i] = {
            name: wanted[i],
            xStart: xMid - 80,
            xMid,
            xEnd: cols[r].xStart,
          };
        } else {
          cols[i] = { name: wanted[i], xStart: 0, xMid: 0, xEnd: 9999 };
        }
      }
    }
    return cols;
  }

  function findSectionMarkers(lines) {
    // Return y of "BUỔI SÁNG" and "BUỔI CHIỀU"
    const marks = {};
    for (const ln of lines) {
      const text = normalizeSpaces(
        ln.items.map((t) => t.str).join(" ")
      ).toUpperCase();
      if (text.includes("BUỔI SÁNG")) marks.am = ln.y;
      if (text.includes("BUỔI CHIỀU")) marks.pm = ln.y;
    }
    return marks;
  }

  function collectRows(lines, headerCols) {
    // Identify row anchor lines by the token "Tiết {n}"
    const isTietLine = (ln) =>
      /\bTiết\s*\d+\b/.test(ln.items.map((t) => t.str).join(" "));
    const anchors = lines
      .map((ln, idx) => ({ idx, y: ln.y, ln }))
      .filter((x) => isTietLine(x.ln));
    if (!anchors.length) return [];

    const rows = [];
    for (let k = 0; k < anchors.length; k++) {
      const a = anchors[k];
      const b = anchors[k + 1];
      const yTop = a.y - 1;
      const yBot = b ? (a.y + b.y) / 2 : a.y + 50; // heuristic
      const band = lines.filter((ln) => ln.y >= yTop && ln.y < yBot);

      // Merge all text in band
      const tokens = [];
      for (const ln of band) for (const it of ln.items) tokens.push(it);
      tokens.sort((p, q) => p.x - q.x);

      // Build cells by header column intervals
      const cols = headerCols;
      const buckets = cols.map(() => []);
      for (const it of tokens) {
        // pick the idx with it.x within [xStart,xEnd)
        let idx = -1;
        for (let i = 0; i < cols.length; i++) {
          const c = cols[i];
          if (it.x >= c.xStart && it.x < c.xEnd) {
            idx = i;
            break;
          }
        }
        if (idx === -1) {
          // push to nearest mid
          let best = 0,
            bestD = Infinity;
          for (let i = 0; i < cols.length; i++) {
            const d = Math.abs(it.x - cols[i].xMid);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
          idx = best;
        }
        buckets[idx].push(it.str);
      }
      // Extract period number & time from buckets[0..1]
      const b0 = normalizeSpaces(buckets[0].join(" "));
      const periodMatch = b0.match(/Tiết\s*(\d+)/i);
      const period = periodMatch
        ? parseInt(periodMatch[1], 10)
        : rows.length + 1;

      const timeRaw = normalizeSpaces(buckets[1].join(" "));
      const timeMatch = timeRaw.match(
        /(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/
      );
      const time = timeMatch
        ? timeMatch[1].padStart(5, "0") + "–" + timeMatch[2].padStart(5, "0")
        : timeRaw;

      const dayCells = [];
      for (let d = 0; d < 7; d++) {
        const txt = normalizeSpaces((buckets[d + 2] || []).join(" "));
        dayCells.push(txt);
      }

      rows.push({ y: a.y, period, time, cells: dayCells });
    }
    return rows;
  }

  async function parseSchedulePdf(arrayBuffer) {
    const pdfjs = await ensurePdfJs();
    const task = pdfjs.getDocument({ data: arrayBuffer });
    const doc = await task.promise;

    // Gather text items from all pages
    const allItems = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const txt = await page.getTextContent();
      for (const it of txt.items) allItems.push(it);
    }
    const lines = textToLines(allItems, 1.8);
    if (!lines.length) throw new Error("Không đọc được văn bản từ PDF.");

    // Find header line (contains at least 5 of the expected labels)
    let headerCols = null;
    for (const ln of lines) {
      const cols = detectHeaderColumns(ln);
      if (cols) {
        headerCols = cols;
        break;
      }
    }
    if (!headerCols)
      throw new Error("Không tìm thấy dòng tiêu đề (Tiết / Giờ / Thứ ...).");

    // Find section markers & rows
    const marks = findSectionMarkers(lines);
    const rows = collectRows(lines, headerCols);
    if (!rows.length)
      throw new Error("Không tìm thấy các dòng 'Tiết' trong PDF.");

    // Split AM/PM by marker if available; else by heuristic (<= 13:00 belongs AM)
    const amRows = [],
      pmRows = [];
    if (marks.pm) {
      for (const r of rows) {
        if (r.y < marks.pm) amRows.push(r);
        else pmRows.push(r);
      }
    } else {
      // Heuristic via time
      const toMin = (hhmm) => {
        const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10) || 0);
        return h * 60 + m;
      };
      for (const r of rows) {
        const t = (r.time || "").split("–")[0] || "";
        const mins = /^\d{2}:\d{2}$/.test(t) ? toMin(t) : 0;
        if (mins && mins < 13 * 60) amRows.push(r);
        else pmRows.push(r);
      }
    }

    // Sort periods ascending within each section
    amRows.sort((a, b) => a.period - b.period);
    pmRows.sort((a, b) => a.period - b.period);

    return { headerCols, amRows, pmRows };
  }

  function buildStateFromParsed(parsed) {
    const HEADS = [
      "Thứ 2",
      "Thứ 3",
      "Thứ 4",
      "Thứ 5",
      "Thứ 6",
      "Thứ 7",
      "Chủ nhật",
    ];
    const counts = {
      am: parsed.amRows.length || 0,
      pm: parsed.pmRows.length || 0,
    };
    const times = { am: {}, pm: {} };
    const cells = {};
    const fill = (section, rows) => {
      rows.forEach((r, idx) => {
        const p = idx + 1; // renumber to 1..n in our table
        times[section][p] = r.time || "";
        for (let d = 0; d < 7; d++) {
          cells[`${section}-${d}-${p}`] = r.cells[d] || "";
        }
      });
    };
    fill("am", parsed.amRows);
    fill("pm", parsed.pmRows);

    return { headers: HEADS, counts, times, cells };
  }

  async function importScheduleFromPdfFile(file) {
    try {
      if (!file || !/\.pdf$/i.test(file.name)) {
        alert("Vui lòng chọn tệp PDF hợp lệ.");
        return;
      }
      setStatusSafe("Đang đọc PDF…");
      const buf = await file.arrayBuffer();
      const parsed = await parseSchedulePdf(buf);
      const state = buildStateFromParsed(parsed);

      // Apply to UI
      if (typeof setState === "function") {
        setState(state);
      } else {
        console.warn("setState() không có sẵn; không thể đổ dữ liệu vào bảng.");
      }
      if (typeof save === "function") {
        save("Nhập từ PDF");
      }
      setStatusSafe("Đã nhập dữ liệu từ PDF ✔️");
      alert("Đã nhập xong. Dữ liệu đã khớp vào bảng!");
    } catch (err) {
      console.error(err);
      alert(
        "Lỗi nhập PDF: " +
          err.message +
          "\nGợi ý: hãy đảm bảo PDF là bảng có cột 'Tiết', 'Giờ', 'Thứ 2…Chủ nhật'."
      );
      setStatusSafe("Nhập PDF thất bại ❌");
    }
  }

  // --- UI wiring (defensive): a hidden input + optional button with id 'importPdfBtn'
  function setupPdfImportUI() {
    // Hidden input (singleton)
    let picker = document.getElementById("tkb_pdf_picker");
    if (!picker) {
      picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "application/pdf";
      picker.id = "tkb_pdf_picker";
      picker.style.display = "none";
      document.body.appendChild(picker);
      picker.addEventListener("change", (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) importScheduleFromPdfFile(f);
        picker.value = "";
      });
    }

    // Bind to existing button if present
    const btn =
      document.getElementById("importPdfBtn") ||
      document.getElementById("importBtn");
    if (btn && !btn.dataset._wiredPdf) {
      btn.dataset._wiredPdf = "1";
      btn.addEventListener("click", () => picker.click());
      btn.title = (btn.title || "") + " (Chọn PDF thời khoá biểu để nhập)";
    }

    // Keyboard shortcut: Ctrl+Shift+I
    document.addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        picker.click();
      }
    });

    // Expose programmatic API
    window.TKB = window.TKB || {};
    window.TKB.importPdf = () => picker.click();
    window.TKB.importPdfFromFile = (file) => importScheduleFromPdfFile(file);
    window.TKB._ensurePdfJs = ensurePdfJs;
  }

  // Auto-setup after DOM ready
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setupPdfImportUI();
  } else {
    document.addEventListener("DOMContentLoaded", setupPdfImportUI);
  }
})();
// ===== END IMPORT PDF SCHEDULE (AUTO-PATCH) =====

// ===== Fallback DOM filler for PDF-imported rows (appended by assistant) =====
(function () {
  if (typeof window.__TKB_FALLBACK_FILLER_V2__ !== "undefined") return;
  window.__TKB_FALLBACK_FILLER_V2__ = true;

  // cleaned: Array of [ "Tiết x", "HH:MM–HH:MM", ...7 day values ]
  function __fallbackFillTableFromArray(cleaned) {
    try {
      const tbody = document.querySelector("#tbody");
      if (!tbody) {
        console.warn("[PDF Fallback] tbody not found");
        return;
      }
      const DAYS = 7; // Thứ 2 → Chủ nhật
      const START_CUTOFF_MIN = 12 * 60; // phân buổi theo GIỜ ĐẦU: < 12:00 = SÁNG, >= 12:00 = CHIỀU

      const getStartMinutes = (s) => {
        const m = String(s || "").match(/(\d{1,2}):(\d{2})/);
        if (!m) return NaN;
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      };

      // Split AM/PM by start time
      const amRows = [],
        pmRows = [];
      for (const r of cleaned) {
        const mins = getStartMinutes(r[1]);
        if (!isNaN(mins) && mins >= START_CUTOFF_MIN) pmRows.push(r);
        else amRows.push(r);
      }

      // Ensure enough DOM rows for each section
      function countExisting(sec) {
        let i = 1,
          count = 0;
        while (tbody.querySelector(`td[data-time="${sec}-${i}"]`)) {
          count = i;
          i++;
        }
        return count;
      }
      function ensureRows(sec, need) {
        // Prefer native COUNTS + buildTable if có
        try {
          if (window.COUNTS && typeof window.buildTable === "function") {
            const key = sec === "am" ? "am" : "pm";
            if (window.COUNTS[key] !== need) {
              window.COUNTS[key] = need;
              window.buildTable();
            }
            return;
          }
        } catch (_) {}

        // Otherwise, clone or create rows directly
        const existing = countExisting(sec);
        if (existing >= need) return;

        // Try to clone the last row of this section as a template; else, make fresh <tr>
        let lastIdx = existing;
        let anchor = null;
        if (lastIdx > 0) {
          anchor =
            tbody.querySelector(`td[data-time="${sec}-${lastIdx}"]`)
              ?.parentElement || null;
        }
        for (let i = existing + 1; i <= need; i++) {
          const tr = document.createElement("tr");
          // cột Tiết (thường là thứ tự) — nếu dự án có cột riêng, giữ trống
          const tdTiet = document.createElement("td");
          tdTiet.textContent = `Tiết ${i}`;
          tr.appendChild(tdTiet);

          // cột Giờ
          const tdTime = document.createElement("td");
          tdTime.setAttribute("data-time", `${sec}-${i}`);
          tr.appendChild(tdTime);

          // 7 cột thứ
          for (let d = 0; d < DAYS; d++) {
            const td = document.createElement("td");
            td.setAttribute("data-cell", `${sec}-${d}-${i}`);
            tr.appendChild(td);
          }

          if (anchor && anchor.nextSibling) {
            tbody.insertBefore(tr, anchor.nextSibling);
            anchor = tr;
          } else {
            tbody.appendChild(tr);
          }
        }
      }

      ensureRows("am", amRows.length);
      ensureRows("pm", pmRows.length);

      // Clear current cells in target ranges
      function clearSec(sec, n) {
        for (let i = 1; i <= n; i++) {
          const timeTd = tbody.querySelector(`td[data-time="${sec}-${i}"]`);
          if (timeTd) timeTd.textContent = "";
          for (let d = 0; d < DAYS; d++) {
            const td = tbody.querySelector(`td[data-cell="${sec}-${d}-${i}"]`);
            if (td) td.textContent = "";
          }
        }
      }
      clearSec("am", amRows.length);
      clearSec("pm", pmRows.length);

      // Fill
      function putLine(sec, idx1, row) {
        const time = String(row[1] || "").trim();
        const timeTd = tbody.querySelector(`td[data-time="${sec}-${idx1}"]`);
        if (timeTd) timeTd.textContent = time;

        for (let d = 0; d < DAYS; d++) {
          const val = __normCell(String(row[2 + d] || "").trim());
          const td = tbody.querySelector(`td[data-cell="${sec}-${d}-${idx1}"]`);
          if (td) td.textContent = val;
        }
      }
      for (let i = 0; i < amRows.length; i++) putLine("am", i + 1, amRows[i]);
      for (let i = 0; i < pmRows.length; i++) putLine("pm", i + 1, pmRows[i]);

      try {
        typeof save === "function" && save("Import PDF (auto-append rows)");
      } catch {}
      try {
        typeof setStatus === "function" &&
          setStatus(
            `Đã import PDF ✔️ (Sáng ${amRows.length} tiết, Chiều ${pmRows.length} tiết)`
          );
      } catch {}
    } catch (e) {
      console.error("[PDF Fallback] fill error", e);
    }
  }

  if (typeof window.fillTableFromArray !== "function") {
    window.fillTableFromArray = __fallbackFillTableFromArray;
  } else {
    // nếu đã có, bọc lại để tự thêm hàng khi cần
    const _orig = window.fillTableFromArray;
    window.fillTableFromArray = function (cleaned) {
      try {
        __fallbackFillTableFromArray(cleaned);
      } catch (e) {
        console.warn("Fallback failed, use original", e);
        _orig(cleaned);
      }
    };
  }
})();

// ===== Improved PDF→DOM filler (uses first start hour for AM/PM) =====
(function () {
  if (window.__TKB_FALLBACK2__) return;
  window.__TKB_FALLBACK2__ = true;

  function __improvedFillTableFromArray(cleaned) {
    try {
      const tbody = document.querySelector("#tbody");
      if (!tbody) {
        console.warn("[PDF Fallback2] tbody not found");
        return;
      }

      const daysCount = 7;
      const getStartHour = (s) => {
        const m = String(s || "").match(/(\d{1,2}):(\d{2})/);
        return m ? parseInt(m[1], 10) + parseInt(m[2], 10) / 60 : null;
      };

      // Determine cutoff dynamically: lấy giờ đầu tiên trong bảng làm mốc phân sáng/chiều
      let firstHour = null;
      for (const r of cleaned) {
        const h = getStartHour(r[1]);
        if (h !== null) {
          firstHour = h;
          break;
        }
      }
      if (firstHour === null) firstHour = 7; // fallback 7h sáng

      const amRows = [],
        pmRows = [];
      for (const r of cleaned) {
        const hh = getStartHour(r[1]);
        if (hh !== null && hh < 12 && hh >= firstHour) amRows.push(r);
        else if (hh !== null && hh >= 12) pmRows.push(r);
        else {
          // Nếu không parse được giờ → tạm cho sáng
          amRows.push(r);
        }
      }

      // Clear table
      tbody
        .querySelectorAll("td[data-cell], td[data-time]")
        .forEach((td) => (td.textContent = ""));

      const putLine = (sec, idx1, row) => {
        const time = String(row[1] || "").trim();
        const timeTd = tbody.querySelector(`td[data-time="${sec}-${idx1}"]`);
        if (timeTd) timeTd.textContent = time;
        for (let d = 0; d < daysCount; d++) {
          const val = String(row[2 + d] || "").trim();
          const td = tbody.querySelector(`td[data-cell="${sec}-${d}-${idx1}"]`);
          if (td) td.textContent = val;
        }
      };
      for (let i = 0; i < amRows.length; i++) putLine("am", i + 1, amRows[i]);
      for (let i = 0; i < pmRows.length; i++) putLine("pm", i + 1, pmRows[i]);

      try {
        typeof save === "function" && save("Import PDF (improved fallback)");
      } catch {}
      try {
        typeof setStatus === "function" && setStatus("Đã import PDF ✔️");
      } catch {}
    } catch (e) {
      console.error("[PDF Fallback2] error", e);
    }
  }

  // overwrite global filler if needed
  window.fillTableFromArray = __improvedFillTableFromArray;
})();

/* ==== Global PDF handler (integrated, non-breaking) ====
   - Uses start time (giờ đầu) of each period to decide SÁNG/CHIỀU
   - Keeps all old code; only defines window.handlePdfFile if not already defined
   - Calls window.fillTableFromArray(cleanedArray) so old UI flow continues working
*/
(function () {
  if (window.handlePdfFile) return; // giữ nguyên code cũ nếu đã có
  async function ensurePdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    const urls = [
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
      "https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.min.js",
    ];
    for (const u of urls) {
      try {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = u;
          s.async = true;
          s.onload = res;
          s.onerror = rej;
          document.head.appendChild(s);
        });
        if (window.pdfjsLib) {
          try {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = u.replace(
              "pdf.min.js",
              "pdf.worker.min.js"
            );
          } catch (_) {}
          return window.pdfjsLib;
        }
      } catch (_) {}
    }
    throw new Error("Không tải được PDF.js");
  }

  function byLine(items, pageNo) {
    const rows = [];
    const EPS = 2.5;
    for (const it of items) {
      const x = it.transform[4],
        y = it.transform[5];
      const s = (it.str || "").trim();
      if (!s) continue;
      let row = rows.find((r) => Math.abs(r.y - y) <= EPS);
      if (!row) {
        row = { page: pageNo, y, cells: [] };
        rows.push(row);
      }
      row.cells.push({ x, text: s });
    }
    rows.sort((a, b) => a.page - b.page || b.y - a.y);
    rows.forEach((r) => r.cells.sort((a, b) => a.x - b.x));
    rows.forEach((r) => (r.text = r.cells.map((c) => c.text).join(" ")));
    return rows;
  }

  function distinctXs(cells) {
    const xs = [];
    const EPS = 6;
    for (const c of cells) {
      if (!xs.some((v) => Math.abs(v - c.x) <= EPS)) xs.push(c.x);
    }
    xs.sort((a, b) => a - b);
    return xs;
  }

  function detectColumns(lines) {
    // try to find header with Tiết + Giờ + Thứ
    let hdr = lines.find(
      (l) => /Ti[êe]t/i.test(l.text) && /Gi[ơo]/i.test(l.text)
    );
    if (!hdr) hdr = lines[0];
    const xs = distinctXs(hdr.cells);
    const first9 = xs.slice(0, 9); // Tiết | Giờ | 7 ngày
    const bounds = [];
    for (let i = 0; i < first9.length; i++) {
      const cur = first9[i];
      const next = i < first9.length - 1 ? first9[i + 1] : cur + 2000;
      bounds.push((cur + next) / 2);
    }
    return { anchors: first9, bounds };
  }

  function colIndex(x, bounds) {
    for (let i = 0; i < bounds.length; i++) if (x < bounds[i]) return i;
    return bounds.length - 1;
  }

  function normTime(s) {
    s = String(s || "")
      .replace(/[–—-]/g, "–")
      .replace(/\s+/g, " ")
      .trim();
    const M = s.match(/(\d{1,2})[:h](\d{2})\s*–\s*(\d{1,2})(?::?(\d{2}))?/);
    if (M) {
      const h1 = String(M[1]).padStart(2, "0"),
        m1 = String(M[2]).padStart(2, "0");
      const h2 = String(M[3]).padStart(2, "0"),
        m2 = String(M[4] || "00").padStart(2, "0");
      return `${h1}:${m1}–${h2}:${m2}`;
    }
    return s;
  }
  function startHour(t) {
    const m = String(t || "").match(/(\d{2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
  }

  function parseTimetable(lines, cols) {
    const rows = [];
    let cur = null;
    for (const l of lines) {
      // skip pure section/header rows
      if (/BUỔI\s*(SÁNG|CHIỀU)/i.test(l.text)) continue;
      if (/^\s*(Thứ 2|Thứ 3|Thứ 4|Thứ 5|Thứ 6|Thứ 7|Chủ nhật)\b/i.test(l.text))
        continue;
      const m = l.text.match(/Ti[êe]t\s*(\d+)/i);
      const hasTimeOnly =
        !m && /\d{1,2}[:h]\d{2}\s*[–—-]\s*\d{1,2}(?::?\d{2})?/.test(l.text);
      if (hasTimeOnly) {
        if (cur) rows.push(cur);
        cur = {
          period: rows.length ? (rows[rows.length - 1].period || 0) + 1 : 0,
          time: "",
          cells: Array(7).fill(""),
        };
      }
      if (m) {
        if (cur) rows.push(cur);
        cur = {
          period: parseInt(m[1], 10) || 0,
          time: "",
          cells: Array(7).fill(""),
        };
      }
      if (!cur) continue;
      for (const cell of l.cells) {
        const s = cell.text.trim();
        if (!s) continue;
        const c = colIndex(cell.x, cols.bounds);
        if (c === 0) continue; // label Tiết
        if (c === 1) {
          cur.time = normTime(cur.time ? cur.time + " " + s : s);
        } else {
          const di = c - 2;
          if (di >= 0 && di < 7) {
            cur.cells[di] = (cur.cells[di] ? cur.cells[di] + " " : "") + s;
          }
        }
      }
    }
    if (cur) rows.push(cur);

    // build cleaned array: each entry -> ["Tiết n", "HH:MM–HH:MM", Mon..Sun]
    const cleaned = [];
    for (const r of rows) {
      const time = normTime(r.time);
      const row = [
        `Tiết ${r.period || ""}`,
        time,
        ...r.cells.map((v) =>
          __normCell(String(v).replace(/\s+/g, " ").trim())
        ),
      ];
      cleaned.push(row);
    }
    return cleaned;
  }

  window.handlePdfFile = async function (file) {
    const pdfjs = await ensurePdfJs();
    const url = URL.createObjectURL(file);
    try {
      const doc = await pdfjs.getDocument({ url }).promise;
      const lines = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        lines.push(...byLine(content.items, p));
      }
      const cols = detectColumns(lines);
      const cleaned = parseTimetable(lines, cols);

      // Phân buổi theo GIỜ ĐẦU (start time) khi đổ vào bảng:
      // -> việc chia sáng/chiều sẽ được hàm fillTableFromArray (fallback) thực hiện theo startHour.
      if (typeof window.fillTableFromArray === "function") {
        window.fillTableFromArray(cleaned);
      } else {
        console.warn("[PDF] fillTableFromArray is not available.");
      }
      try {
        typeof setStatus === "function" &&
          setStatus("Đã nhập PDF (giờ đầu làm chuẩn buổi)");
      } catch (_) {}
    } finally {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    }
  };
})();
/* ==== End Global PDF handler ==== */

// === Normalization helpers (accent-insensitive) ===
function __stripVN(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}
function __normLunch(s) {
  const raw = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  const z = __stripVN(raw).toLowerCase();
  if (/(an\s*trua).*(nghi\s*ngoi)/.test(z)) return "Ăn trưa & nghỉ ngơi";
  return raw;
}

// === Universal cell normalizer ===
function __normCell(s) {
  let raw = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  // unify known lunch phrase
  const z = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
  if (/(an\s*trua).*(nghi\s*ngoi)/.test(z)) return "Ăn trưa & nghỉ ngơi";
  return raw;
}

// === Global column detection (robust across pages/sections) ===
function __globalDetectColumns(lines) {
  // collect x positions from lines that look "tabular": have >= 6 cells
  const xs = [];
  for (const l of lines) {
    if (!l.cells || l.cells.length < 6) continue;
    for (const c of l.cells) {
      xs.push(c.x);
    }
  }
  xs.sort((a, b) => a - b);
  if (!xs.length) return null;

  // Greedy clustering with adaptive EPS
  const EPS = 10; // more tolerant than per-line
  const clusters = [];
  for (const x of xs) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(last.mean - x) > EPS) {
      clusters.push({ sum: x, count: 1, mean: x });
    } else {
      last.sum += x;
      last.count += 1;
      last.mean = last.sum / last.count;
    }
  }
  // choose first 9 cluster means as anchors (Tiết, Giờ, 7 ngày)
  const anchors = clusters.slice(0, 9).map((c) => c.mean);
  if (anchors.length < 3) return null;

  const bounds = [];
  for (let i = 0; i < anchors.length; i++) {
    const cur = anchors[i];
    const next = i < anchors.length - 1 ? anchors[i + 1] : cur + 2000;
    bounds.push((cur + next) / 2);
  }
  return { anchors, bounds };
}

function detectColumns(lines) {
  // try header-based
  let meaningful = lines.filter(
    (l) =>
      !/BUỔI\s*(SÁNG|CHIỀU)/i.test(l.text) &&
      !/^\s*(Thứ|Ti[êe]t|Gi[ơo])/i.test(l.text)
  );
  let hdr = lines.find(
    (l) => /Ti[êe]t/i.test(l.text) && /Gi[ơo]/i.test(l.text)
  );
  if (!hdr) {
    // pick most structured line (max distinct x clusters among meaningful lines)
    hdr =
      meaningful.reduce((best, l) => {
        const distinct = distinctXs(l.cells).length;
        return distinct > (best?.score || 0)
          ? { line: l, score: distinct }
          : best;
      }, null)?.line || lines[0];
  }
  let xs = distinctXs(hdr.cells);
  let first9 = xs.slice(0, 9);
  if (first9.length < 9) {
    const g = __globalDetectColumns(lines);
    if (g) return g;
  }
  const bounds = [];
  for (let i = 0; i < first9.length; i++) {
    const cur = first9[i];
    const next = i < first9.length - 1 ? first9[i + 1] : cur + 2000;
    bounds.push((cur + next) / 2);
  }
  return { anchors: first9, bounds };
}

/* ==== [PATCH 2025-08-16] Robust PDF import helpers ====
 * Yêu cầu:
 * (1) Tự thêm/bớt dòng để "ôm trọn" mọi hàng của bảng PDF (sáng/chiều).
 * (2) Nếu dữ liệu ô trong PDF bị xuống dòng, vẫn đổ vào bảng (gộp dòng).
 *
 * Cách dùng (2 đường):
 *  - Gọi hàm toàn cục: window.TKB_importFromPdf(rows)
 *    trong đó rows = mảng các hàng, mỗi hàng là mảng ô dạng chuỗi.
 *    Ví dụ: ["Tiết 1", "08:00–08:45", "Toán", "Văn", ... tới đủ 7 ngày].
 *  - Hoặc dispatch sự kiện: document.dispatchEvent(new CustomEvent('pdf-table-parsed',{detail:{rows}}))
 *
 * Lưu ý: Hàm sẽ:
 *  - Chuẩn hóa chuỗi: gộp các ngắt dòng trong mỗi ô thành 1 khoảng trắng.
 *  - Tự xác định buổi sáng/chiều theo giờ BẮT ĐẦU (<=11:59 là sáng; >=12:00 là chiều).
 *  - Sắp xếp theo thời gian tăng dần trong từng buổi.
 *  - Tự tăng/giảm số dòng của từng buổi để khớp dữ liệu.
 *  - Nếu thiếu giờ ở 1 hàng → để trống cột giờ, nhưng vẫn giữ hàng và đổ dữ liệu môn.
 */
(function () {
  // ===== Utilities =====
  const EN_DASH = "–";
  const HYPHEN = "-";
  function normalizeCell(text) {
    if (text == null) return "";
    // gộp dòng: thay \r?\n+ bằng 1 khoảng trắng, rút khoảng trắng thừa
    return String(text)
      .replace(/\s*\r?\n+\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function normalizeRow(row) {
    const out = Array.isArray(row) ? row.map(normalizeCell) : [];
    return out;
  }
  function parseStartMinutes(timeText) {
    // Trích HH:MM từ dạng "08:00–08:45" hoặc "8h - 9h", "Hoá (14h-16h)"...
    const s = (timeText || "").replace(/[^\d:–\-h ]/gi, "").trim();
    if (!s) return null;
    // Ưu tiên cặp HH:MM–HH:MM
    let m = s.match(/(\d{1,2}):?(\d{2})?\s*[–\-]\s*(\d{1,2}):?(\d{2})?/);
    if (m) {
      const HH = parseInt(m[1] || "0", 10);
      const MM = parseInt(m[2] || "0", 10);
      if (
        Number.isFinite(HH) &&
        HH >= 0 &&
        HH <= 23 &&
        Number.isFinite(MM) &&
        MM >= 0 &&
        MM <= 59
      ) {
        return HH * 60 + MM;
      }
    }
    // Dạng 8h-9h hoặc 14h-16h
    m = s.match(/(\d{1,2})h\s*[–\-]?\s*(\d{1,2})h?/i);
    if (m) {
      const HH = parseInt(m[1] || "0", 10);
      if (Number.isFinite(HH) && HH >= 0 && HH <= 23) {
        return HH * 60;
      }
    }
    // Chỉ HH:MM ở đầu
    m = s.match(/^\s*(\d{1,2}):(\d{2})/);
    if (m) {
      const HH = parseInt(m[1], 10);
      const MM = parseInt(m[2], 10);
      return HH * 60 + MM;
    }
    // Chỉ HHh
    m = s.match(/^\s*(\d{1,2})h/i);
    if (m) {
      const HH = parseInt(m[1], 10);
      return HH * 60;
    }
    return null;
  }
  function timeToSection(startMin) {
    if (startMin == null) return "am"; // mặc định sáng nếu không có giờ
    // sáng nếu < 12:00 (720 phút), ngược lại chiều
    return startMin < 12 * 60 ? "am" : "pm";
  }

  // Xây state trống theo counts hiện thời
  function emptyStateFromCurrent() {
    const s = getState();
    const headers = [...s.headers];
    const counts = { am: s.counts.am, pm: s.counts.pm };
    const st = { headers, counts, times: { am: {}, pm: {} }, cells: {} };
    for (const sec of ["am", "pm"]) {
      for (let p = 1; p <= counts[sec]; p++) {
        st.times[sec][p] = "";
        for (let d = 0; d < headers.length; d++) {
          st.cells[`${sec}-${d}-${p}`] = "";
        }
      }
    }
    return st;
  }

  // Bảo đảm số dòng theo section = n (tự thêm/bớt)
  function ensureRowCount(section, n) {
    n = Math.max(0, parseInt(n || 0, 10));
    const cur = COUNTS[section] || 0;
    if (cur === n) return;
    COUNTS[section] = n;
    buildTable(); // rebuild DOM để counts mới có hiệu lực
  }

  // Đổ dữ liệu vào DOM theo state
  function applyStateToDom(st) {
    setState(st); // dùng hàm có sẵn để đổ
    queueSave("Import PDF"); // tự lưu
    setStatus && setStatus("Đã nhập dữ liệu từ PDF ✔️");
  }

  // Lõi: nhận rows (mảng mảng), chuẩn hoá & map vào bảng
  function importFromRows(rawRows) {
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      alert("Không có dữ liệu bảng để nhập.");
      return;
    }
    // Chuẩn hoá
    const rows = rawRows
      .map(normalizeRow)
      .filter((r) => r.some((c) => (c || "").trim().length > 0));

    // Tìm hàng tiêu đề: chứa "Tiết" và "Giờ" trong 2 ô đầu (tương đối)
    let headIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const a = (r[0] || "").toLowerCase();
      const b = (r[1] || "").toLowerCase();
      if (/tiết/i.test(a) && /giờ/i.test(b)) {
        headIdx = i;
        break;
      }
    }
    const dataRows = (headIdx >= 0 ? rows.slice(headIdx + 1) : rows).filter(
      (r) => r.length > 0
    );

    // Mỗi dòng dữ liệu kỳ vọng: [Tiết?, Giờ?, d0,d1,...,d6]
    // Nếu số cột > 9 → lấy cột 0=tiết,1=giờ, 7 cột tiếp theo; nếu thiếu, bù "".
    function shapeRow(r) {
      const c = r.slice(0);
      const tiet = c[0] || "";
      const gio = c[1] || "";
      const days = c.slice(2);
      // nếu days dài hơn 7 -> cắt; nếu ngắn -> bù rỗng
      const D = Array.from({ length: 7 }, (_, i) =>
        normalizeCell(days[i] || "")
      );
      return { tiet: normalizeCell(tiet), gio: normalizeCell(gio), days: D };
    }

    const shaped = dataRows
      .map(shapeRow)
      .filter((x) => x.tiet || x.gio || x.days.some(Boolean));

    // phân buổi theo giờ bắt đầu
    const grouped = { am: [], pm: [] };
    for (const row of shaped) {
      const startMin = parseStartMinutes(row.gio);
      const sec = timeToSection(startMin);
      grouped[sec].push({
        ...row,
        startMin: startMin == null ? 99999 : startMin,
      });
    }

    // sắp xếp từng buổi theo thời gian (thiếu giờ để cuối)
    grouped.am.sort((a, b) => a.startMin - b.startMin);
    grouped.pm.sort((a, b) => a.startMin - b.startMin);

    // Bảo đảm số dòng
    ensureRowCount("am", grouped.am.length);
    ensureRowCount("pm", grouped.pm.length);

    // Build state mới
    const st = emptyStateFromCurrent();

    function fillSection(sec, list) {
      for (let i = 0; i < list.length; i++) {
        const p = i + 1;
        st.times[sec][p] = list[i].gio || ""; // nếu thiếu giờ -> để trống
        for (let d = 0; d < st.headers.length; d++) {
          st.cells[`${sec}-${d}-${p}`] = list[i].days[d] || "";
        }
      }
    }
    fillSection("am", grouped.am);
    fillSection("pm", grouped.pm);

    applyStateToDom(st);
  }

  // Public API
  window.TKB_importFromPdf = importFromRows;

  // Lắng nghe sự kiện chung nếu bộ import PDF bên ngoài fire
  document.addEventListener("pdf-table-parsed", (e) => {
    try {
      importFromRows(e?.detail?.rows || []);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi nhập PDF: " + (err && err.message ? err.message : err));
    }
  });
  // ================= AUTO SYNC CLOUD <-> LOCAL =================

  const SYNC_INTERVAL_MS = 15000; // 15s, chỉnh tùy thích
  let syncTimer = null;
  let lastCloudUpdatedAt = "";
  let lastLocalSavedAt = "";
  let isEditing = false;
  let inflightPull = null;

  // Đánh dấu khi người dùng đang gõ
  function markEditing() {
    isEditing = true;
    if (markEditing._t) clearTimeout(markEditing._t);
    markEditing._t = setTimeout(() => (isEditing = false), 1000);
  }

  // Gọi sau khi save thành công
  function onLocalSaved(updatedAtStr) {
    lastLocalSavedAt = updatedAtStr || new Date().toISOString();
    if (typeof window.notifyOtherTabs === "function") window.notifyOtherTabs();
  }

  // So sánh ngày giờ
  function isNewer(a, b) {
    if (!a) return false;
    if (!b) return true;
    return parseDate(a).getTime() > parseDate(b).getTime();
  }
  function parseDate(s) {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
      return new Date(s.replace(" ", "T") + "+07:00");
    }
    return new Date(s);
  }

  // Kéo dữ liệu cloud nếu mới hơn
  async function pullFromCloudIfNewer(username) {
    if (isEditing) return; // tránh ghi đè khi đang gõ
    if (inflightPull) return;

    const abort = new AbortController();
    inflightPull = { abort, start: Date.now() };
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          secret: API_SECRET,
          action: "get_data",
          username,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "server error");

      const cloudUpdatedAt = json.updatedAt || "";
      if (
        isNewer(cloudUpdatedAt, lastCloudUpdatedAt) &&
        isNewer(cloudUpdatedAt, lastLocalSavedAt)
      ) {
        const remoteState = JSON.parse(json.data || "{}");
        setState(remoteState); // dùng hàm sẵn có
        lastCloudUpdatedAt = cloudUpdatedAt;
        showStatus(`Đã đồng bộ cloud: ${cloudUpdatedAt}`);
      }
    } catch (e) {
      // console.warn(e);
    } finally {
      inflightPull = null;
    }
  }

  // Khởi tạo auto sync
  function initAutoSync(username) {
    pullFromCloudIfNewer(username);

    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(
      () => pullFromCloudIfNewer(username),
      SYNC_INTERVAL_MS
    );

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) pullFromCloudIfNewer(username);
    });
    window.addEventListener("online", () => pullFromCloudIfNewer(username));

    try {
      const bc = new BroadcastChannel("timetable-sync");
      bc.onmessage = (ev) => {
        if (ev?.data === `pull:${username}`) pullFromCloudIfNewer(username);
      };
      window.notifyOtherTabs = () => bc.postMessage(`pull:${username}`);
    } catch (_e) {
      window.addEventListener("storage", (e) => {
        if (e.key === `SYNC_PING_${username}`) pullFromCloudIfNewer(username);
      });
      window.notifyOtherTabs = () => {
        localStorage.setItem(`SYNC_PING_${username}`, String(Date.now()));
      };
    }
  }

  // =============================================================

  // Ghép vào flow có sẵn:
  // 1) Sau khi login và gọi renderInitialState(username):
  initAutoSync(username);

  // 2) Trong saveState() sau khi nhận updatedAt từ server:
  lastCloudUpdatedAt = updatedAt; // sync mốc cloud
  onLocalSaved(updatedAt);

  // 3) Trong oninput các ô gọi markEditing()
  cell.addEventListener("input", () => {
    markEditing();
    saveStateDebounced();
  });
})();
