'use client';

import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * A QR code as inline SVG.
 *
 * Drawn from the module matrix by hand rather than using the library's own
 * image output, for two reasons: the dark modules can then use `currentColor`
 * so the code inverts correctly in dark mode, and an SVG stays crisp at any
 * size without a canvas or a raster round trip.
 */
export default function QrCode({ value, size = 168, className = '', label }) {
  const path = useMemo(() => {
    if (!value) return null;
    try {
      // Type 0 auto-sizes to the content; 'M' corrects ~15% damage, which is
      // the usual choice for a code shown on a screen rather than printed.
      const qr = qrcode(0, 'M');
      qr.addData(String(value));
      qr.make();

      const count = qr.getModuleCount();
      const parts = [];
      for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
          // One <path> of many small squares beats thousands of <rect>s: far
          // fewer DOM nodes for the same picture.
          if (qr.isDark(row, col)) parts.push(`M${col} ${row}h1v1h-1z`);
        }
      }
      return { d: parts.join(''), count };
    } catch {
      // Only thrown when the payload exceeds what a QR can hold.
      return null;
    }
  }, [value]);

  if (!path) return null;

  /* One module of quiet zone on each side. The spec asks for four, but at
     phone-screen scale the surrounding card already reads as quiet space,
     and the extra margin just shrinks the modules. */
  const pad = 1;
  const box = path.count + pad * 2;

  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      width={size}
      height={size}
      role="img"
      aria-label={label || 'QR code'}
      shapeRendering="crispEdges"
      className={className}
    >
      {/* Always a light ground, even in dark mode: scanners need the contrast
          to run the right way round, and inverted codes read poorly. */}
      <rect width={box} height={box} fill="#ffffff" rx={pad} />
      <g transform={`translate(${pad} ${pad})`} fill="#0b0c0d">
        <path d={path.d} />
      </g>
    </svg>
  );
}
