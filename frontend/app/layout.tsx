import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import SWRegistrar from "@/components/SWRegistrar";
import AuthProvider from "@/components/AuthProvider";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voyager — AI Document Intelligence",
  description: "Ask questions about your documents, get cited answers.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="flex h-screen bg-zinc-950 text-white overflow-hidden antialiased">
        <SWRegistrar />
        <AuthProvider>
          <Sidebar />
          <main className="flex-1 overflow-auto">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
