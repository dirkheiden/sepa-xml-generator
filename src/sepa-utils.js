// ─── SEPA Utility Functions ─────────────────────────────────────────────────
// Extracted for testability. Used by App.jsx and tests/sepa.test.js

export function cleanIBAN(iban) {
  return (iban || "").replace(/\s+/g, "").toUpperCase();
}

export function validateIBAN(iban) {
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

export function formatIBAN(iban) {
  const clean = cleanIBAN(iban);
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

export function validateBIC(bic) {
  const clean = (bic || "").replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(clean);
}

export function validateCreditorId(id) {
  const clean = (id || "").replace(/\s+/g, "").toUpperCase();
  if (clean.length < 9 || clean.length > 35) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3,31}$/.test(clean)) return false;
  // Gläubiger-ID Mod-97: rearrange = national_id (pos 7+) + country (pos 0-1) + check digits (pos 2-3)
  // Business code at pos 4-6 is skipped for checksum calculation
  const numericStr = (clean.slice(7) + clean.slice(0, 2) + clean.slice(2, 4))
    .split("")
    .map((c) => (c >= "A" && c <= "Z" ? (c.charCodeAt(0) - 55).toString() : c))
    .join("");
  let remainder = numericStr;
  while (remainder.length > 2) {
    const block = remainder.slice(0, 9);
    remainder = (parseInt(block, 10) % 97).toString() + remainder.slice(block.length);
  }
  return parseInt(remainder, 10) % 97 === 1;
}

export function escapeXml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function formatAmount(val) {
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(",", "."));
  if (isNaN(num) || num <= 0) return null;
  return num.toFixed(2);
}

export function generateMsgId() {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MSG${ts}${rand}`;
}

export function generatePmtInfId() {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `PMT${rand}`;
}

export function formatDateISO(date) {
  return date.toISOString().split("T")[0];
}

export function formatDateTime(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "");
}

// ─── SEPA Pain Format Definitions ───────────────────────────────────────────

export const PAIN_FORMATS = {
  debit: [
    { value: "pain.008.001.02", label: "pain.008.001.02", desc: "Ältere Version — hohe Kompatibilität" },
    { value: "pain.008.001.08", label: "pain.008.001.08", desc: "Aktuelle Version — empfohlen", recommended: true },
  ],
  credit: [
    { value: "pain.001.001.03", label: "pain.001.001.03", desc: "Ältere Version — hohe Kompatibilität" },
    { value: "pain.001.001.09", label: "pain.001.001.09", desc: "Aktuelle Version — empfohlen", recommended: true },
  ],
};

// ─── SEPA XML Generation (Direct Debit) ─────────────────────────────────────

export function generateSEPAXML(entries, config) {
  const msgId = generateMsgId();
  const pmtInfId = generatePmtInfId();
  const creDtTm = formatDateTime(new Date());
  const nbOfTxs = entries.length;
  const ctrlSum = entries.reduce((sum, e) => sum + parseFloat(e.amount), 0).toFixed(2);
  const reqdColltnDt = config.collectionDate || formatDateISO(new Date(Date.now() + 5 * 86400000));

  const seqTp = config.sequenceType || "RCUR";
  const lcl = config.localInstrument || "CORE";
  const painFormat = config.painFormat || "pain.008.001.02";
  const ns = `urn:iso:std:iso:20022:tech:xsd:${painFormat}`;
  const rootTag = "CstmrDrctDbtInitn";
  const useBICFI = painFormat === "pain.008.001.08";
  const bicTag = useBICFI ? "BICFI" : "BIC";

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${ns}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${ns} ${painFormat}.xsd">
  <${rootTag}>
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
          <${bicTag}>${escapeXml(config.creditorBIC.toUpperCase())}</${bicTag}>` : `
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
            <${bicTag}>${escapeXml(entry.bic.toUpperCase())}</${bicTag}>` : `
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
  </${rootTag}>
</Document>`;

  return xml;
}

// ─── SEPA XML Generation (Credit Transfer) ──────────────────────────────────

export function generateSEPACreditTransferXML(entries, config) {
  const msgId = generateMsgId();
  const pmtInfId = generatePmtInfId();
  const creDtTm = formatDateTime(new Date());
  const nbOfTxs = entries.length;
  const ctrlSum = entries.reduce((sum, e) => sum + parseFloat(e.amount), 0).toFixed(2);
  const reqdExctnDt = config.executionDate || formatDateISO(new Date(Date.now() + 2 * 86400000));

  const painFormat = config.painFormat || "pain.001.001.03";
  const ns = `urn:iso:std:iso:20022:tech:xsd:${painFormat}`;
  const rootTag = "CstmrCdtTrfInitn";
  const useBICFI = painFormat === "pain.001.001.09";
  const bicTag = useBICFI ? "BICFI" : "BIC";

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="${ns}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${ns} ${painFormat}.xsd">
  <${rootTag}>
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
          <${bicTag}>${escapeXml(config.creditorBIC.toUpperCase())}</${bicTag}>` : `
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
            <${bicTag}>${escapeXml(entry.bic.toUpperCase())}</${bicTag}>` : `
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
  </${rootTag}>
</Document>`;

  return xml;
}

// ─── CSV Parser ─────────────────────────────────────────────────────────────

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { fields: [], data: [] };

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
    if (vals.every((v) => !v)) continue;
    const row = {};
    fields.forEach((f, j) => {
      row[f] = vals[j] || "";
    });
    data.push(row);
  }
  return { fields, data };
}
