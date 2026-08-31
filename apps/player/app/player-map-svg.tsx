import {
  calculatePlayerSvgViewport,
  hasRenderablePlayerMapGeometry,
  type MapProjection,
} from '@murim/map-renderer';

export interface PlayerMapSvgProps {
  projection: MapProjection;
  accessibleName?: string;
}

const DEFAULT_ACCESSIBLE_NAME = 'Mapa de conhecimento do jogador';
const NODE_RADIUS = 2;
const LABEL_OFFSET = 3;

export function PlayerMapSvg({
  projection,
  accessibleName = DEFAULT_ACCESSIBLE_NAME,
}: PlayerMapSvgProps) {
  if (!hasRenderablePlayerMapGeometry(projection)) {
    return (
      <div className="player-map-empty" data-player-map-state="empty" role="status">
        Nenhum conhecimento de mapa disponível ainda.
      </div>
    );
  }

  const viewport = calculatePlayerSvgViewport(projection);
  const routes = projection.items.filter((item) => item.kind === 'route');
  const nodes = projection.items.filter((item) => item.kind === 'node');

  return (
    <svg
      aria-label={accessibleName}
      className="player-map-svg"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      viewBox={viewport.viewBox}
    >
      <g aria-hidden="true" data-map-layer="routes">
        {routes.map((route) => (
          <polyline
            aria-hidden="true"
            data-route-knowledge-state={route.knowledgeState}
            data-route-style={route.styleKey}
            fill="none"
            key={route.id}
            points={route.path.points.map((point) => `${point.x},${point.y}`).join(' ')}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      <g aria-hidden="true" data-map-layer="uncertainty">
        {nodes.map((node) => {
          if (node.role !== 'ghost' || !node.approximateLocation) {
            return null;
          }

          const { center, radius } = node.approximateLocation;
          return (
            <circle
              aria-hidden="true"
              cx={center.x}
              cy={center.y}
              data-uncertainty="true"
              key={node.id}
              r={radius}
            />
          );
        })}
      </g>

      <g data-map-layer="nodes">
        {nodes.map((node) => {
          const position =
            node.role === 'ghost' && node.approximateLocation
              ? node.approximateLocation.center
              : node.position;

          return (
            <g data-node-role={node.role} key={node.id}>
              <circle
                aria-hidden="true"
                cx={position.x}
                cy={position.y}
                data-node-role={node.role}
                r={NODE_RADIUS}
              />
              {node.label ? (
                <text x={position.x + LABEL_OFFSET} y={position.y}>
                  {node.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}