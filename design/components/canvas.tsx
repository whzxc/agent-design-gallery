import { Frame } from 'adg';

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

export default () => (
  <Frame name="default">
    <Canvas />
  </Frame>
);
