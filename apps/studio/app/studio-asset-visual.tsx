'use client';

import { Circle, Image as KonvaImage } from 'react-konva';
import { useEffect, useState } from 'react';
import { assetManifestForId } from '../lib/studio-assets';

interface StudioAssetVisualProps {
  assetId?: string;
  scale: number;
  highlighted?: boolean;
}

export function StudioAssetVisual({ assetId, scale, highlighted = false }: StudioAssetVisualProps) {
  const manifest = assetManifestForId(assetId);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!manifest) {
      setImage(null);
      return;
    }

    let active = true;
    const next = new window.Image();
    next.decoding = 'async';
    next.onload = () => {
      if (active) setImage(next);
    };
    next.onerror = () => {
      if (active) setImage(null);
    };
    next.src = manifest.source;

    return () => {
      active = false;
    };
  }, [manifest]);

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
