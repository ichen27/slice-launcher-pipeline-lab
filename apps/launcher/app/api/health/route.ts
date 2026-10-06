export function GET() {
  return Response.json(
    { status: "ok", release: process.env.SLICE_RELEASE_SHA ?? "development" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
