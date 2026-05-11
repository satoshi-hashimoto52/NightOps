export function parseFenceMeta(infoText) {
  const raw = String(infoText ?? "").trim();
  if (!raw) {
    return {
      language: "",
      metadata: {}
    };
  }

  const colonIndex = raw.indexOf(":");
  const language = (colonIndex === -1 ? raw : raw.slice(0, colonIndex)).trim();
  const metadataText = colonIndex === -1 ? "" : raw.slice(colonIndex + 1).trim();
  const metadata = {};

  if (metadataText) {
    for (const entry of metadataText.split(",")) {
      const token = entry.trim();
      if (!token) {
        continue;
      }

      const equalsIndex = token.indexOf("=");
      if (equalsIndex === -1) {
        metadata[token] = true;
        continue;
      }

      const key = token.slice(0, equalsIndex).trim();
      if (!key) {
        continue;
      }

      const value = token.slice(equalsIndex + 1).trim();
      metadata[key] = value;
    }
  }

  return {
    language,
    metadata
  };
}
