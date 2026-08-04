import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthGate } from "./components/AuthGate";

export const metadata: Metadata = {
  metadataBase: new URL("https://moj-agent-ai-agent-ai-szkolenie.vercel.app"),
  applicationName: "Agent AI",
  title: {
    default: "Agent AI - Twoj osobisty asystent AI",
    template: "%s | Agent AI",
  },
  description: "Osobisty asystent AI z baza wiedzy, pamiecia rozmow i automatyzacja.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "pl_PL",
    siteName: "Agent AI",
    title: "Agent AI",
    description: "Twoj osobisty asystent AI z baza wiedzy, pamiecia i automatyzacja.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Agent AI - Twoj osobisty asystent AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent AI",
    description: "Twoj osobisty asystent AI z baza wiedzy, pamiecia i automatyzacja.",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Agent AI",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090c17" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

const themeScript = `
(() => {
  try {
    const theme = localStorage.getItem("agent-ai-theme") === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body><AuthGate>{children}</AuthGate></body>
    </html>
  );
}
