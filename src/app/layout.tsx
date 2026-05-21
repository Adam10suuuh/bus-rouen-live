import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import { PwaRegister } from "./components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bus Rouen Live",
  description:
    "Application non officielle pour suivre les bus, TEOR, metro et arrets Astuce a Rouen.",
  applicationName: "Bus Rouen Live",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Bus Rouen Live",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#087f5b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
