import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

// Keep the tactical display inside notched iPhone and Android safe areas without
// disabling browser zoom. Unity should mirror this contract with Screen.safeArea.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#06131d",
  colorScheme: "dark",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const title = "DEEP BLUE GRID — 海戦タクティクス";
  const description = "8×8の戦術図で索敵・砲撃・特殊兵装を指揮し、海域攻略・累積損耗・固定状況の限定任務へ挑む一人用海戦ゲーム。";
  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: [{ url: image, width: 1536, height: 1024, alt: "DEEP BLUE GRID tactical display" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      {/* vinext currently omits viewportFit from Next's Viewport serialization,
          so keep an explicit equivalent for this alternate server entry. */}
      <head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></head>
      <body>{children}</body>
    </html>
  );
}
