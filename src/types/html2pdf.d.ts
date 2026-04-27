declare module "html2pdf.js" {
  type PdfDocument = {
    internal: {
      getNumberOfPages: () => number;
      pageSize: {
        getWidth: () => number;
        getHeight: () => number;
      };
    };
    setPage: (page: number) => void;
    setFontSize: (size: number) => void;
    text: (text: string, x: number, y: number, options?: { align?: "left" | "center" | "right" }) => void;
    output: (type: "blob") => Blob;
  };

  const html2pdf: () => {
    set: (options: unknown) => ReturnType<typeof html2pdf>;
    from: (element: HTMLElement) => ReturnType<typeof html2pdf>;
    toPdf: () => ReturnType<typeof html2pdf>;
    get: (key: "pdf") => Promise<PdfDocument>;
  };

  export default html2pdf;
}
