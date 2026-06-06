// A tiny pixel-art companion (InsForge-style), drawn from a character map.

const ART = [
  '.....^.....',
  '.....#.....',
  '..#######..',
  '.#########.',
  '.#o#####o#.',
  '.#########.',
  '.##ooooo##.',
  '.#########.',
  '..#######..',
  '...#...#...',
  '..##...##..',
];

const P = 5;
const FILL: Record<string, string> = {
  '#': '#3ddc97', // body (mint)
  o: '#04150d', // screen / eyes
  '^': '#9bf5cf', // antenna tip
};

export function Mascot({ size = 34 }: { size?: number }) {
  const w = ART[0].length * P;
  const h = ART.length * P;
  return (
    <span className="mascot" aria-hidden="true">
      <svg width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges">
        {ART.flatMap((row, y) =>
          [...row].map((ch, x) =>
            ch === '.' ? null : (
              <rect key={`${x}-${y}`} x={x * P} y={y * P} width={P} height={P} fill={FILL[ch]} />
            ),
          ),
        )}
      </svg>
    </span>
  );
}
