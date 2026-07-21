import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
