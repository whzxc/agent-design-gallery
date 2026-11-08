import { Frame } from 'sdg';
export function Canvas({
  width = 280,
  height = 150,
  children,
}: {
  width?: number;
  height?: number;
  children?: unknown;
}) {
  return (
    <div class="relative overflow-hidden bg-canvas" style={{ width, height }}>
      <svg data-free class="absolute inset-0" width={width} height={height} aria-hidden="true">
        <defs>
          <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" class="fill-dot" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#dots)" />
      </svg>
      {children}
    </div>
  );
}

export function Scrim() {
  return <div class="absolute inset-0 bg-canvas opacity-60" />;
}

export function Screen({ width, height, drawing, children }: any) {
  return (
    <Canvas width={width} height={height}>
      <div data-free class="absolute inset-0">
        <svg class="absolute inset-0 overflow-visible" width={width} height={height}>
          {drawing}
        </svg>
        {children}
      </div>
    </Canvas>
  );
}

export default () => [
  <Frame name="canvas-dots">
    <Canvas />
  </Frame>,
  <Frame name="screen">
    <Screen width={280} height={150} />
  </Frame>,
  <Frame name="scrim">
    <Canvas>
      <Scrim />
    </Canvas>
  </Frame>,
];
