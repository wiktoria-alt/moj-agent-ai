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
  created_at?: unknown;
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

function normalizeMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getChunkIndex(metadata: Record<string, unknown>) {
  return typeof metadata.chunk_index === "number" ? metadata.chunk_index : 0;
}

export async function getKnowledgeDocumentsByTitle(
  titlePatterns: string[],
  limit = 500,
): Promise<KnowledgeSearchResponse> {
  const supabase = getKnowledgeSupabase();
  const results: KnowledgeSearchResult[] = [];
  const seen = new Set<string>();

  for (const pattern of titlePatterns) {
    const { data, error } = await supabase
      .from("documents")
      .select("title, content, metadata, created_at")
      .ilike("title", pattern)
      .limit(limit);

    if (error) {
      throw new Error(`Nie udało się pobrać dokumentu z bazy wiedzy: ${error.message}`);
    }

    for (const row of (Array.isArray(data) ? data : []) as MatchDocumentRow[]) {
      const content = typeof row.content === "string" ? row.content : "";
      const title = typeof row.title === "string" ? row.title : "Bez tytułu";
      const key = `${title}\n${content}`;

      if (!content || seen.has(key)) continue;
      seen.add(key);
      results.push({
        added_at: typeof row.created_at === "string" ? row.created_at : null,
        content,
        metadata: normalizeMetadata(row.metadata),
        similarity: 1,
        title,
      });
    }
  }

  results.sort((a, b) => {
    const titleCompare = a.title.localeCompare(b.title, "pl");
    return titleCompare || getChunkIndex(a.metadata) - getChunkIndex(b.metadata);
  });

  return {
    results,
    source_documents: [...new Set(results.map((result) => result.title))],
    total_found: results.length,
  };
}

export async function searchKnowledgeBase(
  query: string,
  options: { matchCount?: number; matchThreshold?: number } = {},
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
    match_count: options.matchCount ?? 8,
    match_threshold: options.matchThreshold ?? 0.35,
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
