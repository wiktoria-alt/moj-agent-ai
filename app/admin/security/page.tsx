import { createClient } from "@supabase/supabase-js";
import { TopNavigation } from "../../components/TopNavigation";
import { DAILY_TOKEN_LIMIT } from "../../lib/apiUsage";

export const dynamic = "force-dynamic";

type MessageLogRow = {
  block_reason: string | null;
  created_at: string;
  message: string;
  user_id: string;
};

type ApiUsageRow = {
  created_at: string;
  tokens_input: number;
  tokens_output: number;
  user_id: string;
};

type UserUsage = {
  email: string;
  percentLimit: number;
  tokensToday: number;
  tokensWeek: number;
  userId: string;
};

type Alert = {
  label: string;
  tone: "danger" | "warning";
  value: string;
};

function createAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function minutesAgoIso(minutes: number) {
  const date = new Date(Date.now() - minutes * 60 * 1_000);
  return date.toISOString();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pl-PL").format(Math.round(value));
}

function shorten(value: string, maxLength = 120) {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function getEmail(userEmails: Map<string, string>, userId: string) {
  return userEmails.get(userId) ?? userId.slice(0, 8);
}

function groupUsage(
  usageRows: ApiUsageRow[],
  userEmails: Map<string, string>,
): UserUsage[] {
  const todayStart = new Date(startOfTodayIso()).getTime();
  const usageByUser = new Map<string, { today: number; week: number }>();

  for (const row of usageRows) {
    const total = (row.tokens_input ?? 0) + (row.tokens_output ?? 0);
    const current = usageByUser.get(row.user_id) ?? { today: 0, week: 0 };

    current.week += total;
    if (new Date(row.created_at).getTime() >= todayStart) {
      current.today += total;
    }

    usageByUser.set(row.user_id, current);
  }

  return Array.from(usageByUser.entries())
    .map(([userId, totals]) => ({
      email: getEmail(userEmails, userId),
      percentLimit: Math.min(100, (totals.today / DAILY_TOKEN_LIMIT) * 100),
      tokensToday: totals.today,
      tokensWeek: totals.week,
      userId,
    }))
    .sort((a, b) => b.tokensWeek - a.tokensWeek)
    .slice(0, 5);
}

function buildAlerts(
  topUsers: UserUsage[],
  recentLogs: MessageLogRow[],
  blockedLogs: MessageLogRow[],
  userEmails: Map<string, string>,
) {
  const alerts: Alert[] = [];

  for (const user of topUsers.filter((item) => item.percentLimit >= 80)) {
    alerts.push({
      label: "User osiągnął 80% dziennego limitu",
      tone: user.percentLimit >= 100 ? "danger" : "warning",
      value: `${user.email}: ${formatNumber(user.tokensToday)} tokenów dzisiaj`,
    });
  }

  const messagesByUser = new Map<string, number>();
  for (const row of recentLogs) {
    messagesByUser.set(row.user_id, (messagesByUser.get(row.user_id) ?? 0) + 1);
  }

  for (const [userId, count] of messagesByUser) {
    if (count > 20) {
      alerts.push({
        label: "Ponad 20 wiadomości w 10 minut",
        tone: "danger",
        value: `${getEmail(userEmails, userId)}: ${count} wiadomości`,
      });
    }
  }

  for (const row of blockedLogs.slice(0, 3)) {
    alerts.push({
      label: "Wiadomość zablokowana przez filtr",
      tone: "warning",
      value: `${getEmail(userEmails, row.user_id)}: ${row.block_reason ?? "brak powodu"}`,
    });
  }

  return alerts;
}

export default async function SecurityAdminPage() {
  const supabase = createAdminSupabase();

  if (!supabase) {
    return (
      <main className="chat-shell security-shell">
        <TopNavigation />
        <section className="security-hero">
          <p>Admin</p>
          <h1>Panel bezpieczeństwa</h1>
          <span>Brakuje konfiguracji Supabase po stronie serwera.</span>
        </section>
      </main>
    );
  }

  const [
    blockedLogsResult,
    blockedCountResult,
    usageResult,
    recentLogsResult,
    usersResult,
  ] = await Promise.all([
    supabase
      .from("message_logs")
      .select("user_id, message, block_reason, created_at")
      .eq("blocked", true)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("message_logs")
      .select("id", { count: "exact", head: true })
      .eq("blocked", true),
    supabase
      .from("api_usage")
      .select("user_id, tokens_input, tokens_output, created_at")
      .gte("created_at", daysAgoIso(7)),
    supabase
      .from("message_logs")
      .select("user_id, message, block_reason, created_at")
      .gte("created_at", minutesAgoIso(10)),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1_000 }),
  ]);

  const blockedLogs = (blockedLogsResult.data ?? []) as MessageLogRow[];
  const usageRows = (usageResult.data ?? []) as ApiUsageRow[];
  const recentLogs = (recentLogsResult.data ?? []) as MessageLogRow[];
  const userEmails = new Map(
    (usersResult.data?.users ?? []).map((user) => [
      user.id,
      user.email ?? user.id.slice(0, 8),
    ]),
  );
  const topUsers = groupUsage(usageRows, userEmails);
  const alerts = buildAlerts(topUsers, recentLogs, blockedLogs, userEmails);
  const todayStart = new Date(startOfTodayIso()).getTime();
  const tokensToday = usageRows
    .filter((row) => new Date(row.created_at).getTime() >= todayStart)
    .reduce((sum, row) => sum + row.tokens_input + row.tokens_output, 0);
  const tokensWeek = usageRows.reduce(
    (sum, row) => sum + row.tokens_input + row.tokens_output,
    0,
  );
  const activeUsersToday = new Set(
    usageRows
      .filter((row) => new Date(row.created_at).getTime() >= todayStart)
      .map((row) => row.user_id),
  ).size;
  const averagePerUser =
    activeUsersToday > 0 ? Math.round(tokensToday / activeUsersToday) : 0;
  const hasDataError =
    blockedLogsResult.error || usageResult.error || recentLogsResult.error;

  return (
    <main className="chat-shell security-shell">
      <TopNavigation />

      <section className="security-hero">
        <p>Admin</p>
        <h1>Panel bezpieczeństwa</h1>
        <span>Logi podejrzanych wiadomości, zużycie tokenów i alerty.</span>
      </section>

      {hasDataError && (
        <p className="security-error">
          Nie udało się pobrać części danych. Sprawdź, czy migracje `api_usage`
          i `message_logs` są uruchomione w Supabase.
        </p>
      )}

      <section className="security-stats" aria-label="Statystyki">
        <article>
          <span>Tokeny dziś</span>
          <strong>{formatNumber(tokensToday)}</strong>
        </article>
        <article>
          <span>Tokeny tydzień</span>
          <strong>{formatNumber(tokensWeek)}</strong>
        </article>
        <article>
          <span>Zablokowane</span>
          <strong>{formatNumber(blockedCountResult.count ?? 0)}</strong>
        </article>
        <article>
          <span>Średnio / user</span>
          <strong>{formatNumber(averagePerUser)}</strong>
        </article>
      </section>

      <section className="security-grid">
        <article className="security-card security-card-wide">
          <header>
            <p>Zablokowane wiadomości</p>
            <h2>Ostatnie próby</h2>
          </header>
          <div className="security-table-wrap">
            <table className="security-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Wiadomość</th>
                  <th>Powód</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {blockedLogs.length > 0 ? (
                  blockedLogs.map((row) => (
                    <tr key={`${row.user_id}-${row.created_at}`}>
                      <td>{getEmail(userEmails, row.user_id)}</td>
                      <td>{shorten(row.message)}</td>
                      <td>{row.block_reason ?? "brak"}</td>
                      <td>{formatDate(row.created_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>Brak zablokowanych wiadomości.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="security-card">
          <header>
            <p>Top 5 użytkowników</p>
            <h2>Zużycie tokenów</h2>
          </header>
          <div className="security-user-list">
            {topUsers.length > 0 ? (
              topUsers.map((user) => (
                <div key={user.userId} className="security-user-row">
                  <div>
                    <strong>{user.email}</strong>
                    <span>{formatNumber(user.tokensWeek)} tokenów / tydzień</span>
                  </div>
                  <div>
                    <b>{formatNumber(user.tokensToday)}</b>
                    <span>{Math.round(user.percentLimit)}% limitu</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="security-empty">Brak danych o zużyciu.</p>
            )}
          </div>
        </article>

        <article className="security-card">
          <header>
            <p>Alerty</p>
            <h2>Podejrzane zachowania</h2>
          </header>
          <div className="security-alerts">
            {alerts.length > 0 ? (
              alerts.map((alert, index) => (
                <div className={alert.tone} key={`${alert.label}-${index}`}>
                  <strong>{alert.label}</strong>
                  <span>{alert.value}</span>
                </div>
              ))
            ) : (
              <p className="security-empty">Brak aktywnych alertów.</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
