import { ImageResponse } from "next/og";

import { fetchPublicTournament } from "@/lib/public-tournament";

export const alt = "Torneio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BACKGROUND = "#0B0F0D";
const BALL = "#D7F24A";
const GOLD = "#E7B43A";
const MUTED = "#9AA59E";

/** "12/10 – 15/10" from ISO days (no locale data needed in the image runtime). */
function range(start: string, end: string): string {
  const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return start === end ? day(start) : `${day(start)} – ${day(end)}`;
}

/** Share card for WhatsApp and social: name, club, dates, categories and the champion. */
export default async function Image({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const data = await fetchPublicTournament(publicId);
  const name = data?.tournament.name ?? "Torneio";
  const club = data?.clubName ?? "";
  const categories = (data?.tournament.categories ?? [])
    .map((category) => category.name)
    .slice(0, 5);
  const champions = (data?.draws ?? [])
    .filter((draw) => draw.championEntryId)
    .map((draw) => {
      const final = draw.rounds.at(-1)?.matches[0];
      const winner = [final?.a, final?.b].find((side) => side?.id === draw.championEntryId);
      return winner ? `${draw.category.name}: ${winner.name}` : null;
    })
    .filter((line): line is string => line !== null)
    .slice(0, 2);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: BACKGROUND,
        color: "#F7F6F2",
        padding: "64px 72px",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 480,
          height: 480,
          borderRadius: 480,
          background: "rgba(231,180,58,0.18)",
          display: "flex",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{ width: 44, height: 44, borderRadius: 44, background: BALL, display: "flex" }}
        />
        <div style={{ fontSize: 30, color: MUTED, display: "flex" }}>{club}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 30, color: GOLD, letterSpacing: 4, display: "flex" }}>TORNEIO</div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, display: "flex" }}>
          {name}
        </div>
        {data ? (
          <div style={{ fontSize: 34, color: MUTED, display: "flex" }}>
            {range(data.tournament.startDate, data.tournament.endDate)}
            {data.tournament.location ? ` · ${data.tournament.location}` : ""}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {champions.length > 0 ? (
          champions.map((line) => (
            <div key={line} style={{ fontSize: 34, color: GOLD, display: "flex" }}>
              Campeão · {line}
            </div>
          ))
        ) : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {categories.map((category) => (
              <div
                key={category}
                style={{
                  fontSize: 28,
                  padding: "8px 22px",
                  borderRadius: 999,
                  border: "2px solid #2A332E",
                  display: "flex",
                }}
              >
                {category}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    size,
  );
}
