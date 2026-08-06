import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "./embeddings";
import { supabase as publicSupabase } from "./supabase";

export type KnowledgeSearchResult = {
  added_at: string | null;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  title: string;
};

export type KnowledgeSearchResponse = {
  message?: string;
  results: KnowledgeSearchResult[];
  source_documents: string[];
  total_found: number;
};

type MatchDocumentRow = {
  content?: unknown;
  id?: unknown;
  metadata?: unknown;
  similarity?: unknown;
  title?: unknown;
};

function getKnowledgeSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return publicSupabase;
}

export async function searchKnowledgeBase(
  query: string,
): Promise<KnowledgeSearchResponse> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return {
      message: "Nie znaleziono informacji w bazie wiedzy.",
      results: [],
      source_documents: [],
      total_found: 0,
    };
  }

  const supabase = getKnowledgeSupabase();
  const queryEmbedding = await createEmbedding(normalizedQuery);
  const { data, error } = await supabase.rpc("match_documents", {
    match_count: 8,
    match_threshold: 0.35,
    query_embedding: queryEmbedding,
  });

  if (error) {
    throw new Error(`Nie udało się przeszukać bazy wiedzy: ${error.message}`);
  }

  const matches = (Array.isArray(data) ? data : []) as MatchDocumentRow[];
  const ids = matches
    .map((match) => (typeof match.id === "string" ? match.id : null))
    .filter((id): id is string => id !== null);
  const addedAtById = new Map<string, string>();

  if (ids.length > 0) {
    const { data: documents, error: documentsError } = await supabase
      .from("documents")
      .select("id, created_at")
      .in("id", ids);

    if (documentsError) {
      throw new Error(
        `Nie udało się pobrać informacji o źródłach: ${documentsError.message}`,
      );
    }

    for (const document of documents ?? []) {
      if (typeof document.id === "string" && typeof document.created_at === "string") {
        addedAtById.set(document.id, document.created_at);
      }
    }
  }

  const results = matches.map((match) => {
    const id = typeof match.id === "string" ? match.id : null;

    return {
      added_at: id ? addedAtById.get(id) ?? null : null,
      content: typeof match.content === "string" ? match.content : "",
      metadata:
        match.metadata &&
        typeof match.metadata === "object" &&
        !Array.isArray(match.metadata)
          ? (match.metadata as Record<string, unknown>)
          : {},
      similarity:
        typeof match.similarity === "number" ? match.similarity : 0,
      title: typeof match.title === "string" ? match.title : "Bez tytułu",
    };
  });
  const sourceDocuments = [...new Set(results.map((result) => result.title))];

  return results.length > 0
    ? {
        results,
        source_documents: sourceDocuments,
        total_found: results.length,
      }
    : {
        message: "Nie znaleziono informacji w bazie wiedzy.",
        results: [],
        source_documents: [],
        total_found: 0,
      };
}
