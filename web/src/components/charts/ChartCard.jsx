import { cx } from './cx.js';

/**
 * The frame every chart sits in: title, optional subtitle, the plot, and a
 * footer that carries the table view. Keeping the footer in the frame is what
 * makes "every chart has a table" cheap enough to actually hold to.
 */
export function ChartCard({ title, subtitle, action, children, footer, className }) {
  return (
    <section className={cx('card stack', className)} style={{ gap: '0.75rem' }}>
      <div className="between" style={{ alignItems: 'flex-start', gap: '0.75rem' }}>
        <div>
          <h3>{title}</h3>
          {subtitle && (
            <p className="muted" style={{ margin: '0.15rem 0 0', fontSize: '0.8125rem' }}>
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
      {footer}
    </section>
  );
}

/** A disclosure that swaps any chart for the numbers behind it. */
export function TableView({ columns, rows, label = 'table view' }) {
  if (!rows.length) return null;

  return (
    <details className="chart-table">
      <summary className="btn-sm">Show {label}</summary>
      <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
        <table className="data" style={{ minWidth: 0 }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.numeric ? 'num' : undefined}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key ?? index}>
                {columns.map((column) => (
                  <td key={column.key} className={column.numeric ? 'num' : undefined}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
