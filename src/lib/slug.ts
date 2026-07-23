export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export function randomSuffix(length = 5) {
  return Math.random().toString(36).slice(2, 2 + length);
}
