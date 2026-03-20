import "@/styles/globals.css";

export const metadata = {
  title: "INFA Flow Visualizer",
  description:
    "Informatica PowerCenter XML Workflow Visualizer & Field Mapper — parse XML exports into visual flow diagrams and table-by-table field mappings.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
