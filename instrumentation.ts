// On server boot (Node runtime only): migrate the content store and resume the
// Spacehub autosync and source watcher if a space is configured.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { boot } = await import("./lib/server/space");
  await boot().catch((error) => console.error("[instants] space boot failed", error));
}
