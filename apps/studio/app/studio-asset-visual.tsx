'use client';

import { Circle, Image as KonvaImage } from 'react-konva';
import { useEffect, useState } from 'react';
import { assetManifestForId } from '../lib/studio-assets';

interface StudioAssetVisualProps {
  assetId?: string;
  scale: number;
  highlighted?: boolean;
}

interface LoadedAssetImage {
  source: string;
  image: HTMLImageElement;
}

export function StudioAssetVisual({ assetId, scale, highlighted = false }: StudioAssetVisualProps) {
  const manifest = assetManifestForId(assetId);
  const source = manifest?.source;
  const [loaded, setLoaded] = useState<LoadedAssetImage | null>(null);

  useEffect(() => {
    if (!source) return;

    let active = true;
    const next = new window.Image();
    next.decoding = 'async';
    next.onload = () => {
      if (active) setLoaded({ source, image: next });
    };
    next.onerror = () => {
      if (active) {
        setLoaded((current) => (current?.source === source ? null : current));
      }
    };
    next.src = source;

    return () => {
      active = false;
    };
  }, [source]);

  const image = source && loaded?.source === source ? loaded.image : null;

  if (!manifest || !image) {
    return (
      <>
        <Circle
          radius={(highlighted ? 14 : 11) / scale}
          fill={highlighted ? '#d9dfda' : '#9ca7a1'}
          stroke="#0c0d0d"
          strokeWidth={3 / scale}
          listening={false}
        />
        <Circle radius={4 / scale} fill="#0c0d0d" listening={false} />
      </>
    );
  }

  const size = manifest.defaultSize?.width ?? 42;
  return (
    <KonvaImage
      image={image}
      x={-size / 2 / scale}
      y={-size / 2 / scale}
      width={size / scale}
      height={size / scale}
      opacity={highlighted ? 1 : 0.88}
      listening={false}
    />
  );
}
