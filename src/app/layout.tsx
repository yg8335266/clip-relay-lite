import type { Metadata } from "next";
import PwaBootstrap from "@/components/PwaBootstrap";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Clip Relay",
  description: "Self-hosted clipboard for text, files and images with realtime sync.",
  keywords: ["Clip Relay", "Next.js", "TypeScript", "Tailwind CSS", "shadcn/ui", "SSE"],
  authors: [{ name: "Clip Relay" }],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Clip Relay",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "Clip Relay",
    description: "Share snippets and files across devices in realtime.",
    siteName: "Clip Relay",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clip Relay",
    description: "Share snippets and files across devices in realtime.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <Providers>
          <PwaBootstrap />
          {children}
        </Providers>
      </body>
    </html>
  );
}
