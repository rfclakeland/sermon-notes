/** Ids of the preview sample outlines. Kept separate so the public page does not bundle the seed copy. */
export const SAMPLE_SERMON_IDS = new Set([
  "roof-opened",
  "hem",
  "what-do-you-want",
  "be-still",
  "enough",
  "come-and-see",
  "better-portion",
  "road-home",
  "take-heart",
  "living-stones",
]);

export function isSampleSermon(id: string) {
  return SAMPLE_SERMON_IDS.has(id);
}
