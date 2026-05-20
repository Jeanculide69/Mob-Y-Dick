/**
 * MotoCharts — Graphiques de performance par numéro de moto
 * SVG pur, aucune dépendance externe.
 * Métriques : Meilleur tour | Tours complétés
 * Périodes   : Tout | 12 mois | 6 mois | 3 mois
 */
import { useState, useMemo } from 'react'
import './MotoCharts.css'

// ─── Constantes SVG ────────────────────────────────────────────────
const W   = 800
const H   = 210
const PAD = { left: 82, right: 28, top: 26, bottom: 52 }
const IW  = W - PAD.left - PAD.right  // inner width
const IH  = H - PAD.top  - PAD.bottom // inner height

const METRICS = [
  { key: 'bestLap', label: '⚡ Meilleur Tour' },
  { key: 'laps',    label: '🔄 Tours'         },
]
const PERIODS = [
  { key: 'all', label: 'Tout'    },
  { key: '12m', label: '12 mois' },
  { key: '6m',  label: '6 mois'  },
  { key: '3m',  label: '3 mois'  },
]

const formatTime = (ms) => {
  if (ms == null) return '--'
  const m   = Math.floor(ms / 60000)
  const s   = Math.floor((ms % 60000) / 1000)
  const ms3 = ms % 1000
  return `${m}:${s.toString().padStart(2, '0')}.${ms3.toString().padStart(3, '0')}`
}

const toX = (i, n) =>
  n <= 1 ? PAD.left + IW / 2 : PAD.left + (i / (n - 1)) * IW

const toY = (val, min, max) => {
  const range = max - min || 1
  return PAD.top + (1 - (val - min) / range) * IH
}

// Clamp une valeur entre min et max
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// ─── Composant principal ────────────────────────────────────────────
export default function MotoCharts({ teamHistory }) {
  const [metric, setMetric] = useState('bestLap')
  const [period, setPeriod] = useState('all')
  const [hover, setHover]   = useState(null) // { i, px, py, point }

  // 1. Filtre par période
  const filtered = useMemo(() => {
    if (period === 'all') return teamHistory
    const months = period === '3m' ? 3 : period === '6m' ? 6 : 12
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    return teamHistory.filter(h => new Date(h.session?.created_at) >= cutoff)
  }, [teamHistory, period])

  // 2. Tri chronologique + formatage des points
  const points = useMemo(() => {
    return [...filtered]
      .sort((a, b) => new Date(a.session?.created_at) - new Date(b.session?.created_at))
      .map(h => ({
        label:   h.session?.name || '—',
        date:    h.session?.created_at
          ? new Date(h.session.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
          : '—',
        bestLap: h.bestLap,
        laps:    h.totalLaps,
        pilots:  [h.team?.pilot_1_name, h.team?.pilot_2_name].filter(Boolean).join(' & '),
      }))
      .filter(p => metric === 'laps' ? p.laps > 0 : p.bestLap != null)
  }, [filtered, metric])

  // ── Pas assez de données ──
  if (points.length === 0) {
    return (
      <div className="moto-charts-wrap">
        <MotoChartsHeader metric={metric} setMetric={setMetric} period={period} setPeriod={setPeriod} />
        <div className="moto-charts-empty">
          📊 Aucune donnée sur cette période
        </div>
      </div>
    )
  }
  if (points.length < 2) {
    return (
      <div className="moto-charts-wrap">
        <MotoChartsHeader metric={metric} setMetric={setMetric} period={period} setPeriod={setPeriod} />
        <div className="moto-charts-empty">
          📊 Au moins 2 manches nécessaires pour tracer une courbe
        </div>
      </div>
    )
  }

  const vals = points.map(p => metric === 'bestLap' ? p.bestLap : p.laps)
  const minV = Math.min(...vals)
  const maxV = Math.max(...vals)

  // Lignes de grille horizontales (5 niveaux)
  const gridLines = Array.from({ length: 5 }, (_, i) => {
    const ratio = i / 4
    const v = minV + (maxV - minV) * ratio
    return {
      y:     toY(v, minV, maxV),
      label: metric === 'bestLap' ? formatTime(Math.round(v)) : Math.round(v),
    }
  })

  // ── Rendu ──
  return (
    <div className="moto-charts-wrap">
      <MotoChartsHeader metric={metric} setMetric={setMetric} period={period} setPeriod={setPeriod} />

      <div className="moto-chart-stage">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="moto-chart-svg"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="mcGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#ff5500" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ff5500" stopOpacity="0"    />
            </linearGradient>
          </defs>

          {/* Grille horizontale */}
          {gridLines.map((gl, i) => (
            <g key={i}>
              <line
                x1={PAD.left} y1={gl.y} x2={W - PAD.right} y2={gl.y}
                stroke="rgba(255,255,255,0.055)" strokeWidth="1" strokeDasharray="4 4"
              />
              <text
                x={PAD.left - 8} y={gl.y + 4}
                textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="11"
                fontFamily="inherit"
              >
                {gl.label}
              </text>
            </g>
          ))}

          {/* Axe X */}
          <line
            x1={PAD.left} y1={PAD.top + IH}
            x2={W - PAD.right} y2={PAD.top + IH}
            stroke="rgba(255,255,255,0.1)" strokeWidth="1"
          />

          {metric === 'bestLap' ? (
            <LineChart
              points={points} minV={minV} maxV={maxV}
              hover={hover} setHover={setHover}
            />
          ) : (
            <BarChart
              points={points} maxV={maxV}
              hover={hover} setHover={setHover}
            />
          )}

          {/* Labels X (sessions) */}
          {points.map((p, i) => {
            const x = toX(i, points.length)
            const short = p.label.length > 14 ? p.label.slice(0, 13) + '…' : p.label
            return (
              <text
                key={i} x={x} y={H - PAD.bottom + 20}
                textAnchor="middle" fill="rgba(255,255,255,0.38)"
                fontSize="10" fontFamily="inherit"
              >
                {short}
              </text>
            )
          })}
          {/* Dates sous les labels */}
          {points.map((p, i) => (
            <text
              key={`d${i}`}
              x={toX(i, points.length)} y={H - PAD.bottom + 34}
              textAnchor="middle" fill="rgba(255,255,255,0.2)"
              fontSize="9" fontFamily="inherit"
            >
              {p.date}
            </text>
          ))}
        </svg>

        {/* Tooltip HTML flottant */}
        {hover && (
          <Tooltip hover={hover} metric={metric} />
        )}
      </div>

      {/* Légende */}
      <div className="moto-chart-legend">
        <span className="moto-chart-legend-dot" />
        {metric === 'bestLap' ? 'Meilleur tour par manche (plus bas = meilleur)' : 'Tours complétés par manche'}
        <span className="moto-chart-legend-n">{points.length} manche{points.length > 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}

// ─── Header controls ────────────────────────────────────────────────
function MotoChartsHeader({ metric, setMetric, period, setPeriod }) {
  return (
    <div className="moto-charts-header">
      <h3 className="moto-charts-title">📊 Performances</h3>
      <div className="moto-charts-controls">
        <div className="moto-charts-toggles">
          {METRICS.map(m => (
            <button
              key={m.key}
              className={`moto-chart-tab${metric === m.key ? ' active' : ''}`}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="moto-charts-periods">
          {PERIODS.map(p => (
            <button
              key={p.key}
              className={`moto-period-btn${period === p.key ? ' active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Line chart ─────────────────────────────────────────────────────
function LineChart({ points, minV, maxV, hover, setHover }) {
  const coords = points.map((p, i) => ({
    x: toX(i, points.length),
    y: toY(p.bestLap, minV, maxV),
    p,
    i,
  }))

  const polyPoints = coords.map(c => `${c.x},${c.y}`).join(' ')

  const areaD = [
    `M ${coords[0].x} ${PAD.top + IH}`,
    ...coords.map(c => `L ${c.x} ${c.y}`),
    `L ${coords[coords.length - 1].x} ${PAD.top + IH}`,
    'Z',
  ].join(' ')

  return (
    <g>
      {/* Aire */}
      <path d={areaD} fill="url(#mcGrad)" />

      {/* Ligne */}
      <polyline
        points={polyPoints}
        fill="none" stroke="#ff5500" strokeWidth="2.8"
        strokeLinejoin="round" strokeLinecap="round"
      />

      {/* Ligne verticale de hover */}
      {hover != null && (
        <line
          x1={coords[hover.i]?.x} y1={PAD.top}
          x2={coords[hover.i]?.x} y2={PAD.top + IH}
          stroke="rgba(255,85,0,0.3)" strokeWidth="1" strokeDasharray="4 4"
        />
      )}

      {/* Points */}
      {coords.map(({ x, y, p, i }) => (
        <g key={i}>
          {/* Zone de survol invisible plus grande */}
          <rect
            x={x - 20} y={PAD.top} width={40} height={IH}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
            onMouseEnter={() => setHover({ i, px: x / W * 100, py: y / H * 100, point: p })}
          />
          <circle
            cx={x} cy={y}
            r={hover?.i === i ? 7 : 4.5}
            fill={hover?.i === i ? '#ffffff' : '#ff5500'}
            stroke={hover?.i === i ? '#ff5500' : '#ff3300'}
            strokeWidth={hover?.i === i ? 2.5 : 1.5}
            style={{ transition: 'r 0.12s, fill 0.12s', pointerEvents: 'none' }}
          />
        </g>
      ))}
    </g>
  )
}

// ─── Bar chart ──────────────────────────────────────────────────────
function BarChart({ points, maxV, hover, setHover }) {
  const barW = clamp(IW / points.length * 0.5, 12, 52)

  return (
    <g>
      {points.map((p, i) => {
        const x    = toX(i, points.length)
        const barH = (p.laps / maxV) * IH
        const by   = PAD.top + IH - barH
        const isHov = hover?.i === i

        return (
          <g key={i}>
            <rect
              x={x - barW / 2} y={by}
              width={barW} height={barH}
              fill={isHov ? '#ff7730' : '#ff5500'}
              rx="5" ry="5"
              style={{ cursor: 'pointer', transition: 'fill 0.12s' }}
              onMouseEnter={() => setHover({ i, px: x / W * 100, py: by / H * 100, point: p })}
              onMouseLeave={() => setHover(null)}
            />
            {/* Valeur au-dessus */}
            <text
              x={x} y={by - 6}
              textAnchor="middle"
              fill={isHov ? '#ffffff' : 'rgba(255,255,255,0.55)'}
              fontSize="12" fontWeight="800" fontFamily="inherit"
            >
              {p.laps}
            </text>
          </g>
        )
      })}
    </g>
  )
}

// ─── Tooltip ────────────────────────────────────────────────────────
function Tooltip({ hover, metric }) {
  // Colle le tooltip à droite si trop près du bord gauche
  const leftPct  = clamp(hover.px, 10, 82)
  const topPct   = clamp(hover.py, 8, 70)
  const flipLeft = hover.px > 72

  return (
    <div
      className="moto-chart-tooltip"
      style={{
        left:      `${leftPct}%`,
        top:       `${topPct}%`,
        transform: flipLeft
          ? 'translate(-110%, -115%)'
          : 'translate(-50%, -115%)',
      }}
    >
      <div className="moto-chart-tt-title">{hover.point.label}</div>
      <div className="moto-chart-tt-date">{hover.point.date}</div>
      <div className="moto-chart-tt-val">
        {metric === 'bestLap'
          ? <>⚡ <strong>{formatTime(hover.point.bestLap)}</strong></>
          : <>🔄 <strong>{hover.point.laps}</strong> tours</>
        }
      </div>
      {hover.point.pilots && (
        <div className="moto-chart-tt-pilots">👤 {hover.point.pilots}</div>
      )}
    </div>
  )
}
