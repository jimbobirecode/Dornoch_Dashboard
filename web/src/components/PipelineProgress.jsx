import { PIPELINE_STAGES, STATUS_COLORS, normaliseStatus, statusColor } from '../lib/status.js';

export default function PipelineProgress({ status }) {
  const current = normaliseStatus(status);

  if (current === 'Rejected' || current === 'Cancelled') {
    return (
      <div
        className="card"
        style={{
          padding: '0.75rem',
          textAlign: 'center',
          borderColor: statusColor(current),
          background: 'var(--surface-0)',
        }}
      >
        <span style={{ color: statusColor(current), fontWeight: 700, letterSpacing: '0.05em' }}>
          {current.toUpperCase()}
        </span>
      </div>
    );
  }

  const currentIndex = Math.max(PIPELINE_STAGES.indexOf(current), 0);
  const fillWidth = (currentIndex / (PIPELINE_STAGES.length - 1)) * 84; // track spans 8%–92%

  return (
    <div className="pipeline">
      <div className="pipeline-track" />
      <div className="pipeline-fill" style={{ width: `${fillWidth}%` }} />
      {PIPELINE_STAGES.map((stage, index) => {
        const reached = index <= currentIndex;
        return (
          <div
            key={stage}
            className={`pipeline-node${reached ? ' reached' : ''}${index === currentIndex ? ' current' : ''}`}
            style={{ '--node-color': STATUS_COLORS[stage] }}
          >
            <div className="pipeline-dot" />
            <div className="pipeline-label">{stage}</div>
          </div>
        );
      })}
    </div>
  );
}
