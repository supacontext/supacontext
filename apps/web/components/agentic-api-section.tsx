const effortLevels = ["Low", "Medium", "High", "X High", "Auto"];

export function AgenticApiSection() {
  return (
    <section className="agenticSection" aria-labelledby="agentic-api-title">
      <div className="agenticIntro">
        <h2 id="agentic-api-title">A research agent behind every request.</h2>
        <p>
          Supacontext searches 11 public platforms, compares signals, and returns compact cited JSON
          your agent can use.
        </p>
      </div>

      <div className="agenticSystemMap" aria-label="Supacontext agent architecture">
        <div className="agenticMapNode agenticMapEdgeNode">
          <span>Your agent</span>
          <strong>Asks once</strong>
          <p>One query, one endpoint</p>
        </div>

        <div className="agenticMapNode agenticMapCore">
          <span>Supacontext agent</span>
          <strong>Searches and compares</strong>
          <p>11 public platforms</p>
        </div>

        <div className="agenticMapNode agenticMapEdgeNode">
          <span>Returns</span>
          <strong>Cited JSON</strong>
          <p>Compact context, ready to use</p>
        </div>
      </div>

      <div className="agenticEffortRow" aria-label="Available research effort levels">
        {effortLevels.map((level) => (
          <span className={level === "Auto" ? "active" : undefined} key={level}>
            {level}
          </span>
        ))}
      </div>
      <p className="agenticEffortCaption">Choose an effort or let Auto route the request.</p>
    </section>
  );
}
