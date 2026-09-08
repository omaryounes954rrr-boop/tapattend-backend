import React, { useEffect, useState } from "react";
import { api } from "./api";

type Page = "dashboard" | "users" | "payroll" | "logs";
type Me = {
  id: string;
  full_name: string;
  email: string;
  role: "owner" | "hr" | "employee";
  org_id: string;
  org_name: string;
  country: string;
  device_fingerprint: string | null;
};

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [page, setPage] = useState<Page>("dashboard");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("tapattend_token");
    if (!token) {
      setReady(true);
      return;
    }
    api.me().then((user) => {
      setMe(user);
      if (user.role === "employee") setPage("logs");
    }).catch(() => localStorage.removeItem("tapattend_token")).finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="auth-wrap">جاري التحميل...</div>;
  if (!me) return <Auth onAuthed={setMe} />;
  
  const admin = me.role !== "employee";
  return (
    <div className="shell">
      <aside className="nav">
        <strong>TapAttend V1</strong>
        <div className="muted">{me.org_name}</div>
        {admin && (
          <>
            <button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}>لوحة التحكم</button>
            <button className={page === "users" ? "active" : ""} onClick={() => setPage("users")}>الموظفون</button>
            <button className={page === "payroll" ? "active" : ""} onClick={() => setPage("payroll")}>مرتبات</button>
          </>
        )}
        <button className={page === "logs" ? "active" : ""} onClick={() => setPage("logs")}>السجلات</button>
        <button onClick={() => { localStorage.removeItem("tapattend_token"); setMe(null); }}>خروج</button>
      </aside>
      <main className="main">
        {page === "dashboard" && admin && <DashboardMe />}
        {page === "users" && admin && <Users />}
        {page === "payroll" && admin && <PayrollDashboard />}
        {page === "logs" && <Logs admin={admin} />}
      </main>
    </div>
  );
}

function Auth({ onAuthed }: { onAuthed: (me: Me) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
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
      localStorage.setItem("tapattend_token", token.access_token);
      onAuthed(await api.me());
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل");
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>TapAttend V1</h1>
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

function DashboardMe() {
  const [summary, setSummary] = useState({ scans_today: 0, present_employees: 0, total_employees: 0 });
  const [logs, setLogs] = useState([]); // Will hold LogRow[] type
  useEffect(() => {
    api.summary().then(setSummary);
    api.mine().then(setLogs);
  }, []);
  
  return (
    <div>
      <h1>اليوم</h1>
      <div className="cards">
        <div className="card"><div className="muted">مسح اليوم</div><div className="kpi">{summary.scans_today}</div></div>
        <div className="card"><div className="muted">حاضرون</div><div className="kpi">{summary.present_employees}</div></div>
        <div className="card"><div className="muted">موظفون</div><div className="kpi">{summary.total_employees}</div></div>
      </div>
      <div style={{ marginTop: '20px', padding: '15px', background: '#0e1c28', borderRadius: '10px' }}>
        <h3>سجلي pessoal</h3>
        {logs.map((row: any) => (
          <div key={row.id} style={{ padding: '8px 0', borderBottom: '1px solid #234056' }}>
            <span>{row.event_type === 'in' ? 'حضور' : 'انصراف'} · 
            {row.scan_method.toUpperCase()} · 
            {new Date(row.recorded_at).toLocaleString("ar-EG")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Users({ role }: { role: string }) {
  const [rows, setRows] = useState([]); // UserRow[]
  const load = () => api.users().then(setRows);
  useEffect(() => { load(); }, []);

  return (
    <div>
      <h1>الموظفون</h1>
      <table>
        <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th></tr></thead>
        <tbody>
          {rows.map((u: any) => (
            <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td><td>{u.role}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayrollDashboard() {
  const [payrolls, setPayrolls] = useState([]);
  const load = () => {
    // Fetch all payrolls for this org - we'll simplify and just show a button to calculate one
    // In V1 we'll calculate on-demand per employee
    setPayrolls([]);
  };
  useEffect(() => { load(); }, []);
  
  return (
    <div style={{ padding: '20px' }}>
      <h1>مرتبات الموظفين</h1>
      <p className="muted">ادخل معرف الموظف لرؤية حساب المرتب:</p>
      <input type="text" id="userIdInput" placeholder="معرف الموظف" style={{ width: '100%', padding: '10px', marginBottom: '10px' }} />
      <button onclick="calculateIndividualPayroll()" style={{ padding: '10px 20px', background: '#14b8a6', color: '#042f2e', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
        حساب مرتب الموظف
      </button>
      <div id="payrollResult" style={{ marginTop: '20px', padding: '15px', background: '#132433', borderRadius: '10px', display: 'none' }}>
        <h3>النتيجة:</h3>
        <pre id="payrollJson" style={{ color: '#e8f2f6', fontSize: '14px' }}></pre>
      </div>
    </div>
  );
}

function calculateIndividualPayroll() {
  const userId = document.getElementById('userIdInput').value;
  if (!userId) {
    alert('يرجى إدخال معرف الموظف');
    return;
  }
  api.payroll(userId).then((data) => {
    document.getElementById('payrollJson').innerText = JSON.stringify(data, null, 2);
    document.getElementById('payrollResult').style.display = 'block';
  }).catch((err) => {
    alert('حدث خطأ: ' + err.message);
  });
}

function Logs({ admin }: { admin: boolean }) {
  const [rows, setRows] = useState([]); // LogRow[]
  useEffect(() => {
    const source = admin ? api.logs() : api.mine();
    source.then(setRows);
  }, [admin]);
  return (
    <div style={{ padding: '20px' }}>
      <h1>السجلات</h1>
      <table>
        <thead><tr><th>الوقت</th><th>الموظف</th><th>النوع</th><th>الطريقة</th></tr></thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id}>
              <td>{new Date(r.recorded_at).toLocaleString("ar-EG")}</td>
              <td>{r.user_name || "—"}</td>
              <td>{r.event_type === "in" ? "حضور" : "انصراف"}</td>
              <td>{r.scan_method.toUpperCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}