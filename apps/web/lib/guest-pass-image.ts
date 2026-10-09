import QRCode from "qrcode";

/**
 * Fixed brand palette for the shareable pass image (SPEC "Night Session": background #0B0F0D,
 * ball #D7F24A, off-white #F7F6F2). The image looks the same whatever theme the sender uses.
 */
const IMAGE = {
  background: "#0B0F0D",
  card: "#141A17",
  border: "rgba(247, 246, 242, 0.08)",
  text: "#F7F6F2",
  muted: "rgba(247, 246, 242, 0.62)",
  accent: "#D7F24A",
  qrDark: "#0B0F0D",
  qrLight: "#F7F6F2",
} as const;

const WIDTH = 1080;
const HEIGHT = 1440;

/** QR as a data URL for on-screen display (the token is the only content). */
export function qrDataUrl(token: string, size = 512): Promise<string> {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: IMAGE.qrDark, light: IMAGE.qrLight },
  });
}

/** Font family behind a CSS variable set by next/font (falls back to the body font). */
function fontFamily(variable: string): string {
  if (typeof document === "undefined") return "sans-serif";
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || getComputedStyle(document.body).fontFamily || "sans-serif";
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

/** Shortens `text` with an ellipsis until it fits `maxWidth`. */
function fit(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && context.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

export interface PassImageText {
  club: string;
  heading: string;
  guestName: string;
  /** Long visit date, e.g. "sábado, 10 de outubro". */
  date: string;
  hostLine: string;
  footer: string;
}

/** Renders the pass (club, guest, date, QR) as a PNG for sharing or download. */
export async function renderPassImage(token: string, text: PassImageText): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available");
  const display = fontFamily("--font-bricolage");
  const sans = fontFamily("--font-geist-sans");

  context.fillStyle = IMAGE.background;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  // Card
  const margin = 72;
  roundedRect(context, margin, margin, WIDTH - margin * 2, HEIGHT - margin * 2, 48);
  context.fillStyle = IMAGE.card;
  context.fill();
  context.strokeStyle = IMAGE.border;
  context.lineWidth = 3;
  context.stroke();

  const inner = margin + 72;
  const innerWidth = WIDTH - inner * 2;
  context.textBaseline = "alphabetic";

  context.fillStyle = IMAGE.accent;
  context.font = `600 34px ${sans}`;
  context.fillText(fit(context, text.club.toUpperCase(), innerWidth), inner, inner + 30);

  context.fillStyle = IMAGE.muted;
  context.font = `500 34px ${sans}`;
  context.fillText(fit(context, text.heading, innerWidth), inner, inner + 86);

  context.fillStyle = IMAGE.text;
  context.font = `700 72px ${display}`;
  context.fillText(fit(context, text.guestName, innerWidth), inner, inner + 186);

  context.fillStyle = IMAGE.text;
  context.font = `500 40px ${sans}`;
  context.fillText(fit(context, text.date, innerWidth), inner, inner + 250);

  // QR on a light tile
  const qrSize = 640;
  const qrX = (WIDTH - qrSize) / 2;
  const qrY = inner + 310;
  roundedRect(context, qrX - 28, qrY - 28, qrSize + 56, qrSize + 56, 36);
  context.fillStyle = IMAGE.qrLight;
  context.fill();
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, token, {
    errorCorrectionLevel: "M",
    margin: 0,
    width: qrSize,
    color: { dark: IMAGE.qrDark, light: IMAGE.qrLight },
  });
  context.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  context.fillStyle = IMAGE.muted;
  context.font = `500 32px ${sans}`;
  context.textAlign = "center";
  context.fillText(fit(context, text.hostLine, innerWidth), WIDTH / 2, qrY + qrSize + 110);
  context.fillText(fit(context, text.footer, innerWidth), WIDTH / 2, qrY + qrSize + 160);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not render the pass"))),
      "image/png",
    ),
  );
}

/** Shares the image with the Web Share API when files are supported, otherwise downloads it. */
export async function shareOrDownload(
  blob: Blob,
  fileName: string,
  share: { title: string; text: string },
): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], fileName, { type: "image/png" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: share.title, text: share.text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Fall through to a download when sharing fails for another reason.
    }
  }
  downloadBlob(blob, fileName);
  return "downloaded";
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
