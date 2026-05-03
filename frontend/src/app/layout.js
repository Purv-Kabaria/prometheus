import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import AnomalyAlertBar from "@/components/AnomalyAlertBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Prometheus Grid Dashboard",
  description: "Advanced energy consumption monitoring and predictive analytics.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-[var(--background)] text-[var(--foreground)] m-0">
        <AnomalyAlertBar />
        <Sidebar />
        <main className="flex-1 overflow-auto h-screen">
          <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "96px", paddingLeft: "32px", paddingRight: "32px", paddingBottom: "32px" }}>
            <div className="w-full max-w-5xl">
              {children}
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
