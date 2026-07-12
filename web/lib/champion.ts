// Champion square portraits from Riot's Data Dragon. Leaguepedia uses display
// names; Data Dragon uses irregular ids, so map the special cases and strip the
// rest. Misses degrade to the container's background via CSS (no broken-image icon).
const DDRAGON_VERSION = "14.24.1";

const SPECIAL: Record<string, string> = {
  Wukong: "MonkeyKing",
  "Nunu & Willump": "Nunu",
  "Renata Glasc": "Renata",
  "Cho'Gath": "Chogath",
  "Kai'Sa": "Kaisa",
  "Kha'Zix": "Khazix",
  "Vel'Koz": "Velkoz",
  "Bel'Veth": "Belveth",
  "Kog'Maw": "KogMaw",
  "Rek'Sai": "RekSai",
  "K'Sante": "KSante",
  LeBlanc: "Leblanc",
  "Dr. Mundo": "DrMundo",
};

export function championId(name: string): string {
  if (SPECIAL[name]) return SPECIAL[name];
  return (name || "").replace(/[^a-zA-Z0-9]/g, "");
}

export function championSquare(name: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${championId(
    name,
  )}.png`;
}
