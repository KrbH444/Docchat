// Text normalization and tokenization that works for both Arabic and English.

const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

/** Normalize Arabic letter variants so spelling differences still match. */
export function normalizeArabic(text: string): string {
  return text
    .replace(ARABIC_DIACRITICS, "")
    .replace(TATWEEL, "")
    .replace(/[آأإٱ]/g, "ا") // آ أ إ ٱ -> ا
    .replace(/ة/g, "ه") // ة -> ه
    .replace(/ى/g, "ي") // ى -> ي
    .replace(/[ؤ]/g, "و") // ؤ -> و
    .replace(/[ئ]/g, "ي"); // ئ -> ي
}

const STOPWORDS = new Set([
  // English
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "how",
  "in", "is", "it", "its", "of", "on", "or", "that", "the", "this", "to", "was", "were",
  "what", "when", "where", "which", "who", "why", "will", "with", "do", "does", "can",
  // Arabic (already normalized)
  "في", "من", "علي", "الي", "عن", "ان", "او", "و", "ما", "ماذا", "هل", "هو", "هي",
  "هذا", "هذه", "ذلك", "التي", "الذي", "كيف", "متي", "اين", "لماذا", "كم", "مع",
]);

/** Arabic "al-" prefix and common attached conjunction/prepositions. */
function stripArabicPrefix(token: string): string {
  if (token.length > 4 && /^(وال|بال|كال|فال|لل)/.test(token)) return token.slice(3);
  if (token.length > 3 && token.startsWith("ال")) return token.slice(2);
  return token;
}

/** Lowercase, normalize and split into searchable terms. */
export function tokenize(text: string): string[] {
  const normalized = normalizeArabic(text.toLowerCase());
  const raw = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const terms: string[] = [];
  for (const word of raw) {
    if (STOPWORDS.has(word)) continue;
    const term = /[؀-ۿ]/.test(word) ? stripArabicPrefix(word) : word;
    if (term.length < 2 && !/\d/.test(term)) continue;
    terms.push(term);
  }
  return terms;
}

/** True when the text is mostly Arabic, used to pick reply language/direction. */
export function isMostlyArabic(text: string): boolean {
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabic > latin;
}
