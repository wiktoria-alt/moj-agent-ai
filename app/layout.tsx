import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthGate } from "./components/AuthGate";

export const metadata: Metadata = {
  metadataBase: new URL("https://moj-agent-ai-ten.vercel.app"),
  applicationName: "Agent SKD",
  title: {
    default: "Agent SKD - ekspert AI od sankcji kredytu darmowego",
    template: "%s | Agent SKD",
  },
  description: "Asystent AI do wstepnej analizy sankcji kredytu darmowego, dokumentow kredytowych i checklist SKD.",
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
    siteName: "Agent SKD",
    title: "Agent SKD",
    description: "Ekspert AI od sankcji kredytu darmowego, analizy umow i checklist SKD.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Agent SKD - ekspert AI od sankcji kredytu darmowego",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent SKD",
    description: "Ekspert AI od sankcji kredytu darmowego, analizy umow i checklist SKD.",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Agent SKD",
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
