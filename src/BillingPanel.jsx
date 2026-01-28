// src/BillingPanel.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import "./BillingPanel.css";

import {
  apiBillingSuggest,
  apiCheckAvailability,
  apiPurchasesLast,
  apiCreateSaleFIFO,
  apiAccountsSuggest,
  apiAccountByMobile,
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

const fmtDDMMYYYY = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${String(
    d.getMonth() + 1
  ).padStart(2, "0")}-${d.getFullYear()}`;
};

const toINR = (n) =>
  (isNaN(n) ? 0 : n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const n = (v) => (isNaN(Number(v)) || !v ? 0 : Number(v));

const escapeHtml = (s) =>
  String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

/* =========================
   COMPONENT
========================= */

export default function BillingPanel({ company, defaultBank, inventory }) {
  /* =========================
     BASIC STATE
  ========================= */

  const todayIso = new Date().toISOString().slice(0, 10);

  const [invoiceType, setInvoiceType] = useState("B2C");
  const [paymentReceiptNo, setPaymentReceiptNo] = useState("");

  const [invMeta, setInvMeta] = useState({
    invoiceNo: "PKS-B-00001",
    date: todayIso,
    ewayNo: "",
    vehicleNo: "",
    kms: "",
    fromDate: "",
    toDate: "",
    lrDate: todayIso,
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
    email: "",
    phone: "",
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
      const q = nameQuery.trim();
      if (q.length < 2) return setNameSuggest([]);
      try {
        const rows = await apiAccountsSuggestName(q, 10);
        setNameSuggest(rows || []);
      } catch {
        setNameSuggest([]);
      }
    }, 180);

    return () => clearTimeout(nameDebRef.current);
  }, [nameQuery]);

  /* =========================
     ACCOUNT SEARCH (MOBILE)
  ========================= */

  const [mobileQuery, setMobileQuery] = useState("");
  const [mobileSuggest, setMobileSuggest] = useState([]);
  const mobDebRef = useRef();

  useEffect(() => {
    clearTimeout(mobDebRef.current);
    mobDebRef.current = setTimeout(async () => {
      if (mobileQuery.length < 2) return setMobileSuggest([]);
      try {
        const rows = await apiAccountsSuggest(mobileQuery, 10);
        setMobileSuggest(rows || []);
      } catch {
        setMobileSuggest([]);
      }
    }, 180);

    return () => clearTimeout(mobDebRef.current);
  }, [mobileQuery]);

  /* =========================
     ACCOUNT RESOLUTION
  ========================= */

  const fillBuyerFromAccount = (acc) => {
    if (!acc) return;

    setBuyer((b) => ({
      ...b,
      account_id: acc.account_id ?? acc.id ?? null,
      name: acc.name ?? acc.account_name ?? "",
      mobile: acc.mobile ?? "",
      addr1: acc.addr1 ?? "",
      addr2: acc.addr2 ?? "",
      city: acc.city ?? "",
      pin: String(acc.pin ?? ""),
      state: acc.state ?? "",
      stateCode: String(acc.stateCode ?? ""),
      gstin: acc.gstin ?? "",
      email: acc.email ?? "",
      phone: acc.phone ?? "",
    }));

    setSelectedAccount({
      account_id: acc.account_id ?? acc.id,
      name: acc.name ?? acc.account_name,
      mobile: acc.mobile,
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

  const updateAvailability = async (idx, name, qty) => {
    if (!name) return;
    try {
      const st = await apiCheckAvailability(name, Number(qty || 0));
      setStatuses((s) => ({ ...s, [idx]: st }));
    } catch {
      setStatuses((s) => ({ ...s, [idx]: null }));
    }
  };

  const handleItemChange = async (idx, val) => {
    let picked = null;
    try {
      picked = await apiPurchasesLast(val.trim());
    } catch {}

    setLines((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        itemName: val,
        hsn: picked?.hsn ?? "",
        unitPrice: picked?.price ?? "",
        gst: picked?.gst ?? "",
      };
      if (idx === prev.length - 1) next.push(emptyLine());
      return next;
    });

    updateAvailability(idx, val, lines[idx]?.qty);
  };

  /* =========================
     CALCULATIONS
  ========================= */

  const computed = useMemo(() => {
    const filled = lines.filter((l) => l.itemName && Number(l.qty) > 0);

    let taxable = 0;
    let gstRaw = 0;

    filled.forEach((l) => {
      const line = Number(l.qty) * Number(l.unitPrice);
      taxable += line;
      gstRaw += (line * Number(l.gst)) / 100;
    });

    const disc = (taxable * Number(discountPct || 0)) / 100;
    const taxableAfter = taxable - disc;
    const gstRounded = Math.round(gstRaw);
    const roundOff = gstRounded - gstRaw;
    const grand = taxableAfter + gstRounded;

    return {
      rows: filled,
      taxable,
      discountAmount: disc,
      discountedTaxable: taxableAfter,
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
    } catch (e) {
      alert("Failed to save sale");
    }
  };

  /* =========================
     UI
  ========================= */

  return (
    <div className="billing-full card">
      <h2>Billing Panel</h2>

      <div>
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
      </div>

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
        <div>
          <b>Grand Total: {toINR(computed.grand)}</b>
        </div>
      </div>

      <button className="btn primary" onClick={saveBill}>
        Save
      </button>
    </div>
  );
}
