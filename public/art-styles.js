// Both review packaging and the Playable sandbox accept only embedded CSS.
export function embeddedArtStylesheet(href) {
  const data = /^data:text\/css(?:;charset=[\w-]+)?(;base64)?,(.*)$/is.exec(href ?? '');
  if (!data) return null;
  try {
    const text = decodeURIComponent(data[2]);
    return data[1]
      ? new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(text), char => char.charCodeAt(0)))
      : text;
  } catch { return null; }
}
