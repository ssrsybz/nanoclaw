import { useState, useEffect, useMemo } from 'react';

interface WorkspaceAvatarProps {
  name: string;        // workspace name (for fallback letter)
  icon: string | null; // null, "iconify:prefix:name", or raw SVG markup
  size?: number;       // pixel size, default 32
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Renders a workspace avatar with three display modes:
 *
 * 1. No icon (null) → first letter of workspace name in a colored square
 * 2. Iconify reference ("iconify:prefix:name") → fetches SVG via proxy, renders inline
 * 3. Custom SVG ("<svg ...>...</svg>") → renders inline directly
 *
 * The component is self-contained: iconify references are fetched lazily,
 * and fetch failures gracefully fall back to the letter avatar.
 */
export default function WorkspaceAvatar({ name, icon, size = 32, onClick }: WorkspaceAvatarProps) {
  const [iconifySvg, setIconifySvg] = useState<string | null>(null);
  const [iconifyError, setIconifyError] = useState(false);

  // Extract iconify icon name (strip "iconify:" prefix)
  const iconifyName = icon?.startsWith('iconify:') ? icon.slice(8) : null;

  useEffect(() => {
    if (iconifyName) {
      setIconifyError(false);
      setIconifySvg(null);
      fetch(`/api/icons/svg?icon=${encodeURIComponent(iconifyName)}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => setIconifySvg(data.svg))
        .catch(() => setIconifyError(true));
    } else {
      setIconifySvg(null);
      setIconifyError(false);
    }
  }, [iconifyName]);

  // Deterministic background color based on workspace name hash
  const bgColor = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hues = [210, 260, 320, 30, 160, 190, 280, 350];
    const hue = hues[Math.abs(hash) % hues.length];
    return `hsl(${hue}, 60%, 92%)`;
  }, [name]);

  const textColor = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hues = [210, 260, 320, 30, 160, 190, 280, 350];
    const hue = hues[Math.abs(hash) % hues.length];
    return `hsl(${hue}, 65%, 40%)`;
  }, [name]);

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: size * 0.45,
    backgroundColor: bgColor,
    color: textColor,
  };

  const containerClass = `shrink-0 flex items-center justify-center rounded-lg overflow-hidden ${
    onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
  }`;

  // Case 1: No icon (or iconify fetch failed) → letter avatar
  if (!icon || (iconifyName && iconifyError)) {
    const letter = name.charAt(0).toUpperCase();
    return (
      <div className={containerClass} style={containerStyle} onClick={onClick}>
        {letter}
      </div>
    );
  }

  // Case 2: Iconify reference with fetched SVG
  if (iconifyName && iconifySvg) {
    return (
      <div
        className={containerClass}
        style={{ width: size, height: size, backgroundColor: bgColor }}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: iconifySvg }}
      />
    );
  }

  // Case 3: Iconify reference still loading → show letter placeholder
  if (iconifyName && !iconifySvg && !iconifyError) {
    const letter = name.charAt(0).toUpperCase();
    return (
      <div className={containerClass} style={containerStyle} onClick={onClick}>
        {letter}
      </div>
    );
  }

  // Case 4: Custom SVG (raw markup)
  if (icon.startsWith('<svg')) {
    return (
      <div
        className={containerClass}
        style={{ width: size, height: size, backgroundColor: bgColor }}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    );
  }

  // Fallback: letter avatar for any unrecognized format
  const letter = name.charAt(0).toUpperCase();
  return (
    <div className={containerClass} style={containerStyle} onClick={onClick}>
      {letter}
    </div>
  );
}
