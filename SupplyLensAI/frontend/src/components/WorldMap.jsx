const ROUTES = [
  { x1: 120, y1: 100, x2: 320, y2: 80, delay: 0, color: "#0ea5e9" },
  { x1: 320, y1: 80, x2: 520, y2: 110, delay: 0.3, color: "#6366f1" },
  { x1: 520, y1: 110, x2: 680, y2: 90, delay: 0.6, color: "#0ea5e9" },
  { x1: 150, y1: 160, x2: 290, y2: 130, delay: 0.2, color: "#14b8a6" },
  { x1: 290, y1: 130, x2: 440, y2: 150, delay: 0.5, color: "#6366f1" },
  { x1: 440, y1: 150, x2: 600, y2: 140, delay: 0.8, color: "#14b8a6" },
  { x1: 180, y1: 200, x2: 350, y2: 180, delay: 0.4, color: "#0ea5e9" },
  { x1: 350, y1: 180, x2: 500, y2: 195, delay: 0.7, color: "#0ea5e9" },
];

const NODES = [
  { cx: 120, cy: 100 },
  { cx: 320, cy: 80 },
  { cx: 520, cy: 110 },
  { cx: 680, cy: 90 },
  { cx: 150, cy: 160 },
  { cx: 290, cy: 130 },
  { cx: 440, cy: 150 },
  { cx: 600, cy: 140 },
  { cx: 180, cy: 200 },
  { cx: 350, cy: 180 },
  { cx: 500, cy: 195 },
];

export default function WorldMap() {
  return (
    <div className="login-map">
      <svg
        viewBox="0 0 800 240"
        className="login-map__svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="login-node-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
          </radialGradient>
          <filter id="login-node-glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {ROUTES.map((route, index) => (
            <linearGradient key={route.delay} id={`login-route-gradient-${index}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={route.color} stopOpacity="0.2" />
              <stop offset="50%" stopColor={route.color} stopOpacity="0.8" />
              <stop offset="100%" stopColor={route.color} stopOpacity="0.2" />
            </linearGradient>
          ))}
        </defs>

        {Array.from({ length: 12 }).map((_, rowIndex) =>
          Array.from({ length: 24 }).map((__, columnIndex) => (
            <circle
              key={`${rowIndex}-${columnIndex}`}
              cx={columnIndex * 34 + 10}
              cy={rowIndex * 22 + 8}
              r={0.8}
              fill="rgba(56,189,248,0.15)"
            />
          )),
        )}

        {ROUTES.map((route, index) => (
          <line
            key={`route-${route.delay}`}
            x1={route.x1}
            y1={route.y1}
            x2={route.x2}
            y2={route.y2}
            stroke={`url(#login-route-gradient-${index})`}
            strokeWidth={1.5}
            strokeLinecap="round"
            style={{
              strokeDasharray: 400,
              strokeDashoffset: 400,
              animation: `drawRoute 2s ease ${route.delay}s forwards`,
            }}
          />
        ))}

        {ROUTES.map((route, index) => (
          <circle
            key={`dot-${route.delay}`}
            r={2.5}
            fill={route.color}
            filter="url(#login-node-glow)"
            opacity={0.9}
          >
            <animateMotion
              dur={`${3 + index * 0.5}s`}
              repeatCount="indefinite"
              begin={`${route.delay}s`}
              path={`M${route.x1},${route.y1} L${route.x2},${route.y2}`}
            />
          </circle>
        ))}

        {NODES.map((node, index) => (
          <g key={`node-${node.cx}-${node.cy}`}>
            <circle cx={node.cx} cy={node.cy} r={8} fill="url(#login-node-gradient)" opacity={0.4} />
            <circle
              cx={node.cx}
              cy={node.cy}
              r={3}
              fill="#38bdf8"
              filter="url(#login-node-glow)"
              opacity={0.9}
            >
              <animate
                attributeName="r"
                values="2.5;4;2.5"
                dur="2s"
                repeatCount="indefinite"
                begin={`${index * 0.3}s`}
              />
              <animate
                attributeName="opacity"
                values="0.7;1;0.7"
                dur="2s"
                repeatCount="indefinite"
                begin={`${index * 0.3}s`}
              />
            </circle>
          </g>
        ))}
      </svg>
    </div>
  );
}
