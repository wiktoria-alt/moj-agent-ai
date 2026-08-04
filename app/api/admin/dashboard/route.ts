import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const INPUT_PRICE_PER_MILLION = 0.15;
const OUTPUT_PRICE_PER_MILLION = 0.6;

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function dateKey(value: string | Date) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmails = new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Brakuje konfiguracji Supabase." }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Zaloguj się, aby zobaczyć dashboard." }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const email = authData.user?.email?.toLowerCase();

  if (authError || !authData.user || !email) {
    return NextResponse.json({ error: "Sesja wygasła. Zaloguj się ponownie." }, { status: 401 });
  }
  if (!adminEmails.has(email)) {
    return NextResponse.json({ error: "To konto nie ma dostępu administracyjnego." }, { status: 403 });
  }

  const today = startOfDay(new Date());
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);

  const [conversationCount, conversationRows, recentConversations, usageResult, usersResult] =
    await Promise.all([
      admin.from("conversations").select("id", { count: "exact", head: true }),
      admin.from("conversations").select("user_id, created_at").gte("created_at", weekStart.toISOString()).range(0, 9999),
      admin.from("conversations").select("id, user_id, title, created_at, updated_at").order("updated_at", { ascending: false }).limit(10),
      admin.from("api_usage").select("endpoint, tokens_input, tokens_output, created_at").gte("created_at", weekStart.toISOString()).range(0, 9999),
      admin.auth.admin.listUsers({ page: 1, perPage: 1_000 }),
    ]);

  const queryError = conversationCount.error || conversationRows.error || recentConversations.error || usageResult.error || usersResult.error;
  if (queryError) {
    return NextResponse.json({ error: `Nie udało się pobrać danych: ${queryError.message}` }, { status: 500 });
  }

  const conversations = conversationRows.data ?? [];
  const usage = usageResult.data ?? [];
  const recent = recentConversations.data ?? [];
  const recentIds = recent.map((row) => row.id);
  const messagesResult = recentIds.length
    ? await admin.from("messages").select("conversation_id").in("conversation_id", recentIds).range(0, 9999)
    : { data: [], error: null };

  if (messagesResult.error) {
    return NextResponse.json({ error: `Nie udało się pobrać wiadomości: ${messagesResult.error.message}` }, { status: 500 });
  }

  const emailById = new Map((usersResult.data.users ?? []).map((user) => [user.id, user.email ?? "Brak e-maila"]));
  const messageCounts = new Map<string, number>();
  for (const row of messagesResult.data ?? []) {
    messageCounts.set(row.conversation_id, (messageCounts.get(row.conversation_id) ?? 0) + 1);
  }

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return { date: dateKey(date), tokens: 0, conversations: 0 };
  });
  const dayByKey = new Map(days.map((day) => [day.date, day]));
  for (const row of conversations) {
    const day = dayByKey.get(dateKey(row.created_at));
    if (day) day.conversations += 1;
  }

  const endpointTokens = new Map<string, number>();
  let tokensToday = 0;
  let inputToday = 0;
  let outputToday = 0;
  for (const row of usage) {
    const input = row.tokens_input ?? 0;
    const output = row.tokens_output ?? 0;
    const total = input + output;
    const day = dayByKey.get(dateKey(row.created_at));
    if (day) day.tokens += total;
    endpointTokens.set(row.endpoint || "inne", (endpointTokens.get(row.endpoint || "inne") ?? 0) + total);
    if (new Date(row.created_at) >= today) {
      tokensToday += total;
      inputToday += input;
      outputToday += output;
    }
  }

  const activeUserIds = new Set<string>();
  const allConversationUsers = await admin.from("conversations").select("user_id").range(0, 9999);
  for (const row of allConversationUsers.data ?? []) if (row.user_id) activeUserIds.add(row.user_id);

  return NextResponse.json({
    stats: {
      users: activeUserIds.size,
      conversations: conversationCount.count ?? 0,
      tokensToday,
      costToday: (inputToday / 1_000_000) * INPUT_PRICE_PER_MILLION + (outputToday / 1_000_000) * OUTPUT_PRICE_PER_MILLION,
    },
    days,
    endpoints: Array.from(endpointTokens, ([endpoint, tokens]) => ({ endpoint, tokens })).sort((a, b) => b.tokens - a.tokens),
    recent: recent.map((row) => ({
      id: row.id,
      email: emailById.get(row.user_id) ?? "Nieznany użytkownik",
      title: row.title?.trim() || "Rozmowa bez tytułu",
      updatedAt: row.updated_at,
      messages: messageCounts.get(row.id) ?? 0,
    })),
    pricing: { input: INPUT_PRICE_PER_MILLION, output: OUTPUT_PRICE_PER_MILLION },
  });
}
