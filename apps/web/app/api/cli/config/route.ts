import { webEnv } from "../../../../lib/server/env";

export async function GET() {
  const appUrl = webEnv.APP_URL.replace(/\/$/, "");

  return Response.json(
    {
      api_url: webEnv.API_URL.replace(/\/$/, ""),
      device_authorization_url: `${appUrl}/api/cli/device/start`,
      device_token_url: `${appUrl}/api/cli/device/token`,
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
