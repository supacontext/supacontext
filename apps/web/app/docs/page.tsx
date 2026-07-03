import { ArrowRight, BookOpen, Braces, KeyRound, RadioTower, Webhook } from "lucide-react";
import Link from "next/link";
import { DEPTH_CREDIT_COST } from "@supacontext/core";
import { SiteHeader } from "../../components/site-header";

const docs = [
  {
    href: "/docs/quickstart",
    title: "Quickstart",
    text: "Create a key, make your first request, and inspect the JSON response.",
    icon: BookOpen,
  },
  {
    href: "/docs/api-reference",
    title: "API reference",
    text: "Request schema, authentication, async jobs, webhooks, and errors.",
    icon: Braces,
  },
];

export default function DocsPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="pageHero">
          <p className="eyebrow">Docs</p>
          <h1>Integrate live public context with one endpoint.</h1>
          <p className="heroText">
            SupaContext accepts a query, optional depth, and optional platform list. It returns
            compact JSON with citations, gaps, and usage metadata.
          </p>
        </section>

        <section className="featureGrid">
          {docs.map((doc) => {
            const Icon = doc.icon;

            return (
              <Link className="card linkCard" href={doc.href} key={doc.href}>
                <Icon aria-hidden="true" size={22} />
                <h2>{doc.title}</h2>
                <p>{doc.text}</p>
                <span>
                  Open
                  <ArrowRight aria-hidden="true" size={15} />
                </span>
              </Link>
            );
          })}
        </section>

        <section className="section infoGrid">
          <article className="card">
            <KeyRound aria-hidden="true" size={22} />
            <h3>Authentication</h3>
            <p className="mutedText">
              Send API keys as bearer tokens. Raw keys are shown once on creation and stored only as
              hashes.
            </p>
          </article>
          <article className="card">
            <RadioTower aria-hidden="true" size={22} />
            <h3>Platform selection</h3>
            <p className="mutedText">
              Use web, reddit, x, youtube, or omit platforms to let the API use all supported sources.
            </p>
          </article>
          <article className="card">
            <Webhook aria-hidden="true" size={22} />
            <h3>Async jobs</h3>
            <p className="mutedText">
              Long-running jobs can queue and complete through polling or webhooks without changing
              the public response schema.
            </p>
          </article>
        </section>

        <section className="section">
          <article className="card">
            <h2>Depth levels</h2>
            <div className="rows">
              {Object.entries(DEPTH_CREDIT_COST).map(([depth, credits]) => (
                <div className="row" key={depth}>
                  <span>{depth}</span>
                  <strong>{credits} credits</strong>
                </div>
              ))}
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
