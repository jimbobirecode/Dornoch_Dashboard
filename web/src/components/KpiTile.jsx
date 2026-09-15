/**
 * A stat tile — the right form for a single headline number. Renders as a
 * button when it also acts as a filter toggle.
 */
export default function KpiTile({ label, value, sub, accent, onClick, pressed }) {
  const content = (
    <>
      <div className="label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </>
  );

  if (!onClick) {
    return (
      <div className="kpi" style={{ '--kpi-accent': accent }}>
        {content}
      </div>
    );
  }

  return (
    <button type="button" className="kpi" style={{ '--kpi-accent': accent }} onClick={onClick} aria-pressed={pressed}>
      {content}
    </button>
  );
}
