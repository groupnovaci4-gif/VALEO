/** Courbe d'une seule série (survol + clavier), reprise de la maquette validée. */
import { useLayoutEffect, useRef, useState } from 'react';
import { fmtIsoDate, fmtNumber } from '../format';

export function LineChart({ points, unit }: { points: { day: string; value: number }[]; unit: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  const [cur, setCur] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(320, Math.round(el.clientWidth - 40))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (points.length < 2) {
    return <div className="chart"><p className="caption subtle" style={{ margin: '24px 0' }}>Pas encore assez de données pour tracer une courbe.</p></div>;
  }
  const data = points.map((p) => p.value);
  const H = 240, P = { l: 52, r: 12, t: 12, b: 28 };
  const min = Math.min(...data), max = Math.max(...data);
  const step = max - min > 1000 ? 100 : 1;
  let lo = Math.floor((min * 0.94) / step) * step, hi = Math.ceil((max * 1.03) / step) * step;
  if (hi <= lo) { lo = Math.max(0, lo - 1); hi = lo + 2; }
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / (data.length - 1);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  // Graduations entières et distinctes (petites valeurs : 0, 1, 2… sans doublon).
  const ticks = [...new Set([0, 1, 2, 3].map((k) => Math.round(lo + ((hi - lo) * k) / 3)))];
  const path = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${path}L${x(data.length - 1)},${H - P.b}L${x(0)},${H - P.b}Z`;
  const labels = [...new Set([0, Math.round((data.length - 1) / 4), Math.round((data.length - 1) / 2), Math.round(((data.length - 1) * 3) / 4), data.length - 1])];
  const show = (i: number) => setCur(Math.max(0, Math.min(data.length - 1, i)));
  const c = cur;
  return (
    <div className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${unit}, de ${fmtNumber(data[0])} à ${fmtNumber(data[data.length - 1])}`}>
        <g className="grid">{ticks.map((t) => <line key={t} x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={P.l - 8} y={y(t) + 4} textAnchor="end">{fmtNumber(t)}</text>)}
          {labels.map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle">{fmtIsoDate(points[i].day).slice(0, 5)}</text>)}
        </g>
        <path d={area} fill="var(--chartArea)" />
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {c !== null && (
          <>
            <line x1={x(c)} x2={x(c)} y1={P.t} y2={H - P.b} stroke="var(--borderStrong)" strokeDasharray="3 3" />
            <circle cx={x(c)} cy={y(data[c])} r={5} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
        <rect
          x={P.l} y={P.t} width={W - P.l - P.r} height={H - P.t - P.b} fill="transparent" tabIndex={0} aria-label="Parcourir les valeurs avec les flèches"
          onMouseMove={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); const vx = ((e.clientX - r.left) / r.width) * W; show(Math.round(((vx - P.l) / (W - P.l - P.r)) * (data.length - 1))); }}
          onMouseLeave={() => setCur(null)} onBlur={() => setCur(null)} onFocus={() => show(cur ?? data.length - 1)}
          onKeyDown={(e) => { if (e.key === 'ArrowLeft') { show((cur ?? data.length - 1) - 1); e.preventDefault(); } if (e.key === 'ArrowRight') { show((cur ?? data.length - 1) + 1); e.preventDefault(); } }}
        />
      </svg>
      <div className="tip" role="status" aria-live="polite" style={c === null ? { opacity: 0 } : { opacity: 1, left: `${(x(c) / W) * 100}%`, top: `${(y(data[c]) / H) * 100}%`, transform: 'translate(-50%, -120%)' }}>
        {c !== null && <>{fmtIsoDate(points[c].day)}<br /><b>{fmtNumber(data[c])}</b> {unit.toLowerCase()}</>}
      </div>
    </div>
  );
}
