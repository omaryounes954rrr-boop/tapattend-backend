import { FormEvent, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, getToken, LogRow, Me, Point, setToken, UserRow } from "./api";

type Page = "dashboard" | "users" | "points" | "logs";

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [page, setPage] = useState<Page>("dashboard");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then((user) => {
        setMe(user);
        if (user.role === "employee") setPage("logs");
      })
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="auth-wrap">جاري التحميل...</div>;
  if (!me) return <Auth onAuthed={setMe} />;
  return <Shell me={me} page={page} setPage={setPage} onLogout={() => { setToken(null); setMe(null); }} />;
}

function Auth({ onAuthed }: { onAuthed: (me: Me) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const token =
        mode === "login"
          ? await api.login(String(fd.get("email")), String(fd.get("password")))
          : await api.registerOrg({
              org_name: String(fd.get("org_name")),
              full_name: String(fd.get("full_name")),
              email: String(fd.get("email")),
              password: String(fd.get("password")),
            });
      setToken(token.access_token);
      onAuthed(await api.me());
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل");
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>TapAttend</h1>
        <p className="muted">حضور بالـ NFC و QR</p>
        {mode === "register" && (
          <>
            <label>اسم المنظمة</label>
            <input name="org_name" required />
            <label>الاسم الكامل</label>
            <input name="full_name" required />
          </>
        )}
        <label>البريد</label>
        <input name="email" type="email" required />
        <label>كلمة المرور</label>
        <input name="password" type="password" minLength={8} required />
        <button className="btn" type="submit">{mode === "login" ? "دخول" : "إنشاء الحساب"}</button>
        <p className="err">{error}</p>
        <button type="button" className="linkish" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "إنشاء منظمة جديدة" : "لديك حساب؟ تسجيل الدخول"}
        </button>
      </form>
    </div>
  );
}

function Shell({
  me,
  page,
  setPage,
  onLogout,
}: {
  me: Me;
  page: Page;
  setPage: (p: Page) => void;
  onLogout: () => void;
}) {
  const admin = me.role !== "employee";
  return (
    <div className="shell">
      <aside className="nav">
        <strong>TapAttend</strong>
        <div className="muted">{me.org_name}</div>
        {admin && <button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}>لوحة التحكم</button>}
        {admin && <button className={page === "users" ? "active" : ""} onClick={() => setPage("users")}>الموظفون</button>}
        {admin && <button className={page === "points" ? "active" : ""} onClick={() => setPage("points")}>نقاط الحضور</button>}
        <button className={page === "logs" ? "active" : ""} onClick={() => setPage("logs")}>السجلات</button>
        <button onClick={onLogout}>خروج</button>
      </aside>
      <main className="main">
        {page === "dashboard" && admin && <Dashboard />}
        {page === "users" && admin && <Users role={me.role} />}
        {page === "points" && admin && <Points />}
        {page === "logs" && <Logs admin={admin} />}
      </main>
    </div>
  );
}

function Dashboard() {
  const [summary, setSummary] = useState({ scans_today: 0, present_employees: 0, total_employees: 0 });
  const [logs, setLogs] = useState<LogRow[]>([]);
  useEffect(() => {
    api.summary().then(setSummary);
    api.logs().then(setLogs);
  }, []);
  return (
    <>
      <h1>اليوم</h1>
      <div className="cards">
        <div className="card"><div className="muted">مسح اليوم</div><div className="kpi">{summary.scans_today}</div></div>
        <div className="card"><div className="muted">حاضرون</div><div className="kpi">{summary.present_employees}</div></div>
        <div className="card"><div className="muted">موظفون</div><div className="kpi">{summary.total_employees}</div></div>
      </div>
      <LogTable rows={logs.slice(0, 8)} />
    </>
  );
}

function Users({ role }: { role: string }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const load = () => api.users().then(setRows);
  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      await api.createUser({
        full_name: String(fd.get("full_name")),
        email: String(fd.get("email")),
        password: String(fd.get("password")),
        role: String(fd.get("role")),
      });
      e.currentTarget.reset();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل");
    }
  }

  return (
    <>
      <h1>الموظفون</h1>
      <form className="row card" onSubmit={submit}>
        <input name="full_name" placeholder="الاسم" required />
        <input name="email" type="email" placeholder="البريد" required />
        <input name="password" type="password" minLength={8} placeholder="كلمة مرور" required />
        <select name="role">
          <option value="employee">موظف</option>
          {role === "owner" && <option value="hr">موارد بشرية</option>}
        </select>
        <button className="btn" type="submit">إضافة</button>
      </form>
      <p className="err">{error}</p>
      <table>
        <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th></tr></thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td><td>{u.role}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Points() {
  const [rows, setRows] = useState<Point[]>([]);
  const [error, setError] = useState("");
  const load = () => api.points().then(setRows);
  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const lat = String(fd.get("latitude") || "");
    const lng = String(fd.get("longitude") || "");
    try {
      await api.createPoint({
        location_name: String(fd.get("location_name")),
        token_uid: String(fd.get("token_uid") || "") || null,
        latitude: lat ? Number(lat) : null,
        longitude: lng ? Number(lng) : null,
        radius_meters: Number(fd.get("radius_meters") || 30),
      });
      e.currentTarget.reset();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل");
    }
  }

  return (
    <>
      <h1>نقاط الحضور</h1>
      <form className="row card" onSubmit={submit}>
        <input name="location_name" placeholder="اسم الموقع" required />
        <input name="latitude" placeholder="خط العرض" />
        <input name="longitude" placeholder="خط الطول" />
        <input name="radius_meters" type="number" defaultValue={30} />
        <input name="token_uid" placeholder="NFC UID اختياري" />
        <button className="btn" type="submit">إنشاء</button>
      </form>
      <p className="err">{error}</p>
      <div className="cards">
        {rows.map((p) => (
          <div className="card" key={p.id}>
            <strong>{p.location_name || "بدون اسم"}</strong>
            <div className="muted">{p.token_uid}</div>
            <div className="qr-wrap"><QRCodeSVG value={p.token_uid} size={128} /></div>
          </div>
        ))}
      </div>
    </>
  );
}

function Logs({ admin }: { admin: boolean }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  useEffect(() => {
    (admin ? api.logs() : api.mine()).then(setRows);
  }, [admin]);
  return (
    <>
      <h1>السجلات</h1>
      <LogTable rows={rows} />
    </>
  );
}

function LogTable({ rows }: { rows: LogRow[] }) {
  return (
    <table>
      <thead><tr><th>الوقت</th><th>الموظف</th><th>النوع</th><th>الطريقة</th><th>الموقع</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{new Date(r.recorded_at).toLocaleString("ar-EG")}</td>
            <td>{r.user_name || "—"}</td>
            <td>{r.event_type === "in" ? "حضور" : "انصراف"}</td>
            <td>{r.scan_method.toUpperCase()}</td>
            <td>{r.location_name || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
