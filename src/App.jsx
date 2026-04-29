import { useState, useRef } from "react";

const APP_FEE = 0.25;
const TAX_RATE = 0.0875;
const TIP_PCT = 0.20;

const COLORS = {
  You:    { bg:"#FF6B6B", light:"#FFE5E5", text:"#c0392b" },
  Jordan: { bg:"#4ECDC4", light:"#E0F7F6", text:"#1a8a84" },
  Sam:    { bg:"#FFE66D", light:"#FFF9D6", text:"#b8960c" },
  Taylor: { bg:"#A8E6CF", light:"#E6F7EF", text:"#2d8a5e" },
  Alex:   { bg:"#C3A6FF", light:"#EEE5FF", text:"#6a35d4" },
};

const FRIENDS = [
  { name:"Jordan", phone:"+1 (214) 555-0101", venmo:"@jordan-smith",  cashapp:"$jordansmith", status:"active" },
  { name:"Sam",    phone:"+1 (214) 555-0102", venmo:"@sam-lee99",     cashapp:"$samlee",      status:"active" },
  { name:"Taylor", phone:"+1 (214) 555-0103", venmo:"@taylor.pays",   cashapp:"$taylorpays",  status:"active" },
  { name:"Alex",   phone:"+1 (214) 555-0104", venmo:"@alex-w",        cashapp:"",             status:"pending" },
];

const DEMO_RAW = [
  { id:1, name:"Margherita Pizza",  unitPrice:18, quantity:1 },
  { id:2, name:"Truffle Fries",     unitPrice:12, quantity:1 },
  { id:3, name:"Caesar Salad",      unitPrice:14, quantity:1 },
  { id:4, name:"Margarita",         unitPrice:13, quantity:3 },
  { id:5, name:"Impossible Burger", unitPrice:19, quantity:1 },
  { id:6, name:"Sparkling Water",   unitPrice:6,  quantity:3 },
  { id:7, name:"Chicken Tacos",     unitPrice:22, quantity:2 },
  { id:8, name:"Tiramisu",          unitPrice:9,  quantity:1 },
];

const GUEST_PAYER = { name:"Jordan", venmo:"@jordan-smith", cashapp:"$jordansmith" };
const ALL_MEMBERS = ["You","Jordan","Sam","Taylor","Alex"];

function toClaimItem(r) {
  return { id:r.id, name:r.name, price:r.unitPrice*r.quantity, quantity:r.quantity, claimedBy:{} };
}

function calcTotal(items, person, billTotal) {
  const sub = items.reduce((s,i) => {
    const q = (i.claimedBy[person]) || 0;
    return s + (q / Math.max(i.quantity,1)) * i.price;
  }, 0);
  const frac = billTotal > 0 ? sub/billTotal : 0;
  const tax = billTotal * TAX_RATE * frac;
  const tip = billTotal * TIP_PCT * frac;
  return { sub, tax, tip, total: sub+tax+tip };
}

async function scanReceipt(base64, mediaType) {
  const safe = ["image/jpeg","image/png","image/gif","image/webp"].includes(mediaType) ? mediaType : "image/jpeg";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      model:"claude-sonnet-4-5",
      max_tokens:1024,
      messages:[{ role:"user", content:[
        { type:"image", source:{ type:"base64", media_type:safe, data:base64 }},
        { type:"text",  text:"Parse this receipt. Return ONLY a JSON array, no markdown.\nEach item: {\"name\":string,\"unitPrice\":number,\"quantity\":number}\nunitPrice = price per single item. Skip tax/tip/total lines.\nIf unreadable: [{\"name\":\"Item 1\",\"unitPrice\":10,\"quantity\":1}]" }
      ]}]
    })
  });
  if (!res.ok) throw new Error("API " + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const txt = (data.content||[]).map(b=>b.text||"").join("").trim();
  const clean = txt.replace(/^```json?\s*/i,"").replace(/\s*```$/,"").trim();
  let parsed;
  try { parsed = JSON.parse(clean); }
  catch(e) { const m = clean.match(/\[[\s\S]*\]/); parsed = m ? JSON.parse(m[0]) : []; }
  if (!Array.isArray(parsed) || !parsed.length) throw new Error("No items");
  return parsed.map((x,i) => ({ id:i+1, name:x.name||"Item", unitPrice:parseFloat(x.unitPrice)||0, quantity:parseInt(x.quantity)||1 }));
}

// ── Shared Components ─────────────────────────────────────────────────────────

function Av({ name, size=32 }) {
  const c = COLORS[name] || { bg:"#b2bec3" };
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%", background:c.bg,
      color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
      fontWeight:800, fontSize:size*0.38, flexShrink:0,
      fontFamily:"'Nunito',sans-serif", boxShadow:`0 2px 8px ${c.bg}88`
    }}>{name[0]}</div>
  );
}

function Back({ onBack }) {
  return (
    <button onClick={onBack} style={{
      background:"none", border:"none", cursor:"pointer", color:"#FF6B6B",
      fontFamily:"'Nunito',sans-serif", fontWeight:800, fontSize:15,
      display:"flex", alignItems:"center", gap:6, padding:"0 0 4px"
    }}>← Back</button>
  );
}

function NavBar({ tab, setTab }) {
  const tabs = [
    { id:"home",    icon:"💸", label:"New Tab"  },
    { id:"friends", icon:"👥", label:"Friends"  },
    { id:"history", icon:"🕐", label:"History"  },
    { id:"profile", icon:"👤", label:"Profile"  },
  ];
  return (
    <div style={{display:"flex", borderTop:"1px solid #f0f0f0", background:"#fff", boxShadow:"0 -4px 20px #0000000a"}}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          flex:1, padding:"10px 4px 8px", background:"none", border:"none",
          cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:2,
          color: tab===t.id ? "#FF6B6B" : "#bbb", transition:"color 0.2s",
          fontFamily:"'Nunito',sans-serif"
        }}>
          <span style={{fontSize:20}}>{t.icon}</span>
          <span style={{fontSize:10, fontWeight:800}}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Claim Screen (shared by payer + guest) ────────────────────────────────────

function ClaimScreen({ items, setItems, me, onBack, onNext }) {
  const [qtyItem,  setQtyItem]  = useState(null);
  const [qtySel,   setQtySel]   = useState(0);
  const [splitItem,setSplitItem]= useState(null);
  const [splitSel, setSplitSel] = useState([]);

  const myQty = (item) => (item.claimedBy[me] || 0);
  const myTotal = items.reduce((s,i) => s + (myQty(i)/Math.max(i.quantity,1))*i.price, 0);
  const accent = COLORS[me] || COLORS.You;

  function tap(item) {
    if (item.quantity > 1) { setQtyItem(item); setQtySel(myQty(item)||1); return; }
    setItems(prev => prev.map(i => {
      if (i.id !== item.id) return i;
      const cb = {...i.claimedBy};
      if (cb[me]) delete cb[me]; else cb[me] = 1;
      return {...i, claimedBy:cb};
    }));
  }

  function confirmQty() {
    const id = qtyItem.id;
    const q  = qtySel;
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const cb = {...i.claimedBy};
      if (q === 0) delete cb[me]; else cb[me] = q;
      return {...i, claimedBy:cb};
    }));
    setQtyItem(null);
  }

  function confirmSplit() {
    const id  = splitItem.id;
    const sel = [...splitSel];
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const cb = {...i.claimedBy};
      sel.forEach(f => { if (!cb[f]) cb[f] = 1; });
      Object.keys(cb).forEach(k => { if (k !== me && !sel.includes(k)) delete cb[k]; });
      return {...i, claimedBy:cb};
    }));
    setSplitItem(null);
  }

  const hasClaims = items.some(i => myQty(i) > 0);

  return (
    <div style={{padding:"20px", display:"flex", flexDirection:"column", gap:12}}>
      <Back onBack={onBack}/>

      <div style={{textAlign:"center"}}>
        <div style={{fontSize:38, marginBottom:4}}>🍽️</div>
        <h2 style={{margin:0, fontFamily:"'Nunito',sans-serif", fontSize:21, fontWeight:900, color:"#1a1a2e"}}>
          What did you have?
        </h2>
        <p style={{margin:"5px 0 0", color:"#888", fontFamily:"'Nunito',sans-serif", fontSize:13}}>
          Tap to claim. Pick quantity on ×2, ×3 items.
        </p>
      </div>

      <div style={{background:"linear-gradient(135deg,#FF6B6B,#ff8e53)", borderRadius:16, padding:"13px 18px", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <span style={{fontFamily:"'Nunito',sans-serif", fontWeight:800, color:"#fff", fontSize:13}}>Your items so far</span>
        <span style={{fontFamily:"'Nunito',sans-serif", fontWeight:900, color:"#fff", fontSize:22}}>${myTotal.toFixed(2)}</span>
      </div>

      {items.map(item => {
        const mine   = myQty(item) > 0;
        const isMulti= item.quantity > 1;
        const share  = mine ? (myQty(item)/item.quantity)*item.price : 0;
        const entries= Object.entries(item.claimedBy);

        return (
          <div key={item.id} style={{
            background: mine ? accent.light : "#fff",
            border: `2px solid ${mine ? accent.bg : "#eee"}`,
            borderRadius:16, padding:"12px 14px", transition:"all 0.2s"
          }}>
            <div style={{display:"flex", alignItems:"flex-start", gap:10}}>
              <button onClick={() => tap(item)} style={{
                width:27, height:27, borderRadius:8, flexShrink:0, marginTop:2,
                border:`2px solid ${mine ? accent.bg : "#ccc"}`,
                background: mine ? accent.bg : "#fff",
                cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:14, color:"#fff"
              }}>{mine ? "✓" : ""}</button>

              <div style={{flex:1}}>
                <div style={{display:"flex", alignItems:"center", gap:7, flexWrap:"wrap"}}>
                  <span style={{fontFamily:"'Nunito',sans-serif", fontWeight:800, fontSize:14, color:"#1a1a2e"}}>
                    {item.name}
                  </span>
                  {isMulti && (
                    <span style={{background:"#1a1a2e", color:"#fff", borderRadius:7, padding:"2px 7px", fontSize:10, fontWeight:800, fontFamily:"'Nunito',sans-serif"}}>
                      ×{item.quantity}
                    </span>
                  )}
                </div>

                {entries.length > 0 && (
                  <div style={{display:"flex", flexWrap:"wrap", gap:4, marginTop:5}}>
                    {entries.map(([person, qty]) => {
                      const c = COLORS[person] || {bg:"#ccc", light:"#eee", text:"#555"};
                      return (
                        <span key={person} style={{
                          display:"inline-flex", alignItems:"center", gap:3,
                          background:c.light, color:c.text, borderRadius:20,
                          padding:"2px 8px 2px 5px", fontSize:11, fontWeight:700,
                          fontFamily:"'Nunito',sans-serif"
                        }}>
                          <Av name={person} size={16}/>
                          {person}{isMulti ? ` ×${qty}` : ""}
                        </span>
                      );
                    })}
                  </div>
                )}

                {mine && isMulti && (
                  <button onClick={() => { setQtyItem(item); setQtySel(myQty(item)); }} style={{
                    marginTop:6, background:"none", border:`1.5px solid ${accent.bg}`,
                    borderRadius:9, padding:"3px 10px", fontFamily:"'Nunito',sans-serif",
                    fontSize:11, fontWeight:700, color:accent.text, cursor:"pointer"
                  }}>✏️ I had {myQty(item)} of {item.quantity}</button>
                )}
                {mine && !isMulti && (
                  <button onClick={() => { setSplitItem(item); setSplitSel(Object.keys(item.claimedBy).filter(u => u !== me)); }} style={{
                    marginTop:6, background:"none", border:`1.5px dashed ${accent.bg}`,
                    borderRadius:9, padding:"3px 10px", fontFamily:"'Nunito',sans-serif",
                    fontSize:11, fontWeight:700, color:accent.text, cursor:"pointer"
                  }}>➕ Split with friends</button>
                )}
              </div>

              <div style={{textAlign:"right", flexShrink:0}}>
                <div style={{fontFamily:"'Nunito',sans-serif", fontWeight:900, fontSize:14}}>
                  ${item.price.toFixed(2)}
                </div>
                {mine && (
                  <div style={{fontFamily:"'Nunito',sans-serif", fontSize:11, color:accent.text, fontWeight:700}}>
                    yours: ${share.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <button onClick={onNext} disabled={!hasClaims} style={{
        background: hasClaims ? "linear-gradient(135deg,#FF6B6B,#ff8e53)" : "#eee",
        color: hasClaims ? "#fff" : "#bbb",
        border:"none", borderRadius:16, padding:"15px",
        fontSize:16, fontWeight:800, fontFamily:"'Nunito',sans-serif",
        cursor: hasClaims ? "pointer" : "not-allowed"
      }}>
        Done — See My Total →
      </button>

      {/* Qty Modal */}
      {qtyItem && (
        <div style={{position:"fixed",inset:0,background:"#0009",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}}
          onClick={() => setQtyItem(null)}>
          <div onClick={e => e.stopPropagation()} style={{background:"#fff",borderRadius:"24px 24px 0 0",padding:"28px 24px 48px",width:"100%",maxWidth:480}}>
            <h3 style={{margin:"0 0 4px",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:19}}>{qtyItem.name}</h3>
            <p style={{margin:"0 0 18px",color:"#888",fontFamily:"'Nunito',sans-serif",fontSize:13}}>
              ×{qtyItem.quantity} on the receipt · ${qtyItem.price.toFixed(2)} total. How many were yours?
            </p>
            <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
              {Array.from({length: qtyItem.quantity+1}, (_,n) => n).map(n => (
                <button key={n} onClick={() => setQtySel(n)} style={{
                  width:68, height:68, borderRadius:16,
                  border:`2.5px solid ${qtySel===n ? accent.bg : "#eee"}`,
                  background: qtySel===n ? accent.light : "#fafafa",
                  fontFamily:"'Nunito',sans-serif", fontWeight:900, fontSize:24,
                  color: qtySel===n ? accent.text : "#bbb",
                  cursor:"pointer", display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center", gap:2
                }}>
                  {n}
                  {n > 0 && (
                    <span style={{fontSize:10, fontWeight:700, color: qtySel===n ? accent.text : "#ccc"}}>
                      ${((n/qtyItem.quantity)*qtyItem.price).toFixed(2)}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button onClick={confirmQty} style={{
              marginTop:18, width:"100%",
              background: qtySel===0 ? "#ddd" : "linear-gradient(135deg,#FF6B6B,#ff8e53)",
              color:"#fff", border:"none", borderRadius:14, padding:"14px",
              fontSize:16, fontWeight:800, fontFamily:"'Nunito',sans-serif", cursor:"pointer"
            }}>
              {qtySel===0 ? "Remove this item" : `Confirm — I had ${qtySel} ✓`}
            </button>
          </div>
        </div>
      )}

      {/* Split Modal */}
      {splitItem && (
        <div style={{position:"fixed",inset:0,background:"#0009",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200}}
          onClick={() => setSplitItem(null)}>
          <div onClick={e => e.stopPropagation()} style={{background:"#fff",borderRadius:"24px 24px 0 0",padding:"28px 24px 48px",width:"100%",maxWidth:480}}>
            <h3 style={{margin:"0 0 16px",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:19}}>
              Split "{splitItem.name}"
            </h3>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {ALL_MEMBERS.filter(f => f !== me).map(f => {
                const sel = splitSel.includes(f);
                const c = COLORS[f] || {bg:"#ccc",light:"#eee"};
                return (
                  <label key={f} style={{
                    display:"flex", alignItems:"center", gap:12,
                    background: sel ? c.light : "#f8f8f8",
                    border: `2px solid ${sel ? c.bg : "#eee"}`,
                    borderRadius:12, padding:"10px 14px", cursor:"pointer"
                  }}>
                    <input type="checkbox" checked={sel}
                      onChange={() => setSplitSel(p => sel ? p.filter(x=>x!==f) : [...p,f])}
                      style={{display:"none"}}/>
                    <Av name={f} size={36}/>
                    <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:15,flex:1}}>{f}</span>
                    {sel && <span>✓</span>}
                  </label>
                );
              })}
            </div>
            <button onClick={confirmSplit} style={{
              marginTop:20, width:"100%",
              background:"linear-gradient(135deg,#FF6B6B,#ff8e53)",
              color:"#fff", border:"none", borderRadius:14, padding:"14px",
              fontSize:16, fontWeight:800, fontFamily:"'Nunito',sans-serif", cursor:"pointer"
            }}>
              Split {splitSel.length+1} ways — ${(splitItem.price/(splitSel.length+1)).toFixed(2)} each ✓
            </button>
          </div>
        </div>
      )}
      <style>{`@keyframes bounce{from{transform:translateY(0)}to{transform:translateY(-7px)}}`}</style>
    </div>
  );
}

// ── Summary Screen (shared) ───────────────────────────────────────────────────

function SummaryScreen({ items, payer, me, members, onBack, onClose }) {
  const [paid, setPaid] = useState(false);
  const billTotal = items.reduce((s,i) => s+i.price, 0);
  const { sub, tax, tip, total:base } = calcTotal(items, me, billTotal);
  const myTotal = base + APP_FEE;
  const unclaimed = items.filter(i => Object.keys(i.claimedBy).length===0);
  const claimed   = items.filter(i => Object.keys(i.claimedBy).length > 0);

  function pay(e) {
    setPaid(true);
    setTimeout(() => onClose(), 2500);
  }

  return (
    <div style={{padding:"20px 20px 48px", display:"flex", flexDirection:"column", gap:14}}>
      <Back onBack={onBack}/>

      <div style={{textAlign:"center"}}>
        <div style={{fontSize:44,marginBottom:4}}>{paid ? "🎉" : "💰"}</div>
        <h2 style={{margin:0,fontFamily:"'Nunito',sans-serif",fontSize:22,fontWeight:900,color:"#1a1a2e"}}>
          {paid ? "All settled up!" : "Your total"}
        </h2>
      </div>

      {/* Big card */}
      <div style={{
        background: paid ? "linear-gradient(135deg,#4ECDC4,#44a8a1)" : "linear-gradient(135deg,#FF6B6B,#ff8e53)",
        borderRadius:22, padding:"20px", transition:"all 0.5s"
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div>
            <div style={{fontFamily:"'Nunito',sans-serif",color:"#ffffffcc",fontSize:13,fontWeight:700,marginBottom:2}}>
              You owe {payer.name}
            </div>
            <div style={{fontFamily:"'Nunito',sans-serif",color:"#fff",fontSize:42,fontWeight:900,lineHeight:1}}>
              ${myTotal.toFixed(2)}
            </div>
          </div>
          <Av name={payer.name} size={50}/>
        </div>
        <div style={{marginTop:12,display:"flex",gap:7,flexWrap:"wrap"}}>
          {[["Items",`$${sub.toFixed(2)}`],["Tax",`$${tax.toFixed(2)}`],["Tip 20%",`$${tip.toFixed(2)}`],["App Fee","$0.25"]].map(([l,v]) => (
            <div key={l} style={{background:"#ffffff22",borderRadius:10,padding:"5px 10px",textAlign:"center"}}>
              <div style={{fontFamily:"'Nunito',sans-serif",fontSize:10,color:"#ffffffbb",fontWeight:700}}>{l}</div>
              <div style={{fontFamily:"'Nunito',sans-serif",fontSize:13,color:"#fff",fontWeight:800}}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Your items */}
      <div style={{background:"#fff",borderRadius:16,padding:"14px",boxShadow:"0 2px 10px #0000000a"}}>
        <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:14,marginBottom:8,color:"#1a1a2e"}}>🧾 Your items</div>
        {items.filter(i => (i.claimedBy[me]||0) > 0).map(item => {
          const q = item.claimedBy[me];
          return (
            <div key={item.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #f5f5f5"}}>
              <span style={{fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700}}>
                {item.name}{item.quantity>1 ? ` (${q} of ${item.quantity})` : ""}
              </span>
              <span style={{fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:800}}>
                ${((q/item.quantity)*item.price).toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Who got what */}
      {claimed.length > 0 && (
        <div style={{background:"#fff",borderRadius:16,padding:"14px",boxShadow:"0 2px 10px #0000000a"}}>
          <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:14,marginBottom:8,color:"#1a1a2e"}}>👥 Who got what</div>
          {claimed.map(item => (
            <div key={item.id} style={{padding:"6px 0",borderBottom:"1px solid #f5f5f5"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,color:"#1a1a2e"}}>
                  {item.name}{item.quantity>1 ? ` ×${item.quantity}` : ""}
                </span>
                <span style={{fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:800}}>${item.price.toFixed(2)}</span>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {Object.entries(item.claimedBy).map(([person,qty]) => {
                  const c = COLORS[person]||{light:"#eee",text:"#555"};
                  const share = (qty/item.quantity)*item.price;
                  return (
                    <span key={person} style={{fontFamily:"'Nunito',sans-serif",fontSize:11,color:c.text,background:c.light,borderRadius:8,padding:"1px 8px",fontWeight:700}}>
                      {person}{item.quantity>1 ? ` ×${qty}` : ""}: ${share.toFixed(2)}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unclaimed */}
      {unclaimed.length > 0 && (
        <div style={{background:"#fff9e6",borderRadius:14,padding:"12px 14px",border:"2px solid #FFE66D"}}>
          <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:13,color:"#b8960c",marginBottom:5}}>
            ⚠️ {unclaimed.length} unclaimed item{unclaimed.length>1?"s":""}
          </div>
          {unclaimed.map(i => (
            <div key={i.id} style={{fontFamily:"'Nunito',sans-serif",fontSize:12,color:"#888",display:"flex",justifyContent:"space-between"}}>
              <span>{i.name}</span><span>${i.price.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Everyone's totals */}
      <div style={{background:"#fff",borderRadius:16,padding:"14px",boxShadow:"0 2px 10px #0000000a"}}>
        <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:14,marginBottom:8,color:"#1a1a2e"}}>💰 Everyone's total</div>
        {members.map(f => {
          const { total:t } = calcTotal(items, f, billTotal);
          const isPayer = f===payer.name;
          return (
            <div key={f} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:"1px solid #f5f5f5"}}>
              <Av name={f} size={28}/>
              <span style={{flex:1,fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13}}>{f}</span>
              {isPayer && <span style={{fontSize:10,background:"#4ECDC4",color:"#fff",borderRadius:6,padding:"1px 6px",fontFamily:"'Nunito',sans-serif",fontWeight:800}}>PAID BILL</span>}
              <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:14,color:f===me?"#FF6B6B":"#1a1a2e"}}>
                ${(t+APP_FEE).toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Pay buttons */}
      {!paid && (
        <>
          <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13,color:"#555",textAlign:"center"}}>
            Pay {payer.name} however you prefer:
          </div>
          <div style={{display:"flex",gap:10}}>
            {payer.venmo && (
              <a href={`venmo://paycharge?txn=pay&recipients=${encodeURIComponent(payer.venmo.replace("@",""))}&amount=${myTotal.toFixed(2)}&note=OneBill`}
                onClick={pay} style={{flex:1,display:"block",textDecoration:"none",background:"linear-gradient(135deg,#008CFF,#0070cc)",color:"#fff",borderRadius:16,padding:"15px 8px",fontSize:14,fontWeight:900,fontFamily:"'Nunito',sans-serif",textAlign:"center"}}>
                💙 Venmo<br/><span style={{fontSize:11,opacity:0.85}}>{payer.venmo}</span>
              </a>
            )}
            {payer.cashapp && (
              <a href={`https://cash.app/${payer.cashapp}/${myTotal.toFixed(2)}`}
                onClick={pay} style={{flex:1,display:"block",textDecoration:"none",background:"linear-gradient(135deg,#00D632,#00a826)",color:"#fff",borderRadius:16,padding:"15px 8px",fontSize:14,fontWeight:900,fontFamily:"'Nunito',sans-serif",textAlign:"center"}}>
                💚 Cash App<br/><span style={{fontSize:11,opacity:0.85}}>{payer.cashapp}</span>
              </a>
            )}
          </div>
        </>
      )}
      {paid && (
        <div style={{background:"#f0fff9",border:"2px solid #4ECDC4",borderRadius:18,padding:"20px",textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:8}}>🎉</div>
          <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,color:"#1a8a84",fontSize:17}}>
            Payment sent to {payer.name}!
          </div>
          <div style={{fontFamily:"'Nunito',sans-serif",color:"#888",fontSize:13,marginTop:4}}>
            Moving to History... 📁
          </div>
        </div>
      )}
    </div>
  );
}

// ── PAYER FLOW ────────────────────────────────────────────────────────────────

function PayerFlow({ onDone }) {
  const [step, setStep] = useState(0); // 0=upload 1=review 2=invite 3=claim 4=summary
  const [raw,  setRaw]  = useState([]);
  const [items,setItems]= useState([]);
  const cameraRef = useRef();
  const galleryRef= useRef();
  const [scanState, setScanState] = useState("idle");
  const [scanErr,   setScanErr]   = useState("");
  const [inviteStep, setInviteStep] = useState("invite");
  const [selected, setSelected] = useState(FRIENDS.map(f=>f.name));
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editQty, setEditQty] = useState("");

  const totalPeople = selected.length + 1;
  const fee = (totalPeople * APP_FEE).toFixed(2);
  const billTotal = raw.reduce((s,r) => s+r.unitPrice*r.quantity, 0);

  async function handleFile(file) {
    if (!file) return;
    setScanState("scanning");
    try {
      const b64 = await new Promise((res,rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const result = await scanReceipt(b64, file.type||"image/jpeg");
      setScanState("idle");
      setRaw(result);
      setStep(1);
    } catch(e) {
      setScanState("error");
      setScanErr("Couldn't read that receipt. Try a clearer photo.");
    }
  }

  function saveEdit() {
    setRaw(prev => prev.map(r => r.id!==editId ? r : {
      ...r,
      name: editName||r.name,
      unitPrice: parseFloat(editPrice)||r.unitPrice,
      quantity: parseInt(editQty)||r.quantity
    }));
    setEditId(null);
  }

  function goToInvite() {
    setItems(raw.map(toClaimItem));
    setStep(2);
  }

  function sendTab() {
    setInviteStep("processing");
    setTimeout(() => setInviteStep("sent"), 1600);
    setTimeout(() => setStep(3), 2400);
  }

  // Step 0: Upload
  if (step === 0) return (
    <div style={{padding:"32px 24px",display:"flex",flexDirection:"column",gap:24,alignItems:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:52,marginBottom:6}}>🧾</div>
        <h2 style={{margin:0,fontFamily:"'Nunito',sans-serif",fontSize:24,fontWeight:900,color:"#1a1a2e"}}>Snap your receipt</h2>
        <p style={{margin:"8px 0 0",color:"#888",fontFamily:"'Nunito',sans-serif",fontSize:14}}>AI reads every item — you review, then send to the group</p>
      </div>
      {scanState==="scanning" && (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:"32px 0"}}>
          <div style={{fontSize:44}}>🔍</div>
          <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,color:"#4ECDC4",fontSize:16}}>Reading your receipt...</div>
          <div style={{display:"flex",gap:7}}>
            {[0,1,2,3].map(i=><div key={i} style={{width:9,height:9,borderRadius:"50%",background:"#4ECDC4",animation:`bounce 0.7s ${i*0.14}s infinite alternate`}}/>)}
          </div>
        </div>
      )}
      {scanState==="error" && (
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:44}}>😕</div>
          <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,color:"#FF6B6B",fontSize:15,marginTop:8}}>{scanErr}</div>
        </div>
      )}
      {(scanState==="idle"||scanState==="error") && (
        <>
          <div style={{display:"flex",gap:14,width:"100%",maxWidth:340}}>
            <button onClick={()=>cameraRef.current.click()} style={{flex:1,background:"linear-gradient(135deg,#FF6B6B,#ff8e53)",color:"#fff",border:"none",borderRadius:18,padding:"22px 12px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer"}}>
              <span style={{fontSize:32}}>📷</span>
              <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13}}>Take Photo</span>
            </button>
            <button onClick={()=>galleryRef.current.click()} style={{flex:1,background:"linear-gradient(135deg,#C3A6FF,#a076f9)",color:"#fff",border:"none",borderRadius:18,padding:"22px 12px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer"}}>
              <span style={{fontSize:32}}>🖼️</span>
              <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13}}>Camera Roll</span>
            </button>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
          <input ref={galleryRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
          <div style={{display:"flex",alignItems:"center",gap:12,width:"100%",maxWidth:340}}>
            <div style={{flex:1,height:1,background:"#eee"}}/>
            <span style={{fontFamily:"'Nunito',sans-serif",color:"#ccc",fontSize:13,fontWeight:700}}>or</span>
            <div style={{flex:1,height:1,background:"#eee"}}/>
          </div>
          <button onClick={()=>{setRaw(DEMO_RAW);setStep(1);}} style={{background:"#f5f5f5",color:"#888",border:"none",borderRadius:16,padding:"14px 32px",fontSize:15,fontWeight:800,fontFamily:"'Nunito',sans-serif",cursor:"pointer",width:"100%",maxWidth:340}}>
            Try Demo Receipt →
          </button>
        </>
      )}
    </div>
  );

  // Step 1: Review
  if (step === 1) return (
    <div style={{padding:"20px",display:"flex",flexDirection:"column",gap:14}}>
      <Back onBack={()=>setStep(0)}/>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:38,marginBottom:4}}>✏️</div>
        <h2 style={{margin:0,fontFamily:"'Nunito',sans-serif",fontSize:21,fontWeight:900,color:"#1a1a2e"}}>Review your items</h2>
        <p style={{margin:"5px 0 0",color:"#888",fontFamily:"'Nunito',sans-serif",fontSize:13}}>Tap Edit to fix anything before sending.</p>
      </div>
      <div style={{background:"linear-gradient(135deg,#4ECDC4,#44a8a1)",borderRadius:16,padding:"13px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,color:"#fff",fontSize:13}}>Total Bill</span>
        <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,color:"#fff",fontSize:22}}>${billTotal.toFixed(2)}</span>
      </div>
      {raw.map(r => (
        <div key={r.id} style={{background:editId===r.id?"#fff5f5":"#fff",border:`2px solid ${editId===r.id?"#FF6B6B":"#f0f0f0"}`,borderRadius:16,padding:"14px"}}>
          {editId===r.id ? (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <input value={editName} onChange={e=>setEditName(e.target.value)}
                style={{padding:"10px 14px",borderRadius:12,border:"2px solid #FF6B6B",fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:700,outline:"none",boxSizing:"border-box",width:"100%"}}/>
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'Nunito',sans-serif",fontSize:11,fontWeight:700,color:"#aaa",marginBottom:4}}>QUANTITY</div>
                  <input type="number" min="1" value={editQty} onChange={e=>setEditQty(e.target.value)}
                    style={{width:"100%",padding:"10px",borderRadius:12,border:"2px solid #f0f0f0",fontFamily:"'Nunito',sans-serif",fontSize:16,fontWeight:800,outline:"none",boxSizing:"border-box",textAlign:"center"}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'Nunito',sans-serif",fontSize:11,fontWeight:700,color:"#aaa",marginBottom:4}}>PRICE EACH</div>
                  <input type="number" min="0" step="0.01" value={editPrice} onChange={e=>setEditPrice(e.target.value)}
                    style={{width:"100%",padding:"10px",borderRadius:12,border:"2px solid #f0f0f0",fontFamily:"'Nunito',sans-serif",fontSize:15,fontWeight:800,outline:"none",boxSizing:"border-box"}}/>
                </div>
              </div>
              {parseInt(editQty)>1 && parseFloat(editPrice)>0 && (
                <div style={{background:"#f0fffe",borderRadius:10,padding:"8px 12px",border:"1.5px solid #4ECDC488",fontFamily:"'Nunito',sans-serif",fontSize:13,color:"#1a8a84",fontWeight:700,textAlign:"center"}}>
                  {editQty} × ${parseFloat(editPrice||0).toFixed(2)} = <strong>${(parseFloat(editQty||0)*parseFloat(editPrice||0)).toFixed(2)} total</strong>
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setEditId(null)} style={{flex:1,background:"#f5f5f5",color:"#888",border:"none",borderRadius:12,padding:"10px",fontFamily:"'Nunito',sans-serif",fontWeight:800,cursor:"pointer"}}>Cancel</button>
                <button onClick={saveEdit} style={{flex:2,background:"linear-gradient(135deg,#FF6B6B,#ff8e53)",color:"#fff",border:"none",borderRadius:12,padding:"10px",fontFamily:"'Nunito',sans-serif",fontWeight:800,cursor:"pointer"}}>Save ✓</button>
              </div>
            </div>
          ) : (
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:14,color:"#1a1a2e"}}>{r.name}</span>
                  {r.quantity>1 && <span style={{background:"#1a1a2e",color:"#fff",borderRadius:7,padding:"2px 8px",fontSize:11,fontWeight:800,fontFamily:"'Nunito',sans-serif"}}>×{r.quantity}</span>}
                </div>
                {r.quantity>1 && <div style={{fontFamily:"'Nunito',sans-serif",fontSize:12,color:"#aaa",marginTop:2}}>${r.unitPrice.toFixed(2)} each</div>}
              </div>
              <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:15,marginRight:4}}>${(r.unitPrice*r.quantity).toFixed(2)}</div>
              <button onClick={()=>{setEditId(r.id);setEditName(r.name);setEditPrice(r.unitPrice.toString());setEditQty(r.quantity.toString());}}
                style={{background:"#f5f5f5",border:"none",borderRadius:10,padding:"7px 12px",fontFamily:"'Nunito',sans-serif",fontSize:12,fontWeight:700,color:"#555",cursor:"pointer"}}>Edit</button>
              <button onClick={()=>setRaw(p=>p.filter(x=>x.id!==r.id))}
                style={{background:"#fff5f5",border:"none",borderRadius:10,padding:"7px 10px",fontFamily:"'Nunito',sans-serif",fontSize:14,color:"#FF6B6B",cursor:"pointer"}}>✕</button>
            </div>
          )}
        </div>
      ))}
      <button onClick={()=>setRaw(p=>[...p,{id:Date.now(),name:"New Item",unitPrice:0,quantity:1}])}
        style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"none",border:"2px dashed #FF6B6B55",borderRadius:14,padding:"12px",fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:700,color:"#FF6B6B",cursor:"pointer"}}>
        ➕ Add missing item
      </button>
      <button onClick={goToInvite} style={{background:"linear-gradient(135deg,#FF6B6B,#ff8e53)",color:"#fff",border:"none",borderRadius:16,padding:"15px",fontSize:16,fontWeight:800,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>
        Looks good — Invite Crew →
      </button>
    </div>
  );

  // Step 2: Invite
  if (step === 2) {
    if (inviteStep==="confirm") return (
      <div style={{padding:"28px 24px",display:"flex",flexDirection:"column",gap:18}}>
        <Back onBack={()=>setInviteStep("invite")}/>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:8}}>💳</div>
          <h2 style={{margin:0,fontFamily:"'Nunito',sans-serif",fontSize:22,fontWeight:900,color:"#1a1a2e"}}>Confirm & Send Tab</h2>
        </div>
        <div style={{background:"#fff",borderRadius:20,padding:"20px",boxShadow:"0 4px 20px #0000000a",display:"flex",flexDirection:"column",gap:12}}>
          {[["Total bill",`$${billTotal.toFixed(2)}`],["People in Tab",`${totalPeople}`]].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{fontFamily:"'Nunito',sans-serif",fontSize:14,color:"#555"}}>{l}</span>
              <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:14}}>{v}</span>
            </div>
          ))}
          <div style={{height:1,background:"#f0f0f0"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontFamily:"'Nunito',sans-serif",fontSize:14,color:"#555"}}>OneBill fee</div>
              <div style={{fontFamily:"'Nunito',sans-serif",fontSize:11,color:"#aaa"}}>${APP_FEE.toFixed(2)} × {totalPeople} people</div>
            </div>
            <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:16,color:"#FF6B6B"}}>${fee}</span>
          </div>
          <div style={{background:"#f0fffe",borderRadius:12,padding:"10px 14px",border:"1.5px solid #4ECDC488"}}>
            <div style={{fontFamily:"'Nunito',sans-serif",fontSize:12,color:"#1a8a84",lineHeight:1.5}}>
              💡 You'll get <strong>${((totalPeople-1)*APP_FEE).toFixed(2)}</strong> back from your friends. Your net cost: <strong>$0.25</strong>.
            </div>
          </div>
          <div style={{height:1,background:"#f0f0f0"}}/>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:14}}>Charged to card now</span>
            <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:18,color:"#FF6B6B"}}>${fee}</span>
          </div>
          <div style={{fontFamily:"'Nunito',sans-serif",fontSize:11,color:"#aaa"}}>•••• •••• •••• 4242</div>
        </div>
        <button onClick={sendTab} style={{background:"linear-gradient(135deg,#FF6B6B,#ff8e53)",color:"#fff",border:"none",borderRadius:16,padding:"15px",fontSize:16,fontWeight:800,fontFamily:"'Nunito',sans-serif",cursor:"pointer"}}>
          Charge ${fee} & Send Tab →
        </button>
      </div>
    );

    if (inviteStep==="processing"||inviteStep==="sent") return (
      <div style={{padding:"60px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
        {inviteStep==="processing" ? (
          <>
            <div style={{fontSize:52}}>⚡</div>
            <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:20,color:"#1a1a2e"}}>Sending Tab...</div>
            <div style={{display:"flex",gap:7}}>
              {[0,1,2,3].map(i=><div key={i} style={{width:9,height:9,borderRadius:"50%",background:"#FF6B6B",animation:`bounce 0.7s ${i*0.14}s infinite alternate`}}/>)}
            </div>
          </>
        ) : (
          <>
            <div style={{fontSize:56}}>🎉</div>
            <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:20,color:"#1a1a2e",textAlign:"center"}}>Tab sent!</div>
            <div style={{fontFamily:"'Nunito',sans-serif",fontSize:14,color:"#888",textAlign:"center"}}>Everyone's being notified now.</div>
          </>
        )}
      </div>
    );

    return (
      <div style={{padding:"24px 20px",display:"flex",flexDirection:"column",gap:14}}>
        <Back onBack={()=>setStep(1)}/>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:44,marginBottom:4}}>👯</div>
          <h2 style={{margin:0,fontFamily:"'Nunito',sans-serif",fontSize:22,fontWeight:900,color:"#1a1a2e"}}>Invite your crew</h2>
          <p style={{margin:"6px 0 0",color:"#888",fontFamily:"'Nunito',sans-serif",fontSize:13}}>Select who was at the table</p>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,background:COLORS.You.light,borderRadius:14,padding:"12px 16px",border:`2px solid ${COLORS.You.bg}66`}}>
          <Av name="You" size={44}/>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:15}}>You</div>
            <div style={{fontFamily:"'Nunito',sans-serif",fontSize:12,color:"#aaa"}}>Tab Creator & Payer 💳</div>
          </div>
          <span style={{fontSize:11,fontWeight:800,background:COLORS.You.bg,color:"#fff",borderRadius:8,padding:"3px 9px",fontFamily:"'Nunito',sans-serif"}}>PAYER</span>
        </div>
        {FRIENDS.map(f => {
          const sel = selected.includes(f.name);
          const c = COLORS[f.name]||{bg:"#ccc",light:"#eee"};
          return (
            <div key={f.name} onClick={()=>setSelected(p=>p.includes(f.name)?p.filter(x=>x!==f.name):[...p,f.name])}
              style={{display:"flex",alignItems:"center",gap:12,background:sel?c.light:"#fafafa",borderRadius:14,padding:"12px 16px",border:`2px solid ${sel?c.bg+"66":"#eee"}`,cursor:"pointer",transition:"all 0.2s"}}>
              <Av name={f.name} size={44}/>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:15}}>{f.name}</div>
                <div style={{fontFamily:"'Nunito',sans-serif",fontSize:12,color:"#aaa"}}>{f.phone}</div>
              </div>
              <div style={{width:24,height:24,borderRadius:7,border:`2px solid ${sel?c.bg:"#ddd"}`,background:sel?c.bg:"#fff",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:800}}>
                {sel?"✓":""}
              </div>
            </div>
          );
        })}
        <div style={{background:"#fafafa",borderRadius:14,padding:"12px 16px",border:"1.5px solid #f0f0f0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:700,fontSize:13,color:"#555"}}>App fee at send</div>
            <div style={{fontFamily:"'Nunito',sans-serif",fontSize:11,color:"#aaa"}}>${APP_FEE.toFixed(2)} × {totalPeople} people</div>
          </div>
          <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:18,color:"#FF6B6B"}}>${fee}</div>
        </div>
        <button onClick={()=>setInviteStep("confirm")} disabled={selected.length===0}
          style={{background:selected.length>0?"linear-gradient(135deg,#FF6B6B,#ff8e53)":"#eee",color:selected.length>0?"#fff":"#bbb",border:"none",borderRadius:16,padding:"15px",fontSize:16,fontWeight:800,fontFamily:"'Nunito',sans-serif",cursor:selected.length>0?"pointer":"not-allowed"}}>
          Send Tab to {selected.length} Friends →
        </button>
      </div>
    );
  }

  // Step 3: Claim
  if (step === 3) return (
    <ClaimScreen items={items} setItems={setItems} me={"You"}
      onBack={()=>setStep(2)} onNext={()=>setStep(4)}/>
  );

  // Step 4: Summary
  return (
    <SummaryScreen items={items} payer={{name:"You",venmo:"@your-venmo",cashapp:"$yourcashtag"}}
      me={"You"} members={["You",...FRIENDS.map(f=>f.name)]}
      onBack={()=>setStep(3)} onClose={onDone}/>
  );
}

// ── GUEST FLOW ────────────────────────────────────────────────────────────────

function GuestFlow({ onDone }) {
  const [step,  setStep]  = useState(0); // 0=notification 1=claim 2=summary
  const [items, setItems] = useState(() => DEMO_RAW.map(toClaimItem));

  function reset() {
    setStep(0);
    setItems(DEMO_RAW.map(toClaimItem));
    onDone();
  }

  // Step 0: Notification
  if (step === 0) return (
    <div style={{padding:"28px 24px",display:"flex",flexDirection:"column",gap:20,alignItems:"center"}}>

      {/* Push notification mockup */}
      <div style={{width:"100%",maxWidth:360,background:"#1a1a2e",borderRadius:20,padding:"16px 18px",display:"flex",gap:12,alignItems:"flex-start",boxShadow:"0 8px 32px #0000004a"}}>
        <div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,#FF6B6B,#ff8e53)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>💸</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:14,color:"#fff",marginBottom:2}}>OneBill</div>
          <div style={{fontFamily:"'Nunito',sans-serif",fontSize:13,color:"#ffffffcc",lineHeight:1.4}}>
            <strong style={{color:"#fff"}}>Jordan</strong> sent you a Tab for dinner. Tap to claim your items.
          </div>
          <div style={{fontFamily:"'Nunito',sans-serif",fontSize:11,color:"#ffffff55",marginTop:4}}>now</div>
        </div>
      </div>

      <div style={{textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>👋</div>
        <h2 style={{margin:0,fontFamily:"'Nunito',sans-serif",fontSize:24,fontWeight:900,color:"#1a1a2e"}}>You've been invited!</h2>
        <p style={{margin:"10px 0 0",color:"#888",fontFamily:"'Nunito',sans-serif",fontSize:14,lineHeight:1.5}}>
          <strong>Jordan</strong> paid for dinner and used OneBill to split it.<br/>
          Just claim what you had and pay your share.
        </p>
      </div>

      {/* Who's in the tab */}
      <div style={{background:"#fff",borderRadius:18,padding:"16px",boxShadow:"0 2px 12px #0000000a",width:"100%",maxWidth:380}}>
        <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:12,color:"#aaa",marginBottom:10}}>WHO'S IN THIS TAB</div>
        <div style={{display:"flex",gap:14,flexWrap:"wrap",justifyContent:"center"}}>
          {ALL_MEMBERS.map(m => {
            const isYou   = m==="You";
            const isPayer = m==="Jordan";
            return (
              <div key={m} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                <div style={{position:"relative"}}>
                  <Av name={m} size={46}/>
                  {isPayer && <div style={{position:"absolute",bottom:-4,right:-4,background:"#4ECDC4",borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,border:"2px solid #fff"}}>💳</div>}
                  {isYou   && <div style={{position:"absolute",bottom:-4,right:-4,background:"#FF6B6B",borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,border:"2px solid #fff"}}>👤</div>}
                </div>
                <span style={{fontFamily:"'Nunito',sans-serif",fontSize:11,fontWeight:800,color:isYou?"#FF6B6B":"#555"}}>
                  {isYou?"You":m}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* How easy is this */}
      <div style={{background:"linear-gradient(135deg,#fff5f5,#f0fffe)",borderRadius:18,padding:"16px 18px",width:"100%",maxWidth:380,border:"1.5px solid #f0f0f0"}}>
        <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:13,color:"#1a1a2e",marginBottom:10}}>⚡ Here's how quick this is:</div>
        {[
          ["1","Tap Accept below","2 sec"],
          ["2","Check the items you had","15 sec"],
          ["3","Tap Pay — Venmo auto-fills","5 sec"],
          ["4","Done. Goes to History","🎉"],
        ].map(([n,s,t]) => (
          <div key={n} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:"1px solid #f0f0f0"}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:"linear-gradient(135deg,#FF6B6B,#ff8e53)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:12,flexShrink:0}}>{n}</div>
            <span style={{flex:1,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,color:"#1a1a2e"}}>{s}</span>
            <span style={{fontFamily:"'Nunito',sans-serif",fontSize:11,color:"#aaa",fontWeight:700}}>{t}</span>
          </div>
        ))}
      </div>

      <button onClick={()=>setStep(1)} style={{
        background:"linear-gradient(135deg,#FF6B6B,#ff8e53)",
        color:"#fff",border:"none",borderRadius:18,padding:"18px 40px",
        fontSize:18,fontWeight:900,fontFamily:"'Nunito',sans-serif",cursor:"pointer",
        width:"100%",maxWidth:380,boxShadow:"0 6px 24px #FF6B6B55"
      }}>
        ✅ Accept Tab & Claim My Items
      </button>

      <div style={{fontFamily:"'Nunito',sans-serif",fontSize:12,color:"#bbb",textAlign:"center"}}>
        No card needed. Pay however you want.
      </div>
    </div>
  );

  // Step 1: Claim
  if (step === 1) return (
    <ClaimScreen items={items} setItems={setItems} me={"You"}
      onBack={()=>setStep(0)} onNext={()=>setStep(2)}/>
  );

  // Step 2: Summary
  return (
    <SummaryScreen items={items} payer={GUEST_PAYER} me={"You"}
      members={ALL_MEMBERS} onBack={()=>setStep(1)} onClose={reset}/>
  );
}

// ── Mode Switcher ─────────────────────────────────────────────────────────────

function ModeSwitcher({ mode, setMode }) {
  return (
    <div style={{padding:"16px 20px 0"}}>
      <div style={{background:"#f5f5f5",borderRadius:16,padding:4,display:"flex",gap:4}}>
        <button onClick={()=>setMode("payer")} style={{
          flex:1,padding:"10px 8px",borderRadius:12,border:"none",
          background:mode==="payer"?"#fff":"transparent",
          fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13,
          color:mode==="payer"?"#FF6B6B":"#aaa",cursor:"pointer",
          boxShadow:mode==="payer"?"0 2px 8px #0000001a":"none",transition:"all 0.2s"
        }}>💳 I Paid the Bill</button>
        <button onClick={()=>setMode("guest")} style={{
          flex:1,padding:"10px 8px",borderRadius:12,border:"none",
          background:mode==="guest"?"#fff":"transparent",
          fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13,
          color:mode==="guest"?"#4ECDC4":"#aaa",cursor:"pointer",
          boxShadow:mode==="guest"?"0 2px 8px #0000001a":"none",transition:"all 0.2s"
        }}>🔔 I Was Invited</button>
      </div>
    </div>
  );
}

// ── History / Friends / Profile tabs ─────────────────────────────────────────

function HistoryTab({ extra }) {
  const [expanded, setExpanded] = useState(extra ? extra.id : null);
  const hist = [
    {id:"h1",restaurant:"Chili's Grill & Bar",date:"Mar 28, 2025",totalBill:142.50,payer:"Jordan",you:38.20,members:["You","Jordan","Sam","Taylor"],
     items:[{name:"Ribeye Steak",price:34,claimedBy:{You:1},quantity:1},{name:"Loaded Fries",price:12,claimedBy:{Jordan:1,You:1},quantity:1},{name:"Margarita",price:39,claimedBy:{Sam:1,Taylor:1,You:1},quantity:3},{name:"Chicken Sandwich",price:16,claimedBy:{Jordan:1},quantity:1},{name:"Caesar Salad",price:13,claimedBy:{Taylor:1},quantity:1}]},
    {id:"h2",restaurant:"Nobu Dallas",date:"Mar 15, 2025",totalBill:310,payer:"You",you:0,members:["You","Jordan","Sam","Taylor","Alex"],
     items:[{name:"Wagyu Tacos",price:48,claimedBy:{You:1,Jordan:1},quantity:2},{name:"Black Cod",price:52,claimedBy:{Sam:1},quantity:1},{name:"Edamame",price:12,claimedBy:{You:1,Taylor:1,Alex:1},quantity:1},{name:"Sake",price:60,claimedBy:{You:1,Jordan:1,Sam:1},quantity:3}]},
  ];
  const all = extra ? [extra,...hist] : hist;

  return (
    <div style={{padding:"24px 20px",display:"flex",flexDirection:"column",gap:14}}>
      <div>
        <h2 style={{margin:"0 0 4px",fontFamily:"'Nunito',sans-serif",fontSize:22,fontWeight:900,color:"#1a1a2e"}}>History</h2>
        <p style={{margin:0,color:"#aaa",fontFamily:"'Nunito',sans-serif",fontSize:13}}>Every tab, every item, every cent.</p>
      </div>
      {all.map(bill => {
        const open = expanded===bill.id;
        const bt   = bill.items.reduce((s,i)=>s+i.price,0);
        const isMe = bill.payer==="You";
        return (
          <div key={bill.id} style={{background:"#fff",borderRadius:18,boxShadow:"0 2px 12px #0000000a",overflow:"hidden",border:`1.5px solid ${bill.id===extra?.id?"#FF6B6B33":"#f0f0f0"}`}}>
            {bill.id===extra?.id && <div style={{background:"linear-gradient(135deg,#FF6B6B,#ff8e53)",padding:"6px 16px",fontFamily:"'Nunito',sans-serif",fontSize:11,fontWeight:800,color:"#fff"}}>✨ Just settled</div>}
            <div onClick={()=>setExpanded(open?null:bill.id)} style={{padding:"16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:48,height:48,borderRadius:14,flexShrink:0,background:isMe?"linear-gradient(135deg,#4ECDC4,#44a8a1)":"linear-gradient(135deg,#FF6B6B,#ff8e53)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>
                {isMe?"💳":"🧾"}
              </div>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:15,color:"#1a1a2e"}}>{bill.restaurant}</div>
                <div style={{fontFamily:"'Nunito',sans-serif",fontSize:12,color:"#aaa"}}>{bill.date} · {bill.members.length} people</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:16}}>{isMe?`$${bill.totalBill.toFixed(2)}`:`$${bill.you.toFixed(2)}`}</div>
                <div style={{fontFamily:"'Nunito',sans-serif",fontSize:11,color:isMe?"#4ECDC4":"#FF6B6B",fontWeight:700}}>{isMe?"You paid":"You owed"}</div>
              </div>
              <span style={{fontSize:16,color:"#ccc",marginLeft:4,display:"inline-block",transform:open?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}>▾</span>
            </div>
            {open && (
              <div style={{borderTop:"1px solid #f5f5f5",padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontFamily:"'Nunito',sans-serif",fontSize:12,color:"#aaa",fontWeight:700}}>Who was there:</span>
                  {bill.members.map(m=>(
                    <span key={m} style={{display:"inline-flex",alignItems:"center",gap:4,background:COLORS[m]?.light||"#eee",color:COLORS[m]?.text||"#555",borderRadius:20,padding:"2px 10px 2px 5px",fontSize:12,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>
                      <Av name={m} size={18}/>{m}
                    </span>
                  ))}
                </div>
                <div style={{background:"#fafafa",borderRadius:12,padding:"12px"}}>
                  <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13,marginBottom:8,color:"#1a1a2e"}}>Item Breakdown</div>
                  {bill.items.map((item,idx)=>{
                    const claimers=Object.keys(item.claimedBy||{});
                    return (
                      <div key={idx} style={{padding:"5px 0",borderBottom:"1px solid #f0f0f0"}}>
                        <div style={{display:"flex",justifyContent:"space-between"}}>
                          <span style={{fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700}}>{item.name}{item.quantity>1?` ×${item.quantity}`:""}</span>
                          <span style={{fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:800}}>${item.price.toFixed(2)}</span>
                        </div>
                        {claimers.length>0&&(
                          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:2}}>
                            {claimers.map(p=>{
                              const q=item.claimedBy[p], share=(q/item.quantity)*item.price;
                              const c=COLORS[p]||{light:"#eee",text:"#555"};
                              return <span key={p} style={{fontFamily:"'Nunito',sans-serif",fontSize:11,color:c.text,background:c.light,borderRadius:8,padding:"1px 7px",fontWeight:700}}>{p}{item.quantity>1?` ×${q}`:""}: ${share.toFixed(2)}</span>;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{background:"#fafafa",borderRadius:12,padding:"12px"}}>
                  <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13,marginBottom:8}}>Each Person's Total</div>
                  {bill.members.map(m=>{
                    const {total:t}=calcTotal(bill.items,m,bt);
                    const isP=m===bill.payer;
                    return (
                      <div key={m} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #f0f0f0"}}>
                        <Av name={m} size={26}/>
                        <span style={{flex:1,fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13}}>{m}</span>
                        {isP&&<span style={{fontSize:10,background:"#4ECDC4",color:"#fff",borderRadius:6,padding:"1px 6px",fontFamily:"'Nunito',sans-serif",fontWeight:800}}>PAID</span>}
                        <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:14,color:isP?"#4ECDC4":"#1a1a2e"}}>${(t+APP_FEE).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FriendsTab() {
  return (
    <div style={{padding:"24px 20px",display:"flex",flexDirection:"column",gap:14}}>
      <div>
        <h2 style={{margin:"0 0 4px",fontFamily:"'Nunito',sans-serif",fontSize:22,fontWeight:900,color:"#1a1a2e"}}>Friends</h2>
        <p style={{margin:0,color:"#aaa",fontFamily:"'Nunito',sans-serif",fontSize:13}}>Your crew. Venmo & Cash App auto-fill on every Tab.</p>
      </div>
      {FRIENDS.map(f => {
        const c = COLORS[f.name]||{bg:"#b2bec3"};
        return (
          <div key={f.name} style={{display:"flex",alignItems:"center",gap:12,background:"#fff",borderRadius:16,padding:"14px 16px",boxShadow:"0 2px 10px #0000000a",border:`1.5px solid ${c.bg}33`}}>
            <Av name={f.name} size={48}/>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:15}}>{f.name}</div>
              <div style={{fontFamily:"'Nunito',sans-serif",fontSize:12,color:"#aaa"}}>{f.phone}</div>
              <div style={{display:"flex",gap:8,marginTop:2}}>
                {f.venmo   && <span style={{fontFamily:"'Nunito',sans-serif",fontSize:11,color:"#008CFF",fontWeight:700}}>💙 {f.venmo}</span>}
                {f.cashapp && <span style={{fontFamily:"'Nunito',sans-serif",fontSize:11,color:"#00a826",fontWeight:700}}>💚 {f.cashapp}</span>}
              </div>
            </div>
            <span style={{fontSize:11,fontWeight:800,fontFamily:"'Nunito',sans-serif",background:f.status==="active"?"#e8fff8":"#fff9e6",color:f.status==="active"?"#2d8a5e":"#b8960c",border:`1.5px solid ${f.status==="active"?"#A8E6CF":"#FFE66D"}`,borderRadius:8,padding:"3px 9px"}}>
              {f.status==="active"?"● Active":"⏳ Pending"}
            </span>
          </div>
        );
      })}
      <button style={{display:"flex",alignItems:"center",gap:14,background:"linear-gradient(135deg,#FF6B6B,#ff8e53)",color:"#fff",border:"none",borderRadius:16,padding:"16px 20px",cursor:"pointer",width:"100%",textAlign:"left"}}>
        <span style={{fontSize:28}}>➕</span>
        <div>
          <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:16}}>Add a Friend</div>
          <div style={{fontFamily:"'Nunito',sans-serif",fontSize:12,opacity:0.85}}>From contacts or enter a number</div>
        </div>
      </button>
    </div>
  );
}

function ProfileTab() {
  const [venmo,    setVenmo]    = useState("");
  const [cashapp,  setCashapp]  = useState("");
  const [editV,    setEditV]    = useState(false);
  const [editC,    setEditC]    = useState(false);
  return (
    <div style={{padding:"24px 20px",display:"flex",flexDirection:"column",gap:16}}>
      <div style={{textAlign:"center",paddingTop:8}}>
        <Av name="You" size={72}/>
        <h2 style={{margin:"12px 0 2px",fontFamily:"'Nunito',sans-serif",fontSize:22,fontWeight:900,color:"#1a1a2e"}}>Your Profile</h2>
        <p style={{margin:0,color:"#aaa",fontFamily:"'Nunito',sans-serif",fontSize:13}}>+1 (214) 555-0100</p>
      </div>
      <div style={{background:"#fff",borderRadius:18,padding:"18px",boxShadow:"0 2px 12px #0000000a"}}>
        <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:14,marginBottom:12,color:"#1a1a2e"}}>💳 Card on File</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f5f5f5",borderRadius:12,padding:"12px 14px"}}>
          <div>
            <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:14}}>•••• •••• •••• 4242</div>
            <div style={{fontFamily:"'Nunito',sans-serif",fontSize:11,color:"#aaa"}}>Required to send Tabs as payer</div>
          </div>
          <button style={{background:"none",border:"none",fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,color:"#FF6B6B",cursor:"pointer"}}>Update</button>
        </div>
      </div>
      <div style={{background:"#fff",borderRadius:18,padding:"18px",boxShadow:"0 2px 12px #0000000a",display:"flex",flexDirection:"column",gap:14}}>
        <div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:14,color:"#1a1a2e"}}>
          💸 Payment Handles <span style={{fontSize:11,fontWeight:700,color:"#aaa",background:"#f5f5f5",borderRadius:8,padding:"2px 8px",marginLeft:6}}>Optional</span>
        </div>
        <div style={{background:"#f0f8ff",borderRadius:14,padding:"14px",border:"1.5px solid #cce5ff"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{width:30,height:30,borderRadius:8,background:"#008CFF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>💙</div>
            <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:14,color:"#1a1a2e"}}>Venmo</span>
          </div>
          {editV ? (
            <div style={{display:"flex",gap:8}}>
              <input value={venmo} onChange={e=>setVenmo(e.target.value)} placeholder="@your-venmo"
                style={{flex:1,padding:"9px 12px",borderRadius:10,border:"2px solid #008CFF",fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:700,outline:"none",color:"#008CFF"}}/>
              <button onClick={()=>setEditV(false)} style={{background:"#008CFF",color:"#fff",border:"none",borderRadius:10,padding:"9px 14px",fontFamily:"'Nunito',sans-serif",fontWeight:800,cursor:"pointer"}}>Save</button>
            </div>
          ) : (
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:800,color:venmo?"#008CFF":"#bbb"}}>{venmo||"Not added yet"}</span>
              <button onClick={()=>setEditV(true)} style={{background:"none",border:"none",fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,color:"#008CFF",cursor:"pointer"}}>{venmo?"Edit":"+ Add"}</button>
            </div>
          )}
        </div>
        <div style={{background:"#f0fff5",borderRadius:14,padding:"14px",border:"1.5px solid #b2f0c8"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{width:30,height:30,borderRadius:8,background:"#00D632",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>💚</div>
            <span style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:14,color:"#1a1a2e"}}>Cash App</span>
          </div>
          {editC ? (
            <div style={{display:"flex",gap:8}}>
              <input value={cashapp} onChange={e=>setCashapp(e.target.value)} placeholder="$your-cashtag"
                style={{flex:1,padding:"9px 12px",borderRadius:10,border:"2px solid #00D632",fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:700,outline:"none",color:"#00a826"}}/>
              <button onClick={()=>setEditC(false)} style={{background:"#00D632",color:"#fff",border:"none",borderRadius:10,padding:"9px 14px",fontFamily:"'Nunito',sans-serif",fontWeight:800,cursor:"pointer"}}>Save</button>
            </div>
          ) : (
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:800,color:cashapp?"#00a826":"#bbb"}}>{cashapp||"Not added yet"}</span>
              <button onClick={()=>setEditC(true)} style={{background:"none",border:"none",fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,color:"#00a826",cursor:"pointer"}}>{cashapp?"Edit":"+ Add"}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function OneBill() {
  const [mode,    setMode]    = useState("payer");
  const [navTab,  setNavTab]  = useState("home");
  const [extra,   setExtra]   = useState(null);
  const [payerKey,setPayerKey]= useState(0);
  const [guestKey,setGuestKey]= useState(0);

  function switchMode(m) {
    setMode(m);
    if (m==="payer") setPayerKey(k=>k+1);
    else             setGuestKey(k=>k+1);
  }

  function payerDone(closedBill) {
    if (closedBill) setExtra(closedBill);
    setPayerKey(k=>k+1);
    setNavTab("history");
  }

  function guestDone() {
    setGuestKey(k=>k+1);
    setNavTab("history");
  }

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#fff5f5 0%,#fffef0 50%,#f0fffe 100%)",display:"flex",justifyContent:"center",fontFamily:"'Nunito',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:480,background:"#fff",minHeight:"100vh",boxShadow:"0 0 60px #0000000f",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"16px 24px 12px",borderBottom:"1px solid #f0f0f0",background:"#fff",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:24}}>💸</span>
            <span style={{fontWeight:900,fontSize:21,color:"#1a1a2e"}}>OneBill</span>
          </div>
          {navTab==="home" && (
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontFamily:"'Nunito',sans-serif",fontSize:11,fontWeight:700,color:"#bbb"}}>
                {mode==="payer" ? "💳 Payer" : "🔔 Guest"}
              </span>
            </div>
          )}
        </div>

        <div style={{flex:1,overflowY:"auto"}}>
          {navTab==="home" && (
            <>
              <ModeSwitcher mode={mode} setMode={switchMode}/>
              {mode==="payer" && <PayerFlow key={payerKey} onDone={payerDone}/>}
              {mode==="guest" && <GuestFlow key={guestKey} onDone={guestDone}/>}
            </>
          )}
          {navTab==="friends" && <FriendsTab/>}
          {navTab==="history" && <HistoryTab extra={extra}/>}
          {navTab==="profile" && <ProfileTab/>}
        </div>

        <NavBar tab={navTab} setTab={setNavTab}/>
      </div>
    </div>
  );
}
