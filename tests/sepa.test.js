import { describe, it, expect } from "vitest";
import {
  cleanIBAN, validateIBAN, formatIBAN, validateBIC, validateCreditorId,
  escapeXml, formatAmount, generateMsgId, generatePmtInfId, formatDateISO, formatDateTime,
  PAIN_FORMATS, generateSEPAXML, generateSEPACreditTransferXML, parseCSV,
} from "../src/sepa-utils.js";

// ─── IBAN Tests ─────────────────────────────────────────────────────────────

describe("cleanIBAN", () => {
  it("removes spaces and uppercases", () => {
    expect(cleanIBAN("de89 3704 0044 0532 0130 00")).toBe("DE89370400440532013000");
  });
  it("handles null/undefined", () => {
    expect(cleanIBAN(null)).toBe("");
    expect(cleanIBAN(undefined)).toBe("");
  });
});

describe("validateIBAN", () => {
  it("accepts valid German IBAN", () => {
    expect(validateIBAN("DE89370400440532013000")).toBe(true);
  });
  it("accepts valid German IBAN with spaces", () => {
    expect(validateIBAN("DE89 3704 0044 0532 0130 00")).toBe(true);
  });
  it("accepts valid Dutch IBAN", () => {
    expect(validateIBAN("NL91ABNA0417164300")).toBe(true);
  });
  it("accepts valid Austrian IBAN", () => {
    expect(validateIBAN("AT611904300234573201")).toBe(true);
  });
  it("accepts valid French IBAN", () => {
    expect(validateIBAN("FR7630006000011234567890189")).toBe(true);
  });
  it("rejects IBAN with wrong checksum", () => {
    expect(validateIBAN("DE00370400440532013000")).toBe(false);
  });
  it("rejects too short IBAN", () => {
    expect(validateIBAN("DE89")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(validateIBAN("")).toBe(false);
  });
  it("rejects IBAN with invalid characters", () => {
    expect(validateIBAN("DE89370400440532013!00")).toBe(false);
  });
  it("rejects IBAN starting with numbers", () => {
    expect(validateIBAN("12345678901234567890")).toBe(false);
  });
});

describe("formatIBAN", () => {
  it("formats in groups of 4", () => {
    expect(formatIBAN("DE89370400440532013000")).toBe("DE89 3704 0044 0532 0130 00");
  });
});

// ─── BIC Tests ──────────────────────────────────────────────────────────────

describe("validateBIC", () => {
  it("accepts 8-character BIC", () => {
    expect(validateBIC("COBADEFF")).toBe(true);
  });
  it("accepts 11-character BIC", () => {
    expect(validateBIC("COBADEFFXXX")).toBe(true);
  });
  it("accepts BIC with spaces", () => {
    expect(validateBIC("COBA DEFF XXX")).toBe(true);
  });
  it("accepts lowercase BIC", () => {
    expect(validateBIC("cobadeffxxx")).toBe(true);
  });
  it("rejects too short BIC", () => {
    expect(validateBIC("COBAD")).toBe(false);
  });
  it("rejects 9-character BIC (invalid length)", () => {
    expect(validateBIC("COBADEFFX")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(validateBIC("")).toBe(false);
  });
});

// ─── Creditor ID Tests ──────────────────────────────────────────────────────

describe("validateCreditorId", () => {
  it("accepts valid German Gläubiger-ID", () => {
    expect(validateCreditorId("DE98ZZZ09999999999")).toBe(true);
  });
  it("accepts with spaces", () => {
    expect(validateCreditorId("DE98 ZZZ 09999999999")).toBe(true);
  });
  it("rejects too short ID", () => {
    expect(validateCreditorId("DE98ZZZ")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(validateCreditorId("")).toBe(false);
  });
  it("rejects ID with invalid checksum", () => {
    expect(validateCreditorId("DE00ZZZ09999999999")).toBe(false);
  });
  it("rejects null", () => {
    expect(validateCreditorId(null)).toBe(false);
  });
});

// ─── XML Escaping ───────────────────────────────────────────────────────────

describe("escapeXml", () => {
  it("escapes ampersand", () => {
    expect(escapeXml("A & B")).toBe("A &amp; B");
  });
  it("escapes angle brackets", () => {
    expect(escapeXml("<tag>")).toBe("&lt;tag&gt;");
  });
  it("escapes quotes", () => {
    expect(escapeXml('a"b')).toBe("a&quot;b");
  });
  it("escapes apostrophe", () => {
    expect(escapeXml("it's")).toBe("it&apos;s");
  });
  it("handles null/undefined", () => {
    expect(escapeXml(null)).toBe("");
    expect(escapeXml(undefined)).toBe("");
  });
  it("handles German umlauts (no escaping needed)", () => {
    expect(escapeXml("Müller")).toBe("Müller");
  });
});

// ─── Amount Formatting ──────────────────────────────────────────────────────

describe("formatAmount", () => {
  it("formats integer", () => {
    expect(formatAmount(120)).toBe("120.00");
  });
  it("formats float", () => {
    expect(formatAmount(59.9)).toBe("59.90");
  });
  it("formats German comma notation string", () => {
    expect(formatAmount("120,50")).toBe("120.50");
  });
  it("formats dot notation string", () => {
    expect(formatAmount("99.99")).toBe("99.99");
  });
  it("returns null for zero", () => {
    expect(formatAmount(0)).toBe(null);
  });
  it("returns null for negative", () => {
    expect(formatAmount(-10)).toBe(null);
  });
  it("returns null for non-numeric string", () => {
    expect(formatAmount("abc")).toBe(null);
  });
  it("returns null for empty string", () => {
    expect(formatAmount("")).toBe(null);
  });
});

// ─── ID Generation ──────────────────────────────────────────────────────────

describe("generateMsgId", () => {
  it("starts with MSG", () => {
    expect(generateMsgId()).toMatch(/^MSG/);
  });
  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateMsgId()));
    expect(ids.size).toBe(100);
  });
});

describe("generatePmtInfId", () => {
  it("starts with PMT", () => {
    expect(generatePmtInfId()).toMatch(/^PMT/);
  });
});

// ─── Date Formatting ────────────────────────────────────────────────────────

describe("formatDateISO", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(formatDateISO(new Date("2025-03-15T10:30:00Z"))).toBe("2025-03-15");
  });
});

describe("formatDateTime", () => {
  it("formats without milliseconds", () => {
    const dt = formatDateTime(new Date("2025-03-15T10:30:45.123Z"));
    expect(dt).toBe("2025-03-15T10:30:45");
    expect(dt).not.toContain(".");
  });
});

// ─── Pain Format Definitions ────────────────────────────────────────────────

describe("PAIN_FORMATS", () => {
  it("has debit formats", () => {
    expect(PAIN_FORMATS.debit.length).toBeGreaterThanOrEqual(2);
    expect(PAIN_FORMATS.debit.map(f => f.value)).toContain("pain.008.001.02");
    expect(PAIN_FORMATS.debit.map(f => f.value)).toContain("pain.008.001.08");
  });
  it("has credit formats", () => {
    expect(PAIN_FORMATS.credit.length).toBeGreaterThanOrEqual(2);
    expect(PAIN_FORMATS.credit.map(f => f.value)).toContain("pain.001.001.03");
    expect(PAIN_FORMATS.credit.map(f => f.value)).toContain("pain.001.001.09");
  });
  it("has one recommended per type", () => {
    expect(PAIN_FORMATS.debit.filter(f => f.recommended).length).toBe(1);
    expect(PAIN_FORMATS.credit.filter(f => f.recommended).length).toBe(1);
  });
});

// ─── CSV Parser ─────────────────────────────────────────────────────────────

describe("parseCSV", () => {
  it("parses semicolon-delimited CSV", () => {
    const csv = "Name;IBAN;Betrag\nMax Mustermann;DE89370400440532013000;120,00";
    const result = parseCSV(csv);
    expect(result.fields).toEqual(["Name", "IBAN", "Betrag"]);
    expect(result.data.length).toBe(1);
    expect(result.data[0].Name).toBe("Max Mustermann");
    expect(result.data[0].Betrag).toBe("120,00");
  });
  it("parses comma-delimited CSV", () => {
    const csv = "Name,IBAN,Amount\nJohn Doe,NL91ABNA0417164300,50.00";
    const result = parseCSV(csv);
    expect(result.data[0].Name).toBe("John Doe");
  });
  it("parses tab-delimited TSV", () => {
    const csv = "Name\tIBAN\tBetrag\nTest\tDE89370400440532013000\t99";
    const result = parseCSV(csv);
    expect(result.data[0].Name).toBe("Test");
  });
  it("handles quoted fields with delimiters", () => {
    const csv = 'Name;Adresse\n"Müller, Hans";"Straße 1; Köln"';
    const result = parseCSV(csv);
    expect(result.data[0].Name).toBe("Müller, Hans");
    expect(result.data[0].Adresse).toBe("Straße 1; Köln");
  });
  it("handles escaped quotes", () => {
    const csv = 'Name;Wert\n"Er sagte ""Hallo""";42';
    const result = parseCSV(csv);
    expect(result.data[0].Name).toBe('Er sagte "Hallo"');
  });
  it("skips empty rows", () => {
    const csv = "Name;Betrag\nAlice;10\n\n\nBob;20";
    const result = parseCSV(csv);
    expect(result.data.length).toBe(2);
  });
  it("returns empty for empty input", () => {
    const result = parseCSV("");
    expect(result.fields).toEqual([]);
    expect(result.data).toEqual([]);
  });
});

// ─── XML Generation: Direct Debit ───────────────────────────────────────────

describe("generateSEPAXML", () => {
  const baseConfig = {
    creditorName: "Turnverein Test e.V.",
    creditorIBAN: "DE89370400440532013000",
    creditorBIC: "COBADEFFXXX",
    creditorId: "DE98ZZZ09999999999",
    collectionDate: "2025-04-01",
    sequenceType: "RCUR",
    localInstrument: "CORE",
    batchBooking: true,
    defaultPurpose: "Mitgliedsbeitrag 2025",
  };

  const baseEntries = [{
    name: "Max Mustermann",
    iban: "DE27100777770209299700",
    bic: "DEUTDEFFXXX",
    amount: "120.00",
    mandateId: "MND-001",
    mandateDate: "2024-01-01",
    purpose: "Beitrag",
    endToEndId: "",
  }];

  it("generates valid XML for pain.008.001.02", () => {
    const xml = generateSEPAXML(baseEntries, { ...baseConfig, painFormat: "pain.008.001.02" });
    expect(xml).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02"');
    expect(xml).toContain("<CstmrDrctDbtInitn>");
    expect(xml).toContain("<PmtMtd>DD</PmtMtd>");
    expect(xml).toContain("<BIC>COBADEFFXXX</BIC>");
    expect(xml).toContain("<BIC>DEUTDEFFXXX</BIC>");
    expect(xml).toContain("<IBAN>DE89370400440532013000</IBAN>");
    expect(xml).toContain("<IBAN>DE27100777770209299700</IBAN>");
    expect(xml).toContain("<InstdAmt Ccy=\"EUR\">120.00</InstdAmt>");
    expect(xml).toContain("<MndtId>MND-001</MndtId>");
    expect(xml).toContain("<SeqTp>RCUR</SeqTp>");
    expect(xml).toContain("<Cd>CORE</Cd>");
    expect(xml).toContain("<NbOfTxs>1</NbOfTxs>");
    expect(xml).toContain("<CtrlSum>120.00</CtrlSum>");
  });

  it("generates valid XML for pain.008.001.08 with BICFI", () => {
    const xml = generateSEPAXML(baseEntries, { ...baseConfig, painFormat: "pain.008.001.08" });
    expect(xml).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.08"');
    expect(xml).toContain("<BICFI>COBADEFFXXX</BICFI>");
    expect(xml).toContain("<BICFI>DEUTDEFFXXX</BICFI>");
    expect(xml).not.toContain("<BIC>");
  });

  it("uses NOTPROVIDED when BIC is missing", () => {
    const xml = generateSEPAXML(
      [{ ...baseEntries[0], bic: "" }],
      { ...baseConfig, creditorBIC: "", painFormat: "pain.008.001.02" }
    );
    expect(xml).toContain("NOTPROVIDED");
    expect(xml).not.toContain("<BIC>");
  });

  it("escapes XML special characters in names", () => {
    const xml = generateSEPAXML(
      [{ ...baseEntries[0], name: "Müller & Söhne" }],
      { ...baseConfig, painFormat: "pain.008.001.02" }
    );
    expect(xml).toContain("Müller &amp; Söhne");
  });

  it("calculates correct CtrlSum for multiple entries", () => {
    const entries = [
      { ...baseEntries[0], amount: "50.00" },
      { ...baseEntries[0], amount: "75.50" },
      { ...baseEntries[0], amount: "24.50" },
    ];
    const xml = generateSEPAXML(entries, { ...baseConfig, painFormat: "pain.008.001.02" });
    expect(xml).toContain("<CtrlSum>150.00</CtrlSum>");
    expect(xml).toContain("<NbOfTxs>3</NbOfTxs>");
  });

  it("respects all sequence types", () => {
    for (const seqTp of ["FRST", "RCUR", "OOFF", "FNAL"]) {
      const xml = generateSEPAXML(baseEntries, { ...baseConfig, sequenceType: seqTp, painFormat: "pain.008.001.02" });
      expect(xml).toContain(`<SeqTp>${seqTp}</SeqTp>`);
    }
  });

  it("respects all local instruments", () => {
    for (const lcl of ["CORE", "B2B"]) {
      const xml = generateSEPAXML(baseEntries, { ...baseConfig, localInstrument: lcl, painFormat: "pain.008.001.02" });
      expect(xml).toContain(`<Cd>${lcl}</Cd>`);
    }
  });

  it("uses NOTPROVIDED for missing EndToEndId", () => {
    const xml = generateSEPAXML(baseEntries, { ...baseConfig, painFormat: "pain.008.001.02" });
    expect(xml).toContain("<EndToEndId>NOTPROVIDED</EndToEndId>");
  });

  it("uses provided EndToEndId when present", () => {
    const xml = generateSEPAXML(
      [{ ...baseEntries[0], endToEndId: "E2E-123" }],
      { ...baseConfig, painFormat: "pain.008.001.02" }
    );
    expect(xml).toContain("<EndToEndId>E2E-123</EndToEndId>");
  });
});

// ─── XML Generation: Credit Transfer ────────────────────────────────────────

describe("generateSEPACreditTransferXML", () => {
  const baseConfig = {
    creditorName: "Turnverein Test e.V.",
    creditorIBAN: "DE89370400440532013000",
    creditorBIC: "COBADEFFXXX",
    executionDate: "2025-04-01",
    batchBooking: false,
    defaultPurpose: "Zahlung",
  };

  const baseEntries = [{
    name: "Empfänger GmbH",
    iban: "DE27100777770209299700",
    bic: "DEUTDEFFXXX",
    amount: "250.00",
    purpose: "Rechnung 42",
    endToEndId: "INV-42",
  }];

  it("generates valid XML for pain.001.001.03", () => {
    const xml = generateSEPACreditTransferXML(baseEntries, { ...baseConfig, painFormat: "pain.001.001.03" });
    expect(xml).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"');
    expect(xml).toContain("<CstmrCdtTrfInitn>");
    expect(xml).toContain("<PmtMtd>TRF</PmtMtd>");
    expect(xml).toContain("<BIC>COBADEFFXXX</BIC>");
    expect(xml).toContain("<EndToEndId>INV-42</EndToEndId>");
    expect(xml).toContain("<InstdAmt Ccy=\"EUR\">250.00</InstdAmt>");
    expect(xml).toContain("Rechnung 42");
  });

  it("generates valid XML for pain.001.001.09 with BICFI", () => {
    const xml = generateSEPACreditTransferXML(baseEntries, { ...baseConfig, painFormat: "pain.001.001.09" });
    expect(xml).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09"');
    expect(xml).toContain("<BICFI>COBADEFFXXX</BICFI>");
    expect(xml).toContain("<BICFI>DEUTDEFFXXX</BICFI>");
    expect(xml).not.toContain("<BIC>");
  });

  it("uses default purpose when entry has none", () => {
    const xml = generateSEPACreditTransferXML(
      [{ ...baseEntries[0], purpose: "" }],
      { ...baseConfig, painFormat: "pain.001.001.03" }
    );
    expect(xml).toContain("<Ustrd>Zahlung</Ustrd>");
  });

  it("sets BtchBookg correctly", () => {
    const xmlFalse = generateSEPACreditTransferXML(baseEntries, { ...baseConfig, batchBooking: false, painFormat: "pain.001.001.03" });
    expect(xmlFalse).toContain("<BtchBookg>false</BtchBookg>");
    const xmlTrue = generateSEPACreditTransferXML(baseEntries, { ...baseConfig, batchBooking: true, painFormat: "pain.001.001.03" });
    expect(xmlTrue).toContain("<BtchBookg>true</BtchBookg>");
  });
});
