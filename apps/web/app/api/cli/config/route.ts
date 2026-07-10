import { webEnv } from "../../../../lib/server/env";

export async function GET() {
  return Response.json({
    api_url: webEnv.API_URL.replace(/\/$/, ""),
    workos_client_id: webEnv.WORKOS_CLIENT_ID,
    device_authorization_url: "https://api.workos.com/user_management/authorize/device",
    device_token_url: "https://api.workos.com/user_management/authenticate",
  });
}
