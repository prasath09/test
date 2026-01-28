import React, { useMemo, useState } from "react";
import BillingPanel from "./BillingPanel";

// ===== Styles =====
const styles = `
:root { --border:#d1d5db; --muted:#6b7280; --ink:#111827; --accent:#2563eb; --paper:#fff; }
* { box-sizing: border-box; }
body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#f3f4f6; }
.container { max-width: 1000px; margin: 24px auto; padding: 16px; }
.card { background: var(--paper); border:1px solid var(--border); border-radius: 12px; padding: 16px; }
header { display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; }
h1 { font-size: 20px; margin:0; }
.tabs { display:flex; gap:8px; margin: 6px 0 16px; }
.tab { padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:#fff; cursor:pointer; }
.tab.active { border-color: var(--accent); color:white; background: var(--accent); }
`;

const defaultCompany = {
  name: "P.KARTHIKEYAN STEEL",
  city: "Thiruvarur",
  state: "Tamil Nadu",
  stateCode: "33",
  gstin: "33AEFSR7230F1ZC",
  banks: [
    {
      id: 1,
      bankName: "TAMILNAD MERCANTILE BANK LTD",
      branch: "SRINIVASAN NAGAR",
      ifsc: "TMBL0000510",
      account: "610701054050002",
      isDefault: true,
    },
  ],
};

export default function App() {
  const [tab, setTab] = useState("billing");
  const [company] = useState(defaultCompany);

  const defaultBank = useMemo(() => {
    return company.banks?.find((b) => b.isDefault) || company.banks?.[0] || null;
  }, [company.banks]);

  return (
    <div className="container">
      <style>{styles}</style>

      <div className="card">
        <header>
          <h1>Steel Billing + Inventory</h1>
        </header>

        <div className="tabs">
          <button
            className={`tab ${tab === "billing" ? "active" : ""}`}
            onClick={() => setTab("billing")}
          >
            BILLING
          </button>
        </div>
      </div>

      {tab === "billing" && (
        <BillingPanel company={company} defaultBank={defaultBank} />
      )}
    </div>
  );
}
