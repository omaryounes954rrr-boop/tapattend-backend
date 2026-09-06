const app = document.getElementById("app");
const TOKEN_KEY = "tapattend_token";

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  me: null,
  page: "dashboard",
  users: [],
  points: [],
  logs: [],
  summary: null,
  error: "",
  authMode: "login",
};

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

function el(html) {
  const box = document.createElement("div");
  box.innerHTML = html.trim();
  return box.firstElementChild;
}

function fmt(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("ar-EG");
}

async function boot() {
  if (!state.token) return renderAuth();
  try {
    state.me = await api("/api/auth/me");
    if (state.me.role === "employee") {
      state.page = "mine";
      state.logs = await api("/api/attendance/mine");
    } else {
      await loadAdmin();
    }
    renderApp();
  } catch {
    state.token = null;
    localStorage.removeItem(TOKEN_KEY);
    renderAuth();
  }
}

async function loadAdmin() {
  const [users, points, logs, summary] = await Promise.all([
    api("/api/users"),
    api("/api/points"),
    api("/api/attendance/logs"),
    api("/api/attendance/today-summary"),
  ]);
  state.users = users;
  state.points = points;
  state.logs = logs;
  state.summary = summary;
}

function renderAuth() {
  app.innerHTML = "";
  const card = el(`
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="brand"><div class="logo"></div><div><h1>TapAttend</h1><div class="sub">حضور بالـ NFC و QR</div></div></div>
        <form id="auth-form"></form>
        <p class="err" id="auth-err"></p>
        <button class="linkish" id="toggle"></button>
      </div>
    </div>
  `);
  app.appendChild(card);
  const form = card.querySelector("#auth-form");
  const toggle = card.querySelector("#toggle");
  const err = card.querySelector("#auth-err");
  const isLogin = state.authMode === "login";
  toggle.textContent = isLogin ? "إنشاء منظمة جديدة" : "لديك حساب؟ تسجيل الدخول";
  form.innerHTML = isLogin
    ? `
      <label>البريد</label><input name="email" type="email" required />
      <label>كلمة المرور</label><input name="password" type="password" required />
      <div style="height:14px"></div>
      <button class="btn" type="submit">دخول</button>`
    : `
      <label>اسم المنظمة</label><input name="org_name" required />
      <label>الاسم الكامل</label><input name="full_name" required />
      <label>البريد</label><input name="email" type="email" required />
      <label>كلمة المرور</label><input name="password" type="password" minlength="8" required />
      <div style="height:14px"></div>
      <button class="btn" type="submit">إنشاء الحساب</button>`;
  toggle.onclick = () => {
    state.authMode = isLogin ? "register" : "login";
    renderAuth();
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = "";
    const fd = Object.fromEntries(new FormData(form).entries());
    try {
      const data = isLogin
        ? await api("/api/auth/login", { method: "POST", body: JSON.stringify(fd) })
        : await api("/api/auth/register-org", { method: "POST", body: JSON.stringify(fd) });
      state.token = data.access_token;
      localStorage.setItem(TOKEN_KEY, state.token);
      await boot();
    } catch (ex) {
      err.textContent = ex.message;
    }
  };
}

function navBtn(id, label) {
  return `<button data-page="${id}" class="${state.page === id ? "active" : ""}">${label}</button>`;
}

function renderApp() {
  const admin = state.me.role !== "employee";
  app.innerHTML = "";
  const shell = el(`
    <div class="shell">
      <aside class="nav">
        <div class="brand"><div class="logo"></div><div><strong>TapAttend</strong><div class="muted">${state.me.org_name}</div></div></div>
        ${admin ? navBtn("dashboard", "لوحة التحكم") : ""}
        ${admin ? navBtn("users", "الموظفون") : ""}
        ${admin ? navBtn("points", "نقاط الحضور") : ""}
        ${navBtn(admin ? "logs" : "mine", "السجلات")}
        <button id="logout">خروج</button>
      </aside>
      <main class="main" id="main"></main>
    </div>
  `);
  app.appendChild(shell);
  shell.querySelector("#logout").onclick = () => {
    localStorage.removeItem(TOKEN_KEY);
    state.token = null;
    renderAuth();
  };
  shell.querySelectorAll("[data-page]").forEach((btn) => {
    btn.onclick = () => {
      state.page = btn.dataset.page;
      renderApp();
    };
  });
  const main = shell.querySelector("#main");
  if (state.page === "dashboard") renderDashboard(main);
  if (state.page === "users") renderUsers(main);
  if (state.page === "points") renderPoints(main);
  if (state.page === "logs" || state.page === "mine") renderLogs(main);
}

function renderDashboard(main) {
  const s = state.summary || {};
  main.innerHTML = `
    <div class="topbar"><h1>اليوم</h1><div class="muted">${state.me.full_name} · ${state.me.role}</div></div>
    <div class="cards">
      <div class="card"><div class="muted">مسح اليوم</div><div class="kpi">${s.scans_today ?? 0}</div></div>
      <div class="card"><div class="muted">موظفون حاضرون</div><div class="kpi">${s.present_employees ?? 0}</div></div>
      <div class="card"><div class="muted">إجمالي الموظفين</div><div class="kpi">${s.total_employees ?? 0}</div></div>
    </div>
    ${demoForm()}
    <div class="table-wrap">${logsTable(state.logs.slice(0, 8))}</div>
  `;
  bindDemoScan(main);
}

function renderUsers(main) {
  main.innerHTML = `
    <div class="topbar"><h1>الموظفون</h1></div>
    <div class="form-card" style="margin-bottom:16px">
      <form id="user-form" class="row">
        <input name="full_name" placeholder="الاسم" required />
        <input name="email" type="email" placeholder="البريد" required />
        <input name="password" type="password" placeholder="كلمة مرور مؤقتة" minlength="8" required />
        <select name="role"><option value="employee">موظف</option>${state.me.role === "owner" ? '<option value="hr">موارد بشرية</option>' : ""}</select>
        <button class="btn" type="submit">إضافة</button>
      </form>
      <p class="err" id="user-err"></p>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>الجهاز</th></tr></thead>
        <tbody>${state.users.map((u) => `<tr><td>${u.full_name}</td><td>${u.email}</td><td>${u.role}</td><td>${u.device_fingerprint ? "مرتبط" : "—"}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
  main.querySelector("#user-form").onsubmit = async (e) => {
    e.preventDefault();
    const err = main.querySelector("#user-err");
    err.textContent = "";
    const fd = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify(fd) });
      await loadAdmin();
      renderApp();
    } catch (ex) {
      err.textContent = ex.message;
    }
  };
}

function renderPoints(main) {
  main.innerHTML = `
    <div class="topbar"><h1>نقاط الحضور</h1></div>
    <div class="form-card" style="margin-bottom:16px">
      <form id="point-form" class="row">
        <input name="location_name" placeholder="اسم الموقع" required />
        <input name="latitude" placeholder="خط العرض (اختياري)" />
        <input name="longitude" placeholder="خط الطول (اختياري)" />
        <input name="radius_meters" type="number" value="30" />
        <input name="token_uid" placeholder="UID للـ NFC (اختياري)" />
        <button class="btn" type="submit">إنشاء نقطة و QR</button>
      </form>
      <p class="err" id="point-err"></p>
    </div>
    <div id="points-list" class="cards"></div>
  `;
  const list = main.querySelector("#points-list");
  state.points.forEach((p) => {
    const card = el(`
      <div class="card">
        <strong>${p.location_name || "بدون اسم"}</strong>
        <div class="muted">token: ${p.token_uid}</div>
        <div class="muted">${p.is_active ? "نشطة" : "متوقفة"} · نصف القطر ${p.radius_meters}م</div>
        <div class="qr" data-token="${p.token_uid}"></div>
      </div>
    `);
    list.appendChild(card);
    const box = card.querySelector(".qr");
    if (window.QRCode) new QRCode(box, { text: p.token_uid, width: 128, height: 128 });
  });
  main.querySelector("#point-form").onsubmit = async (e) => {
    e.preventDefault();
    const err = main.querySelector("#point-err");
    err.textContent = "";
    const raw = Object.fromEntries(new FormData(e.target).entries());
    const body = {
      location_name: raw.location_name,
      token_uid: raw.token_uid || null,
      latitude: raw.latitude ? Number(raw.latitude) : null,
      longitude: raw.longitude ? Number(raw.longitude) : null,
      radius_meters: raw.radius_meters ? Number(raw.radius_meters) : 30,
    };
    try {
      await api("/api/points", { method: "POST", body: JSON.stringify(body) });
      await loadAdmin();
      renderApp();
    } catch (ex) {
      err.textContent = ex.message;
    }
  };
}

function logsTable(rows) {
  return `
    <table>
      <thead><tr><th>الوقت</th><th>الموظف</th><th>النوع</th><th>الطريقة</th><th>الموقع</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
              <td>${fmt(r.recorded_at)}</td>
              <td>${r.user_name || r.user_id}</td>
              <td><span class="badge ${r.event_type}">${r.event_type === "in" ? "حضور" : "انصراف"}</span></td>
              <td>${r.scan_method.toUpperCase()}</td>
              <td>${r.location_name || "—"}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function bindDemoScan(root) {
  const form = root.querySelector("#demo-form");
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = root.querySelector("#demo-err");
    err.textContent = "";
    const fd = Object.fromEntries(new FormData(form).entries());
    try {
      const result = await api("/api/attendance/demo-scan", {
        method: "POST",
        body: JSON.stringify({
          email: fd.email,
          token_uid: fd.token_uid,
          scan_method: "qr",
        }),
      });
      await loadAdmin();
      renderApp();
      const nextErr = document.querySelector("#demo-err");
      if (nextErr) nextErr.textContent = result.message || "تم";
    } catch (ex) {
      err.textContent = ex.message;
    }
  };
}

function demoForm() {
  if (state.me.role === "employee") return "";
  const employees = state.users.filter((u) => u.role === "employee");
  return `
    <div class="form-card" style="margin-bottom:16px">
      <form id="demo-form" class="row">
        <select name="email" required>
          <option value="">موظف تجريبي</option>
          ${employees.map((u) => `<option value="${u.email}">${u.full_name} (${u.email})</option>`).join("")}
        </select>
        <select name="token_uid" required>
          <option value="">نقطة الحضور</option>
          ${state.points.map((p) => `<option value="${p.token_uid}">${p.location_name || p.token_uid}</option>`).join("")}
        </select>
        <button class="btn" type="submit">تسجيل حضور تجريبي</button>
      </form>
      <p class="err" id="demo-err"></p>
    </div>
  `;
}

function renderLogs(main) {
  main.innerHTML = `
    <div class="topbar"><h1>السجلات</h1></div>
    ${demoForm()}
    <div class="table-wrap">${logsTable(state.logs)}</div>
  `;
  bindDemoScan(main);
}

boot();
