import { AuthPage } from "../../components/auth-page";

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AuthPage intent="sign-in" searchParams={searchParams} />;
}
