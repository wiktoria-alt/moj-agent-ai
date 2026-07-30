"use client";

import { useMemo, useState } from "react";
import { TopNavigation } from "../components/TopNavigation";

const monthNames = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
] as const;

function parseNumber(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    currency: "PLN",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatPercent(value: string) {
  const parsed = parseNumber(value);

  return Number.isFinite(parsed) ? `${parsed.toFixed(2).replace(".", ",")}%` : "0,00%";
}

function pmt(monthlyRate: number, periods: number, presentValue: number) {
  if (periods <= 0) {
    return 0;
  }

  if (monthlyRate === 0) {
    return presentValue / periods;
  }

  return (presentValue * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -periods));
}

export default function SkdCalculatorPage() {
  const [contractAmount, setContractAmount] = useState("58000");
  const [paidOutAmount, setPaidOutAmount] = useState("50000");
  const [interestRate, setInterestRate] = useState("9,5");
  const [rrso, setRrso] = useState("12,4");
  const [months, setMonths] = useState("60");
  const [contractDay, setContractDay] = useState("15");
  const [contractMonth, setContractMonth] = useState("Styczeń");
  const [contractYear, setContractYear] = useState("2021");
  const [isPaidOff, setIsPaidOff] = useState("TAK");

  const result = useMemo(() => {
    const amount = parseNumber(contractAmount);
    const capital = parseNumber(paidOutAmount);
    const annualRate = parseNumber(interestRate) / 100;
    const periodCount = Math.max(0, Math.round(parseNumber(months)));
    const monthlyRate = annualRate / 12;
    const standardInstallment = Math.round(pmt(monthlyRate, periodCount, amount) * 100) / 100;
    const standardTotal = Math.round(standardInstallment * periodCount * 100) / 100;
    const standardCosts = Math.round((standardTotal - capital) * 100) / 100;
    const skdInstallment = periodCount > 0 ? Math.round((capital / periodCount) * 100) / 100 : 0;
    const skdTotal = capital;
    const installmentSaving = Math.round((standardInstallment - skdInstallment) * 100) / 100;
    const estimatedClaim = Math.round((standardTotal - skdTotal) * 100) / 100;
    const financedCosts = Math.max(0, amount - capital);

    return {
      financedCosts,
      installmentSaving,
      periodCount,
      skdInstallment,
      skdTotal,
      standardCosts,
      standardInstallment,
      standardTotal,
      estimatedClaim,
    };
  }, [contractAmount, interestRate, months, paidOutAmount]);

  function fillExample() {
    setContractAmount("58000");
    setPaidOutAmount("50000");
    setInterestRate("9,5");
    setRrso("12,4");
    setMonths("60");
    setContractDay("15");
    setContractMonth("Styczeń");
    setContractYear("2021");
    setIsPaidOff("TAK");
  }

  return (
    <main className="chat-shell skd-shell">
      <TopNavigation className="think-nav" />

      <section className="skd-panel" aria-label="Kalkulator SKD">
        <header className="skd-header">
          <div>
            <p className="eyebrow">Sankcja kredytu darmowego</p>
            <h1>⚖️ Wstępny kalkulator roszczenia</h1>
            <p className="agent-description">
              Wpisz dane z umowy, a kalkulator oszacuje różnicę między kredytem standardowym i wariantem po SKD.
            </p>
          </div>
          <button onClick={fillExample} type="button">
            Wstaw przykład z wzoru
          </button>
        </header>

        <section className="skd-workspace">
          <form className="skd-form">
            <div className="skd-form-grid">
              <label>
                <span>Kwota kredytu z umowy</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setContractAmount(event.target.value)}
                  value={contractAmount}
                />
              </label>
              <label>
                <span>Kwota oddana do dyspozycji</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setPaidOutAmount(event.target.value)}
                  value={paidOutAmount}
                />
              </label>
              <label>
                <span>Oprocentowanie nominalne (%)</span>
                <input
                  inputMode="decimal"
                  onChange={(event) => setInterestRate(event.target.value)}
                  value={interestRate}
                />
              </label>
              <label>
                <span>RRSO (%)</span>
                <input inputMode="decimal" onChange={(event) => setRrso(event.target.value)} value={rrso} />
              </label>
              <label>
                <span>Okres kredytowania (miesiące)</span>
                <input inputMode="numeric" onChange={(event) => setMonths(event.target.value)} value={months} />
              </label>
              <label>
                <span>Czy kredyt jest spłacony?</span>
                <select onChange={(event) => setIsPaidOff(event.target.value)} value={isPaidOff}>
                  <option>TAK</option>
                  <option>NIE</option>
                </select>
              </label>
            </div>

            <div className="skd-date-grid">
              <label>
                <span>Dzień umowy</span>
                <input inputMode="numeric" onChange={(event) => setContractDay(event.target.value)} value={contractDay} />
              </label>
              <label>
                <span>Miesiąc umowy</span>
                <select onChange={(event) => setContractMonth(event.target.value)} value={contractMonth}>
                  {monthNames.map((month) => (
                    <option key={month}>{month}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Rok umowy</span>
                <input inputMode="numeric" onChange={(event) => setContractYear(event.target.value)} value={contractYear} />
              </label>
            </div>
          </form>

          <aside className="skd-summary">
            <span>Szacowana wartość korzyści klienta</span>
            <strong>{formatCurrency(result.estimatedClaim)}</strong>
            <p>
              To wstępna kalkulacja na podstawie wzoru: suma rat standardowych minus kapitał oddany do dyspozycji.
            </p>
          </aside>
        </section>

        <section className="skd-results">
          <article className="skd-card">
            <h2>Kredyt standardowy</h2>
            <dl>
              <div>
                <dt>Rata miesięczna</dt>
                <dd>{formatCurrency(result.standardInstallment)}</dd>
              </div>
              <div>
                <dt>Suma wszystkich rat</dt>
                <dd>{formatCurrency(result.standardTotal)}</dd>
              </div>
              <div>
                <dt>Suma kosztów</dt>
                <dd>{formatCurrency(result.standardCosts)}</dd>
              </div>
            </dl>
          </article>

          <article className="skd-card">
            <h2>Sankcja kredytu darmowego</h2>
            <dl>
              <div>
                <dt>Rata po SKD</dt>
                <dd>{formatCurrency(result.skdInstallment)}</dd>
              </div>
              <div>
                <dt>Suma do spłaty</dt>
                <dd>{formatCurrency(result.skdTotal)}</dd>
              </div>
              <div>
                <dt>Koszty po SKD</dt>
                <dd>{formatCurrency(0)}</dd>
              </div>
            </dl>
          </article>

          <article className="skd-card accent">
            <h2>Wstępne roszczenie</h2>
            <dl>
              <div>
                <dt>Oszczędność na racie</dt>
                <dd>{formatCurrency(result.installmentSaving)}</dd>
              </div>
              <div>
                <dt>Łączna wartość korzyści</dt>
                <dd>{formatCurrency(result.estimatedClaim)}</dd>
              </div>
              <div>
                <dt>Koszty skredytowane</dt>
                <dd>{formatCurrency(result.financedCosts)}</dd>
              </div>
            </dl>
          </article>
        </section>

        <section className="skd-note">
          <h2>Notatka do sprawy</h2>
          <p>
            Umowa z {contractDay} {contractMonth.toLowerCase()} {contractYear}, RRSO {formatPercent(rrso)}, okres {result.periodCount} mies.,
            kredyt spłacony: {isPaidOff}. Wstępna wartość korzyści klienta wynosi {formatCurrency(result.estimatedClaim)}.
            Wynik wymaga weryfikacji z dokumentami, historią spłat i oceną naruszeń SKD.
          </p>
        </section>

        <section className="skd-comparison">
          <h2>Porównanie z ręczną pracą</h2>
          <div>
            <span>Ręcznie</span>
            <strong>10-15 min</strong>
            <p>Przepisanie danych, podstawienie do wzoru i policzenie różnic.</p>
          </div>
          <div>
            <span>Kalkulator</span>
            <strong>30 sek</strong>
            <p>Pierwsze oszacowanie roszczenia i gotowa notatka do sprawy.</p>
          </div>
        </section>
      </section>
    </main>
  );
}
