import { fmtNumber, fmtPercent } from '../format';

/** Barres horizontales (part de chaque ligne dans le total). */
export function HBars({ rows, total, percentOnly }: { rows: [string, number][]; total: number; percentOnly?: boolean }) {
  return (
    <>
      {rows.map(([l, v]) => (
        <div className="hbar" key={l}>
          <div className="row">
            <span>{l}</span>
            <span>
              {percentOnly ? <b>{v}&nbsp;%</b> : <><b>{fmtNumber(v)}</b> <span className="subtle">· {fmtPercent(v, total)}</span></>}
            </span>
          </div>
          <div className="trk" role="img" aria-label={`${l} ${percentOnly ? `${v} %` : fmtPercent(v, total)}`}>
            <div className="fill" style={{ width: `${total ? (v / total) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </>
  );
}
