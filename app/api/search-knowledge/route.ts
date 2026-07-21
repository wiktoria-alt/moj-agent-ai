import { searchKnowledgeBase } from "../../lib/knowledgeSearch";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";

    if (!query) {
      return Response.json({ error: "Wpisz pytanie do wyszukania." }, { status: 400 });
    }

    return Response.json(await searchKnowledgeBase(query));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nie udało się przeszukać bazy wiedzy.",
      },
      { status: 500 },
    );
  }
}
