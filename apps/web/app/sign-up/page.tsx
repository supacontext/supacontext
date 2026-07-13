import { AuthPage } from "../../components/auth-page";

export default function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <AuthPage intent="sign-up" searchParams={searchParams} />;
}
