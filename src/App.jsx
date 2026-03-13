import React, { useState, useCallback, useRef, Fragment } from "react";
import * as XLSX from "xlsx";

// ─── Simple CSV Parser (replaces PapaParse) ────────────────────────────────

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { fields: [], data: [] };

  // Detect delimiter
  const firstLine = lines[0];
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  const delimiter = tabs > semicolons && tabs > commas ? "\t" : semicolons > commas ? ";" : ",";

  function splitRow(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  const fields = splitRow(lines[0]);
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitRow(lines[i]);
    if (vals.every((v) => !v)) continue; // skip empty rows
    const row = {};
    fields.forEach((f, j) => {
      row[f] = vals[j] || "";
    });
    data.push(row);
  }
  return { fields, data };
}

// ─── IBAN / BIC Utilities ───────────────────────────────────────────────────

function cleanIBAN(iban) {
  return (iban || "").replace(/\s+/g, "").toUpperCase();
}

function validateIBAN(iban) {
  const clean = cleanIBAN(iban);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(clean)) return false;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  const numStr = rearranged
    .split("")
    .map((c) => (c >= "A" && c <= "Z" ? (c.charCodeAt(0) - 55).toString() : c))
    .join("");
  let remainder = numStr;
  while (remainder.length > 2) {
    const block = remainder.slice(0, 9);
    remainder = (parseInt(block, 10) % 97).toString() + remainder.slice(block.length);
  }
  return parseInt(remainder, 10) % 97 === 1;
}

function deriveBIC(iban) {
  // Simplified BIC derivation for German IBANs based on Bankleitzahl
  // In production, you'd use a full BLZ→BIC mapping
  const clean = cleanIBAN(iban);
  if (!clean.startsWith("DE")) return "";
  return ""; // User must provide BIC
}

function formatIBAN(iban) {
  const clean = cleanIBAN(iban);
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

function validateBIC(bic) {
  const clean = (bic || "").replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(clean);
}

function escapeXml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatAmount(val) {
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(",", "."));
  if (isNaN(num) || num <= 0) return null;
  return num.toFixed(2);
}

function generateMsgId() {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MSG${ts}${rand}`;
}

function generatePmtInfId() {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `PMT${rand}`;
}

function formatDateISO(date) {
  return date.toISOString().split("T")[0];
}

function formatDateTime(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "");
}

// ─── SEPA XML Generation (pain.008.001.02 – Direct Debit) ──────────────────

function generateSEPAXML(entries, config) {
  const msgId = generateMsgId();
  const pmtInfId = generatePmtInfId();
  const creDtTm = formatDateTime(new Date());
  const nbOfTxs = entries.length;
  const ctrlSum = entries.reduce((sum, e) => sum + parseFloat(e.amount), 0).toFixed(2);
  const reqdColltnDt = config.collectionDate || formatDateISO(new Date(Date.now() + 5 * 86400000));

  const seqTp = config.sequenceType || "RCUR"; // FRST, RCUR, OOFF, FNAL
  const lcl = config.localInstrument || "CORE"; // CORE, COR1, B2B

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02 pain.008.001.02.xsd">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(config.creditorName)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(pmtInfId)}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>${config.batchBooking ? "true" : "false"}</BtchBookg>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
        <LclInstrm>
          <Cd>${escapeXml(lcl)}</Cd>
        </LclInstrm>
        <SeqTp>${escapeXml(seqTp)}</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${escapeXml(reqdColltnDt)}</ReqdColltnDt>
      <Cdtr>
        <Nm>${escapeXml(config.creditorName)}</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <IBAN>${escapeXml(cleanIBAN(config.creditorIBAN))}</IBAN>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>${config.creditorBIC ? `
          <BIC>${escapeXml(config.creditorBIC.toUpperCase())}</BIC>` : `
          <Othr><Id>NOTPROVIDED</Id></Othr>`}
        </FinInstnId>
      </CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId>
        <Id>
          <PrvtId>
            <Othr>
              <Id>${escapeXml(config.creditorId)}</Id>
              <SchmeNm>
                <Prtry>SEPA</Prtry>
              </SchmeNm>
            </Othr>
          </PrvtId>
        </Id>
      </CdtrSchmeId>`;

  entries.forEach((entry) => {
    xml += `
      <DrctDbtTxInf>
        <PmtId>
          <EndToEndId>${escapeXml(entry.endToEndId || "NOTPROVIDED")}</EndToEndId>
        </PmtId>
        <InstdAmt Ccy="EUR">${entry.amount}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${escapeXml(entry.mandateId)}</MndtId>
            <DtOfSgntr>${escapeXml(entry.mandateDate)}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>
        <DbtrAgt>
          <FinInstnId>${entry.bic ? `
            <BIC>${escapeXml(entry.bic.toUpperCase())}</BIC>` : `
            <Othr><Id>NOTPROVIDED</Id></Othr>`}
          </FinInstnId>
        </DbtrAgt>
        <Dbtr>
          <Nm>${escapeXml(entry.name)}</Nm>
        </Dbtr>
        <DbtrAcct>
          <Id>
            <IBAN>${escapeXml(cleanIBAN(entry.iban))}</IBAN>
          </Id>
        </DbtrAcct>
        <RmtInf>
          <Ustrd>${escapeXml(entry.purpose || config.defaultPurpose || "Mitgliedsbeitrag")}</Ustrd>
        </RmtInf>
      </DrctDbtTxInf>`;
  });

  xml += `
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;

  return xml;
}

// ─── SEPA XML Generation (pain.001.001.03 – Credit Transfer / Überweisungen) ─

function generateSEPACreditTransferXML(entries, config) {
  const msgId = generateMsgId();
  const pmtInfId = generatePmtInfId();
  const creDtTm = formatDateTime(new Date());
  const nbOfTxs = entries.length;
  const ctrlSum = entries.reduce((sum, e) => sum + parseFloat(e.amount), 0).toFixed(2);
  const reqdExctnDt = config.executionDate || formatDateISO(new Date(Date.now() + 2 * 86400000));

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03 pain.001.001.03.xsd">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(config.creditorName)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(pmtInfId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>${config.batchBooking ? "true" : "false"}</BtchBookg>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${escapeXml(reqdExctnDt)}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(config.creditorName)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${escapeXml(cleanIBAN(config.creditorIBAN))}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>${config.creditorBIC ? `
          <BIC>${escapeXml(config.creditorBIC.toUpperCase())}</BIC>` : `
          <Othr><Id>NOTPROVIDED</Id></Othr>`}
        </FinInstnId>
      </DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>`;

  entries.forEach((entry) => {
    xml += `
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${escapeXml(entry.endToEndId || "NOTPROVIDED")}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${entry.amount}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>${entry.bic ? `
            <BIC>${escapeXml(entry.bic.toUpperCase())}</BIC>` : `
            <Othr><Id>NOTPROVIDED</Id></Othr>`}
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>${escapeXml(entry.name)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${escapeXml(cleanIBAN(entry.iban))}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${escapeXml(entry.purpose || config.defaultPurpose || "Zahlung")}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`;
  });

  xml += `
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;

  return xml;
}

// ─── Column Mapping Heuristics ──────────────────────────────────────────────

const COLUMN_MAP = {
  name: ["name", "namn", "nachname", "vorname", "mitglied", "kontoinhaber", "debtor", "inhaber", "empfänger", "empfaenger", "schuldner", "zahler", "vor- und nachname", "vollständiger name", "kontoinh"],
  iban: ["iban", "konto", "kontonummer", "bankverbindung"],
  bic: ["bic", "swift", "bic/swift", "bankleitzahl", "blz"],
  amount: ["betrag", "amount", "summe", "beitrag", "euro", "eur", "preis", "gebühr", "gebuehr"],
  mandateId: ["mandat", "mandate", "mandatsreferenz", "mandatsnummer", "mandats-id", "mandate_id", "mandateid", "mandatreferenz", "referenz"],
  mandateDate: ["mandatsdatum", "mandate_date", "mandatedate", "datum_mandat", "unterschrift", "unterschriftsdatum", "signatur", "sign_date"],
  purpose: ["verwendungszweck", "zweck", "purpose", "betreff", "grund", "beschreibung", "text", "buchungstext"],
  endToEndId: ["end2end", "endtoend", "end_to_end", "e2e", "zahlungsreferenz"],
};

function autoMapColumns(headers) {
  const mapping = {};
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  for (const [field, keywords] of Object.entries(COLUMN_MAP)) {
    for (const kw of keywords) {
      const idx = lowerHeaders.findIndex((h) => h === kw || h.includes(kw));
      if (idx !== -1 && !Object.values(mapping).includes(headers[idx])) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }
  return mapping;
}

// ─── Styling ────────────────────────────────────────────────────────────────

// Fonts are self-hosted via @fontsource (imported in main.jsx)

// ─── Main App ───────────────────────────────────────────────────────────────

const STEPS = ["upload", "mapping", "config", "preview", "download"];
const STEP_LABELS = {
  upload: "Datei hochladen",
  mapping: "Spalten zuordnen",
  config: "Vereinsdaten",
  preview: "Vorschau & Prüfung",
  download: "XML herunterladen",
};

export default function SEPAXMLGenerator() {
  const [step, setStep] = useState("upload");
  const [rawData, setRawData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fileName, setFileName] = useState("");
  const [columnMapping, setColumnMapping] = useState({});
  const [xmlType, setXmlType] = useState("debit"); // debit or credit
  const [config, setConfig] = useState({
    creditorName: "",
    creditorIBAN: "",
    creditorBIC: "",
    creditorId: "",
    collectionDate: "",
    executionDate: "",
    sequenceType: "RCUR",
    localInstrument: "CORE",
    batchBooking: true,
    defaultPurpose: "Mitgliedsbeitrag",
  });
  const [entries, setEntries] = useState([]);
  const [errors, setErrors] = useState([]);
  const [xmlOutput, setXmlOutput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [showModal, setShowModal] = useState(null);
  const fileInputRef = useRef(null);

  // ── File Parsing ──

  const parseFile = useCallback((file) => {
    setFileName(file.name);
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "csv" || ext === "tsv") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const result = parseCSV(text);
          if (result.data.length === 0) {
            setErrors([{ row: 0, msg: "Datei enthält keine Daten." }]);
            return;
          }
          const hdrs = result.fields;
          setHeaders(hdrs);
          setRawData(result.data);
          setColumnMapping(autoMapColumns(hdrs));
          setStep("mapping");
          setErrors([]);
        } catch {
          setErrors([{ row: 0, msg: "Fehler beim Lesen der CSV-Datei." }]);
        }
      };
      reader.readAsText(file, "UTF-8");
    } else if (["xlsx", "xls", "xlsm"].includes(ext)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
          if (json.length === 0) {
            setErrors([{ row: 0, msg: "Arbeitsblatt enthält keine Daten." }]);
            return;
          }
          const hdrs = Object.keys(json[0]);
          setHeaders(hdrs);
          setRawData(json);
          setColumnMapping(autoMapColumns(hdrs));
          setStep("mapping");
          setErrors([]);
        } catch {
          setErrors([{ row: 0, msg: "Fehler beim Lesen der Excel-Datei." }]);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setErrors([{ row: 0, msg: "Bitte eine CSV- oder Excel-Datei (.csv, .xlsx, .xls) hochladen." }]);
    }
  }, []);

  // ── Entry Validation ──

  const buildAndValidateEntries = useCallback(() => {
    const errs = [];
    const built = rawData.map((row, i) => {
      const entry = {};
      const rowNum = i + 2; // header is row 1

      // Name
      const nameCol = columnMapping.name;
      entry.name = nameCol ? String(row[nameCol] || "").trim() : "";
      if (!entry.name) errs.push({ row: rowNum, msg: `Name fehlt` });
      if (entry.name.length > 70) errs.push({ row: rowNum, msg: `Name zu lang (max. 70 Zeichen)` });

      // IBAN
      const ibanCol = columnMapping.iban;
      entry.iban = ibanCol ? cleanIBAN(row[ibanCol]) : "";
      if (!entry.iban) errs.push({ row: rowNum, msg: `IBAN fehlt` });
      else if (!validateIBAN(entry.iban)) errs.push({ row: rowNum, msg: `IBAN ungültig: ${entry.iban}` });

      // BIC (optional)
      const bicCol = columnMapping.bic;
      entry.bic = bicCol ? String(row[bicCol] || "").replace(/\s/g, "").toUpperCase() : "";
      if (entry.bic && !validateBIC(entry.bic)) errs.push({ row: rowNum, msg: `BIC ungültig: ${entry.bic}` });

      // Amount
      const amtCol = columnMapping.amount;
      const rawAmt = amtCol ? row[amtCol] : "";
      entry.amount = formatAmount(rawAmt);
      if (!entry.amount) errs.push({ row: rowNum, msg: `Betrag ungültig: "${rawAmt}"` });

      // Mandate ID (required for direct debit)
      const mandCol = columnMapping.mandateId;
      entry.mandateId = mandCol ? String(row[mandCol] || "").trim() : "";
      if (xmlType === "debit" && !entry.mandateId) errs.push({ row: rowNum, msg: `Mandatsreferenz fehlt` });

      // Mandate Date
      const mdCol = columnMapping.mandateDate;
      let md = mdCol ? String(row[mdCol] || "").trim() : "";
      if (md) {
        // Try to parse various date formats
        if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(md)) {
          const [d, m, y] = md.split(".");
          md = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(md)) {
          const [d, m, y] = md.split("/");
          md = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        } else if (/^\d{4}-\d{2}-\d{2}/.test(md)) {
          md = md.slice(0, 10);
        } else if (typeof row[mdCol] === "number") {
          // Excel serial date
          const d = new Date((row[mdCol] - 25569) * 86400000);
          md = formatDateISO(d);
        }
      }
      entry.mandateDate = md || "2024-01-01";
      if (xmlType === "debit" && !md && !mdCol) {
        // silently default
      }

      // Purpose
      const purpCol = columnMapping.purpose;
      entry.purpose = purpCol ? String(row[purpCol] || "").trim() : "";

      // End-to-End ID
      const e2eCol = columnMapping.endToEndId;
      entry.endToEndId = e2eCol ? String(row[e2eCol] || "").trim() : "";

      return entry;
    });

    setEntries(built);
    setErrors(errs);
    return errs;
  }, [rawData, columnMapping, xmlType]);

  // ── XML Generation ──

  const generateXML = useCallback(() => {
    let xml;
    if (xmlType === "debit") {
      xml = generateSEPAXML(entries, config);
    } else {
      xml = generateSEPACreditTransferXML(entries, config);
    }
    setXmlOutput(xml);
    setStep("download");
  }, [entries, config, xmlType]);

  const downloadXML = useCallback(() => {
    const blob = new Blob([xmlOutput], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const prefix = xmlType === "debit" ? "SEPA_Lastschrift" : "SEPA_Ueberweisung";
    a.href = url;
    a.download = `${prefix}_${new Date().toISOString().slice(0, 10)}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }, [xmlOutput, xmlType]);

  // ── Navigation ──

  const goTo = (target) => {
    if (target === "preview") {
      const errs = buildAndValidateEntries();
      // allow preview even with errors, just show them
    }
    setStep(target);
  };

  const currentStepIdx = STEPS.indexOf(step);

  // ── Styles ──

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    :root {
      --bg: #F7F6F3;
      --surface: #FFFFFF;
      --surface-alt: #F0EFEB;
      --border: #E2E0DA;
      --border-focus: #2D5A27;
      --text: #1A1A18;
      --text-secondary: #6B6960;
      --text-muted: #9B978C;
      --accent: #2D5A27;
      --accent-light: #E8F0E6;
      --accent-hover: #1E3D1A;
      --error: #B33A3A;
      --error-light: #FBEAEA;
      --warning: #8B6914;
      --warning-light: #FFF8E6;
      --success: #2D5A27;
      --success-light: #E8F0E6;
      --radius: 10px;
      --radius-sm: 6px;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
      --shadow: 0 4px 12px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04);
      --shadow-lg: 0 12px 40px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04);
      --font: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      --mono: 'JetBrains Mono', 'Fira Code', monospace;
    }

    body { font-family: var(--font); background: var(--bg); color: var(--text); line-height: 1.5; }

    .app {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 24px 80px;
      min-height: 100vh;
    }

    /* Header */
    .header {
      text-align: center;
      margin-bottom: 40px;
    }
    .header-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--accent-light);
      color: var(--accent);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 5px 14px;
      border-radius: 100px;
      margin-bottom: 16px;
    }
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text);
      margin-bottom: 8px;
    }
    .header p {
      font-size: 16px;
      color: var(--text-secondary);
      max-width: 520px;
      margin: 0 auto;
    }

    /* Steps nav */
    .steps-nav {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      margin-bottom: 36px;
      padding: 0 16px;
    }
    .step-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-muted);
      cursor: default;
      transition: color 0.2s;
      white-space: nowrap;
    }
    .step-item.active { color: var(--accent); font-weight: 600; }
    .step-item.done { color: var(--text-secondary); cursor: pointer; }
    .step-item.done:hover { color: var(--accent); }
    .step-dot {
      width: 26px; height: 26px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700;
      background: var(--surface-alt); color: var(--text-muted);
      border: 2px solid var(--border);
      transition: all 0.25s;
      flex-shrink: 0;
    }
    .step-item.active .step-dot {
      background: var(--accent); color: white; border-color: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-light);
    }
    .step-item.done .step-dot {
      background: var(--accent-light); color: var(--accent); border-color: var(--accent);
    }
    .step-line {
      width: 40px; height: 2px; background: var(--border);
      margin: 0 8px; flex-shrink: 0;
    }
    .step-line.done { background: var(--accent); }

    @media (max-width: 700px) {
      .step-label { display: none; }
      .step-line { width: 24px; }
    }

    /* Card */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px;
      box-shadow: var(--shadow);
    }
    .card-title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 6px;
      letter-spacing: -0.01em;
    }
    .card-desc {
      font-size: 14px;
      color: var(--text-secondary);
      margin-bottom: 24px;
    }

    /* Drop zone */
    .dropzone {
      border: 2px dashed var(--border);
      border-radius: var(--radius);
      padding: 56px 32px;
      text-align: center;
      cursor: pointer;
      transition: all 0.25s;
      background: var(--surface-alt);
    }
    .dropzone:hover, .dropzone.active {
      border-color: var(--accent);
      background: var(--accent-light);
    }
    .dropzone-icon {
      width: 52px; height: 52px;
      margin: 0 auto 16px;
      background: var(--accent-light);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px;
    }
    .dropzone.active .dropzone-icon { background: var(--accent); color: white; }
    .dropzone h3 { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
    .dropzone p { font-size: 13px; color: var(--text-secondary); }

    /* Type selector */
    .type-selector {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 28px;
    }
    .type-btn {
      padding: 16px;
      border: 2px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      cursor: pointer;
      text-align: left;
      transition: all 0.2s;
      font-family: var(--font);
    }
    .type-btn:hover { border-color: var(--accent); background: var(--accent-light); }
    .type-btn.selected { border-color: var(--accent); background: var(--accent-light); box-shadow: 0 0 0 3px rgba(45,90,39,0.1); }
    .type-btn strong { display: block; font-size: 14px; margin-bottom: 2px; }
    .type-btn span { font-size: 12px; color: var(--text-secondary); }

    /* Form elements */
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } }
    .form-group { margin-bottom: 0; }
    .form-group.full { grid-column: 1 / -1; }
    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 6px;
      letter-spacing: 0.01em;
    }
    .form-label .required { color: var(--error); margin-left: 2px; }
    input[type="text"], input[type="date"], select {
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 14px;
      font-family: var(--font);
      color: var(--text);
      background: var(--surface);
      transition: border-color 0.2s, box-shadow 0.2s;
      outline: none;
    }
    input:focus, select:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(45,90,39,0.1);
    }
    input.error { border-color: var(--error); }
    .input-hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
    .input-valid { font-size: 11px; color: var(--success); margin-top: 4px; }
    .input-error { font-size: 11px; color: var(--error); margin-top: 4px; }

    /* Mapping */
    .mapping-row {
      display: grid;
      grid-template-columns: 180px 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }
    @media (max-width: 600px) { .mapping-row { grid-template-columns: 1fr; gap: 6px; } }
    .mapping-row:last-child { border-bottom: none; }
    .mapping-field { font-size: 14px; font-weight: 500; }
    .mapping-field .req { color: var(--error); font-weight: 400; font-size: 12px; }
    .mapping-status { font-size: 18px; }

    /* Table */
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      margin-top: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      background: var(--surface-alt);
      padding: 10px 14px;
      text-align: left;
      font-weight: 600;
      color: var(--text-secondary);
      font-size: 12px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      border-bottom: 2px solid var(--border);
      white-space: nowrap;
    }
    td {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      font-family: var(--mono);
      font-size: 12.5px;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--surface-alt); }
    tr.row-error td { background: var(--error-light); }

    /* Error list */
    .error-box {
      background: var(--error-light);
      border: 1px solid rgba(179,58,58,0.2);
      border-radius: var(--radius-sm);
      padding: 16px;
      margin-bottom: 16px;
    }
    .error-box h4 { font-size: 14px; color: var(--error); margin-bottom: 8px; }
    .error-box ul { list-style: none; padding: 0; }
    .error-box li {
      font-size: 13px;
      padding: 3px 0;
      color: var(--error);
    }
    .error-box li::before { content: "⚠ "; }

    .warning-box {
      background: var(--warning-light);
      border: 1px solid rgba(139,105,20,0.2);
      border-radius: var(--radius-sm);
      padding: 16px;
      margin-bottom: 16px;
    }
    .warning-box h4 { font-size: 14px; color: var(--warning); margin-bottom: 4px; }
    .warning-box p { font-size: 13px; color: var(--warning); }

    .success-box {
      background: var(--success-light);
      border: 1px solid rgba(45,90,39,0.2);
      border-radius: var(--radius-sm);
      padding: 16px;
      margin-bottom: 16px;
    }
    .success-box h4 { font-size: 14px; color: var(--success); margin-bottom: 4px; }
    .success-box p { font-size: 13px; color: var(--success); }

    /* Stats strip */
    .stats-strip {
      display: flex;
      gap: 24px;
      padding: 16px 20px;
      background: var(--surface-alt);
      border-radius: var(--radius-sm);
      margin-bottom: 20px;
    }
    .stat { text-align: center; flex: 1; }
    .stat-value { font-size: 22px; font-weight: 700; color: var(--text); font-family: var(--mono); }
    .stat-label { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }

    /* XML preview */
    .xml-preview {
      background: #1E1E1E;
      color: #D4D4D4;
      border-radius: var(--radius-sm);
      padding: 20px;
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.6;
      overflow-x: auto;
      max-height: 400px;
      overflow-y: auto;
      white-space: pre;
      margin-top: 16px;
    }

    /* Buttons */
    .btn-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-top: 28px;
    }
    .btn {
      padding: 11px 24px;
      border-radius: var(--radius-sm);
      font-size: 14px;
      font-weight: 600;
      font-family: var(--font);
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .btn-primary {
      background: var(--accent);
      color: white;
    }
    .btn-primary:hover { background: var(--accent-hover); transform: translateY(-1px); box-shadow: var(--shadow); }
    .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none; }
    .btn-secondary {
      background: var(--surface);
      color: var(--text);
      border: 1.5px solid var(--border);
    }
    .btn-secondary:hover { background: var(--surface-alt); border-color: var(--text-muted); }
    .btn-download {
      background: var(--accent);
      color: white;
      padding: 16px 36px;
      font-size: 16px;
      border-radius: var(--radius);
    }
    .btn-download:hover { background: var(--accent-hover); transform: translateY(-2px); box-shadow: var(--shadow-lg); }

    /* Privacy */
    .privacy-note {
      text-align: center;
      margin-top: 40px;
      padding: 20px;
    }
    .privacy-note p {
      font-size: 13px;
      color: var(--text-muted);
      max-width: 480px;
      margin: 0 auto;
    }
    .privacy-note strong { color: var(--text-secondary); }

    /* Checkbox */
    .checkbox-row {
      display: flex; align-items: center; gap: 10px;
      font-size: 14px; cursor: pointer; padding: 4px 0;
    }
    .checkbox-row input[type="checkbox"] {
      width: 18px; height: 18px; accent-color: var(--accent);
      cursor: pointer;
    }

    /* Reset */
    .reset-link {
      font-size: 13px;
      color: var(--text-muted);
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
      background: none;
      border: none;
      font-family: var(--font);
    }
    .reset-link:hover { color: var(--error); }

    /* Animations */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .card { animation: fadeIn 0.3s ease-out; }

    /* Footer */
    .footer {
      text-align: center;
      padding: 24px 0 12px;
      border-top: 1px solid var(--border);
      margin-top: 20px;
    }
    .footer-link {
      background: none;
      border: none;
      font-family: var(--font);
      font-size: 13px;
      color: var(--text-muted);
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
      padding: 4px 8px;
    }
    .footer-link:hover { color: var(--accent); }
    .footer-sep { color: var(--border); margin: 0 4px; }

    /* Modal */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 24px;
      animation: fadeIn 0.2s ease-out;
    }
    .modal-content {
      background: var(--surface);
      border-radius: var(--radius);
      max-width: 680px;
      width: 100%;
      max-height: 85vh;
      overflow-y: auto;
      padding: 36px 40px;
      box-shadow: var(--shadow-lg);
      position: relative;
    }
    .modal-close {
      position: absolute;
      top: 16px;
      right: 20px;
      background: none;
      border: none;
      font-size: 20px;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      line-height: 1;
    }
    .modal-close:hover { background: var(--surface-alt); color: var(--text); }

    .legal-text h2 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 20px;
      letter-spacing: -0.01em;
    }
    .legal-text h3 {
      font-size: 15px;
      font-weight: 600;
      margin-top: 24px;
      margin-bottom: 8px;
      color: var(--text);
    }
    .legal-text p {
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.7;
      margin-bottom: 10px;
    }
    .legal-text a {
      color: var(--accent);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .legal-text a:hover { color: var(--accent-hover); }
    .legal-text strong { color: var(--text); }
  `;

  // ── Render helpers ──

  const renderStepNav = () => (
    <div className="steps-nav">
      {STEPS.map((s, i) => {
        const isDone = i < currentStepIdx;
        const isActive = s === step;
        return (
          <Fragment key={s}>
            {i > 0 && <div className={`step-line ${isDone || isActive ? "done" : ""}`} />}
            <div
              className={`step-item ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
              onClick={() => isDone && goTo(s)}
            >
              <div className="step-dot">
                {isDone ? "✓" : i + 1}
              </div>
              <span className="step-label">{STEP_LABELS[s]}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );

  // ── Step: Upload ──

  const renderUpload = () => (
    <div className="card">
      <div className="card-title">Zahlungsdatei hochladen</div>
      <div className="card-desc">
        Laden Sie eine CSV- oder Excel-Datei mit den Zahlungsdaten Ihrer Vereinsmitglieder hoch.
      </div>

      <div className="type-selector">
        <button
          className={`type-btn ${xmlType === "debit" ? "selected" : ""}`}
          onClick={() => setXmlType("debit")}
        >
          <strong>↓ SEPA-Lastschrift</strong>
          <span>pain.008.001.02 — Beiträge einziehen</span>
        </button>
        <button
          className={`type-btn ${xmlType === "credit" ? "selected" : ""}`}
          onClick={() => setXmlType("credit")}
        >
          <strong>↑ SEPA-Überweisung</strong>
          <span>pain.001.001.03 — Zahlungen senden</span>
        </button>
      </div>

      <div
        className={`dropzone ${dragOver ? "active" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files[0]) parseFile(e.dataTransfer.files[0]);
        }}
      >
        <div className="dropzone-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
        <h3>Datei hierher ziehen oder klicken</h3>
        <p>.csv, .xlsx, .xls — UTF-8 empfohlen für Umlaute</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.xlsm,.tsv"
        style={{ display: "none" }}
        onChange={(e) => e.target.files[0] && parseFile(e.target.files[0])}
      />

      {errors.length > 0 && (
        <div className="error-box" style={{ marginTop: 16 }}>
          <h4>Fehler</h4>
          <ul>{errors.map((e, i) => <li key={i}>{e.msg}</li>)}</ul>
        </div>
      )}

      <div style={{ marginTop: 24, padding: "16px 20px", background: "var(--surface-alt)", borderRadius: "var(--radius-sm)" }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>Erwartete Spalten</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          <strong>Pflicht:</strong> Name/Kontoinhaber, IBAN, Betrag
          {xmlType === "debit" && <>, Mandatsreferenz</>}
          <br />
          <strong>Optional:</strong> BIC, Verwendungszweck, Mandatsdatum, End-to-End-ID
        </div>
      </div>
    </div>
  );

  // ── Step: Mapping ──

  const FIELDS = xmlType === "debit"
    ? [
        { key: "name", label: "Name / Kontoinhaber", required: true },
        { key: "iban", label: "IBAN", required: true },
        { key: "bic", label: "BIC", required: false },
        { key: "amount", label: "Betrag (EUR)", required: true },
        { key: "mandateId", label: "Mandatsreferenz", required: true },
        { key: "mandateDate", label: "Mandatsdatum", required: false },
        { key: "purpose", label: "Verwendungszweck", required: false },
        { key: "endToEndId", label: "End-to-End-ID", required: false },
      ]
    : [
        { key: "name", label: "Empfänger", required: true },
        { key: "iban", label: "IBAN", required: true },
        { key: "bic", label: "BIC", required: false },
        { key: "amount", label: "Betrag (EUR)", required: true },
        { key: "purpose", label: "Verwendungszweck", required: false },
        { key: "endToEndId", label: "End-to-End-ID", required: false },
      ];

  const renderMapping = () => {
    const requiredMapped = FIELDS.filter((f) => f.required).every((f) => columnMapping[f.key]);
    return (
      <div className="card">
        <div className="card-title">Spalten zuordnen</div>
        <div className="card-desc">
          {fileName} — {rawData.length} Datensätze erkannt. Ordnen Sie die Spalten zu.
        </div>

        {FIELDS.map((field) => (
          <div className="mapping-row" key={field.key}>
            <div className="mapping-field">
              {field.label} {field.required && <span className="req">*</span>}
            </div>
            <select
              value={columnMapping[field.key] || ""}
              onChange={(e) => setColumnMapping((m) => ({ ...m, [field.key]: e.target.value || undefined }))}
            >
              <option value="">— nicht zugeordnet —</option>
              {headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <div className="mapping-status">
              {columnMapping[field.key] ? "✓" : field.required ? "✗" : "–"}
            </div>
          </div>
        ))}

        <div className="btn-row">
          <button className="btn btn-secondary" onClick={() => setStep("upload")}>← Zurück</button>
          <button
            className="btn btn-primary"
            disabled={!requiredMapped}
            onClick={() => goTo("config")}
          >
            Weiter →
          </button>
        </div>
      </div>
    );
  };

  // ── Step: Config ──

  const renderConfig = () => {
    const ibanValid = config.creditorIBAN ? validateIBAN(config.creditorIBAN) : null;
    const bicValid = config.creditorBIC ? validateBIC(config.creditorBIC) : null;
    const canProceed =
      config.creditorName &&
      config.creditorIBAN && ibanValid &&
      (xmlType === "credit" || config.creditorId);

    return (
      <div className="card">
        <div className="card-title">
          {xmlType === "debit" ? "Vereinsdaten (Gläubiger)" : "Vereinsdaten (Auftraggeber)"}
        </div>
        <div className="card-desc">
          Daten Ihres Vereins für die SEPA-XML-Datei.
        </div>

        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">Vereinsname <span className="required">*</span></label>
            <input
              type="text"
              value={config.creditorName}
              onChange={(e) => setConfig((c) => ({ ...c, creditorName: e.target.value }))}
              placeholder="z.B. Turnverein Musterstadt 1899 e.V."
              maxLength={70}
            />
          </div>

          <div className="form-group">
            <label className="form-label">IBAN des Vereins <span className="required">*</span></label>
            <input
              type="text"
              value={config.creditorIBAN}
              onChange={(e) => setConfig((c) => ({ ...c, creditorIBAN: e.target.value }))}
              placeholder="DE89 3704 0044 0532 0130 00"
              className={config.creditorIBAN && !ibanValid ? "error" : ""}
            />
            {config.creditorIBAN && ibanValid && <div className="input-valid">✓ IBAN gültig</div>}
            {config.creditorIBAN && !ibanValid && <div className="input-error">IBAN ungültig</div>}
          </div>

          <div className="form-group">
            <label className="form-label">BIC</label>
            <input
              type="text"
              value={config.creditorBIC}
              onChange={(e) => setConfig((c) => ({ ...c, creditorBIC: e.target.value }))}
              placeholder="z.B. COBADEFFXXX"
              className={config.creditorBIC && !bicValid ? "error" : ""}
            />
            {config.creditorBIC && bicValid && <div className="input-valid">✓ BIC gültig</div>}
            {config.creditorBIC && !bicValid && <div className="input-error">BIC-Format ungültig</div>}
            <div className="input-hint">Optional bei deutschen IBANs</div>
          </div>

          {xmlType === "debit" && (
            <div className="form-group">
              <label className="form-label">Gläubiger-ID <span className="required">*</span></label>
              <input
                type="text"
                value={config.creditorId}
                onChange={(e) => setConfig((c) => ({ ...c, creditorId: e.target.value }))}
                placeholder="DE98ZZZ09999999999"
              />
              <div className="input-hint">Gläubiger-Identifikationsnummer der Bundesbank</div>
            </div>
          )}

          {xmlType === "debit" && (
            <div className="form-group">
              <label className="form-label">Einzugsdatum</label>
              <input
                type="date"
                value={config.collectionDate}
                onChange={(e) => setConfig((c) => ({ ...c, collectionDate: e.target.value }))}
              />
              <div className="input-hint">Standard: 5 Tage ab heute</div>
            </div>
          )}

          {xmlType === "credit" && (
            <div className="form-group">
              <label className="form-label">Ausführungsdatum</label>
              <input
                type="date"
                value={config.executionDate}
                onChange={(e) => setConfig((c) => ({ ...c, executionDate: e.target.value }))}
              />
              <div className="input-hint">Standard: 2 Tage ab heute</div>
            </div>
          )}

          {xmlType === "debit" && (
            <>
              <div className="form-group">
                <label className="form-label">Sequenztyp</label>
                <select
                  value={config.sequenceType}
                  onChange={(e) => setConfig((c) => ({ ...c, sequenceType: e.target.value }))}
                >
                  <option value="FRST">Erstlastschrift (FRST)</option>
                  <option value="RCUR">Wiederkehrend (RCUR)</option>
                  <option value="OOFF">Einmalig (OOFF)</option>
                  <option value="FNAL">Letzte (FNAL)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Lastschriftart</label>
                <select
                  value={config.localInstrument}
                  onChange={(e) => setConfig((c) => ({ ...c, localInstrument: e.target.value }))}
                >
                  <option value="CORE">SEPA-Basislastschrift (CORE)</option>
                  <option value="B2B">SEPA-Firmenlastschrift (B2B)</option>
                </select>
              </div>
            </>
          )}

          <div className="form-group full">
            <label className="form-label">Standard-Verwendungszweck</label>
            <input
              type="text"
              value={config.defaultPurpose}
              onChange={(e) => setConfig((c) => ({ ...c, defaultPurpose: e.target.value }))}
              placeholder="z.B. Mitgliedsbeitrag 2025"
              maxLength={140}
            />
            <div className="input-hint">Wird verwendet, wenn in der Datei kein Zweck angegeben</div>
          </div>

          <div className="form-group full">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.batchBooking}
                onChange={(e) => setConfig((c) => ({ ...c, batchBooking: e.target.checked }))}
              />
              Sammelbuchung (eine Buchung auf dem Kontoauszug)
            </label>
          </div>
        </div>

        <div className="btn-row">
          <button className="btn btn-secondary" onClick={() => setStep("mapping")}>← Zurück</button>
          <button className="btn btn-primary" disabled={!canProceed} onClick={() => goTo("preview")}>
            Vorschau →
          </button>
        </div>
      </div>
    );
  };

  // ── Step: Preview ──

  const renderPreview = () => {
    const totalAmount = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const validCount = entries.length - new Set(errors.map((e) => e.row)).size;
    const errorRows = new Set(errors.map((e) => e.row));

    return (
      <div className="card">
        <div className="card-title">Vorschau & Prüfung</div>
        <div className="card-desc">Überprüfen Sie die Daten vor der XML-Erzeugung.</div>

        <div className="stats-strip">
          <div className="stat">
            <div className="stat-value">{entries.length}</div>
            <div className="stat-label">Einträge</div>
          </div>
          <div className="stat">
            <div className="stat-value" style={{ color: "var(--success)" }}>{validCount}</div>
            <div className="stat-label">Gültig</div>
          </div>
          <div className="stat">
            <div className="stat-value" style={{ color: errors.length ? "var(--error)" : "inherit" }}>
              {new Set(errors.map((e) => e.row)).size}
            </div>
            <div className="stat-label">Fehlerhaft</div>
          </div>
          <div className="stat">
            <div className="stat-value">{totalAmount.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</div>
            <div className="stat-label">Gesamtbetrag</div>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="error-box">
            <h4>{errors.length} Validierungsfehler</h4>
            <ul>
              {errors.slice(0, 20).map((e, i) => (
                <li key={i}>Zeile {e.row}: {e.msg}</li>
              ))}
              {errors.length > 20 && <li>… und {errors.length - 20} weitere Fehler</li>}
            </ul>
          </div>
        )}

        {errors.length > 0 && (
          <div className="warning-box">
            <h4>Hinweis</h4>
            <p>Fehlerhafte Zeilen werden trotzdem in die XML-Datei aufgenommen. Bitte korrigieren Sie Ihre Quelldatei, falls nötig.</p>
          </div>
        )}

        {errors.length === 0 && (
          <div className="success-box">
            <h4>Alle Daten gültig ✓</h4>
            <p>{entries.length} Einträge bereit zur XML-Erzeugung.</p>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>IBAN</th>
                <th>Betrag</th>
                {xmlType === "debit" && <th>Mandat</th>}
                <th>Zweck</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 50).map((e, i) => (
                <tr key={i} className={errorRows.has(i + 2) ? "row-error" : ""}>
                  <td>{i + 1}</td>
                  <td style={{ fontFamily: "var(--font)" }}>{e.name}</td>
                  <td>{formatIBAN(e.iban)}</td>
                  <td style={{ textAlign: "right" }}>{e.amount ? `${parseFloat(e.amount).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : "—"}</td>
                  {xmlType === "debit" && <td>{e.mandateId || "—"}</td>}
                  <td style={{ fontFamily: "var(--font)" }}>{e.purpose || config.defaultPurpose || "—"}</td>
                </tr>
              ))}
              {entries.length > 50 && (
                <tr><td colSpan={xmlType === "debit" ? 6 : 5} style={{ textAlign: "center", fontFamily: "var(--font)", color: "var(--text-muted)" }}>
                  … {entries.length - 50} weitere Einträge
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="btn-row">
          <button className="btn btn-secondary" onClick={() => setStep("config")}>← Zurück</button>
          <button className="btn btn-primary" onClick={generateXML}>
            XML erzeugen →
          </button>
        </div>
      </div>
    );
  };

  // ── Step: Download ──

  const renderDownload = () => {
    const totalAmount = entries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const typeLabel = xmlType === "debit" ? "SEPA-Lastschrift" : "SEPA-Überweisung";
    const schemaLabel = xmlType === "debit" ? "pain.008.001.02" : "pain.001.001.03";

    return (
      <div className="card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12, color: "var(--success)" }}>✓</div>
        <div className="card-title" style={{ marginBottom: 4 }}>{typeLabel}-XML erstellt</div>
        <div className="card-desc" style={{ marginBottom: 24 }}>
          {entries.length} Transaktionen · {totalAmount.toLocaleString("de-DE", { minimumFractionDigits: 2 })} € · Schema {schemaLabel}
        </div>

        <button className="btn btn-download" onClick={downloadXML}>
          ↓ XML-Datei herunterladen
        </button>

        <div className="btn-row" style={{ justifyContent: "center" }}>
          <button className="btn btn-secondary" onClick={() => setStep("preview")}>← Zurück zur Vorschau</button>
          <button className="reset-link" onClick={() => {
            setStep("upload");
            setRawData([]);
            setHeaders([]);
            setFileName("");
            setColumnMapping({});
            setEntries([]);
            setErrors([]);
            setXmlOutput("");
          }}>
            Neue Datei hochladen
          </button>
        </div>
      </div>
    );
  };

  // ── Main Render ──

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <div className="header-badge">
            Für Vereine & Organisationen
          </div>
          <h1>SEPA XML Generator</h1>
          <p>
            CSV oder Excel hochladen, Spalten zuordnen, XML für Ihre Bank erzeugen. 
            Kompatibel mit allen SEPA-fähigen Instituten.
          </p>
        </div>

        {renderStepNav()}

        {step === "upload" && renderUpload()}
        {step === "mapping" && renderMapping()}
        {step === "config" && renderConfig()}
        {step === "preview" && renderPreview()}
        {step === "download" && renderDownload()}

        <div className="privacy-note">
          <p>
            <strong>Datenschutz:</strong> Alle Daten werden ausschließlich in Ihrem Browser verarbeitet. 
            Es werden keine Daten an einen Server übertragen. Die Verarbeitung erfolgt vollständig lokal.
          </p>
        </div>

        <footer className="footer">
          <button className="footer-link" onClick={() => setShowModal("impressum")}>Impressum</button>
          <span className="footer-sep">·</span>
          <button className="footer-link" onClick={() => setShowModal("datenschutz")}>Datenschutzerklärung</button>
        </footer>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModal(null)}>✕</button>
            {showModal === "impressum" && (
              <div className="legal-text">
                <h2>Impressum</h2>
                <p>Angaben gemäß § 5 TMG</p>

                <h3>Verantwortlich</h3>
                <p>
                  Dirk Heiden<br />
                  Am Blümlingspfad 134<br />
                  53359 Rheinbach<br />
                  Deutschland
                </p>

                <h3>Kontakt</h3>
                <p>
                  E-Mail: dheiden@t-online.de
                </p>

                <h3>Haftung für Inhalte</h3>
                <p>
                  Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten 
                  nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als 
                  Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde 
                  Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige 
                  Tätigkeit hinweisen.
                </p>

                <h3>Haftungsausschluss</h3>
                <p>
                  Die erzeugten SEPA-XML-Dateien werden nach bestem Wissen und Gewissen generiert. 
                  Für die Richtigkeit, Vollständigkeit und Aktualität der erzeugten Dateien wird 
                  keine Gewähr übernommen. Die Nutzung erfolgt auf eigene Verantwortung. 
                  Bitte prüfen Sie die erzeugten XML-Dateien vor dem Upload bei Ihrer Bank.
                </p>
              </div>
            )}
            {showModal === "datenschutz" && (
              <div className="legal-text">
                <h2>Datenschutzerklärung</h2>

                <h3>1. Verantwortlicher</h3>
                <p>
                  Verantwortlich für die Datenverarbeitung auf dieser Webseite ist:<br />
                  Dirk Heiden, Am Blümlingspfad 134, 53359 Rheinbach<br />
                  E-Mail: dheiden@t-online.de
                </p>

                <h3>2. Grundsatz: Keine Datenübertragung</h3>
                <p>
                  Diese Webseite verarbeitet <strong>sämtliche Daten ausschließlich lokal in 
                  Ihrem Browser</strong> (clientseitig). Es werden zu keinem Zeitpunkt personenbezogene 
                  Daten, Bankdaten, IBAN-Nummern, Namen oder andere Inhalte Ihrer hochgeladenen Dateien 
                  an unseren Server oder an Dritte übertragen.
                </p>
                <p>
                  Die hochgeladenen CSV- und Excel-Dateien verlassen Ihren Computer nicht. Die gesamte 
                  Verarbeitung — einschließlich Validierung, Spalten-Zuordnung und XML-Erzeugung — 
                  findet im JavaScript-Code Ihres Browsers statt.
                </p>

                <h3>3. Hosting</h3>
                <p>
                  Diese Webseite wird über Cloudflare Pages gehostet. Cloudflare kann beim Aufruf der 
                  Seite technische Daten wie Ihre IP-Adresse, Browsertyp und Zugriffszeit in 
                  Server-Logfiles erfassen. Dies dient der Sicherstellung des Betriebs und der 
                  Abwehr von Angriffen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO 
                  (berechtigtes Interesse). Weitere Informationen finden Sie in der{" "}
                  <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">
                    Datenschutzerklärung von Cloudflare
                  </a>.
                </p>

                <h3>4. Cookies</h3>
                <p>
                  Diese Webseite verwendet <strong>keine Cookies</strong> und setzt keine 
                  Tracking- oder Analysetools ein. Es findet kein Tracking Ihres Nutzerverhaltens statt.
                </p>

                <h3>5. Keine Analyse- oder Werbedienste</h3>
                <p>
                  Es werden keine Analyse-Tools (wie Google Analytics), Werbenetzwerke, Social-Media-Plugins 
                  oder sonstige Dienste eingebunden, die personenbezogene Daten erheben.
                </p>

                <h3>6. Schriftarten</h3>
                <p>
                  Diese Webseite verwendet selbst gehostete Schriftarten (DM Sans, JetBrains Mono). 
                  Die Schriftdateien werden direkt von unserem Server geladen. Es findet <strong>keine 
                  Verbindung zu Google Fonts oder anderen externen Schriftarten-Diensten</strong> statt. 
                  Ihre IP-Adresse wird nicht an Dritte übermittelt.
                </p>

                <h3>7. Ihre Rechte</h3>
                <p>
                  Da wir keine personenbezogenen Daten speichern oder verarbeiten (abgesehen von den 
                  technisch notwendigen Verbindungsdaten beim Seitenaufruf durch den Hoster), entfallen 
                  in der Regel Auskunfts-, Berichtigungs- und Löschungsansprüche. Sollten Sie dennoch 
                  Fragen haben, können Sie sich jederzeit an die oben genannte E-Mail-Adresse wenden.
                </p>
                <p>
                  Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, 
                  wenn Sie der Ansicht sind, dass die Verarbeitung Ihrer Daten gegen die DSGVO verstößt.
                </p>

                <h3>8. Änderungen</h3>
                <p>
                  Wir behalten uns vor, diese Datenschutzerklärung anzupassen, um sie an geänderte 
                  Rechtslagen oder Änderungen der Webseite anzupassen. Es gilt die jeweils aktuelle 
                  auf dieser Seite veröffentlichte Fassung.
                </p>

                <p><em>Stand: März 2026</em></p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
