export function GET() {
  return new Response(null, {
    status: 410,
    headers: {
      "cache-control": "no-store",
    },
  });
}
