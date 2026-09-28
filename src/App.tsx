import { useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Lead, Message } from "./types";

const path = window.location.pathname.replace(/\/+$/, "") || "/inbox";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function Layout({ children }: { children: ReactNode }) {
  const isPipeline = path === "/pipeline";
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/inbox" aria-label="InboxIQ home"><span className="brand-mark">IQ</span><span>InboxIQ</span></a>
        <nav aria-label="Primary navigation">
          <a className={!isPipeline ? "nav-link active" : "nav-link"} href="/inbox" aria-current={!isPipeline ? "page" : undefined}>Inbox</a>
          <a className={isPipeline ? "nav-link active" : "nav-link"} href="/pipeline" aria-current={isPipeline ? "page" : undefined}>Pipeline</a>
        </nav>
        <span className="status-pill"><span className="status-dot" /> Local workspace</span>
      </header>
      {children}
    </div>
  );
}

function StateMessage({ children }: { children: ReactNode }) {
  return <p className="state-message">{children}</p>;
}

function InboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    api.listMessages().then((result) => {
      if (active) { setMessages(result); setState("ready"); }
    }).catch(() => active && setState("error"));
    return () => { active = false; };
  }, []);

  return (
    <main className="page-container">
      <section className="page-heading"><div><p className="eyebrow">Sales workspace</p><h1>Inbox</h1><p className="muted">Review inbound conversations and decide what deserves a follow-up.</p></div><div className="metric-card"><strong>{messages.length}</strong><span>messages</span></div></section>
      <section className="panel" aria-labelledby="messages-heading">
        <div className="panel-heading"><h2 id="messages-heading">Latest messages</h2><span className="muted">Deterministic demo data</span></div>
        {state === "loading" && <StateMessage>Loading inbox…</StateMessage>}
        {state === "error" && <StateMessage>Could not load the inbox. Check that the API is running.</StateMessage>}
        {state === "ready" && <ul className="message-list">{messages.map((message) => <MessageRow key={message.id} message={message} />)}</ul>}
      </section>
    </main>
  );
}

function MessageRow({ message }: { message: Message }) {
  return (
    <li>
      <a className="message-row" href={`/inbox/${message.id}`}>
        <span className="avatar">{message.senderName.slice(0, 1)}</span>
        <span className="message-copy">
          <span className="message-meta"><strong>{message.senderName}</strong><span>{formatDate(message.createdAt)}</span></span>
          <span className="message-subject">{message.subject}</span>
          <span className="message-preview">{message.company} · {message.body}</span>
        </span>
        <span className="row-arrow" aria-hidden="true">→</span>
      </a>
    </li>
  );
}

function LeadExtractionPanel({ messageId }: { messageId: string }) {
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [material, setMaterial] = useState("");
  const [budget, setBudget] = useState("");

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleExtract = async () => {
    setIsExtracting(true);
    setExtractionError(null);
    try {
      const data = await api.extractLead(messageId);
      setProduct((prev) => (prev.trim() !== "" ? prev : data.product ?? ""));
      setQuantity((prev) =>
        prev.trim() !== ""
          ? prev
          : data.quantity !== null && data.quantity !== undefined
          ? String(data.quantity)
          : "",
      );
      setMaterial((prev) => (prev.trim() !== "" ? prev : data.material ?? ""));
      setBudget((prev) =>
        prev.trim() !== ""
          ? prev
          : data.budget !== null && data.budget !== undefined
          ? String(data.budget)
          : "",
      );
    } catch {
      setExtractionError("Could not extract lead data with AI. You can still fill the form manually.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    const trimmedProduct = product.trim();
    if (!trimmedProduct) {
      setSaveError("Product is required.");
      return;
    }

    const parsedQuantity = Number(quantity.trim());
    if (!quantity.trim() || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setSaveError("Quantity must be a positive whole number.");
      return;
    }

    const trimmedBudget = budget.trim();
    let parsedBudget: number | null = null;
    if (trimmedBudget !== "") {
      parsedBudget = Number(trimmedBudget);
      if (Number.isNaN(parsedBudget) || !Number.isFinite(parsedBudget) || parsedBudget < 0) {
        setSaveError("Budget must be a non-negative number.");
        return;
      }
    }

    setIsSaving(true);
    try {
      await api.createLead({
        sourceMessageId: messageId,
        product: trimmedProduct,
        quantity: parsedQuantity,
        material: material.trim() || null,
        budget: parsedBudget,
      });
      window.location.href = "/pipeline";
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save lead.");
      setIsSaving(false);
    }
  };

  return (
    <aside className="panel extraction-panel" aria-label="Lead extraction">
      <div className="extraction-header">
        <div>
          <p className="eyebrow">Lead extraction</p>
          <h2>Create lead</h2>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          onClick={handleExtract}
          disabled={isExtracting || isSaving}
        >
          {isExtracting ? "Extracting…" : "Extract with AI"}
        </button>
      </div>

      {extractionError && (
        <div role="alert" className="alert-box">
          {extractionError}
        </div>
      )}

      {saveError && (
        <div role="alert" className="alert-box">
          {saveError}
        </div>
      )}

      <form className="lead-form" onSubmit={handleSaveLead}>
        <div className="form-field">
          <label htmlFor="lead-product">Product</label>
          <input
            id="lead-product"
            name="product"
            type="text"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            disabled={isSaving}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="lead-quantity">Quantity</label>
          <input
            id="lead-quantity"
            name="quantity"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={isSaving}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="lead-material">Material</label>
          <input
            id="lead-material"
            name="material"
            type="text"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            disabled={isSaving}
          />
        </div>

        <div className="form-field">
          <label htmlFor="lead-budget">Budget</label>
          <input
            id="lead-budget"
            name="budget"
            type="number"
            min="0"
            step="any"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            disabled={isSaving}
          />
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSaving || isExtracting}
          >
            {isSaving ? "Saving lead…" : "Save lead"}
          </button>
        </div>
      </form>
    </aside>
  );
}

function DetailPage({ messageId }: { messageId: string }) {
  const [message, setMessage] = useState<Message | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    api.getMessage(messageId).then((result) => {
      if (active) { setMessage(result); setState("ready"); }
    }).catch(() => active && setState("error"));
    return () => { active = false; };
  }, [messageId]);

  if (state === "loading") return <main className="page-container"><StateMessage>Loading message…</StateMessage></main>;
  if (state === "error" || !message) return <main className="page-container"><StateMessage>Message not found.</StateMessage></main>;

  return (
    <main className="page-container detail-layout">
      <a className="back-link" href="/inbox">← Back to inbox</a>
      <section className="detail-grid">
        <article className="panel message-detail">
          <p className="eyebrow">Inbound message</p>
          <h1>{message.subject}</h1>
          <dl className="message-facts">
            <div><dt>Sender</dt><dd>{message.senderName} · {message.senderEmail}</dd></div>
            <div><dt>Company</dt><dd>{message.company}</dd></div>
          </dl>
          <div className="message-body">{message.body}</div>
        </article>
        <LeadExtractionPanel messageId={messageId} />
      </section>
    </main>
  );
}

function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    api.listLeads().then((result) => {
      if (active) { setLeads(result); setState("ready"); }
    }).catch(() => active && setState("error"));
    return () => { active = false; };
  }, []);

  const handleLeadUpdated = (updatedLead: Lead) => {
    setLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)));
  };

  return (
    <main className="page-container">
      <section className="page-heading"><div><p className="eyebrow">Revenue view</p><h1>Pipeline</h1><p className="muted">Saved leads will appear here.</p></div><div className="metric-card"><strong>{leads.length}</strong><span>leads</span></div></section>
      <section className="panel" aria-labelledby="pipeline-heading">
        <div className="panel-heading"><h2 id="pipeline-heading">Leads</h2></div>
        {state === "loading" && <StateMessage>Loading pipeline…</StateMessage>}
        {state === "error" && <StateMessage>Could not load the pipeline.</StateMessage>}
        {state === "ready" && (leads.length === 0 ? <p className="state-message">No leads yet.</p> : <ul className="lead-list">{leads.map((lead) => <LeadCard key={lead.id} lead={lead} onStatusUpdated={handleLeadUpdated} />)}</ul>)}
      </section>
    </main>
  );
}

function LeadCard({ lead, onStatusUpdated }: { lead: Lead; onStatusUpdated: (updated: Lead) => void }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMarkContacted = async () => {
    setIsUpdating(true);
    setError(null);
    try {
      const updated = await api.updateLeadStatus(lead.id, "CONTACTED");
      onStatusUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update lead status.");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <li className="lead-card">
      <div className="lead-content">
        <h3>{lead.product}</h3>
        <p>
          {lead.quantity} unit{lead.quantity === 1 ? "" : "s"}
          {lead.material ? ` · ${lead.material}` : ""}
        </p>
        <span className="muted">
          <span className={`status-badge ${lead.status === "CONTACTED" ? "status-contacted" : "status-new"}`}>
            {lead.status}
          </span>
          <span>·</span>
          <span>{lead.budget === null ? "Budget unknown" : `${lead.budget}`}</span>
        </span>
        {error && (
          <div role="alert" className="alert-box" style={{ marginTop: "10px" }}>
            {error}
          </div>
        )}
      </div>
      {lead.status === "NEW" && (
        <div className="lead-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleMarkContacted}
            disabled={isUpdating}
          >
            {isUpdating ? "Updating…" : "Mark as contacted"}
          </button>
        </div>
      )}
    </li>
  );
}

export function App() {
  const content = path === "/pipeline" ? <PipelinePage /> : path.startsWith("/inbox/") ? <DetailPage messageId={decodeURIComponent(path.slice("/inbox/".length))} /> : <InboxPage />;
  return <Layout>{content}</Layout>;
}
