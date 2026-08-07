"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TopNavigation } from "../components/TopNavigation";

type CaseStatus =
  | "nowa"
  | "brakuje-dokumentow"
  | "w-analizie"
  | "gotowa-do-pisma"
  | "wyslane"
  | "zamknieta";

type DocumentKey =
  | "umowa"
  | "formularz"
  | "harmonogram"
  | "historiaSplaty"
  | "potwierdzenieSplaty"
  | "aneksy";

type CalculatorInput = {
  contractAmount: string;
  contractDate: string;
  interestRate: string;
  isPaidOff: "TAK" | "NIE";
  months: string;
  paidOutAmount: string;
  rrso: string;
};

type CalculatorResult = {
  estimatedClaim: number;
  financedCosts: number;
  installmentSaving: number;
  skdInstallment: number;
  skdTotal: number;
  standardCosts: number;
  standardInstallment: number;
  standardTotal: number;
};

type SavedCalculation = {
  input: CalculatorInput;
  result: CalculatorResult;
  savedAt: string;
};

type ContractAnalysis = {
  analyzedAt: string;
  clientCard?: string;
  fileLabel: string;
  pages: number;
  report: string;
  sources: string[];
};

type ClientCase = {
  amounts: {
    capital: string;
    commission: string;
    insurance: string;
    paidSum: string;
  };
  analysis: ContractAnalysis | null;
  bank: string;
  calculation: SavedCalculation | null;
  createdAt: string;
  documents: Record<DocumentKey, boolean>;
  id: string;
  notes: string;
  product: string;
  reference: string;
  status: CaseStatus;
  updatedAt: string;
};

const storageKey = "agent-skd-anonymous-cases";

const statuses: Array<{ id: CaseStatus; label: string }> = [
  { id: "nowa", label: "Nowa" },
  { id: "brakuje-dokumentow", label: "Brakuje dokumentów" },
  { id: "w-analizie", label: "W analizie" },
  { id: "gotowa-do-pisma", label: "Gotowa do pisma" },
  { id: "wyslane", label: "Wysłane" },
  { id: "zamknieta", label: "Zamknięta" },
];

const documents: Array<{ id: DocumentKey; label: string }> = [
  { id: "umowa", label: "Umowa kredytu" },
  { id: "formularz", label: "Formularz informacyjny" },
  { id: "harmonogram", label: "Harmonogram spłat" },
  { id: "historiaSplaty", label: "Historia spłaty" },
  { id: "potwierdzenieSplaty", label: "Potwierdzenie całkowitej spłaty" },
  { id: "aneksy", label: "Aneksy / załączniki" },
];

const emptyDocuments = documents.reduce(
  (result, document) => ({ ...result, [document.id]: false }),
  {} as Record<DocumentKey, boolean>,
);

const defaultCalculatorInput: CalculatorInput = {
  contractAmount: "",
  contractDate: "",
  interestRate: "",
  isPaidOff: "NIE",
  months: "",
  paidOutAmount: "",
  rrso: "",
};

function getEmptyCase(): ClientCase {
  return {
    amounts: { capital: "", commission: "", insurance: "", paidSum: "" },
    analysis: null,
    bank: "",
    calculation: null,
    createdAt: "",
    documents: { ...emptyDocuments },
    id: "",
    notes: "",
    product: "kredyt gotówkowy",
    reference: "",
    status: "nowa",
    updatedAt: "",
  };
}

function createCaseId() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `SKD-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    currency: "PLN",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function pmt(monthlyRate: number, periods: number, presentValue: number) {
  if (periods <= 0) return 0;
  if (monthlyRate === 0) return presentValue / periods;
  return (presentValue * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -periods));
}

function calculateSkd(input: CalculatorInput): CalculatorResult {
  const contractAmount = parseNumber(input.contractAmount);
  const capital = parseNumber(input.paidOutAmount);
  const periods = Math.max(0, Math.round(parseNumber(input.months)));
  const monthlyRate = parseNumber(input.interestRate) / 100 / 12;
  const standardInstallment = Math.round(pmt(monthlyRate, periods, contractAmount) * 100) / 100;
  const standardTotal = Math.round(standardInstallment * periods * 100) / 100;
  const skdInstallment = periods > 0 ? Math.round((capital / periods) * 100) / 100 : 0;

  return {
    estimatedClaim: Math.round((standardTotal - capital) * 100) / 100,
    financedCosts: Math.max(0, contractAmount - capital),
    installmentSaving: Math.round((standardInstallment - skdInstallment) * 100) / 100,
    skdInstallment,
    skdTotal: capital,
    standardCosts: Math.round((standardTotal - capital) * 100) / 100,
    standardInstallment,
    standardTotal,
  };
}

function detectPersonalData(value: string) {
  const warnings: string[] = [];
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) warnings.push("adres e-mail");
  if (/(?:\+?48)?[\s-]?(?:\d[\s-]?){9}/.test(value)) warnings.push("numer telefonu");
  if (/\b\d{11}\b/.test(value)) warnings.push("PESEL");
  return warnings;
}

function redactContractText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[USUNIĘTO E-MAIL]")
    .replace(/\b\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, "[USUNIĘTO NR RACHUNKU]")
    .replace(/\b\d{11}\b/g, "[USUNIĘTO PESEL]")
    .replace(/(?:\+?48)?[\s-]?(?:\d[\s-]?){9}/g, "[USUNIĘTO TELEFON]")
    .replace(/((?:imię i nazwisko|nazwisko i imię|imię|nazwisko)\s*[:\-]?\s*)([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+){0,2})/g, "$1[USUNIĘTO]")
    .replace(/((?:nr|numer)\s+(?:dowodu|dokumentu tożsamości)\s*[:\-]?\s*)[A-Z0-9]+/gi, "$1[USUNIĘTO]");
}

function cleanPdfText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractPdfTextInBrowser(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc =
    pdfjs.GlobalWorkerOptions.workerSrc ||
    `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.mjs`;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    disableFontFace: true,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      page.cleanup();
    }
    return { pages: pdf.numPages, text: cleanPdfText(pages.join("\n\n")) };
  } finally {
    await loadingTask.destroy();
  }
}

function normalizeCase(value: Partial<ClientCase>): ClientCase {
  const fallback = getEmptyCase();
  return {
    ...fallback,
    ...value,
    amounts: { ...fallback.amounts, ...(value.amounts ?? {}) },
    analysis: value.analysis ?? null,
    calculation: value.calculation ?? null,
    documents: { ...fallback.documents, ...(value.documents ?? {}) },
  };
}

function readCases() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? (JSON.parse(raw) as Partial<ClientCase>[]) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeCase) : [];
  } catch {
    return [];
  }
}

export default function CasesPage() {
  const [cases, setCases] = useState<ClientCase[]>([]);
  const [draft, setDraft] = useState<ClientCase>(getEmptyCase);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [calculator, setCalculator] = useState<CalculatorInput>(defaultCalculatorInput);
  const [draftCalculator, setDraftCalculator] = useState<CalculatorInput>(defaultCalculatorInput);
  const [pdfError, setPdfError] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingCard, setIsGeneratingCard] = useState(false);
  const [savedNotice, setSavedNotice] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setCases(readCases()), []);
  useEffect(() => window.localStorage.setItem(storageKey, JSON.stringify(cases)), [cases]);

  const selectedCase = cases.find((item) => item.id === selectedCaseId) ?? cases[0] ?? null;

  useEffect(() => {
    if (!selectedCase) {
      setCalculator(defaultCalculatorInput);
      return;
    }

    setCalculator(
      selectedCase.calculation?.input ?? {
        ...defaultCalculatorInput,
        contractAmount: String(
          parseNumber(selectedCase.amounts.capital) +
            parseNumber(selectedCase.amounts.commission) +
            parseNumber(selectedCase.amounts.insurance) ||
            "",
        ),
        paidOutAmount: selectedCase.amounts.capital,
      },
    );
    setPdfError("");
    setPdfStatus("");
  }, [selectedCase?.id]);

  const calculatorResult = useMemo(() => calculateSkd(calculator), [calculator]);
  const draftCalculatorResult = useMemo(
    () => calculateSkd(draftCalculator),
    [draftCalculator],
  );
  const hasDraftCalculation = Boolean(
    draftCalculator.contractAmount.trim() ||
      draftCalculator.paidOutAmount.trim() ||
      draftCalculator.interestRate.trim() ||
      draftCalculator.months.trim(),
  );
  const personalDataWarnings = detectPersonalData(`${draft.reference} ${draft.notes}`);
  const missingDocuments = selectedCase
    ? documents.filter((document) => !selectedCase.documents[document.id])
    : [];

  const stats = useMemo(
    () => ({
      active: cases.filter((item) => item.status !== "zamknieta").length,
      analyzed: cases.filter((item) => item.analysis).length,
      calculated: cases.filter((item) => item.calculation).length,
      total: cases.length,
    }),
    [cases],
  );

  function updateDraft<K extends keyof ClientCase>(key: K, value: ClientCase[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateDraftAmount(
    key: keyof ClientCase["amounts"],
    value: string,
  ) {
    const nextAmounts = { ...draft.amounts, [key]: value };
    updateDraft("amounts", nextAmounts);

    if (key === "capital" || key === "commission" || key === "insurance") {
      const contractAmount =
        parseNumber(nextAmounts.capital) +
        parseNumber(nextAmounts.commission) +
        parseNumber(nextAmounts.insurance);

      setDraftCalculator((current) => ({
        ...current,
        contractAmount: contractAmount > 0 ? String(contractAmount) : "",
        paidOutAmount:
          key === "capital" ? value : current.paidOutAmount || nextAmounts.capital,
      }));
    }
  }

  function editCase(item: ClientCase) {
    setDraft(normalizeCase(item));
    setSelectedCaseId(item.id);
    setSavedNotice("");
    setDraftCalculator(
      item.calculation?.input ?? {
        ...defaultCalculatorInput,
        contractAmount: String(
          parseNumber(item.amounts.capital) +
            parseNumber(item.amounts.commission) +
            parseNumber(item.amounts.insurance) ||
            "",
        ),
        paidOutAmount: item.amounts.capital,
      },
    );
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function updateSelectedCase(updater: (item: ClientCase) => ClientCase) {
    if (!selectedCase) return;
    setCases((current) =>
      current.map((item) =>
        item.id === selectedCase.id
          ? { ...updater(item), updatedAt: new Date().toISOString() }
          : item,
      ),
    );
  }

  function saveCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (personalDataWarnings.length) return;
    const now = new Date().toISOString();
    const generatedId = draft.id || createCaseId();
    const savedAt = new Date().toISOString();
    const item = {
      ...draft,
      amounts: {
        ...draft.amounts,
        capital: draftCalculator.paidOutAmount || draft.amounts.capital,
      },
      calculation: hasDraftCalculation
        ? {
            input: draftCalculator,
            result: draftCalculatorResult,
            savedAt,
          }
        : draft.calculation,
      createdAt: draft.createdAt || now,
      id: generatedId,
      reference: draft.reference.trim() || generatedId,
      updatedAt: now,
    };
    setCases((current) =>
      current.some((existing) => existing.id === item.id)
        ? current.map((existing) => (existing.id === item.id ? item : existing))
        : [item, ...current],
    );
    setSelectedCaseId(item.id);
    setDraft(getEmptyCase());
    setDraftCalculator(defaultCalculatorInput);
    setSavedNotice(`Sprawa ${item.reference} została zapisana. Formularz jest gotowy na kolejną sprawę.`);
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function saveCalculation() {
    if (!selectedCase) return;
    const savedAt = new Date().toISOString();
    updateSelectedCase((item) => ({
      ...item,
      amounts: { ...item.amounts, capital: calculator.paidOutAmount },
      calculation: { input: calculator, result: calculatorResult, savedAt },
    }));
  }

  async function analyzePdf(file: File) {
    if (!selectedCase) return;
    setPdfError("");
    setPdfStatus("Odczytuję PDF na tym urządzeniu…");
    setIsAnalyzing(true);

    try {
      if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
        throw new Error("Dodaj plik PDF z umową klienta.");
      }
      if (file.size > 15 * 1024 * 1024) {
        throw new Error("PDF jest większy niż 15 MB. Skompresuj go lub podziel na części.");
      }

      const extracted = await extractPdfTextInBrowser(file);
      if (extracted.text.length < 100) {
        throw new Error("Nie udało się odczytać tekstu. Jeśli to skan, potrzebny jest PDF po OCR.");
      }

      setPdfStatus("Maskuję dane osobowe i porównuję umowę z art. 30…");
      const response = await fetch("/api/analyze-skd-contract", {
        body: JSON.stringify({
          bank: selectedCase.bank,
          calculationSummary: `Wstępna wartość korzyści: ${formatMoney(calculatorResult.estimatedClaim)}; kwota kredytu: ${calculator.contractAmount || "brak"}; kapitał wypłacony: ${calculator.paidOutAmount || "brak"}; okres: ${calculator.months || "brak"} miesięcy; RRSO: ${calculator.rrso || "brak"}%.`,
          contractText: redactContractText(extracted.text),
          product: selectedCase.product,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as {
        analysis?: string;
        clientCard?: string;
        error?: string;
        sources?: string[];
      };
      if (!response.ok || !data.analysis) {
        throw new Error(data.error || "Nie udało się przeanalizować umowy.");
      }

      const analyzedAt = new Date().toISOString();
      updateSelectedCase((item) => ({
        ...item,
        analysis: {
          analyzedAt,
          clientCard: data.clientCard ?? "",
          fileLabel: "Umowa PDF — nazwa pliku nie została zapisana",
          pages: extracted.pages,
          report: data.analysis ?? "",
          sources: data.sources ?? [],
        },
        documents: { ...item.documents, umowa: true },
        status: item.status === "nowa" ? "w-analizie" : item.status,
      }));
      setPdfStatus("Analiza została zapisana w tej sprawie.");
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Nie udało się przeanalizować PDF.");
      setPdfStatus("");
    } finally {
      setIsAnalyzing(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  }

  async function generateClientCard() {
    if (!selectedCase?.analysis) return;
    setPdfError("");
    setIsGeneratingCard(true);

    try {
      const response = await fetch("/api/analyze-skd-contract", {
        body: JSON.stringify({
          bank: selectedCase.bank,
          calculationSummary: `Wstępna wartość korzyści: ${formatMoney(selectedCase.calculation?.result.estimatedClaim ?? 0)}; kwota kredytu: ${selectedCase.calculation?.input.contractAmount || "brak"}; kapitał wypłacony: ${selectedCase.calculation?.input.paidOutAmount || "brak"}; okres: ${selectedCase.calculation?.input.months || "brak"} miesięcy; RRSO: ${selectedCase.calculation?.input.rrso || "brak"}%.`,
          existingAnalysis: selectedCase.analysis.report,
          product: selectedCase.product,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as {
        clientCard?: string;
        error?: string;
      };
      if (!response.ok || !data.clientCard) {
        throw new Error(data.error || "Nie udało się przygotować fiszki klienta.");
      }

      updateSelectedCase((item) => ({
        ...item,
        analysis: item.analysis
          ? { ...item.analysis, clientCard: data.clientCard }
          : null,
      }));
    } catch (error) {
      setPdfError(
        error instanceof Error
          ? error.message
          : "Nie udało się przygotować fiszki klienta.",
      );
    } finally {
      setIsGeneratingCard(false);
    }
  }

  function deleteCase(id: string) {
    if (!window.confirm("Usunąć tę anonimową sprawę z tego urządzenia?")) return;
    setCases((current) => current.filter((item) => item.id !== id));
    if (selectedCaseId === id) setSelectedCaseId(null);
    if (draft.id === id) {
      setDraft(getEmptyCase());
      setDraftCalculator(defaultCalculatorInput);
    }
  }

  return (
    <main className="chat-shell cases-shell">
      <TopNavigation />
      <section className="cases-panel" aria-label="Anonimowe sprawy klientów">
        <header className="cases-hero">
          <div>
            <p className="eyebrow">Bez danych osobowych</p>
            <h1>📂 Sprawy klientów SKD</h1>
            <p>Jedna sprawa łączy dokumenty, kalkulator roszczenia i analizę umowy według art. 30 ustawy.</p>
          </div>
          <div className="cases-privacy-badge">
            <strong>Anonimowo</strong>
            <span>PDF i tekst umowy nie są zapisywane</span>
          </div>
        </header>

        <section className="cases-stats" aria-label="Statystyki spraw">
          <article><strong>{stats.total}</strong><span>spraw razem</span></article>
          <article><strong>{stats.active}</strong><span>aktywnych</span></article>
          <article><strong>{stats.calculated}</strong><span>z kalkulacją</span></article>
          <article><strong>{stats.analyzed}</strong><span>z analizą PDF</span></article>
        </section>

        <section className="cases-layout">
          <form className="cases-form" onSubmit={saveCase} ref={formRef}>
            <h2>{draft.id ? "Edytuj sprawę" : "Dodaj anonimową sprawę"}</h2>
            {savedNotice ? <p className="cases-success">{savedNotice}</p> : null}
            <label>
              Numer roboczy / pseudonim
              <input onChange={(event) => updateDraft("reference", event.target.value)} placeholder="Np. SKD-ALIOR-001" value={draft.reference} />
            </label>
            <div className="cases-form-grid">
              <label>Bank<input onChange={(event) => updateDraft("bank", event.target.value)} placeholder="Np. Alior Bank" value={draft.bank} /></label>
              <label>Produkt<input onChange={(event) => updateDraft("product", event.target.value)} value={draft.product} /></label>
            </div>
            <label>
              Status
              <select onChange={(event) => updateDraft("status", event.target.value as CaseStatus)} value={draft.status}>
                {statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
              </select>
            </label>
            <fieldset className="cases-documents">
              <legend>Dokumenty</legend>
              {documents.map((document) => (
                <label key={document.id}>
                  <input checked={draft.documents[document.id]} onChange={(event) => updateDraft("documents", { ...draft.documents, [document.id]: event.target.checked })} type="checkbox" />
                  {document.label}
                </label>
              ))}
            </fieldset>
            <div className="cases-form-grid">
              <label>Kapitał wypłacony<input inputMode="decimal" onChange={(event) => updateDraftAmount("capital", event.target.value)} value={draft.amounts.capital} /></label>
              <label>Suma zapłaconych rat<input inputMode="decimal" onChange={(event) => updateDraftAmount("paidSum", event.target.value)} value={draft.amounts.paidSum} /></label>
              <label>Prowizja<input inputMode="decimal" onChange={(event) => updateDraftAmount("commission", event.target.value)} value={draft.amounts.commission} /></label>
              <label>Ubezpieczenie<input inputMode="decimal" onChange={(event) => updateDraftAmount("insurance", event.target.value)} value={draft.amounts.insurance} /></label>
            </div>

            <section className="cases-inline-calculator" aria-label="Kalkulator przed zapisaniem sprawy">
              <div className="cases-inline-calculator-heading">
                <div>
                  <span>Kalkulator działa przed zapisem</span>
                  <h3>⚖️ Oblicz wstępny wynik</h3>
                </div>
                <strong>{formatMoney(draftCalculatorResult.estimatedClaim)}</strong>
              </div>
              <div className="cases-form-grid">
                <label>Kwota kredytu z umowy<input inputMode="decimal" onChange={(event) => setDraftCalculator((value) => ({ ...value, contractAmount: event.target.value }))} value={draftCalculator.contractAmount} /></label>
                <label>Kwota oddana do dyspozycji<input inputMode="decimal" onChange={(event) => { const value = event.target.value; setDraftCalculator((current) => ({ ...current, paidOutAmount: value })); updateDraft("amounts", { ...draft.amounts, capital: value }); }} value={draftCalculator.paidOutAmount} /></label>
                <label>Oprocentowanie nominalne (%)<input inputMode="decimal" onChange={(event) => setDraftCalculator((value) => ({ ...value, interestRate: event.target.value }))} value={draftCalculator.interestRate} /></label>
                <label>RRSO (%)<input inputMode="decimal" onChange={(event) => setDraftCalculator((value) => ({ ...value, rrso: event.target.value }))} value={draftCalculator.rrso} /></label>
                <label>Okres kredytowania (miesiące)<input inputMode="numeric" onChange={(event) => setDraftCalculator((value) => ({ ...value, months: event.target.value }))} value={draftCalculator.months} /></label>
                <label>Data umowy<input onChange={(event) => setDraftCalculator((value) => ({ ...value, contractDate: event.target.value }))} type="date" value={draftCalculator.contractDate} /></label>
                <label>Czy kredyt spłacony?<select onChange={(event) => setDraftCalculator((value) => ({ ...value, isPaidOff: event.target.value as "TAK" | "NIE" }))} value={draftCalculator.isPaidOff}><option>TAK</option><option>NIE</option></select></label>
              </div>
              <dl>
                <div><dt>Rata standardowa</dt><dd>{formatMoney(draftCalculatorResult.standardInstallment)}</dd></div>
                <div><dt>Rata po SKD</dt><dd>{formatMoney(draftCalculatorResult.skdInstallment)}</dd></div>
                <div><dt>Koszty skredytowane</dt><dd>{formatMoney(draftCalculatorResult.financedCosts)}</dd></div>
              </dl>
              <p>Wynik zmienia się od razu podczas wpisywania i zostanie zapisany razem ze sprawą.</p>
            </section>

            <label>Notatka bez danych osobowych<textarea onChange={(event) => updateDraft("notes", event.target.value)} placeholder="Np. sprawdzić RRSO i kredytowaną prowizję…" value={draft.notes} /></label>
            {personalDataWarnings.length ? <p className="cases-warning">Usuń dane osobowe przed zapisem: {personalDataWarnings.join(", ")}.</p> : null}
            <div className="cases-actions">
              <button disabled={personalDataWarnings.length > 0} type="submit">{draft.id ? "Zapisz sprawę i wynik" : "Dodaj sprawę i zapisz wynik"}</button>
              {draft.id ? <button onClick={() => { setDraft(getEmptyCase()); setDraftCalculator(defaultCalculatorInput); setSavedNotice("Edycja anulowana. Formularz jest pusty."); }} type="button">Anuluj</button> : null}
            </div>
          </form>

          <aside className="cases-board">
            <div className="cases-list">
              <h2>Lista spraw</h2>
              {cases.length ? cases.map((item) => (
                <article className={`cases-list-card ${selectedCase?.id === item.id ? "active" : ""}`} key={item.id}>
                  <button className="cases-list-main" onClick={() => setSelectedCaseId(item.id)} type="button">
                    <strong>{item.reference}</strong>
                    <span>{item.bank || "Bank do uzupełnienia"}</span>
                    <em>{statuses.find((status) => status.id === item.status)?.label}</em>
                  </button>
                  <div className="cases-list-actions" aria-label={`Akcje dla sprawy ${item.reference}`}>
                    <button onClick={() => editCase(item)} type="button">Edytuj</button>
                    <button onClick={() => deleteCase(item.id)} type="button">Usuń</button>
                  </div>
                </article>
              )) : <p className="cases-empty">Dodaj pierwszą sprawę, używając wyłącznie anonimowego oznaczenia.</p>}
            </div>

            <section className="cases-detail">
              {selectedCase ? (
                <>
                  <div className="cases-detail-header">
                    <div><span>Aktywna sprawa</span><h2>{selectedCase.reference}</h2><p>{selectedCase.bank || "Bank nieuzupełniony"} · {selectedCase.product}</p></div>
                    <div className="cases-detail-actions">
                      <button onClick={() => editCase(selectedCase)} type="button">Edytuj</button>
                      <button onClick={() => deleteCase(selectedCase.id)} type="button">Usuń</button>
                    </div>
                  </div>
                  <div className="cases-benefit">
                    <span>Zapisany wynik kalkulatora</span>
                    <strong>{formatMoney(selectedCase.calculation?.result.estimatedClaim ?? 0)}</strong>
                    <small>{selectedCase.calculation ? `zapisano ${new Date(selectedCase.calculation.savedAt).toLocaleString("pl-PL")}` : "uzupełnij kalkulator poniżej"}</small>
                  </div>
                  <div className="cases-next-step">
                    <h3>Następny krok</h3>
                    <p>{missingDocuments.length ? `Brakuje: ${missingDocuments.map((item) => item.label).join(", ")}.` : "Dokumenty są kompletne w checkliście. Przejdź do kalkulacji i analizy umowy."}</p>
                  </div>
                  <ul className="cases-document-list">
                    {documents.map((document) => <li className={selectedCase.documents[document.id] ? "done" : ""} key={document.id}><span>{selectedCase.documents[document.id] ? "✓" : "•"}</span>{document.label}</li>)}
                  </ul>
                </>
              ) : <p className="cases-empty">Wybierz sprawę, aby zobaczyć szczegóły.</p>}
            </section>
          </aside>
        </section>

        {selectedCase ? (
          <section className="case-tools">
            <article className="case-tool-card case-calculator">
              <header>
                <div><p className="eyebrow">Połączony ze sprawą {selectedCase.reference}</p><h2>⚖️ Kalkulator SKD</h2></div>
                {selectedCase.calculation ? <span className="case-saved-badge">✓ wynik zapisany</span> : null}
              </header>
              <div className="case-calculator-grid">
                <div className="case-calculator-fields">
                  <label>Kwota kredytu z umowy<input inputMode="decimal" onChange={(event) => setCalculator((value) => ({ ...value, contractAmount: event.target.value }))} value={calculator.contractAmount} /></label>
                  <label>Kwota oddana do dyspozycji<input inputMode="decimal" onChange={(event) => setCalculator((value) => ({ ...value, paidOutAmount: event.target.value }))} value={calculator.paidOutAmount} /></label>
                  <label>Oprocentowanie nominalne (%)<input inputMode="decimal" onChange={(event) => setCalculator((value) => ({ ...value, interestRate: event.target.value }))} value={calculator.interestRate} /></label>
                  <label>RRSO (%)<input inputMode="decimal" onChange={(event) => setCalculator((value) => ({ ...value, rrso: event.target.value }))} value={calculator.rrso} /></label>
                  <label>Okres kredytowania (miesiące)<input inputMode="numeric" onChange={(event) => setCalculator((value) => ({ ...value, months: event.target.value }))} value={calculator.months} /></label>
                  <label>Data umowy<input onChange={(event) => setCalculator((value) => ({ ...value, contractDate: event.target.value }))} type="date" value={calculator.contractDate} /></label>
                  <label>Czy kredyt spłacony?<select onChange={(event) => setCalculator((value) => ({ ...value, isPaidOff: event.target.value as "TAK" | "NIE" }))} value={calculator.isPaidOff}><option>TAK</option><option>NIE</option></select></label>
                </div>
                <div className="case-calculator-result">
                  <span>Wstępna wartość korzyści</span>
                  <strong>{formatMoney(calculatorResult.estimatedClaim)}</strong>
                  <dl>
                    <div><dt>Rata standardowa</dt><dd>{formatMoney(calculatorResult.standardInstallment)}</dd></div>
                    <div><dt>Rata po SKD</dt><dd>{formatMoney(calculatorResult.skdInstallment)}</dd></div>
                    <div><dt>Koszty skredytowane</dt><dd>{formatMoney(calculatorResult.financedCosts)}</dd></div>
                    <div><dt>Suma rat standardowych</dt><dd>{formatMoney(calculatorResult.standardTotal)}</dd></div>
                  </dl>
                  <button onClick={saveCalculation} type="button">💾 Zapisz wynik w sprawie</button>
                  <small>To wynik orientacyjny. Nie potwierdza prawa do SKD bez analizy umowy.</small>
                </div>
              </div>
            </article>

            <article className="case-tool-card case-contract-analysis">
              <header>
                <div><p className="eyebrow">Weryfikacja dokumentu</p><h2>📄 Analiza umowy PDF — art. 30</h2></div>
                {selectedCase.analysis ? <span className="case-saved-badge">✓ analiza zapisana</span> : null}
              </header>
              <div className="case-pdf-zone">
                <input accept="application/pdf,.pdf" aria-label="Dodaj umowę PDF" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void analyzePdf(file); }} ref={pdfInputRef} type="file" />
                <button disabled={isAnalyzing} onClick={() => pdfInputRef.current?.click()} type="button">{isAnalyzing ? "Analizuję umowę…" : "＋ Dodaj umowę klienta w PDF"}</button>
                <div>
                  <strong>Ochrona danych</strong>
                  <p>Plik nie jest zapisywany. Tekst jest odczytywany w przeglądarce, typowe dane osobowe są maskowane, a w sprawie zapisuje się tylko raport.</p>
                </div>
              </div>
              {pdfStatus ? <p className="case-analysis-status">{pdfStatus}</p> : null}
              {pdfError ? <p className="cases-warning">{pdfError}</p> : null}
              {selectedCase.analysis ? (
                <>
                  <section className="case-analysis-report">
                    <div className="case-analysis-meta">
                      <span>{selectedCase.analysis.fileLabel}</span>
                      <span>{selectedCase.analysis.pages} str.</span>
                      <span>{new Date(selectedCase.analysis.analyzedAt).toLocaleString("pl-PL")}</span>
                    </div>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedCase.analysis.report}</ReactMarkdown>
                    <footer><strong>Źródła z bazy wiedzy:</strong> {selectedCase.analysis.sources.join(", ") || "brak nazw źródeł"}</footer>
                  </section>

                  {selectedCase.analysis.clientCard ? (
                    <section className="case-client-card" aria-label="Fiszka klienta">
                      <header>
                        <div>
                          <p className="eyebrow">Podsumowanie gotowe do rozmowy</p>
                          <h2>🗂️ Fiszka klienta — {selectedCase.reference}</h2>
                        </div>
                        <span>bez danych osobowych</span>
                      </header>
                      <div className="case-client-card-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedCase.analysis.clientCard}</ReactMarkdown>
                      </div>
                    </section>
                  ) : (
                    <section className="case-client-card-empty">
                      <div>
                        <h3>🗂️ Dodaj fiszkę do tej analizy</h3>
                        <p>Ta sprawa została przeanalizowana przed dodaniem fiszek. Możesz utworzyć ją teraz z zapisanego raportu i kalkulacji.</p>
                      </div>
                      <button disabled={isGeneratingCard} onClick={() => void generateClientCard()} type="button">
                        {isGeneratingCard ? "Przygotowuję fiszkę…" : "Wygeneruj fiszkę klienta"}
                      </button>
                    </section>
                  )}
                </>
              ) : <p className="cases-empty">Dodaj PDF. Agent porówna odczytaną umowę z art. 30 zapisanym w bazie wiedzy i wskaże elementy do ręcznej weryfikacji.</p>}
            </article>
          </section>
        ) : null}
      </section>
    </main>
  );
}
