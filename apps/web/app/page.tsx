import { ArrowRight, Braces, CheckCircle2, DatabaseZap, Layers3, RadioTower } from "lucide-react";
import Link from "next/link";
import { DEPTH_CREDIT_COST, PLANS } from "@supacontext/core";
import { SiteHeader } from "../components/site-header";

const platforms = ["web", "Reddit", "X", "YouTube"];
const productPoints = [
  "One request instead of separate search, social, video, and forum tooling.",
  "Compact cited context packs shaped for coding agents and app agents.",
  "JSON output only, with depth controls for cost, latency, and coverage.",
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="heroSection">
          <div className="heroCopy">
            <p className="eyebrow">Developer API for agent context</p>
            <h1>One live context API for AI agents.</h1>
            <p className="heroText">
              SupaContext turns public web, Reddit, X, and YouTube signals into compact, cited JSON
              that agents can use without juggling search tools, scrapers, or provider-specific output.
            </p>
            <div className="heroActions">
              <Link className="button primaryButton" href="/dashboard">
                Start with 50 credits
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
              <Link className="button secondaryButton" href="/docs">
                Read docs
              </Link>
            </div>
          </div>
          <div className="productVisual" aria-label="Example context response">
            <div className="visualTopbar">
              <span>POST /v1/context</span>
              <span>standard - 20 credits</span>
            </div>
            <pre>{`{
  "query": "latest React compiler guidance",
  "depth": "standard",
  "platforms": ["web", "reddit", "youtube"],
  "answer": "Compact cited context...",
  "sources": [
    { "id": "src_1", "platform": "web" },
    { "id": "src_2", "platform": "reddit" }
  ]
}`}</pre>
          </div>
        </section>

        <section className="section">
          <div className="sectionHeader">
            <p className="eyebrow">Built for agents</p>
            <h2>Context retrieval without tool sprawl.</h2>
          </div>
          <div className="featureGrid">
            {productPoints.map((point) => (
              <article className="card featureCard" key={point}>
                <CheckCircle2 aria-hidden="true" size={20} />
                <p>{point}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section splitSection">
          <div>
            <p className="eyebrow">Source coverage</p>
            <h2>Web, Reddit, X, and YouTube in one schema.</h2>
            <p className="mutedText">
              Pick platforms manually or let SupaContext choose the right mix. Responses are
              structured for citations, gaps, usage accounting, and downstream agent reasoning.
            </p>
          </div>
          <div className="platformGrid">
            {platforms.map((platform) => (
              <div className="metricTile" key={platform}>
                <RadioTower aria-hidden="true" size={18} />
                <strong>{platform}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="infoGrid">
            <article className="card">
              <Layers3 aria-hidden="true" size={22} />
              <h3>Depth levels</h3>
              <div className="rows">
                {Object.entries(DEPTH_CREDIT_COST).map(([depth, credits]) => (
                  <div className="row" key={depth}>
                    <span>{depth}</span>
                    <strong>{credits} credits</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className="card">
              <DatabaseZap aria-hidden="true" size={22} />
              <h3>Credit plans</h3>
              <div className="rows">
                {Object.values(PLANS).map((plan) => (
                  <div className="row" key={plan.slug}>
                    <span>{plan.name}</span>
                    <strong>{plan.includedCredits.toLocaleString()} credits</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className="card">
              <Braces aria-hidden="true" size={22} />
              <h3>JSON only</h3>
              <p className="mutedText">
                Public responses return structured context packs, citations, gaps, and usage metadata.
                No raw provider dumps reach the API consumer.
              </p>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}
