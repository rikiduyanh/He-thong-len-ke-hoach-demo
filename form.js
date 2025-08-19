/* ========= Cấu hình API ========= */
const API_URL =
  "https://script.google.com/macros/s/AKfycbxwTfNX39wC26fw5imA8v6RXiF6RsZtGRxx3TZS5fv0pJwsQpOQQEoJZYxRTd9G0yGxkA/exec"; // Web app URL (/exec)
const API_SECRET = "chuoi-bi-mat_cua-ban"; // PHẢI trùng với const SECRET trong code.gs  <-- ĐÃ ĐỔI THÀNH DẤU "_"

/* ========= Ping seed khi form.html vừa mở ========= */
(() => {
  try {
    fetch(API_URL + "?seed=1&ts=" + Date.now(), {
      method: "GET",
      mode: "no-cors",
      keepalive: true,
    });
  } catch (e) {}
})();

/* ========= Sky + SVG cluster + Theme switcher (giữ nguyên) ========= */
const canvas = document.getElementById("sky");
const ctx = canvas.getContext("2d", { alpha: true });
let W, H, DPR;
function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = canvas.width = Math.floor(innerWidth * DPR);
  H = canvas.height = Math.floor(innerHeight * DPR);
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
}
resize();
addEventListener("resize", resize);

const STAR_COUNT = 460;
const stars = Array.from({ length: STAR_COUNT }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  r: 0.6 + Math.random() * 1.4,
  t: Math.random() * Math.PI * 2,
  sp: 0.002 + Math.random() * 0.004,
}));
const CONST = [];
function addConstellation(cx, cy, s) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + (i % 2 ? 0.25 : -0.15);
    pts.push({ x: cx + Math.cos(a) * 60 * s, y: cy + Math.sin(a) * 40 * s });
  }
  CONST.push(pts);
}
function seedConstellations() {
  CONST.length = 0;
  addConstellation(W * 0.75, H * 0.25, 1.1);
  addConstellation(W * 0.2, H * 0.78, 0.95);
  addConstellation(W * 0.55, H * 0.72, 0.8);
}
seedConstellations();
addEventListener("resize", seedConstellations);

function frame() {
  ctx.clearRect(0, 0, W, H);
  for (const s of stars) {
    s.t += s.sp;
    const a = 0.25 + ((Math.sin(s.t) + 1) / 2) * 0.75;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`;
    ctx.arc(s.x, s.y, s.r * DPR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1 * DPR;
  ctx.strokeStyle = "rgba(255,255,255,.45)";
  CONST.forEach((pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.stroke();
    }
  });
  ctx.restore();
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,.95)";
  CONST.forEach((pts) => {
    pts.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2 * DPR, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  ctx.restore();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(function cluster() {
  const g = document.getElementById("cluster");
  if (!g) return;
  const NS = "http://www.w3.org/2000/svg";
  for (let i = 0; i < 40; i++) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", (Math.random() * 680).toFixed(1));
    c.setAttribute("cy", (Math.random() * 680).toFixed(1));
    c.setAttribute("r", (Math.random() * 2 + 0.5).toFixed(1));
    c.setAttribute("fill", "#fff");
    c.setAttribute("opacity", ".85");
    g.appendChild(c);
  }
})();

const switcher = document.querySelector(".theme-switcher");
const themeBtns = document.querySelectorAll(".theme-btn");
switcher.addEventListener("click", (e) => {
  const b = e.target.closest(".theme-btn");
  if (!b) return;
  themeBtns.forEach((x) => x.classList.toggle("is-active", x === b));
  const t = b.getAttribute("data-theme");
  document.body.classList.remove("theme-aurora", "theme-sunset", "theme-ocean");
  document.body.classList.add(`theme-${t}`);
});

/* ============================ Modal ============================ */
const modal = document.getElementById("modal"),
  modalMsg = document.getElementById("modalMsg"),
  modalTitle = document.getElementById("modalTitle");
function showModal(t, m) {
  modalTitle.textContent = t;
  modalMsg.innerHTML = m;
  modal.setAttribute("aria-hidden", "false");
}
function hideModal() {
  modal.setAttribute("aria-hidden", "true");
}
document.getElementById("modalClose").addEventListener("click", hideModal);
document.getElementById("modalOk").addEventListener("click", hideModal);
modal.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-backdrop")) hideModal();
});

/* ==== Tăng cỡ chữ modal cho nổi bật ==== */
(function bumpModalTypography() {
  const st = document.createElement("style");
  st.textContent = `
    #modal #modalTitle{font-size:1.35rem}
    #modal #modalMsg{font-size:1.15rem;line-height:1.55}
    #modal #modalMsg b, #modal #modalMsg code{font-size:1.2rem}
  `;
  document.head.appendChild(st);
})();

/* ============================ Loading Overlay + Progress ============================ */
let $loading, $loadingBar, $loadingPct, $loadingTitle, $loadingMeta;
(function ensureLoadingOverlay() {
  if (document.getElementById("loading")) return;
  const style = document.createElement("style");
  style.textContent = `
  .loading{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center}
  .loading[aria-hidden="false"]{display:flex}
  .loading .backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(2px)}
  .loading .card{position:relative;z-index:1;width:min(420px,92vw);border-radius:16px;background:rgba(17,25,40,.92);border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.3);padding:18px 16px 16px;color:#fff;font-family:inherit}
  .loading .title{margin:0 0 10px;font-weight:800;letter-spacing:-.01em}
  .loading .meta{margin:6px 0 12px;color:#cbd5e1;font-size:14px}
  .progress{width:100%;height:10px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;border:1px solid rgba(255,255,255,.16)}
  .progress>i{display:block;height:100%;width:0%;background:linear-gradient(90deg,#22d3ee,#a78bfa,#f472b6);transition:width .15s ease}
  .percent{margin-top:10px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
  `;
  document.head.appendChild(style);
  const wrap = document.createElement("div");
  wrap.id = "loading";
  wrap.className = "loading";
  wrap.setAttribute("aria-hidden", "true");
  wrap.setAttribute("role", "status");
  wrap.setAttribute("aria-live", "polite");
  wrap.innerHTML = `
    <div class="card" aria-label="Đang xử lý">
      <h3 class="title" id="loadingTitle">Đang xử lý…</h3>
      <div class="meta" id="loadingMeta">Chuẩn bị bắt đầu</div>
      <div class="progress" aria-hidden="true"><i id="loadingBar"></i></div>
      <div class="percent"><span id="loadingPct">0</span>%</div>
    </div>
    <div class="backdrop"></div>
  `;
  document.body.appendChild(wrap);
})();
$loading = document.getElementById("loading");
$loadingBar = document.getElementById("loadingBar");
$loadingPct = document.getElementById("loadingPct");
$loadingTitle = document.getElementById("loadingTitle");
$loadingMeta = document.getElementById("loadingMeta");

function startProgress(title = "Đang xử lý…", expectedMs = 2500) {
  let start = performance.now();
  let pct = 0,
    raf = null;
  $loadingTitle.textContent = title;
  $loadingMeta.textContent = "Chuẩn bị bắt đầu";
  $loading.setAttribute("aria-hidden", "false");
  const setProgress = (val) => {
    const c = Math.max(0, Math.min(100, val));
    $loadingBar.style.width = c.toFixed(1) + "%";
    $loadingPct.textContent = String(Math.round(c));
  };
  const tick = () => {
    const t = performance.now() - start;
    const target = Math.min(90, (t / expectedMs) * 100);
    pct += (target - pct) * 0.08;
    setProgress(pct);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return function end(meta = {}) {
    if (raf) cancelAnimationFrame(raf);
    const elapsed = meta.elapsedMs ?? performance.now() - start;
    const bytes = meta.respBytes ?? 0;
    setProgress(100);
    const kb = bytes / 1024;
    const sec = Math.max(0.001, elapsed / 1000);
    const speed = kb ? kb / sec : null;
    $loadingMeta.textContent = speed
      ? `Hoàn tất trong ${elapsed.toFixed(0)} ms • ~${speed.toFixed(1)} KB/s`
      : `Hoàn tất trong ${elapsed.toFixed(0)} ms`;
    setTimeout(() => {
      $loading.setAttribute("aria-hidden", "true");
      $loadingBar.style.width = "0%";
      $loadingPct.textContent = "0";
    }, 250);
  };
}

/* ============================ UI elements ============================ */
const usernameInput = document.getElementById("username");
const pwd = document.getElementById("password");
const eyeBtn = document.getElementById("togglePwd");
const rememberCheckbox = document.querySelector(".remember input");
const loginForm = document.getElementById("loginForm");
const forgotLink = document.getElementById("forgotLink");

eyeBtn.addEventListener("click", () => {
  const isPwd = pwd.type === "password";
  pwd.type = isPwd ? "text" : "password";
  eyeBtn.classList.toggle("showing", isPwd);
  eyeBtn.setAttribute("aria-pressed", String(isPwd));
});

/* ============================ Forgot (real via API) ============================ */
forgotLink.addEventListener("click", async (e) => {
  e.preventDefault();
  const u = usernameInput.value.trim();
  if (!u) {
    showModal(
      "Thiếu thông tin",
      "Vui lòng nhập <b>Username</b> trước khi khôi phục mật khẩu."
    );
    return;
  }
  const end = startProgress("Đang khôi phục mật khẩu…", 2500);
  try {
    const r = await sheetRequest({ action: "forgot_password", username: u });
    end((r && r.__meta) || {});
    if (r.ok && r.password) {
      showModal(
        "Mật khẩu tìm thấy",
        `Tài khoản <b>${u}</b> có mật khẩu: <code>${r.password}</code>`
      );
    } else {
      showModal(
        "Không tìm thấy",
        r.message || `Không tìm thấy tài khoản <b>${u}</b> trong hệ thống.`
      );
    }
  } catch (err) {
    end(err.__meta || {});
    console.error(err);
    showModal("Mạng lỗi", "Không kết nối được máy chủ.");
  }
});

/* ====================== Nhận diện thiết bị & API ====================== */
function pickDeviceType() {
  const ua = navigator.userAgent.toLowerCase();
  const isTablet = /ipad|tablet|sm-t|tab|xperia tablet/.test(ua);
  const isPhone = /iphone|android.+mobile|windows phone/.test(ua);
  if (isTablet) return "tablet";
  if (isPhone) return "phone";
  return "laptop";
}
function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id =
      (crypto.randomUUID && crypto.randomUUID()) ||
      Date.now() + "-" + Math.random().toString(36).slice(2);
    localStorage.setItem("deviceId", id);
  }
  return id;
}

/* ==== Gọi Apps Script: tránh preflight CORS bằng text/plain + timeout ==== */
async function sheetRequest(payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s
  const t0 = performance.now();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        Accept: "application/json, text/plain, */*",
      },
      body: JSON.stringify({ secret: API_SECRET, ...payload }),
      signal: controller.signal,
      credentials: "omit",
      redirect: "follow",
    });

    clearTimeout(timeout);

    const text = await res.text();
    const elapsedMs = performance.now() - t0;
    const respBytes = new TextEncoder().encode(text).length;

    let data = null;
    try {
      data = JSON.parse(text);
    } catch {}

    if (!res.ok) {
      const msg =
        (data && (data.message || data.error)) ||
        `HTTP ${res.status} khi gọi API`;
      const err = new Error(msg);
      err.__meta = { elapsedMs, respBytes };
      throw err;
    }
    if (data && typeof data === "object") {
      data.__meta = { elapsedMs, respBytes };
      return data;
    }
    return {
      ok: false,
      message: "Phản hồi rỗng từ server",
      __meta: { elapsedMs, respBytes },
    };
  } catch (err) {
    clearTimeout(timeout);
    if (!err.__meta)
      err.__meta = { elapsedMs: performance.now() - t0, respBytes: 0 };
    console.error("sheetRequest error:", err);
    throw err;
  }
}

/* ====================== Nhớ đăng nhập (lưu cả mật khẩu) ====================== */
const KEYS = {
  remember: "rememberMe",
  cred: "savedCredentials", // { username, password }
};
const parseJSON = (v, fb) => {
  try {
    return v ? JSON.parse(v) : fb;
  } catch {
    return fb;
  }
};
const saveRemember = (flag) =>
  localStorage.setItem(KEYS.remember, String(!!flag));
const getRemember = () => localStorage.getItem(KEYS.remember) === "true";
const saveCred = (u, p) =>
  localStorage.setItem(KEYS.cred, JSON.stringify({ username: u, password: p }));
const clearCred = () => localStorage.removeItem(KEYS.cred);
const getCred = () => parseJSON(localStorage.getItem(KEYS.cred), null);

/* ====================== Helper: đồng bộ snapshot lần đầu ====================== */
async function bootstrapCloud(username) {
  try {
    const r = await sheetRequest({ action: "get_data", username });
    if (r.ok && r.data) {
      localStorage.setItem("tkb_pro_full_v7", r.data);
      if (r.updatedAt) localStorage.setItem("tkb_cloud_updatedAt", r.updatedAt);
    }
  } catch {}
}

/* ====================== Đăng nhập ====================== */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = usernameInput.value.trim();
  const password = pwd.value;
  const deviceType = pickDeviceType();
  const deviceId = getDeviceId();

  const isRemember = !!rememberCheckbox.checked;
  saveRemember(isRemember);
  if (isRemember) saveCred(username, password);
  else clearCred();

  const end = startProgress("Đang đăng nhập…", 3200);
  try {
    const rsp = await sheetRequest({
      action: "login",
      username,
      password,
      deviceType,
      deviceId,
    });
    end((rsp && rsp.__meta) || {});

    if (rsp.ok) {
      localStorage.setItem("auth_username", username);
      localStorage.setItem("auth_device_id", deviceId);

      if (rsp.data) {
        try {
          localStorage.setItem("tkb_pro_full_v7", rsp.data);
        } catch {}
      } else {
        await bootstrapCloud(username);
      }
      if (rsp.updatedAt)
        localStorage.setItem("tkb_cloud_updatedAt", rsp.updatedAt);

      setTimeout(() => {
        location.href = rsp.redirect || "index.html";
      }, 150);
      return;
    }

    if (rsp.needSwitch) {
      showModal(
        "Thiết bị đã được dùng",
        `Tài khoản này đã có trên thiết bị <b>${rsp.type}</b> khác.<br/>Bạn có muốn chuyển sang thiết bị hiện tại không?`
      );
      const okBtn = document.getElementById("modalOk");
      const oldHandler = okBtn.onclick;
      okBtn.onclick = async () => {
        hideModal();
        const end2 = startProgress("Đang chuyển thiết bị…", 2200);
        try {
          const r2 = await sheetRequest({
            action: "force_switch_confirm",
            username,
            deviceType,
            deviceId,
          });
          end2((r2 && r2.__meta) || {});
          if (!r2.ok) {
            showModal("Lỗi", r2.message || "Không thể chuyển thiết bị.");
            return;
          }
          await bootstrapCloud(username);
          localStorage.setItem("auth_username", username);
          localStorage.setItem("auth_device_id", deviceId);
          setTimeout(() => {
            location.href = "index.html";
          }, 150);
        } catch (err) {
          end2(err.__meta || {});
          showModal("Lỗi", "Kết nối thất bại khi chuyển thiết bị.");
        } finally {
          okBtn.onclick = oldHandler || hideModal;
        }
      };
      return;
    }

    if (rsp.limitReached) {
      showModal(
        "Vượt giới hạn",
        "Tài khoản đã dùng tối đa 3 thiết bị. Vui lòng liên hệ admin để giải phóng."
      );
      return;
    }

    showModal("Không thể đăng nhập", rsp.message || "Có lỗi xảy ra.");
  } catch (err) {
    end(err.__meta || {});
    console.error(err);
    showModal("Mạng lỗi", "Không kết nối được máy chủ.");
  }
});

/* ====================== Auto-login theo nhớ ====================== */
window.addEventListener("load", autoLoginIfRemembered);
async function autoLoginIfRemembered() {
  if (!getRemember()) return false;
  const cred = getCred();
  if (!cred || !cred.username || !cred.password) return false;

  usernameInput.value = cred.username;
  pwd.value = cred.password;
  rememberCheckbox.checked = true;

  try {
    const rsp = await sheetRequest({
      action: "login",
      username: cred.username,
      password: cred.password,
      deviceType: pickDeviceType(),
      deviceId: getDeviceId(),
    });

    if (rsp.ok) {
      localStorage.setItem("auth_username", cred.username);
      localStorage.setItem("auth_device_id", getDeviceId());
      if (rsp.data) {
        localStorage.setItem("tkb_pro_full_v7", rsp.data);
      } else {
        await bootstrapCloud(cred.username);
      }
      if (rsp.updatedAt)
        localStorage.setItem("tkb_cloud_updatedAt", rsp.updatedAt);

      location.href = rsp.redirect || "index.html";
      return true;
    }
  } catch (e) {}
  return false;
}

/* ====================== Logout (tuỳ chọn) ====================== */
async function logout() {
  try {
    await sheetRequest({
      action: "logout",
      username:
        localStorage.getItem("auth_username") || usernameInput.value.trim(),
      deviceType: pickDeviceType(),
      deviceId: getDeviceId(),
    });
  } catch {}
  saveRemember(false);
  clearCred();
  showModal("Đăng xuất", "Đã đăng xuất trên thiết bị này.");
}

/* ---- Thêm lối thoát nhanh qua query: ?logout=1 ---- */
(function handleQuickLogout() {
  const q = new URLSearchParams(location.search);
  if (q.get("logout") === "1") {
    saveRemember(false);
    clearCred();
  }
})();
