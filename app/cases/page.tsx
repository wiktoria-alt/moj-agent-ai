"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

type ClientCase = {
  amounts: {
    capital: string;
    commission: string;
    insurance: string;
    paidSum: string;
  };
  bank: string;
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
  (accumulator, document) => ({ ...accumulator, [document.id]: false }),
  {} as Record<DocumentKey, boolean>,
);

const emptyCase: ClientCase = {
  amounts: {
    capital: "",
    commission: "",
    insurance: "",
    paidSum: "",
  },
  bank: "",
  createdAt: "",
  documents: emptyDocuments,
  id: "",
  notes: "",
  product: "kredyt gotówkowy",
  reference: "",
  status: "nowa",
  updatedAt: "",
};

function createCaseId() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}${String(date.getDate()).padStart(2, "0")}`;

  return `SKD-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function parseAmount(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    currency: "PLN",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function detectPersonalData(value: string) {
  const warnings: string[] = [];

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)) {
    warnings.push("adres e-mail");
  }

  if (/(?:\+?48)?[\s-]?(?:\d[\s-]?){9}/.test(value)) {
    warnings.push("numer telefonu");
  }

  if (/\b\d{11}\b/.test(value)) {
    warnings.push("PESEL");
  }

  if (/\b[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+ [A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\b/u.test(value)) {
    warnings.push("imię i nazwisko");
  }

  return warnings;
}

function readCases() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as ClientCase[]) : [];
  } catch {
    return [];
  }
}

export default function CasesPage() {
  const [cases, setCases] = useState<ClientCase[]>([]);
  const [draft, setDraft] = useState<ClientCase>(emptyCase);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  useEffect(() => {
    setCases(readCases());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(cases));
  }, [cases]);

  const selectedCase = cases.find((item) => item.id === selectedCaseId) ?? cases[0] ?? null;
  const personalDataWarnings = detectPersonalData(
    `${draft.reference} ${draft.notes}`,
  );
  const missingDocuments = selectedCase
    ? documents.filter((document) => !selectedCase.documents[document.id])
    : [];
  const benefit = selectedCase
    ? Math.max(
        0,
        parseAmount(selectedCase.amounts.paidSum) -
          parseAmount(selectedCase.amounts.capital),
      )
    : 0;

  const stats = useMemo(
    () => ({
      active: cases.filter((item) => item.status !== "zamknieta").length,
      missing: cases.filter((item) => item.status === "brakuje-dokumentow").length,
      ready: cases.filter((item) => item.status === "gotowa-do-pisma").length,
      total: cases.length,
    }),
    [cases],
  );

  function updateDraft<K extends keyof ClientCase>(key: K, value: ClientCase[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function saveCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (personalDataWarnings.length > 0) {
      return;
    }

    const now = new Date().toISOString();
    const caseToSave: ClientCase = {
      ...draft,
      createdAt: draft.createdAt || now,
      id: draft.id || createCaseId(),
      reference: draft.reference.trim() || createCaseId(),
      updatedAt: now,
    };

    setCases((current) => {
      const exists = current.some((item) => item.id === caseToSave.id);
      return exists
        ? current.map((item) => (item.id === caseToSave.id ? caseToSave : item))
        : [caseToSave, ...current];
    });
    setSelectedCaseId(caseToSave.id);
    setDraft(emptyCase);
  }

  function editCase(item: ClientCase) {
    setDraft(item);
    setSelectedCaseId(item.id);
  }

  function deleteCase(id: string) {
    if (!window.confirm("Usunąć tę anonimową sprawę z tego urządzenia?")) {
      return;
    }

    setCases((current) => current.filter((item) => item.id !== id));
    if (selectedCaseId === id) {
      setSelectedCaseId(null);
    }
  }

  return (
    <main className="chat-shell cases-shell">
      <TopNavigation />

      <section className="cases-panel" aria-label="Anonimowe sprawy klientów">
        <header className="cases-hero">
          <div>
            <p className="eyebrow">Bez danych osobowych</p>
            <h1>📂 Sprawy klientów</h1>
            <p>
              Prowadź sprawy SKD po numerze roboczym lub pseudonimie. Nie zapisuj
              imion, nazwisk, PESEL, telefonu, adresu ani e-maila.
            </p>
          </div>
          <div className="cases-privacy-badge">
            <strong>Anonimowo</strong>
            <span>dane zostają w tej przeglądarce</span>
          </div>
        </header>

        <section className="cases-stats" aria-label="Statystyki spraw">
          <article>
            <strong>{stats.total}</strong>
            <span>spraw razem</span>
          </article>
          <article>
            <strong>{stats.active}</strong>
            <span>aktywnych</span>
          </article>
          <article>
            <strong>{stats.missing}</strong>
            <span>brakuje dokumentów</span>
          </article>
          <article>
            <strong>{stats.ready}</strong>
            <span>gotowe do pisma</span>
          </article>
        </section>

        <section className="cases-layout">
          <form className="cases-form" onSubmit={saveCase}>
            <h2>{draft.id ? "Edytuj sprawę" : "Dodaj anonimową sprawę"}</h2>

            <label>
              Numer roboczy / pseudonim bez danych osobowych
              <input
                onChange={(event) => updateDraft("reference", event.target.value)}
                placeholder="Np. SKD-ALIOR-001 albo Klient A"
                value={draft.reference}
              />
            </label>

            <div className="cases-form-grid">
              <label>
                Bank
                <input
                  onChange={(event) => updateDraft("bank", event.target.value)}
                  placeholder="Np. Alior Bank"
                  value={draft.bank}
                />
              </label>
              <label>
                Produkt
                <input
                  onChange={(event) => updateDraft("product", event.target.value)}
                  placeholder="Np. kredyt gotówkowy"
                  value={draft.product}
                />
              </label>
            </div>

            <label>
              Status
              <select
                onChange={(event) =>
                  updateDraft("status", event.target.value as CaseStatus)
                }
                value={draft.status}
              >
                {statuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="cases-documents">
              <legend>Dokumenty</legend>
              {documents.map((document) => (
                <label key={document.id}>
                  <input
                    checked={draft.documents[document.id]}
                    onChange={(event) =>
                      updateDraft("documents", {
                        ...draft.documents,
                        [document.id]: event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  {document.label}
                </label>
              ))}
            </fieldset>

            <div className="cases-form-grid">
              <label>
                Kapitał wypłacony
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    updateDraft("amounts", {
                      ...draft.amounts,
                      capital: event.target.value,
                    })
                  }
                  placeholder="Np. 40000"
                  value={draft.amounts.capital}
                />
              </label>
              <label>
                Suma zapłaconych rat
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    updateDraft("amounts", {
                      ...draft.amounts,
                      paidSum: event.target.value,
                    })
                  }
                  placeholder="Np. 52300"
                  value={draft.amounts.paidSum}
                />
              </label>
              <label>
                Prowizja
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    updateDraft("amounts", {
                      ...draft.amounts,
                      commission: event.target.value,
                    })
                  }
                  placeholder="Np. 6000"
                  value={draft.amounts.commission}
                />
              </label>
              <label>
                Ubezpieczenie
                <input
                  inputMode="decimal"
                  onChange={(event) =>
                    updateDraft("amounts", {
                      ...draft.amounts,
                      insurance: event.target.value,
                    })
                  }
                  placeholder="Np. 1800"
                  value={draft.amounts.insurance}
                />
              </label>
            </div>

            <label>
              Notatka bez danych osobowych
              <textarea
                onChange={(event) => updateDraft("notes", event.target.value)}
                placeholder="Np. brakuje historii spłaty; sprawdzić RRSO i kredytowaną prowizję..."
                value={draft.notes}
              />
            </label>

            {personalDataWarnings.length > 0 ? (
              <p className="cases-warning">
                Usuń dane osobowe przed zapisem: {personalDataWarnings.join(", ")}.
              </p>
            ) : null}

            <div className="cases-actions">
              <button disabled={personalDataWarnings.length > 0} type="submit">
                {draft.id ? "Zapisz zmiany" : "Dodaj sprawę"}
              </button>
              {draft.id ? (
                <button onClick={() => setDraft(emptyCase)} type="button">
                  Anuluj edycję
                </button>
              ) : null}
            </div>
          </form>

          <aside className="cases-board">
            <div className="cases-list">
              <h2>Lista spraw</h2>
              {cases.length ? (
                cases.map((item) => (
                  <button
                    className={selectedCase?.id === item.id ? "active" : ""}
                    key={item.id}
                    onClick={() => setSelectedCaseId(item.id)}
                    type="button"
                  >
                    <strong>{item.reference}</strong>
                    <span>{item.bank || "Bank do uzupełnienia"}</span>
                    <em>{statuses.find((status) => status.id === item.status)?.label}</em>
                  </button>
                ))
              ) : (
                <p className="cases-empty">
                  Dodaj pierwszą anonimową sprawę. Najlepiej użyj oznaczenia typu
                  SKD-001, bez danych klienta.
                </p>
              )}
            </div>

            <section className="cases-detail">
              {selectedCase ? (
                <>
                  <div className="cases-detail-header">
                    <div>
                      <span>Aktywna sprawa</span>
                      <h2>{selectedCase.reference}</h2>
                      <p>
                        {selectedCase.bank || "Bank nieuzupełniony"} ·{" "}
                        {selectedCase.product || "produkt nieuzupełniony"}
                      </p>
                    </div>
                    <div className="cases-detail-actions">
                      <button onClick={() => editCase(selectedCase)} type="button">
                        Edytuj
                      </button>
                      <button onClick={() => deleteCase(selectedCase.id)} type="button">
                        Usuń
                      </button>
                    </div>
                  </div>

                  <div className="cases-benefit">
                    <span>Szacowana korzyść klienta</span>
                    <strong>{formatMoney(benefit)}</strong>
                    <small>suma rat minus kapitał wypłacony</small>
                  </div>

                  <div className="cases-next-step">
                    <h3>Następny krok</h3>
                    {missingDocuments.length ? (
                      <p>
                        Poproś o:{" "}
                        {missingDocuments.map((document) => document.label).join(", ")}.
                      </p>
                    ) : (
                      <p>
                        Dokumenty są kompletne w checkliście. Można przejść do
                        analizy naruszeń i przygotowania pisma.
                      </p>
                    )}
                  </div>

                  <ul className="cases-document-list">
                    {documents.map((document) => (
                      <li
                        className={selectedCase.documents[document.id] ? "done" : ""}
                        key={document.id}
                      >
                        <span>{selectedCase.documents[document.id] ? "✓" : "•"}</span>
                        {document.label}
                      </li>
                    ))}
                  </ul>

                  {selectedCase.notes ? (
                    <div className="cases-note">
                      <h3>Notatka</h3>
                      <p>{selectedCase.notes}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="cases-empty">Wybierz sprawę, aby zobaczyć szczegóły.</p>
              )}
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}
