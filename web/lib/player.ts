// Player photo from Leaguepedia. Players.Image is a wiki file name; Special:FilePath
// redirects it to the actual CDN image, so the browser resolves it directly with no
// extra API calls from our side.
export function playerPhoto(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const f = filename.replace(/ /g, "_");
  return `https://lol.fandom.com/wiki/Special:FilePath/${encodeURIComponent(f)}`;
}
