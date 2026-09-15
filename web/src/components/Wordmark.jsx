import { BRAND } from '../lib/brand.js';

/**
 * The club's mark.
 *
 * The supplied logo is dark green on transparent, so it needs a light plate
 * to read against the Dornoch-green sidebar — the repo has no light-on-dark
 * variant (assets/royal-dornoch-logo.png and -dark.png are byte-identical).
 * Drop a reversed logo in and set BRAND.logoOnDark to skip the plate.
 */
export default function Wordmark({ showTagline = true }) {
  if (BRAND.logoUrl) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div
          style={
            BRAND.logoOnDark
              ? undefined
              : {
                  background: 'var(--text-primary)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem 1rem',
                  display: 'inline-block',
                  lineHeight: 0,
                }
          }
        >
          <img src={BRAND.logoUrl} alt={BRAND.name} width="168" />
        </div>
        {showTagline && (
          <div className="wordmark-sub" style={{ marginTop: '0.625rem' }}>
            {BRAND.tagline}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="wordmark">{BRAND.name}</div>
      <div className="wordmark-rule" />
      {showTagline && <div className="wordmark-sub">{BRAND.tagline}</div>}
    </div>
  );
}
