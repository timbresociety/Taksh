import Link from "next/link";
import Studio from "@/components/Studio";
import { arkivMessage, readGame } from "@/lib/arkiv/store";
import { validateSpec } from "@/lib/spec/validate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared game" };

// The spec comes from the entity's bytes and is validated again, since anything on Arkiv is public.
export default async function Page({ params }) {
  const { key } = await params;
  let game = null;
  let failed = null;
  try {
    game = await readGame(key);
  } catch (error) {
    failed = arkivMessage(error, "this game can't load right now");
    console.error("Arkiv game read failed:", error.shortMessage ?? error.message);
  }
  const checked = game ? validateSpec(game.spec) : null;

  if (!checked?.ok) {
    return (
      <main className="shelf-page">
        <header className="court__mark">
          <Link href="/">Taksh</Link>
        </header>
        <p role="alert">{failed ?? "No live game has that key. It may have expired."}</p>
        <Link className="button" href="/games">All shared games</Link>
      </main>
    );
  }
  return <Studio initialGame={{ spec: game.spec, source: "arkiv", arkivKey: key }} />;
}
