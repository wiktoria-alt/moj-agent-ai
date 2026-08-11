import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { googleModelIds } from "../../lib/models";

export const runtime = "nodejs";
export const maxDuration = 60;

const maxPdfSize = 15 * 1024 * 1024;

function cleanPdfText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractTextFromPdf(data: Uint8Array) {
  const loadingTask = getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");

      pages.push(pageText);
      page.cleanup();
    }

    return {
      pages: pdf.numPages,
      text: cleanPdfText(pages.join("\n\n")),
    };
  } finally {
    await loadingTask.destroy();
  }
}

async function extractTextWithOcr(data: Uint8Array) {
  if (!process.env.GOOGLE_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("Brakuje klucza Google API potrzebnego do OCR.");
  }

  const result = await generateText({
    maxOutputTokens: 12000,
    maxRetries: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "file",
            data,
            mediaType: "application/pdf",
          },
          {
            type: "text",
            text:
              "Odczytaj tekst z tego PDF metodą OCR. Zwróć wyłącznie możliwie wierny tekst dokumentu po polsku, strona po stronie. Nie oceniaj dokumentu, nie streszczaj i nie dodawaj komentarzy. Jeśli fragment jest nieczytelny, wpisz [NIECZYTELNE].",
          },
        ],
      },
    ],
    model: google(googleModelIds.flash),
    temperature: 0,
    timeout: { totalMs: 55000 },
  });

  return cleanPdfText(result.text);
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
            "PDF jest za duży do OCR. Maksymalny rozmiar to 15 MB. Skompresuj PDF albo podziel go na części.",
        },
        { status: 413 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await extractTextFromPdf(bytes);
    let extractionMethod: "text" | "ocr" = "text";

    if (result.text.length < 40) {
      result.text = await extractTextWithOcr(bytes);
      extractionMethod = "ocr";

      if (result.text.length < 40) {
        return Response.json(
          {
            error:
              "Nie udało się odczytać tekstu z PDF nawet przez OCR. Spróbuj wyraźniejszego skanu albo podziel plik na części.",
          },
          { status: 422 },
        );
      }
    }

    return Response.json({
      extractionMethod,
      fileName: file.name,
      pages: result.pages,
      text: result.text,
    });
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
