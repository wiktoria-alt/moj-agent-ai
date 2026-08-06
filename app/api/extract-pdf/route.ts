import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";
export const maxDuration = 60;

const maxPdfSize = 4 * 1024 * 1024;

function cleanPdfText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Dodaj plik PDF." }, { status: 400 });
    }

    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return Response.json(
        { error: "Ten przycisk obsługuje tylko pliki PDF." },
        { status: 400 },
      );
    }

    if (file.size > maxPdfSize) {
      return Response.json(
        {
          error:
            "PDF jest za duży dla szybkiego importu na Vercel. Maksymalny rozmiar to 4 MB. Podziel plik, skompresuj PDF albo wklej tekst ręcznie.",
        },
        { status: 413 },
      );
    }

    const data = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data });

    try {
      const result = await parser.getText();
      const text = cleanPdfText(result.text ?? "");

      if (text.length < 40) {
        return Response.json(
          {
            error:
              "Nie udało się odczytać tekstu z PDF. Jeśli to skan, najpierw użyj OCR albo wklej tekst ręcznie.",
          },
          { status: 422 },
        );
      }

      return Response.json({
        fileName: file.name,
        pages: result.total ?? null,
        text,
      });
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nie udało się odczytać pliku PDF.",
      },
      { status: 500 },
    );
  }
}
