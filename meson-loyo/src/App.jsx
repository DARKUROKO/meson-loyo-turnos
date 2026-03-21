import { useState, useEffect } from "react";
import { db } from "./firebase";
import { ref, onValue, set, update } from "firebase/database";

// ─── EMPLEADOS ───────────────────────────────────────────────────────────────
const EMPLOYEES_INIT = [
  { id:1, name:"Javier",  color:"#9B5DE5" },
  { id:2, name:"Noelia",  color:"#E07A5F" },
  { id:3, name:"Saúl",    color:"#118AB2" },
  { id:4, name:"Eric",    color:"#81B29A" },
  { id:5, name:"Maikel",  color:"#b08800" },
  { id:6, name:"Sergio",  color:"#E65100" },
  { id:7, name:"Nilo",    color:"#00897B" },
  { id:8, name:"Gonzalo", color:"#d63384" },
];

// ─── USUARIOS ─────────────────────────────────────────────────────────────────
const USUARIOS = [
  { id:1, nombre:"Javier",  usuario:"javier",  password:"javier2024",  rol:"admin",    empId:1 },
  { id:2, nombre:"Noelia",  usuario:"noelia",  password:"noelia2024",  rol:"admin",    empId:2 },
  { id:3, nombre:"Jaime",   usuario:"jaime",   password:"jaime2024",   rol:"visor",    empId:null },
  { id:4, nombre:"Saúl",    usuario:"saul",    password:"saul2024",    rol:"empleado", empId:3 },
  { id:5, nombre:"Eric",    usuario:"eric",    password:"eric2024",    rol:"empleado", empId:4 },
  { id:6, nombre:"Maikel",  usuario:"maikel",  password:"maikel2024",  rol:"empleado", empId:5 },
  { id:7, nombre:"Sergio",  usuario:"sergio",  password:"sergio2024",  rol:"empleado", empId:6 },
  { id:8, nombre:"Nilo",    usuario:"nilo",    password:"nilo2024",    rol:"empleado", empId:7 },
  { id:9, nombre:"Gonzalo", usuario:"gonzalo", password:"gonzalo2024", rol:"empleado", empId:8 },
];

const TURNOS = {
  manana:   { label:"Mañanas",      horas:2,    start:"07:00", end:"09:00", bg:"#F3E5F5", color:"#6A1B9A", emoji:"🌅", abr:"MAN"   },
  mediodia: { label:"Mediodía",     horas:6.5,  start:"11:30", end:"18:00", bg:"#FFF8E1", color:"#E65100", emoji:"☀️", abr:"MED"   },
  noche:    { label:"Noche",        horas:6,    start:"18:00", end:"24:00", bg:"#E3F2FD", color:"#1565C0", emoji:"🌙", abr:"NOC"   },
  doble:    { label:"Turno Doble",  horas:12.5, start:"11:30", end:"24:00", bg:"#FCE4EC", color:"#AD1457", emoji:"⚡", abr:"DOBLE" },
  libre:    { label:"Libre",        horas:0,    start:"-",     end:"-",     bg:"#F5F5F5", color:"#9E9E9E", emoji:"🏖️",abr:"L"     },
};

const DIAS  = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function daysInMonth(y,m)     { return new Date(y,m+1,0).getDate(); }
function firstDayOfMonth(y,m) { const d=new Date(y,m,1).getDay(); return d===0?6:d-1; }
function dowIndex(y,m,d)      { const x=new Date(y,m,d).getDay(); return x===0?6:x-1; }

function genShiftsLibre(emps,y,m) {
  const days=daysInMonth(y,m), out={};
  emps.forEach(e=>{ out[e.id]={}; for(let d=1;d<=days;d++) out[e.id][d]=["libre"]; });
  return out;
}

function horasDia(arr){ return (arr||[]).reduce((s,t)=>s+(TURNOS[t]?.horas||0),0); }
function abrDia(arr){
  if(!arr) return {abr:"L",emoji:"🏖️",bg:"#F5F5F5",color:"#9E9E9E",start:"-"};
  if(typeof arr==="string") arr=[arr];
  if(arr.length===0||arr[0]==="libre") return {abr:"L",emoji:"🏖️",bg:"#F5F5F5",color:"#9E9E9E",start:"-"};
  const valid=arr.filter(t=>t&&t!=="libre"&&TURNOS[t]);
  if(valid.length===0) return {abr:"L",emoji:"🏖️",bg:"#F5F5F5",color:"#9E9E9E",start:"-"};
  if(valid.length===1) return {...TURNOS[valid[0]]};
  return {abr:"VAR",emoji:"🔀",bg:"#EDE7F6",color:"#4527A0",start:valid.map(t=>TURNOS[t]?.start).join("/")};
}
function esLibre(arr){ if(!arr) return true; if(typeof arr==="string") return arr==="libre"; return arr.length===0||(arr.length===1&&arr[0]==="libre"); }

// Clave Firebase para un mes concreto
function mesKey(y,m){ return `${y}_${String(m+1).padStart(2,"0")}`; }

const today = new Date();
const S = {
  overlay:{ position:"fixed",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 },
  modal:  { background:"#fff",borderRadius:20,padding:28,width:"92%",maxWidth:400,boxShadow:"0 24px 70px rgba(0,0,0,.25)" },
};

/* ─── LOGIN ──────────────────────────────────────────────────────────────── */
function Login({ onLogin }) {
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [err,setErr]=useState(""); const [show,setShow]=useState(false);
  function go() {
    const user=USUARIOS.find(x=>x.usuario===u.trim().toLowerCase()&&x.password===p);
    if(user) onLogin(user);
    else { setErr("Usuario o contraseña incorrectos"); setTimeout(()=>setErr(""),2500); }
  }
  const inp={ width:"100%",border:"1.5px solid #e0e0e0",borderRadius:10,padding:"11px 14px",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit" };
  return (
    <div style={{ minHeight:"100vh",background:"#1B2432",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif",padding:16 }}>
      <div style={{ width:"100%",maxWidth:380,background:"#fff",borderRadius:24,padding:36,boxShadow:"0 30px 80px rgba(0,0,0,.4)" }}>
        <div style={{ textAlign:"center",marginBottom:28 }}>
          <div style={{ fontSize:52 }}>🍽️</div>
          <div style={{ fontWeight:800,fontSize:22,color:"#1B2432",marginTop:8 }}>Mesón do Loyo</div>
          <div style={{ color:"#aaa",fontSize:13,marginTop:4 }}>Gestión de Turnos · Paradela, Lugo</div>
        </div>
        <label style={{ fontSize:12,fontWeight:700,color:"#555",display:"block",marginBottom:5 }}>Usuario</label>
        <input value={u} onChange={e=>setU(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="Tu usuario..." style={{ ...inp,marginBottom:14 }} autoCapitalize="none" autoCorrect="off"/>
        <label style={{ fontSize:12,fontWeight:700,color:"#555",display:"block",marginBottom:5 }}>Contraseña</label>
        <div style={{ position:"relative",marginBottom:20 }}>
          <input type={show?"text":"password"} value={p} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="••••••••" style={inp}/>
          <button onClick={()=>setShow(x=>!x)} style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#999" }}>{show?"🙈":"👁️"}</button>
        </div>
        {err&&<div style={{ background:"#FFEBEE",color:"#C62828",borderRadius:10,padding:"10px 14px",fontSize:13,fontWeight:600,marginBottom:14,textAlign:"center" }}>❌ {err}</div>}
        <button onClick={go} style={{ width:"100%",background:"#E07A5F",color:"#fff",border:"none",borderRadius:12,padding:14,fontWeight:800,fontSize:16,cursor:"pointer" }}>Entrar →</button>
      </div>
    </div>
  );
}

/* ─── VISTA EMPLEADO ─────────────────────────────────────────────────────── */
function VistaEmpleado({ user, emps, shifts, month, year, onLogout, onMonthChange }) {
  const emp = emps.find(e=>e.id===user.empId);
  const [tab, setTab] = useState("mis");
  if (!emp) return <div style={{ padding:40,textAlign:"center",color:"#aaa" }}>Empleado no encontrado</div>;

  const dim = daysInMonth(year,month);
  const fd  = firstDayOfMonth(year,month);

  function getHoras() { let t=0; for(let d=1;d<=dim;d++) t+=horasDia(shifts[emp.id]?.[d]); return t; }
  function getDias()  { let c=0; for(let d=1;d<=dim;d++){if(!esLibre(shifts[emp.id]?.[d])) c++;} return c; }

  const proxTurno = (()=>{
    if(month!==today.getMonth()||year!==today.getFullYear()) return null;
    for(let d=today.getDate();d<=dim;d++){ const arr=shifts[emp.id]?.[d]; if(!esLibre(arr)) return {day:d,arr}; }
    return null;
  })();

  const tabBtn = (id,label) => (
    <button onClick={()=>setTab(id)} style={{ flex:1,padding:"11px 0",fontWeight:700,fontSize:14,border:"none",cursor:"pointer",borderRadius:10,background:tab===id?"#1B2432":"transparent",color:tab===id?"#fff":"#888",transition:"all .2s" }}>{label}</button>
  );

  return (
    <div style={{ fontFamily:"'DM Sans','Segoe UI',sans-serif",minHeight:"100vh",background:"#F4F1EC" }}>
      <div style={{ background:"#1B2432",color:"#fff" }}>
        <div style={{ maxWidth:700,margin:"0 auto",padding:"0 16px",display:"flex",alignItems:"center",height:58,gap:12 }}>
          <div style={{ width:36,height:36,borderRadius:"50%",background:emp.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:16,flexShrink:0 }}>{emp.name.charAt(0)}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800,fontSize:15 }}>{emp.name}</div>
            <div style={{ fontSize:11,color:"#aaa" }}>Mesón do Loyo · Paradela</div>
          </div>
          <button onClick={onLogout} style={{ background:"#2a3244",color:"#ccc",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600 }}>Salir</button>
        </div>
      </div>
      <div style={{ maxWidth:700,margin:"0 auto",padding:"20px 16px" }}>
        {proxTurno && (()=>{ const info=abrDia(proxTurno.arr); return (
          <div style={{ background:info.bg,border:`2px solid ${info.color}55`,borderRadius:16,padding:"14px 18px",marginBottom:18,display:"flex",alignItems:"center",gap:14 }}>
            <div style={{ fontSize:34 }}>{info.emoji}</div>
            <div>
              <div style={{ fontSize:11,fontWeight:700,color:info.color,marginBottom:2 }}>PRÓXIMO TURNO</div>
              <div style={{ fontWeight:800,fontSize:17,color:"#1B2432" }}>{proxTurno.day===today.getDate()?"Hoy":`Día ${proxTurno.day}`} — {proxTurno.arr.filter(t=>t!=="libre").map(t=>TURNOS[t]?.label).join(" + ")}</div>
              <div style={{ fontSize:13,color:"#888",marginTop:2 }}>{info.start} · {horasDia(proxTurno.arr)}h</div>
            </div>
          </div>
        );})()}
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
          <button onClick={()=>onMonthChange(-1)} style={{ background:"#fff",border:"1px solid #ddd",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center" }}>‹</button>
          <span style={{ fontWeight:800,fontSize:17,flex:1,textAlign:"center" }}>{MESES[month]} {year}</span>
          <button onClick={()=>onMonthChange(1)}  style={{ background:"#fff",border:"1px solid #ddd",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center" }}>›</button>
        </div>
        <div style={{ display:"flex",gap:4,background:"#fff",borderRadius:12,padding:4,marginBottom:18,boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
          {tabBtn("mis","📅 Mis turnos")}
          {tabBtn("completo","👥 Calendario completo")}
        </div>
        {tab==="mis" && (
          <div>
            <div style={{ display:"flex",gap:10,marginBottom:18 }}>
              <div style={{ flex:1,background:"#fff",borderRadius:14,padding:14,textAlign:"center",boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                <div style={{ fontSize:30,fontWeight:900,color:"#E07A5F" }}>{getDias()}</div>
                <div style={{ fontSize:11,color:"#aaa",fontWeight:700 }}>DÍAS TRABAJADOS</div>
              </div>
              <div style={{ flex:1,background:"#fff",borderRadius:14,padding:14,textAlign:"center",boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                <div style={{ fontSize:30,fontWeight:900,color:"#1B2432" }}>{getHoras()}</div>
                <div style={{ fontSize:11,color:"#aaa",fontWeight:700 }}>HORAS ESTE MES</div>
              </div>
            </div>
            <div style={{ background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,.06)" }}>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:"1px solid #f0f0f0" }}>
                {DIAS.map(d=><div key={d} style={{ textAlign:"center",fontSize:11,fontWeight:700,color:"#ccc",padding:"9px 0 5px" }}>{d}</div>)}
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)" }}>
                {Array.from({length:fd}).map((_,i)=><div key={`e${i}`} style={{ borderBottom:"1px solid #f5f5f5",minHeight:68 }}/>)}
                {Array.from({length:dim}).map((_,i)=>{
                  const day=i+1, arr=shifts[emp.id]?.[day]||["libre"], info=abrDia(arr);
                  const dow=dowIndex(year,month,day), isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear(), isWe=dow>=5;
                  return (
                    <div key={day} style={{ padding:"6px 3px",textAlign:"center",borderBottom:"1px solid #f5f5f5",borderRight:"1px solid #f5f5f5",background:isToday?"#FFF8E1":isWe?"#fafafa":"transparent",minHeight:68,display:"flex",flexDirection:"column",alignItems:"center",gap:3 }}>
                      <div style={{ fontSize:12,color:isToday?"#E07A5F":isWe?"#bbb":"#ccc",fontWeight:isToday?900:400 }}>{day}</div>
                      <div style={{ background:info.bg,color:info.color,borderRadius:6,fontSize:10,fontWeight:800,padding:"3px 2px",lineHeight:1.3,width:"92%" }}>{info.emoji}<br/>{info.abr}</div>
                      {!esLibre(arr)&&<div style={{ fontSize:8,color:"#bbb" }}>{info.start}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ display:"flex",gap:7,flexWrap:"wrap",marginTop:14,justifyContent:"center" }}>
              {Object.entries(TURNOS).map(([k,v])=>(
                <span key={k} style={{ background:v.bg,color:v.color,borderRadius:8,padding:"5px 11px",fontSize:12,fontWeight:700,border:`1px solid ${v.color}33` }}>{v.emoji} {v.label}{v.horas>0?` · ${v.horas}h`:""}</span>
              ))}
            </div>
          </div>
        )}
        {tab==="completo" && (
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            {Array.from({length:dim},(_,i)=>{
              const day=i+1, dow=dowIndex(year,month,day);
              const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear(), isWe=dow>=5;
              const miArr=shifts[emp.id]?.[day]||["libre"], miInfo=abrDia(miArr), trabajo=!esLibre(miArr);
              const compas=emps.filter(e=>e.id!==emp.id&&!esLibre(shifts[e.id]?.[day]));
              const hayActividad=trabajo||compas.length>0;
              const miLabel=trabajo?miArr.filter(t=>t!=="libre").map(t=>TURNOS[t]?.label).join(" + "):"Libre";
              if(!hayActividad) return (
                <div key={day} style={{ background:"#fff",borderRadius:12,padding:"10px 16px",display:"flex",alignItems:"center",gap:10,opacity:.45,boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
                  <div style={{ fontWeight:700,fontSize:14,color:"#ccc",minWidth:34 }}>{day}</div>
                  <div style={{ fontSize:12,color:"#ccc" }}>{DIAS[dow]}</div>
                  <div style={{ fontSize:12,color:"#ccc",marginLeft:"auto" }}>🏖️ Libre</div>
                </div>
              );
              return (
                <div key={day} style={{ background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:isToday?"0 0 0 2px #E07A5F,0 4px 16px rgba(0,0,0,.1)":"0 2px 10px rgba(0,0,0,.06)",border:isToday?"2px solid #E07A5F":"2px solid transparent" }}>
                  <div style={{ padding:"9px 14px",background:isToday?"#E07A5F":isWe?"#1B2432":"#2a3244",color:"#fff",display:"flex",alignItems:"center",gap:10 }}>
                    <span style={{ fontWeight:900,fontSize:17 }}>{day}</span>
                    <span style={{ fontSize:13,opacity:.8 }}>{DIAS[dow]}</span>
                    {isWe&&<span style={{ background:"rgba(255,255,255,.2)",borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700 }}>Fin de semana</span>}
                    {isToday&&<span style={{ background:"rgba(255,255,255,.25)",borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700 }}>Hoy</span>}
                    <div style={{ marginLeft:"auto",background:trabajo?miInfo.bg:"rgba(255,255,255,.1)",borderRadius:8,padding:"4px 10px",display:"flex",alignItems:"center",gap:5 }}>
                      <span style={{ fontSize:14 }}>{miInfo.emoji}</span>
                      <span style={{ fontSize:12,fontWeight:800,color:trabajo?miInfo.color:"#ddd" }}>Yo: {miLabel}</span>
                    </div>
                  </div>
                  {compas.length>0 && (
                    <div style={{ padding:"10px 14px" }}>
                      <div style={{ fontSize:11,fontWeight:700,color:"#aaa",marginBottom:7 }}>COMPAÑEROS QUE TRABAJAN</div>
                      <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
                        {compas.map(c=>{
                          const cArr=shifts[c.id]?.[day]||["libre"], cInfo=abrDia(cArr);
                          const coincide=trabajo&&miArr.some(t=>t!=="libre"&&cArr.includes(t));
                          return (
                            <div key={c.id} style={{ display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:8,background:coincide?cInfo.bg+"99":"#f9f9f9",border:coincide?`1px solid ${cInfo.color}44`:"1px solid transparent" }}>
                              <div style={{ width:26,height:26,borderRadius:"50%",background:c.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:11,flexShrink:0 }}>{c.name.charAt(0)}</div>
                              <span style={{ fontWeight:600,fontSize:13,flex:1 }}>{c.name}</span>
                              <span style={{ fontSize:11,fontWeight:700,color:cInfo.color }}>{cInfo.emoji} {cArr.filter(t=>t!=="libre").map(t=>TURNOS[t]?.label).join("+")||"Libre"}</span>
                              {coincide&&<span style={{ fontSize:10,background:cInfo.color,color:"#fff",borderRadius:5,padding:"2px 6px",fontWeight:700 }}>Mismo turno</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {compas.length===0&&trabajo&&<div style={{ padding:"10px 14px",fontSize:13,color:"#bbb" }}>Sin compañeros asignados aún</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── MODALES ────────────────────────────────────────────────────────────── */
function ModalTurno({ emp, day, month, currentArr, onSave, onClose }) {
  const [selected, setSelected] = useState(currentArr&&currentArr.length>0?currentArr.filter(t=>t!=="libre"):[]);
  function toggle(k) { if(k==="libre"){setSelected([]);return;} setSelected(prev=>prev.includes(k)?prev.filter(x=>x!==k):[...prev,k]); }
  function confirm() { onSave(selected.length===0?["libre"]:selected); }
  const totalH=selected.reduce((s,t)=>s+(TURNOS[t]?.horas||0),0);
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={{ fontWeight:800,fontSize:17,marginBottom:2 }}>{emp.name}</div>
        <div style={{ color:"#aaa",fontSize:13,marginBottom:6 }}>{day} de {MESES[month]}</div>
        <div style={{ fontSize:12,color:"#888",marginBottom:16,background:"#F4F1EC",borderRadius:8,padding:"6px 10px" }}>💡 Puedes seleccionar <b>varios turnos</b> el mismo día</div>
        <div style={{ display:"flex",flexDirection:"column",gap:9 }}>
          {Object.entries(TURNOS).filter(([k])=>k!=="doble").map(([k,v])=>{
            const sel=k==="libre"?selected.length===0:selected.includes(k);
            return (
              <button key={k} onClick={()=>toggle(k)} style={{ background:sel?v.bg:"#f8f8f8",border:`2px solid ${sel?v.color:"transparent"}`,borderRadius:12,padding:"11px 16px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12 }}>
                <span style={{ fontSize:22 }}>{v.emoji}</span>
                <div><div style={{ fontWeight:700,color:v.color,fontSize:14 }}>{v.label}</div><div style={{ fontSize:12,color:"#aaa" }}>{v.start!=="-"?`${v.start} → ${v.end} · ${v.horas}h`:"Día de descanso"}</div></div>
                {sel&&<span style={{ marginLeft:"auto",color:v.color,fontSize:20 }}>✓</span>}
              </button>
            );
          })}
        </div>
        {selected.length>1&&<div style={{ marginTop:12,background:"#EDE7F6",borderRadius:10,padding:"8px 14px",fontSize:13,color:"#4527A0",fontWeight:700 }}>🔀 Turno combinado · Total: {totalH}h</div>}
        <div style={{ display:"flex",gap:10,marginTop:14 }}>
          <button onClick={onClose} style={{ flex:1,background:"#f0f0f0",border:"none",borderRadius:10,padding:10,cursor:"pointer",fontWeight:600,color:"#666" }}>Cancelar</button>
          <button onClick={confirm} style={{ flex:2,background:"#E07A5F",color:"#fff",border:"none",borderRadius:10,padding:10,cursor:"pointer",fontWeight:700,fontSize:14 }}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

function ModalCambio({ emps, dim, month, year, shifts, initialEmp1, onConfirm, onClose }) {
  const [e1,setE1]=useState(initialEmp1||""); const [e2,setE2]=useState(""); const [day,setDay]=useState(""); const [motivo,setMotivo]=useState("");
  const ok=e1&&e2&&day; const t1=shifts[e1]?.[day]||["libre"]; const t2=shifts[e2]?.[day]||["libre"];
  const sel={ width:"100%",border:"1.5px solid #e0e0e0",borderRadius:10,padding:"10px 12px",fontSize:14,outline:"none",background:"#fff",fontFamily:"inherit" };
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal,maxWidth:420 }} onClick={e=>e.stopPropagation()}>
        <div style={{ fontWeight:800,fontSize:17,marginBottom:4 }}>🔄 Registrar Cambio de Turno</div>
        <div style={{ color:"#aaa",fontSize:13,marginBottom:20 }}>Intercambio entre dos empleados</div>
        <div style={{ display:"flex",flexDirection:"column",gap:11 }}>
          <div><label style={{ fontSize:12,fontWeight:700,color:"#555",display:"block",marginBottom:4 }}>Empleado 1 — cede su turno</label>
            <select value={e1} onChange={x=>setE1(Number(x.target.value))} style={sel}><option value="">Seleccionar...</option>{emps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
          <div><label style={{ fontSize:12,fontWeight:700,color:"#555",display:"block",marginBottom:4 }}>Empleado 2 — cubre</label>
            <select value={e2} onChange={x=>setE2(Number(x.target.value))} style={sel}><option value="">Seleccionar...</option>{emps.filter(e=>e.id!==e1).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
          <div><label style={{ fontSize:12,fontWeight:700,color:"#555",display:"block",marginBottom:4 }}>Día de {MESES[month]}</label>
            <select value={day} onChange={x=>setDay(Number(x.target.value))} style={sel}><option value="">Seleccionar día...</option>{Array.from({length:dim},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></div>
          {ok&&t1&&t2&&(
            <div style={{ background:"#F4F1EC",borderRadius:12,padding:"12px 16px",fontSize:13 }}>
              <div style={{ marginBottom:4 }}><b>{emps.find(e=>e.id===e1)?.name}</b>: {abrDia(t1).emoji} <b style={{ color:abrDia(t1).color }}>{(t1||[]).filter(x=>x!=="libre").map(x=>TURNOS[x]?.label).join("+")||"Libre"}</b></div>
              <div><b>{emps.find(e=>e.id===e2)?.name}</b>: {abrDia(t2).emoji} <b style={{ color:abrDia(t2).color }}>{(t2||[]).filter(x=>x!=="libre").map(x=>TURNOS[x]?.label).join("+")||"Libre"}</b></div>
              <div style={{ marginTop:8,fontSize:11,color:"#aaa" }}>↕ Se intercambiarán sus turnos ese día.</div>
            </div>
          )}
          <div><label style={{ fontSize:12,fontWeight:700,color:"#555",display:"block",marginBottom:4 }}>Motivo (opcional)</label>
            <input value={motivo} onChange={x=>setMotivo(x.target.value)} placeholder="Ej: cita médica, urgencia..." style={sel}/></div>
        </div>
        <div style={{ display:"flex",gap:10,marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1,background:"#f0f0f0",border:"none",borderRadius:10,padding:12,cursor:"pointer",fontWeight:600,color:"#666" }}>Cancelar</button>
          <button disabled={!ok} onClick={()=>onConfirm(e1,e2,day,motivo)} style={{ flex:2,background:ok?"#E07A5F":"#ccc",color:"#fff",border:"none",borderRadius:10,padding:12,cursor:ok?"pointer":"not-allowed",fontWeight:800,fontSize:14 }}>Confirmar Cambio</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   APP PRINCIPAL
═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [user,    setUser]    = useState(null);
  const [view,    setView]    = useState("dia");
  const [month,   setMonth]   = useState(today.getMonth());
  const [year,    setYear]    = useState(today.getFullYear());
  const [emps,    setEmps]    = useState(EMPLOYEES_INIT);
  const [shifts,  setShifts]  = useState({});
  const [cambios, setCambios] = useState([]);
  const [modal,   setModal]   = useState(null);
  const [cambioM, setCambioM] = useState(null);
  const [newName, setNewName] = useState("");
  const [notif,   setNotif]   = useState(null);
  const [delConf, setDelConf] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Cargar y escuchar cambios en Firebase en tiempo real ──────────────────
  useEffect(()=>{
    const mk = mesKey(year,month);
    // Turnos del mes actual
    const shiftsRef = ref(db, `turnos/${mk}`);
    const unsubShifts = onValue(shiftsRef, snap=>{
      const data = snap.val();
      if(data){
        // Convertir arrays guardados como objetos de vuelta a arrays
        const fixed = {};
        Object.keys(data).forEach(empId=>{
          fixed[empId]={};
          Object.keys(data[empId]).forEach(day=>{
            const val=data[empId][day];
            fixed[empId][day]=Array.isArray(val)?val:Object.values(val);
          });
        });
        setShifts(fixed);
      } else {
        // Primer acceso a este mes: inicializar todo libre en Firebase
        const init = genShiftsLibre(EMPLOYEES_INIT, year, month);
        set(ref(db,`turnos/${mk}`), init);
        setShifts(init);
      }
      setLoading(false);
    });
    // Cambios
    const cambiosRef = ref(db, "cambios");
    const unsubCambios = onValue(cambiosRef, snap=>{
      const data=snap.val();
      setCambios(data?Object.values(data):[]);
    });
    return ()=>{ unsubShifts(); unsubCambios(); };
  }, [year, month]);

  // ── Si es empleado → vista reducida ──────────────────────────────────────
  if (!user) return <Login onLogin={setUser}/>;

  if (user.rol==="empleado") {
    function goMonthEmp(dir) {
      let m=month+dir, y=year;
      if(m>11){m=0;y++;} if(m<0){m=11;y--;}
      setMonth(m); setYear(y);
    }
    return <VistaEmpleado user={user} emps={emps} shifts={shifts} month={month} year={year} onLogout={()=>setUser(null)} onMonthChange={goMonthEmp}/>;
  }

  // ── Admin / Visor ─────────────────────────────────────────────────────────
  const canEdit    = user.rol !== "visor";
  const canSeeHoras = user.usuario==="javier"||user.usuario==="jaime";
  const dim = daysInMonth(year,month);
  const fd  = firstDayOfMonth(year,month);

  function notify(msg,type="ok"){ setNotif({msg,type}); setTimeout(()=>setNotif(null),3000); }

  function goMonth(dir){
    let m=month+dir, y=year;
    if(m>11){m=0;y++;} if(m<0){m=11;y--;}
    setMonth(m); setYear(y);
  }

  // Guardar turno en Firebase
  function saveShift(empId,day,arr){
    const mk=mesKey(year,month);
    set(ref(db,`turnos/${mk}/${empId}/${day}`), arr);
    setModal(null); notify("✅ Turno guardado");
  }

  function horas(id){ let t=0; for(let d=1;d<=dim;d++) t+=horasDia(shifts[id]?.[d]); return t; }
  function diasT(id){ let c=0; for(let d=1;d<=dim;d++){if(!esLibre(shifts[id]?.[d])) c++;} return c; }

  function registrarCambio(e1,e2,day,motivo){
    const em1=emps.find(e=>e.id===e1), em2=emps.find(e=>e.id===e2);
    const mk=mesKey(year,month);
    const t1=shifts[e1]?.[day]||["libre"], t2=shifts[e2]?.[day]||["libre"];
    // Swap en Firebase
    set(ref(db,`turnos/${mk}/${e1}/${day}`), t2);
    set(ref(db,`turnos/${mk}/${e2}/${day}`), t1);
    // Guardar registro
    const id=Date.now();
    set(ref(db,`cambios/${id}`),{ id,fecha:`${day}/${month+1}/${year}`,emp1:em1.name,emp2:em2.name,t1:t1.join("+"),t2:t2.join("+"),motivo,por:user.nombre });
    setCambioM(null); notify(`✅ Cambio: ${em1.name} ↔ ${em2.name}`);
  }

  function addEmp(){
    if(!newName.trim()) return;
    const cols=["#E07A5F","#3D405B","#81B29A","#b08800","#118AB2","#9B5DE5","#d63384","#00897B","#FF6D00","#6D4C41"];
    const e={id:Date.now(),name:newName.trim(),color:cols[emps.length%cols.length]};
    const newEmps=[...emps,e];
    setEmps(newEmps);
    // Añadir sus días como libre en Firebase para el mes actual
    const mk=mesKey(year,month);
    const empShifts={};
    for(let d=1;d<=dim;d++) empShifts[d]=["libre"];
    set(ref(db,`turnos/${mk}/${e.id}`), empShifts);
    setNewName(""); notify(`👤 ${e.name} añadido/a`);
  }

  function deleteEmp(id){
    setEmps(prev=>prev.filter(e=>e.id!==id));
    setDelConf(null); notify("🗑️ Empleado eliminado","warn");
  }

  const NAV=[
    {id:"dia",label:"📋 Por día"},
    {id:"calendario",label:"📅 Calendario"},
    {id:"tabla",label:"📊 Tabla"},
    ...(canSeeHoras?[{id:"horas",label:"⏱️ Horas"}]:[]),
    {id:"cambios",label:"🔄 Cambios"},
    {id:"empleados",label:"👥 Empleados"},
  ];

  // ── VISTAS ────────────────────────────────────────────────────────────────
  function ViewDia(){
    return (
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:12 }}>
        {Array.from({length:dim},(_,i)=>{
          const day=i+1, dow=dowIndex(year,month,day);
          const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear(), isWe=dow>=5;
          const trabajando=emps.filter(e=>!esLibre(shifts[e.id]?.[day]));
          const medC=trabajando.filter(e=>(shifts[e.id][day]||[]).some(t=>t==="mediodia"||t==="doble")).length;
          const nocC=trabajando.filter(e=>(shifts[e.id][day]||[]).some(t=>t==="noche"||t==="doble")).length;
          return (
            <div key={day} style={{ background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:isToday?"0 0 0 2px #E07A5F,0 4px 16px rgba(0,0,0,.1)":"0 2px 10px rgba(0,0,0,.06)",border:isToday?"2px solid #E07A5F":"2px solid transparent" }}>
              <div style={{ padding:"10px 14px",background:isToday?"#E07A5F":isWe?"#1B2432":"#2a3244",color:"#fff",display:"flex",alignItems:"center",gap:8 }}>
                <span style={{ fontWeight:900,fontSize:18 }}>{day}</span>
                <span style={{ fontSize:13,opacity:.8 }}>{DIAS[dow]}</span>
                {isWe&&<span style={{ background:"rgba(255,255,255,.2)",borderRadius:5,padding:"2px 7px",fontSize:11,fontWeight:700 }}>Fin sem.</span>}
                {isToday&&<span style={{ background:"rgba(255,255,255,.25)",borderRadius:5,padding:"2px 7px",fontSize:11,fontWeight:700 }}>Hoy</span>}
                <div style={{ marginLeft:"auto",fontSize:12,opacity:.75 }}>{trabajando.length} trabajan</div>
              </div>
              <div style={{ display:"flex",borderBottom:"1px solid #f0f0f0" }}>
                <div style={{ flex:1,padding:"7px 10px",borderRight:"1px solid #f0f0f0",background:"#FFFBF0" }}>
                  <div style={{ fontSize:10,fontWeight:700,color:"#E65100",marginBottom:2 }}>☀️ MED.</div>
                  <div style={{ fontSize:20,fontWeight:900,color:"#E65100" }}>{medC}</div>
                </div>
                <div style={{ flex:1,padding:"7px 10px",background:"#F0F6FF" }}>
                  <div style={{ fontSize:10,fontWeight:700,color:"#1565C0",marginBottom:2 }}>🌙 NOCHE</div>
                  <div style={{ fontSize:20,fontWeight:900,color:"#1565C0" }}>{nocC}</div>
                </div>
              </div>
              <div style={{ padding:"10px 12px",display:"flex",flexDirection:"column",gap:5,minHeight:50 }}>
                {trabajando.length===0?<div style={{ color:"#ccc",fontSize:12,textAlign:"center",padding:"6px 0" }}>Sin asignar</div>
                :trabajando.map(e=>{ const eArr=shifts[e.id][day]||["libre"], eInfo=abrDia(eArr);
                  return <div key={e.id} onClick={()=>canEdit&&setModal({empId:e.id,day})} style={{ display:"flex",alignItems:"center",gap:7,cursor:canEdit?"pointer":"default",padding:"4px 7px",borderRadius:7,background:eInfo.bg }} onMouseEnter={x=>canEdit&&(x.currentTarget.style.opacity=".75")} onMouseLeave={x=>x.currentTarget.style.opacity="1"}>
                    <div style={{ width:24,height:24,borderRadius:"50%",background:e.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:11,flexShrink:0 }}>{e.name.charAt(0)}</div>
                    <span style={{ fontWeight:600,fontSize:12,flex:1 }}>{e.name}</span>
                    <span style={{ fontSize:11,fontWeight:700,color:eInfo.color }}>{eInfo.emoji} {eArr.filter(t=>t!=="libre").map(t=>TURNOS[t]?.abr).join("+")}</span>
                  </div>; })}
                {emps.filter(e=>esLibre(shifts[e.id]?.[day])).length>0&&(
                  <div style={{ display:"flex",gap:4,flexWrap:"wrap",marginTop:2 }}>
                    {emps.filter(e=>esLibre(shifts[e.id]?.[day])).map(e=>(
                      <span key={e.id} onClick={()=>canEdit&&setModal({empId:e.id,day})} style={{ fontSize:10,background:"#f5f5f5",color:"#aaa",padding:"2px 7px",borderRadius:10,cursor:canEdit?"pointer":"default",fontWeight:600 }}>{e.name}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function ViewCalendario(){
    return <div>{emps.map(emp=>(
      <div key={emp.id} style={{ background:"#fff",borderRadius:16,marginBottom:14,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,.06)" }}>
        <div style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 18px",borderBottom:"1px solid #f0f0f0" }}>
          <div style={{ width:36,height:36,borderRadius:"50%",background:emp.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:14,flexShrink:0 }}>{emp.name.charAt(0)}</div>
          <div><div style={{ fontWeight:700,fontSize:15 }}>{emp.name}</div><div style={{ fontSize:12,color:"#aaa" }}>{diasT(emp.id)} días · {horas(emp.id)}h</div></div>
          {canEdit&&<button onClick={()=>setCambioM({emp1Id:emp.id})} style={{ marginLeft:"auto",background:"#F4F1EC",border:"1px solid #ddd",borderRadius:8,padding:"6px 13px",cursor:"pointer",fontSize:12,fontWeight:600,color:"#555" }}>🔄 Cambio</button>}
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)" }}>
          {DIAS.map(d=><div key={d} style={{ textAlign:"center",fontSize:10,fontWeight:700,color:"#ccc",padding:"6px 0 3px",borderBottom:"1px solid #f5f5f5" }}>{d}</div>)}
          {Array.from({length:fd}).map((_,i)=><div key={`e${i}`} style={{ borderBottom:"1px solid #f5f5f5" }}/>)}
          {Array.from({length:dim}).map((_,i)=>{
            const day=i+1, arr=shifts[emp.id]?.[day]||["libre"], info=abrDia(arr), dow=dowIndex(year,month,day);
            const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear(), isWe=dow>=5;
            return <div key={day} onClick={()=>canEdit&&setModal({empId:emp.id,day})}
              style={{ padding:"4px 2px",textAlign:"center",cursor:canEdit?"pointer":"default",borderBottom:"1px solid #f5f5f5",borderRight:"1px solid #f5f5f5",background:isToday?"#FFF8E1":isWe?"#fafafa":"transparent" }}
              onMouseEnter={x=>canEdit&&(x.currentTarget.style.background="#efefef")} onMouseLeave={x=>x.currentTarget.style.background=isToday?"#FFF8E1":isWe?"#fafafa":"transparent"}>
              <div style={{ fontSize:10,color:isToday?"#E07A5F":"#ccc",fontWeight:isToday?800:400,marginBottom:2 }}>{day}</div>
              <div style={{ background:info.bg,color:info.color,borderRadius:5,fontSize:9,fontWeight:800,padding:"2px 1px",lineHeight:1.4 }}>{info.emoji}<br/>{info.abr}</div>
              {!esLibre(arr)&&<div style={{ fontSize:8,color:"#bbb",marginTop:1 }}>{info.start}</div>}
            </div>;
          })}
        </div>
      </div>
    ))}</div>;
  }

  function ViewTabla(){
    return <div>
      <p style={{ margin:"0 0 12px",color:"#888",fontSize:13 }}>M=Mediodía · N=Noche · MAN=Mañana · D=Doble · L=Libre{canEdit?" · Clic para editar":""}</p>
      <div style={{ overflowX:"auto" }}>
        <table style={{ borderCollapse:"collapse",background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 2px 14px rgba(0,0,0,.06)",fontSize:11,minWidth:700 }}>
          <thead>
            <tr style={{ background:"#1B2432",color:"#fff" }}>
              <th style={{ padding:"12px 16px",textAlign:"left",minWidth:130,fontWeight:700,position:"sticky",left:0,background:"#1B2432",zIndex:2 }}>Empleado</th>
              {Array.from({length:dim},(_,i)=>{ const d=i+1,dow=dowIndex(year,month,d),isWe=dow>=5,isT=d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
                return <th key={d} style={{ padding:"6px 3px",textAlign:"center",minWidth:32,background:isT?"#E07A5F":isWe?"#2a3244":"#1B2432" }}><div style={{ fontSize:9,opacity:.65 }}>{DIAS[dow]}</div><div>{d}</div></th>; })}
              <th style={{ padding:"10px 8px",textAlign:"center",minWidth:48 }}>Días</th>
              <th style={{ padding:"10px 8px",textAlign:"center",minWidth:48 }}>Horas</th>
            </tr>
          </thead>
          <tbody>
            {emps.map((emp,ri)=>(
              <tr key={emp.id} style={{ background:ri%2===0?"#fff":"#fafafa" }}>
                <td style={{ padding:"8px 16px",position:"sticky",left:0,background:ri%2===0?"#fff":"#fafafa",zIndex:1 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:7 }}><div style={{ width:9,height:9,borderRadius:"50%",background:emp.color,flexShrink:0 }}/><span style={{ fontWeight:600,whiteSpace:"nowrap" }}>{emp.name}</span></div>
                </td>
                {Array.from({length:dim},(_,i)=>{ const day=i+1,arr=shifts[emp.id]?.[day]||["libre"],info=abrDia(arr);
                  return <td key={day} onClick={()=>canEdit&&setModal({empId:emp.id,day})} style={{ textAlign:"center",cursor:canEdit?"pointer":"default",padding:"3px 2px" }}>
                    <span style={{ background:info.bg,color:info.color,borderRadius:5,padding:"3px 2px",fontWeight:800,fontSize:10,display:"block" }}>{info.abr}</span>
                  </td>; })}
                <td style={{ textAlign:"center",fontWeight:700,color:"#3D405B",padding:"0 8px" }}>{diasT(emp.id)}</td>
                <td style={{ textAlign:"center",fontWeight:700,color:"#E07A5F",padding:"0 8px" }}>{horas(emp.id)}h</td>
              </tr>
            ))}
            <tr style={{ background:"#1B2432",color:"#fff",fontWeight:700 }}>
              <td style={{ padding:"8px 16px",fontSize:11,position:"sticky",left:0,background:"#1B2432" }}>Total trabajan</td>
              {Array.from({length:dim},(_,i)=>{ const day=i+1,cnt=emps.filter(e=>!esLibre(shifts[e.id]?.[day])).length;
                return <td key={day} style={{ textAlign:"center",fontSize:12,padding:"6px 2px" }}>
                  <span style={{ background:cnt>=5?"#E07A5F":cnt>=3?"rgba(242,204,143,.3)":"transparent",color:cnt>=5?"#fff":cnt>=3?"#c8a600":"#aaa",borderRadius:5,padding:"2px 3px",fontWeight:800 }}>{cnt}</span>
                </td>; })}
              <td/><td/>
            </tr>
          </tbody>
        </table>
      </div>
    </div>;
  }

  function ViewHoras(){
    return <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(255px,1fr))",gap:14 }}>
      {emps.map(emp=>{
        const h=horas(emp.id),d=diasT(emp.id),pct=Math.min(100,Math.round((h/130)*100));
        const cnt={};
        for(let day=1;day<=dim;day++){ const arr=shifts[emp.id]?.[day]||["libre"]; const key=esLibre(arr)?"libre":arr.filter(t=>t!=="libre").join("+"); cnt[key]=(cnt[key]||0)+1; }
        return <div key={emp.id} style={{ background:"#fff",borderRadius:18,padding:20,boxShadow:"0 2px 12px rgba(0,0,0,.06)" }}>
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:16 }}>
            <div style={{ width:44,height:44,borderRadius:"50%",background:emp.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:19,flexShrink:0 }}>{emp.name.charAt(0)}</div>
            <div><div style={{ fontWeight:800,fontSize:16 }}>{emp.name}</div><div style={{ fontSize:12,color:"#aaa" }}>{MESES[month]} {year}</div></div>
          </div>
          <div style={{ display:"flex",gap:10,marginBottom:14 }}>
            <div style={{ flex:1,background:"#F4F1EC",borderRadius:12,padding:10,textAlign:"center" }}><div style={{ fontSize:28,fontWeight:900,color:"#E07A5F" }}>{h}</div><div style={{ fontSize:10,color:"#aaa",fontWeight:700 }}>HORAS</div></div>
            <div style={{ flex:1,background:"#F4F1EC",borderRadius:12,padding:10,textAlign:"center" }}><div style={{ fontSize:28,fontWeight:900,color:"#1B2432" }}>{d}</div><div style={{ fontSize:10,color:"#aaa",fontWeight:700 }}>DÍAS</div></div>
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:11 }}><span style={{ color:"#aaa" }}>Ref. 130h/mes</span><span style={{ fontWeight:700 }}>{pct}%</span></div>
            <div style={{ background:"#eee",borderRadius:6,height:8,overflow:"hidden" }}><div style={{ width:`${pct}%`,height:"100%",background:emp.color,borderRadius:6,transition:"width .5s" }}/></div>
          </div>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
            {Object.entries(cnt).map(([key,c])=>{ const info=key==="libre"?TURNOS.libre:abrDia(key.split("+")); const label=key==="libre"?"Libre":key.split("+").map(t=>TURNOS[t]?.label).join("+");
              return <span key={key} style={{ background:info.bg,color:info.color,borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700,border:`1px solid ${info.color}22` }}>{info.emoji} {label}: {c}</span>; })}
          </div>
        </div>;
      })}
    </div>;
  }

  function ViewCambios(){
    return <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}>
        <h3 style={{ margin:0,fontWeight:800,fontSize:19 }}>🔄 Registro de Cambios</h3>
        {canEdit&&<button onClick={()=>setCambioM({emp1Id:null})} style={{ background:"#E07A5F",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontWeight:700,cursor:"pointer",fontSize:14 }}>+ Nuevo cambio</button>}
      </div>
      {cambios.length===0?<div style={{ background:"#fff",borderRadius:18,padding:52,textAlign:"center" }}><div style={{ fontSize:52,marginBottom:10 }}>🔄</div><div style={{ fontSize:16,fontWeight:700,color:"#aaa" }}>Sin cambios registrados</div></div>
      :<div style={{ display:"flex",flexDirection:"column",gap:10 }}>{[...cambios].reverse().map(c=>(
        <div key={c.id} style={{ background:"#fff",borderRadius:14,padding:"16px 20px",boxShadow:"0 2px 8px rgba(0,0,0,.05)",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap" }}>
          <div style={{ background:"#FFF8E1",color:"#E65100",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,whiteSpace:"nowrap" }}>📅 {c.fecha}</div>
          <div style={{ flex:1,minWidth:200 }}>
            <div style={{ fontWeight:700,fontSize:14 }}>{c.emp1} <span style={{ color:"#E07A5F" }}>↔</span> {c.emp2}</div>
            <div style={{ fontSize:12,color:"#888",marginTop:2 }}>{c.emp1}: {c.t1} ↔ {c.emp2}: {c.t2}</div>
            {c.motivo&&<div style={{ fontSize:11,color:"#bbb",marginTop:2 }}>💬 {c.motivo}</div>}
          </div>
          <div style={{ fontSize:11,color:"#ccc" }}>por {c.por}</div>
        </div>
      ))}</div>}
    </div>;
  }

  function ViewEmpleados(){
    return <div>
      {canEdit&&<div style={{ display:"flex",gap:10,marginBottom:20,background:"#fff",borderRadius:14,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
        <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addEmp()} placeholder="Nombre del nuevo empleado..." style={{ flex:1,border:"1.5px solid #e0e0e0",borderRadius:10,padding:"10px 16px",fontSize:14,outline:"none" }}/>
        <button onClick={addEmp} style={{ background:"#1B2432",color:"#fff",border:"none",borderRadius:10,padding:"10px 24px",fontWeight:700,cursor:"pointer",fontSize:14 }}>+ Añadir</button>
      </div>}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12 }}>
        {emps.map(emp=>(
          <div key={emp.id} style={{ background:"#fff",borderRadius:14,padding:18,boxShadow:"0 2px 8px rgba(0,0,0,.05)",display:"flex",alignItems:"center",gap:14 }}>
            <div style={{ width:48,height:48,borderRadius:"50%",background:emp.color,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:20,flexShrink:0 }}>{emp.name.charAt(0)}</div>
            <div style={{ flex:1 }}><div style={{ fontWeight:700,fontSize:15 }}>{emp.name}</div><div style={{ fontSize:12,color:"#aaa" }}>{diasT(emp.id)} días · {horas(emp.id)}h</div></div>
            {user.rol==="admin"&&<button onClick={()=>setDelConf(emp.id)} style={{ background:"#FFF0F0",border:"none",color:"#C62828",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:16 }}>🗑️</button>}
          </div>
        ))}
      </div>
      {user.rol==="admin"&&(
        <div style={{ marginTop:28,background:"#fff",borderRadius:16,padding:20,boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
          <div style={{ fontWeight:800,fontSize:16,marginBottom:14 }}>🔑 Accesos de empleados</div>
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
            <thead><tr style={{ background:"#F4F1EC" }}>
              <th style={{ padding:"8px 12px",textAlign:"left",fontWeight:700 }}>Nombre</th>
              <th style={{ padding:"8px 12px",textAlign:"left",fontWeight:700 }}>Usuario</th>
              <th style={{ padding:"8px 12px",textAlign:"left",fontWeight:700 }}>Contraseña</th>
            </tr></thead>
            <tbody>{USUARIOS.filter(u=>["empleado","visor"].includes(u.rol)).map(u=>(
              <tr key={u.id} style={{ borderBottom:"1px solid #f5f5f5" }}>
                <td style={{ padding:"10px 12px",fontWeight:600 }}>{u.nombre}</td>
                <td style={{ padding:"10px 12px",color:"#1565C0",fontWeight:700,fontFamily:"monospace" }}>{u.usuario}</td>
                <td style={{ padding:"10px 12px",color:"#888",fontFamily:"monospace" }}>{u.password}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>;
  }

  if(loading) return (
    <div style={{ minHeight:"100vh",background:"#F4F1EC",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48,marginBottom:16 }}>🍽️</div>
        <div style={{ fontWeight:700,fontSize:16,color:"#555" }}>Cargando turnos...</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily:"'DM Sans','Segoe UI',sans-serif",minHeight:"100vh",background:"#F4F1EC",color:"#1a1a1a" }}>
      {notif&&<div style={{ position:"fixed",top:20,right:20,zIndex:9999,background:notif.type==="warn"?"#E65100":"#2D6A4F",color:"#fff",padding:"12px 20px",borderRadius:10,fontWeight:600,fontSize:14,boxShadow:"0 4px 20px rgba(0,0,0,.2)",animation:"fadeIn .3s ease" }}>{notif.msg}</div>}
      <div style={{ background:"#1B2432",color:"#fff" }}>
        <div style={{ maxWidth:1400,margin:"0 auto",padding:"0 20px",display:"flex",alignItems:"center",gap:14,height:58 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
            <div style={{ background:"#E07A5F",borderRadius:10,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17 }}>🍽️</div>
            <div><div style={{ fontWeight:800,fontSize:15,lineHeight:1.2 }}>Mesón do Loyo</div><div style={{ fontSize:10,color:"#aaa" }}>Paradela, Lugo</div></div>
          </div>
          <div style={{ flex:1 }}/>
          <div style={{ display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:13,fontWeight:700 }}>{user.nombre}</div>
              <div style={{ fontSize:11,color:"#aaa" }}>{user.rol==="admin"?"👑 Admin":user.rol==="visor"?"👁️ Solo lectura":"✏️ Editor"}</div>
            </div>
            <button onClick={()=>setUser(null)} style={{ background:"#2a3244",color:"#ccc",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600 }}>Salir</button>
          </div>
        </div>
        <div style={{ background:"#141c28",borderTop:"1px solid #2a3244" }}>
          <div style={{ maxWidth:1400,margin:"0 auto",padding:"0 20px",display:"flex",gap:4,overflowX:"auto" }}>
            {NAV.map(n=>(
              <button key={n.id} onClick={()=>setView(n.id)} style={{ background:view===n.id?"#E07A5F":"transparent",color:view===n.id?"#fff":"#9aa3b0",border:"none",borderRadius:0,padding:"13px 16px",cursor:"pointer",fontWeight:700,fontSize:13,whiteSpace:"nowrap",borderBottom:view===n.id?"3px solid #fff":"3px solid transparent",transition:"all .15s" }}>{n.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ maxWidth:1400,margin:"0 auto",padding:"24px 20px" }}>
        <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:22,flexWrap:"wrap" }}>
          <button onClick={()=>goMonth(-1)} style={{ background:"#fff",border:"1px solid #ddd",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center" }}>‹</button>
          <h2 style={{ margin:0,fontSize:20,fontWeight:800 }}>{MESES[month]} {year}</h2>
          <button onClick={()=>goMonth(1)} style={{ background:"#fff",border:"1px solid #ddd",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center" }}>›</button>
          <div style={{ display:"flex",gap:8,marginLeft:"auto",flexWrap:"wrap" }}>
            {Object.entries(TURNOS).map(([k,v])=><span key={k} style={{ background:v.bg,color:v.color,borderRadius:8,padding:"4px 11px",fontSize:12,fontWeight:700,border:`1px solid ${v.color}33` }}>{v.emoji} {v.label}{v.horas>0?` · ${v.horas}h`:""}</span>)}
          </div>
        </div>
        {view==="dia"        && <ViewDia/>}
        {view==="calendario" && <ViewCalendario/>}
        {view==="tabla"      && <ViewTabla/>}
        {view==="horas"      && canSeeHoras && <ViewHoras/>}
        {view==="cambios"    && <ViewCambios/>}
        {view==="empleados"  && <ViewEmpleados/>}
      </div>
      {modal&&(()=>{ const emp=emps.find(e=>e.id===modal.empId); return <ModalTurno emp={emp} day={modal.day} month={month} currentArr={shifts[modal.empId]?.[modal.day]||["libre"]} onSave={arr=>saveShift(modal.empId,modal.day,arr)} onClose={()=>setModal(null)}/>; })()}
      {cambioM&&<ModalCambio emps={emps} dim={dim} month={month} year={year} shifts={shifts} initialEmp1={cambioM.emp1Id} onConfirm={registrarCambio} onClose={()=>setCambioM(null)}/>}
      {delConf&&<div style={S.overlay} onClick={()=>setDelConf(null)}><div style={{ ...S.modal,maxWidth:330 }} onClick={e=>e.stopPropagation()}><div style={{ fontSize:42,textAlign:"center",marginBottom:12 }}>⚠️</div><div style={{ fontWeight:800,fontSize:17,textAlign:"center",marginBottom:8 }}>¿Eliminar empleado?</div><div style={{ color:"#aaa",fontSize:13,textAlign:"center",marginBottom:24 }}>No se puede deshacer.</div><div style={{ display:"flex",gap:10 }}><button onClick={()=>setDelConf(null)} style={{ flex:1,background:"#f0f0f0",border:"none",borderRadius:10,padding:12,cursor:"pointer",fontWeight:600 }}>Cancelar</button><button onClick={()=>deleteEmp(delConf)} style={{ flex:1,background:"#C62828",color:"#fff",border:"none",borderRadius:10,padding:12,cursor:"pointer",fontWeight:700 }}>Eliminar</button></div></div></div>}
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}*{box-sizing:border-box}button:active{transform:scale(.97)}`}</style>
    </div>
  );
}
