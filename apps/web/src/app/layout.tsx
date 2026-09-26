import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { toComponentCss, toCssVariables } from "@meguiars/ui-tokens";
import { ToastProvider } from "@/components/ui/overlay";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meguiar's Detail Center",
  description: "Operación de Meguiar's Detail Center",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <style>{toCssVariables() + toComponentCss()}</style>
      </head>
      <body className="min-h-full flex flex-col">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
