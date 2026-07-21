import type { Metadata } from "next";
import "./globals.css";
import { AuthGate } from "./components/AuthGate";

export const metadata: Metadata = {
  title: "Marta - Ekspert analiz kredytowych",
  description: "Chatbot do pytań o sankcję kredytu darmowego",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body><AuthGate>{children}</AuthGate></body>
    </html>
  );
}
