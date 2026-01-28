import { useEffect, useMemo, useRef, useState } from "react";
import "./BillingPanel.css";

import {
  apiPurchasesLast,
  apiCreateSaleFIFO,
  apiAccountsSuggestName,
  apiAccountById,
} from "./api";

/* =========================
   HELPERS
========================= */

const emptyLine = () => ({
  itemName: "",
  qty: "",
  unitPrice: "",
  hsn: "",
  gst: "",
  unit: "KG",
});

const toINR = (n) =>
  (isNaN(n) ? 0 : n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/* =========================
   COMPONENT
========================= */

export default function BillingPanel() {
  const todayIso = new Date().toISOString().slice(0, 10);

  /* =========================
     BUYER / ACCOUNT
  ========================= */

  const [buyer, setBuyer] = useState({ name: "", account_id: null });
  const [selectedAccount, setSelectedAccount] = useState(null);

  const [nameQuery, setNameQuery] = useState("");
  const [nameSuggest, setNameSuggest] = useState([]);
  const nameDebRef = useRef();

  useEffect(() => {
    clearTimeout(nameDebRef.current);
    nameDebRef.current = setTimeout(async () => {
      if (nameQuery.trim().length < 2) {
        setNameSuggest([]);
        return;
      }
      try {
        const rows = await apiAccountsSuggestName(nameQuery, 10);
        setNameSuggest(rows || []);
      } catch {
        setNameSuggest([]);
      }
    }, 200);

    return () => clearTimeout(nameDebRef.current);
  }, [nameQuery]);

  const pickName = async (acc) => {
    try {
      const full = await apiAccountById(acc.account_id ?? acc.id);
      if (full) {
        setBuyer({ name: full.name, account_id: full.account_id ?? full.id });
        setSelectedAccount(full);
      }
    } catch {}
    setNameSuggest([]);
  };

  /* =========================
     ITEMS
  ========================= */

  const [lines, setLines] = useState([emptyLine()]);

  const handleItemChange = async (idx, value) => {
    let picked = null;
    try {
      picked = await apiPurchasesLast(value.trim());
    } catch {}

    setLines((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        itemName: value,
        hsn: picked?.hsn ?? "",
        unitPrice: picked?.price ?? "",
        gst: picked?.gst ?? "",
      };
      if (idx === prev.length - 1) next.push(emptyLine());
      return next;
    });
  };

  /* =========================
     CALCULATIONS
  ========================= */

  const computed = useMemo(() => {
    const rows = lines.filter(
      (l) => l.itemName && Number(l.qty) > 0 && Number(l.unitPrice) > 0
    );

    let taxable = 0;
    rows.forEach((l) => {
      taxable += Number(l.qty) * Number(l.unitPrice);
    });

    let gstRaw = 0;
    rows.forEach((l) => {
      gstRaw +=
        (Number(l.qty) * Number(l.unitPrice) * Number(l.gst || 0)) / 100;
    });

    const gstRounded = Math.round(gstRaw);
    const roundOff = gstRounded - gstRaw;
    const grand = taxable + gstRounded;

    return {
      rows,
      taxable,
      gstRounded,
      roundOff,
      grand,
    };
  }, [lines]);

  /* =========================
     SAVE
  ========================= */

  const saveBill = async () => {
    if (!selectedAccount?.account_id) {
      alert("Please select Account (Ledger)");
      return;
    }

    if (computed.rows.length === 0) {
      alert("Add at least one valid item");
      return;
    }

    const payload = {
      bill_no: "AUTO",
      date: todayIso,
      account_id: selectedAccount.account_id,
      party_name: buyer.name,
      invoice_type: "B2C",
      taxable: computed.taxable,
      gst_amount: computed.gstRounded,
      round_off: computed.roundOff,
      grand_total: computed.grand,
      items: computed.rows.map((r) => ({
        item_name: r.itemName,
        hsn: r.hsn,
        qty: Number(r.qty),
        unit: "KG",
        price: Number(r.unitPrice),
        gst: Number(r.gst),
      })),
    };

    try {
      await apiCreateSaleFIFO(payload);
      alert("Sale saved successfully");
    } catch {
      alert("Failed to save sale");
    }
  };

  /* =========================
     UI
  ========================= */

  return (
    <div className="billing-full card">
      <h2>Billing Panel</h2>

      <label>Buyer Name</label>
      <input
        value={buyer.name}
        onChange={(e) => {
          setBuyer({ name: e.target.value, account_id: null });
          setNameQuery(e.target.value);
        }}
      />

      {nameSuggest.length > 0 && (
        <div className="suggest">
          {nameSuggest.map((a) => (
            <div key={a.account_id} onClick={() => pickName(a)}>
              {a.name}
            </div>
          ))}
        </div>
      )}

      <table className="items-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>GST%</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                <input
                  value={l.itemName}
                  onChange={(e) => handleItemChange(i, e.target.value)}
                />
              </td>
              <td>
                <input
                  value={l.qty}
                  onChange={(e) =>
                    setLines((p) =>
                      p.map((r, x) =>
                        x === i ? { ...r, qty: e.target.value } : r
                      )
                    )
                  }
                />
              </td>
              <td>
                <input
                  value={l.unitPrice}
                  onChange={(e) =>
                    setLines((p) =>
                      p.map((r, x) =>
                        x === i ? { ...r, unitPrice: e.target.value } : r
                      )
                    )
                  }
                />
              </td>
              <td>
                <input
                  value={l.gst}
                  onChange={(e) =>
                    setLines((p) =>
                      p.map((r, x) =>
                        x === i ? { ...r, gst: e.target.value } : r
                      )
                    )
                  }
                />
              </td>
              <td>{toINR(Number(l.qty) * Number(l.unitPrice || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals">
        <div>Taxable: {toINR(computed.taxable)}</div>
        <div>GST: {toINR(computed.gstRounded)}</div>
        <b>Grand Total: {toINR(computed.grand)}</b>
      </div>

      <button className="btn primary" onClick={saveBill}>
        Save
      </button>
    </div>
  );
}
