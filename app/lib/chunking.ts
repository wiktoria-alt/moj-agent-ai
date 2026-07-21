export function splitIntoChunks(
  text: string,
  chunkSize = 500,
  overlap = 50,
): string[] {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();

  if (!normalized) return [];
  if (chunkSize < 50) throw new Error("chunkSize musi wynosić co najmniej 50");
  if (overlap < 0 || overlap >= chunkSize) {
    throw new Error("overlap musi być nieujemny i mniejszy niż chunkSize");
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  function overlapTail(value: string) {
    if (!overlap) return "";
    const tail = value.slice(-overlap);
    const withoutPartialWord = tail.replace(/^\S*\s+/, "").trim();
    return withoutPartialWord || tail.trim();
  }

  function flush() {
    const chunk = current.trim();
    if (!chunk) return;
    chunks.push(chunk);
    current = overlapTail(chunk);
  }

  for (const sentence of sentences) {
    if (sentence.length > chunkSize) {
      if (current) flush();
      let start = 0;

      while (start < sentence.length) {
        const end = Math.min(start + chunkSize, sentence.length);
        const part = sentence.slice(start, end).trim();
        if (part) chunks.push(part);
        if (end === sentence.length) break;
        start = Math.max(end - overlap, start + 1);
      }

      current = overlapTail(chunks.at(-1) ?? "");
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > chunkSize && current) flush();
    current = current ? `${current} ${sentence}` : sentence;
  }

  if (current.trim() && current.trim() !== chunks.at(-1)) {
    chunks.push(current.trim());
  }

  return chunks;
}
