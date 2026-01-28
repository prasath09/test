// src/BillingPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import "./BillingPanel.css";

import {
  apiCheckAvailability,
  apiPurchasesLast,
  apiCreateSaleFIFO,
  apiAccountsSuggest,
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

export default function BillingPanel({ company, defaultBank }) {
  const todayIso = new Date().toISOString().slice(0, 10);

  /* =========================
     BASIC STATE
  ========================= */

  const [invoiceType] = useState("B2C");
  const [paymentReceiptNo, setPaymentReceiptNo] = useState("");

  const [invMeta] = useState({
    invoiceNo: "PKS-B-00001", // TODO: fetch from backend
    date: todayIso,
  });

  /* =========================
     BUYER / ACCOUNT
  ========================= */

  const [buyer, setBuyer] = useState({
    account_id: null,
    name: "",
    mobile: "",
    addr1: "",
    addr2: "",
    city: "",
    pin: "",
    state: "",
    stateCode: "",
    gstin: "",
  });

  const [selectedAccount, setSelectedAccount] = useState(null);

  /* =========================
     ACCOUNT SEARCH (NAME)
  ========================= */

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

  const fillBuyerFromAccount = (acc) => {
    if (!acc) return;

    setBuyer({
      account_id: acc.account_id ?? acc.id,
      name: acc.name ?? acc.account_name ?? "",
      mobile: acc.mobile ?? "",
      addr1: acc.addr1 ?? "",
      addr2: acc.addr2 ?? "",
      city: acc.city ?? "",
      pin: String(acc.pin ?? ""),
      state: acc.state ?? "",
      stateCode: String(acc.stateCode ?? ""),
      gstin: acc.gstin ?? "",
    });

    setSelectedAccount({
      account_id: acc.account_id ?? acc.id,
      name: acc.name ?? acc.account_name,
    });
  };

  const pickName = async (acc) => {
    try {
      const full = await apiAccountById(acc.account_id ?? acc.id);
      if (full) fillBuyerFromAccount(full);
    } catch {}
    setNameSuggest([]);
  };

  /* =========================
     ITEMS
  ========================= */

  const [lines, setLines] = useState([emptyLine()]);
  const [statuses, setStatuses] = useState({});
  const [discountPct, setDiscountPct] = useState("0");

  const updateAvailability = async (idx, itemName, qty) => {
    if (!itemName) return;
    try {
      const st = await apiCheckAvailability(itemName, Number(qty || 0));
      setStatuses((s) => ({ ...s, [idx]: st }));
    } catch {
      setStatuses((s) => ({ ...s, [idx]: null }));
    }
  };

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

    const discountAmount =
      (taxable * Number(discountPct || 0)) / 100;
    const discountedTaxable = taxable - discountAmount;

    let gstRaw = 0;
    rows.forEach((l) => {
      const lineValue =
        Number(l.qty) * Number(l.unitPrice);
      const ratio = lineValue / taxable || 0;
      gstRaw +=
        ((discountedTaxable * ratio) * Number(l.gst || 0)) / 100;
    });

    const gstRounded = Math.round(gstRaw);
    const roundOff = gstRounded - gstRaw;
    const grand = discountedTaxable + gstRounded;

    return {
      rows,
      taxable,
      discountAmount,
      discountedTaxable,
      gstRounded,
      roundOff,
      grand,
    };
  }, [lines, discountPct]);

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
      bill_no: invMeta.invoiceNo,
      date: invMeta.date,
      account_id: selectedAccount.account_id,
      party_name: buyer.name,
      invoice_type: invoiceType,
      taxable: computed.taxable,
      discount_amount: computed.discountAmount,
      discounted_taxable: computed.discountedTaxable,
      gst_amount: computed.gstRounded,
      round_off: computed.roundOff,
      grand_total: computed.grand,
      payment_receipt_no: paymentReceiptNo,
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
          setBuyer((b) => ({ ...b, name: e.target.value }));
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
                  onChange={(e) =>
                    handleItemChange(i, e.target.value)
                  }
                />
              </td>
              <td>
                <input
                  value={l.qty}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLines((p) =>
                      p.map((r, x) =>
                        x === i ? { ...r, qty: v } : r
                      )
                    );
                    updateAvailability(i, l.itemName, v);
                  }}
                />
              </td>
              <td>
                <input
                  value={l.unitPrice}
                  onChange={(e) =>
                    setLines((p) =>
                      p.map((r, x) =>
                        x === i
                          ? { ...r, unitPrice: e.target.value }
                          : r
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
              <td>
                {toINR(
                  Number(l.qty) * Number(l.unitPrice || 0)
                )}
              </td>
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
