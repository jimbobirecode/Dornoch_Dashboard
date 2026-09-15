import { statusColor, normaliseStatus } from '../lib/status.js';

/** Colour plus the written status — identity is never carried by colour alone. */
export default function StatusPill({ status }) {
  const label = normaliseStatus(status);
  return (
    <span className="status-pill" style={{ '--pill-color': statusColor(status) }}>
      {label}
    </span>
  );
}
