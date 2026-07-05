import { authkitProxy } from "@workos-inc/authkit-nextjs";

const configuredRedirectUri = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
const appUrl = process.env.APP_URL;
const redirectUri = configuredRedirectUri || (appUrl ? new URL("/callback", appUrl).toString() : undefined);

if (!redirectUri) {
  throw new Error("Set NEXT_PUBLIC_WORKOS_REDIRECT_URI or APP_URL for WorkOS AuthKit.");
}

export default authkitProxy({
  redirectUri,
  signUpPaths: ["/sign-up"],
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
