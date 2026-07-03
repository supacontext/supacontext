import { DEPTH_CREDIT_COST, PLANS } from "@supacontext/core";
import { Button } from "@supacontext/ui";

const depthRows = Object.entries(DEPTH_CREDIT_COST);
const planRows = Object.values(PLANS);

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Developer API foundation</p>
        <h1>Compact, cited public context for AI agents.</h1>
        <p className="heroText">
          SupaContext compiles web, Reddit, X, and YouTube context into structured JSON. It is
          intentionally not a raw search API or scraper output layer.
        </p>
        <div className="actions">
          <Button className="primary" disabled>
            Dashboard coming next
          </Button>
          <span>POST /v1/context is intentionally not implemented in this foundation.</span>
        </div>
      </section>

      <section className="grid" aria-label="Product configuration">
        <article className="card">
          <h2>Depth pricing</h2>
          <div className="rows">
            {depthRows.map(([depth, credits]) => (
              <div className="row" key={depth}>
                <span>{depth}</span>
                <strong>{credits} credits</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>Plans</h2>
          <div className="rows">
            {planRows.map((plan) => (
              <div className="row" key={plan.slug}>
                <span>{plan.name}</span>
                <strong>{plan.includedCredits.toLocaleString()} credits</strong>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

