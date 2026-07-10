import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="notFoundPage">
      <p className="eyebrow">Not found</p>
      <h1>That page does not exist.</h1>
      <p className="mutedText">Check the URL or return to the Supacontext dashboard.</p>
      <Link className="button primaryButton" href="/">
        Go home
      </Link>
    </main>
  );
}
