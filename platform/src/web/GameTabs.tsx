import { GAME_LIST } from "../games";

/** The game picker used on the home, method and results pages. Only the games the site exposes are listed. */
export function GameTabs({ value, onChange, label = (g) => g.title, gap = 14 }: {
  value: string;
  onChange: (gameId: string) => void;
  label?: (g: (typeof GAME_LIST)[number]) => string;
  gap?: number;
}) {
  return (
    <div className="seg" style={{ marginBottom: gap, flexWrap: "wrap" }}>
      {GAME_LIST.map((g) => (
        <button key={g.id} className={g.id === value ? "on" : ""} onClick={() => onChange(g.id)}>{label(g)}</button>
      ))}
    </div>
  );
}
