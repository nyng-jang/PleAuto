"use client";
// 차량 앱 연결 흐름을 브라우저에서 확인하는 시험용 화면 (실제 차량 앱은 vehicle/ 의 Android 앱)
import { useEffect, useState } from "react";

type CarStop = { id: string; order: number; name: string; time: string; memo: string; byCar: boolean; placeStatus: string; place: { address: string } | null };
type CarPlan = { title: string; days: { dayIndex: number; date: string; stops: CarStop[] }[] };

export default function CarTest() {
  const [code, setCode] = useState("");
  const [reqId, setReqId] = useState("");
  const [token, setToken] = useState("");
  const [plan, setPlan] = useState<CarPlan | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    try {
      setToken(localStorage.getItem("nd.car.token") ?? "");
    } catch {}
  }, []);

  useEffect(() => {
    if (!reqId) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/vehicle/pair/${reqId}`).then((x) => x.json());
      if (r.status === "approved") {
        setToken(r.vehicleToken);
        try { localStorage.setItem("nd.car.token", r.vehicleToken); } catch {}
        setReqId("");
      } else if (r.status !== "pending") {
        setMsg(r.status === "rejected" ? "폰에서 연결을 거절했어요" : r.error);
        setReqId("");
      }
    }, 1500);
    return () => clearInterval(t);
  }, [reqId]);

  useEffect(() => {
    if (!token) return;
    fetch("/api/vehicle/plan", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok) setPlan(d);
        else {
          setMsg(d.error);
          setToken("");
          try { localStorage.removeItem("nd.car.token"); } catch {}
        }
      });
  }, [token]);

  async function submit() {
    setMsg("");
    const r = await fetch("/api/vehicle/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, vehicleName: "시험 차량 (브라우저)" }) });
    const d = await r.json();
    if (r.ok) setReqId(d.requestId);
    else setMsg(d.error);
  }

  return (
    <main>
      <h1>차량 연결 시험</h1>
      <p className="muted">실제 차량 앱과 같은 API로 연결과 계획 불러오기를 확인해요.</p>
      {!token && (
        <div className="card">
          {reqId ? (
            <p>폰에서 연결을 승인해 주세요…</p>
          ) : (
            <div className="row">
              <input className="grow" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="6자리 코드" />
              <button className="primary" disabled={code.length !== 6} onClick={submit}>연결</button>
            </div>
          )}
          {msg && <p className="error">{msg}</p>}
        </div>
      )}
      {plan && (
        <>
          {plan.days.map((d) => (
            <div className="card" key={d.dayIndex}>
              <h2>{d.dayIndex}일차 · {d.date}</h2>
              {d.stops.map((s) => (
                <div className={`stop row ${s.byCar ? "" : "off"}`} key={s.id}>
                  <span className="num">{s.order}</span>
                  <span className="grow">{s.time} <strong>{s.name}</strong><br /><span className="muted">{s.place?.address ?? s.memo}</span></span>
                  <span className={`badge ${s.placeStatus === "confirmed" ? "ok" : s.placeStatus === "unresolved" ? "warn" : ""}`}>
                    {s.placeStatus === "confirmed" ? "안내" : s.placeStatus === "unresolved" ? "미확인" : "제외"}
                  </span>
                </div>
              ))}
            </div>
          ))}
          <button onClick={() => { setToken(""); setPlan(null); try { localStorage.removeItem("nd.car.token"); } catch {} }}>이 브라우저 연결 잊기</button>
        </>
      )}
    </main>
  );
}
