export const dynamic = "force-dynamic";
export const maxDuration = 30;

type NewsItem = {
  category: "news" | "tsue" | "judgment";
  description: string;
  link: string;
  publishedAt: string | null;
  source: string;
  title: string;
};

const feeds = [
  {
    category: "judgment" as const,
    query: '"sankcja kredytu darmowego" "II CSKP 89/26"',
  },
  {
    category: "judgment" as const,
    query: '"sankcja kredytu darmowego" "Sąd Najwyższy" "wyrok"',
  },
  {
    category: "judgment" as const,
    query: '"sankcja kredytu darmowego" "wyrok" when:30d',
  },
  {
    category: "news" as const,
    query: '"sankcja kredytu darmowego" OR "SKD" kredyt konsumencki when:30d',
  },
  {
    category: "tsue" as const,
    query: '"sankcja kredytu darmowego" TSUE wyrok kredyt konsumencki',
  },
  {
    category: "judgment" as const,
    query: '"sankcja kredytu darmowego" wyrok orzeczenie sąd',
  },
  {
    category: "judgment" as const,
    query: 'site:orzeczenia.ms.gov.pl "sankcja kredytu darmowego"',
  },
  {
    category: "judgment" as const,
    query: 'site:sn.pl "II CSKP 89/26"',
  },
] as const;

const watchedItems: NewsItem[] = [
  {
    category: "judgment",
    description:
      "Pilnowany wpis: Sąd Najwyższy, II CSKP 89/26. Ważny materiał do spraw SKD dotyczących kredytowanych kosztów, RRSO i obowiązków informacyjnych.",
    link: "https://www.sn.pl/sites/orzecznictwo/Orzeczenia3/II%20CSKP%2089-26.pdf",
    publishedAt: "2026-08-10T08:00:00.000Z",
    source: "Sąd Najwyższy",
    title: "Wyrok SN II CSKP 89/26 — ważny kierunek dla spraw SKD",
  },
  {
    category: "judgment",
    description:
      "Aktualne omówienie wyroku SN z 8 lipca 2026 r. w sprawie sankcji kredytu darmowego.",
    link: "https://www.prawo.pl/biznes/wyrok-sn-kiedy-dziala-sankcja-kredytu-darmowego%2C1550045.html",
    publishedAt: "2026-08-09T08:00:00.000Z",
    source: "Prawo.pl",
    title: "Wyrok SN: kiedy działa sankcja kredytu darmowego",
  },
];

const categoryPriority: Record<NewsItem["category"], number> = {
  tsue: 3,
  judgment: 2,
  news: 1,
};

function decodeHtml(value: string) {
  const entities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };

  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, entity: string) => entities[entity] ?? match)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function getRealGoogleNewsLink(link: string) {
  try {
    const url = new URL(link);
    return url.searchParams.get("url") || link;
  } catch {
    return link;
  }
}

function parseSource(item: string, fallbackLink: string) {
  const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
  if (sourceMatch) {
    return decodeHtml(sourceMatch[1]);
  }

  try {
    return new URL(fallbackLink).hostname.replace(/^www\./, "");
  } catch {
    return "Źródło internetowe";
  }
}

function parseGoogleNewsRss(xml: string, category: NewsItem["category"]) {
  const matches = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

  return matches.map((item) => {
    const rawLink = extractTag(item, "link");
    const link = getRealGoogleNewsLink(rawLink);
    const pubDate = extractTag(item, "pubDate");
    const publishedAt = pubDate ? new Date(pubDate).toISOString() : null;

    return {
      category,
      description: extractTag(item, "description"),
      link,
      publishedAt,
      source: parseSource(item, link),
      title: extractTag(item, "title"),
    } satisfies NewsItem;
  });
}

function itemScore(item: NewsItem) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  let score = categoryPriority[item.category] * 20;

  if (text.includes("tsue") || text.includes("trybuna")) score += 18;
  if (text.includes("wyrok") || text.includes("orzeczenie")) score += 16;
  if (text.includes("uokik") || text.includes("rzecznik finansowy")) score += 10;
  if (text.includes("rrso") || text.includes("prowizj")) score += 8;
  if (text.includes("ustawa o kredycie konsumenckim")) score += 8;

  if (item.publishedAt) {
    const ageDays = Math.max(
      0,
      (Date.now() - new Date(item.publishedAt).getTime()) / 86_400_000,
    );
    score += Math.max(0, 30 - Math.min(ageDays, 30));
  }

  return score;
}

function itemTime(item: NewsItem) {
  return item.publishedAt ? new Date(item.publishedAt).getTime() || 0 : 0;
}

function sortNewestAndImportant(a: NewsItem, b: NewsItem) {
  const timeDifference = itemTime(b) - itemTime(a);
  if (Math.abs(timeDifference) > 12 * 60 * 60 * 1000) {
    return timeDifference;
  }

  return itemScore(b) - itemScore(a);
}

async function fetchFeed(query: string, category: NewsItem["category"]) {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "pl");
  url.searchParams.set("gl", "PL");
  url.searchParams.set("ceid", "PL:pl");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AgentSKD/1.0)",
    },
    next: { revalidate: 1800 },
  });

  if (!response.ok) {
    throw new Error(`Google News RSS zwrócił błąd ${response.status}.`);
  }

  return parseGoogleNewsRss(await response.text(), category);
}

export async function GET() {
  try {
    const settledFeeds = await Promise.allSettled(
      feeds.map((feed) => fetchFeed(feed.query, feed.category)),
    );
    const items = settledFeeds
      .flatMap((feed) => (feed.status === "fulfilled" ? feed.value : []))
      .concat(watchedItems)
      .filter((item) => item.title && item.link);
    const uniqueItems = Array.from(
      new Map(items.map((item) => [item.link, item])).values(),
    )
      .sort(sortNewestAndImportant)
      .slice(0, 18);

    return Response.json(
      {
        items: uniqueItems,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać newsów SKD.",
      },
      { status: 500 },
    );
  }
}
