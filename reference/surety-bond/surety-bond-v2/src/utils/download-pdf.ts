import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export async function downloadDocumentAsPdf(
  apiUrl: string,
  token: string,
  fileName: string
): Promise<void> {
  if (!token) throw new Error("Authentication required");

  const separator = apiUrl.includes("?") ? "&" : "?";
  const url = `${apiUrl}${separator}token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
  const html = await res.text();

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "800px";
  container.style.background = "#fff";
  container.style.zIndex = "-1";

  const wrapper = document.createElement("div");

  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");

  const styles = parsed.querySelectorAll("style");
  styles.forEach((s) => {
    const clone = document.createElement("style");
    clone.textContent = s.textContent;
    wrapper.appendChild(clone);
  });

  const noPrint = parsed.body.querySelectorAll(".no-print");
  noPrint.forEach((el) => el.remove());

  const content = document.createElement("div");
  content.innerHTML = parsed.body.innerHTML;
  content.style.width = "800px";
  content.style.background = "#fff";
  content.style.padding = "0";
  wrapper.appendChild(content);
  container.appendChild(wrapper);
  document.body.appendChild(container);

  await new Promise((r) => setTimeout(r, 400));

  try {
    const pageBreaks = content.querySelectorAll(".page-break");

    if (pageBreaks.length > 0) {
      const sections: HTMLElement[] = [];
      const allElements = Array.from(content.querySelectorAll("*")) as HTMLElement[];
      const breakPositions = new Set(Array.from(pageBreaks));

      const sectionContainers: HTMLElement[] = [];
      let currentContainer = document.createElement("div");
      currentContainer.style.width = "800px";
      currentContainer.style.background = "#fff";

      const topLevelParent = content.querySelector(".container") || content;
      const topChildren = Array.from(topLevelParent.children) as HTMLElement[];

      for (const child of topChildren) {
        if (child.classList.contains("page-break")) {
          if (currentContainer.children.length > 0) {
            sectionContainers.push(currentContainer);
          }
          currentContainer = document.createElement("div");
          currentContainer.style.width = "800px";
          currentContainer.style.background = "#fff";
        } else {
          currentContainer.appendChild(child.cloneNode(true));
        }
      }
      if (currentContainer.children.length > 0) {
        sectionContainers.push(currentContainer);
      }

      for (const sec of sectionContainers) {
        container.appendChild(sec);
        sections.push(sec);
      }

      await new Promise((r) => setTimeout(r, 200));

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = 210;
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;

      for (let i = 0; i < sections.length; i++) {
        if (i > 0) pdf.addPage();

        const canvas = await html2canvas(sections[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          width: 800,
          logging: false,
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const imgWidth = contentWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        pdf.addImage(imgData, "JPEG", margin, margin, imgWidth, imgHeight);
      }

      pdf.save(pdfName(fileName));
    } else {
      const canvas = await html2canvas(content, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 800,
        logging: false,
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;

      const imgWidth = contentWidth;
      const totalImgHeight = (canvas.height * imgWidth) / canvas.width;

      if (totalImgHeight <= contentHeight) {
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        pdf.addImage(imgData, "JPEG", margin, margin, imgWidth, totalImgHeight);
      } else {
        const scaleFactor = canvas.width / imgWidth;
        const sliceHeightMm = contentHeight;
        const sliceHeightPx = sliceHeightMm * scaleFactor;
        let sourceY = 0;
        let pageIndex = 0;

        while (sourceY < canvas.height) {
          if (pageIndex > 0) pdf.addPage();

          const remaining = canvas.height - sourceY;
          const currentSlice = Math.min(sliceHeightPx, remaining);

          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = canvas.width;
          pageCanvas.height = currentSlice;
          const ctx = pageCanvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            ctx.drawImage(
              canvas,
              0, sourceY, canvas.width, currentSlice,
              0, 0, canvas.width, currentSlice
            );
          }

          const pageImgData = pageCanvas.toDataURL("image/jpeg", 0.95);
          const drawHeight = (currentSlice * imgWidth) / canvas.width;
          pdf.addImage(pageImgData, "JPEG", margin, margin, imgWidth, drawHeight);

          sourceY += currentSlice;
          pageIndex++;
        }
      }

      pdf.save(pdfName(fileName));
    }
  } finally {
    document.body.removeChild(container);
  }
}

function pdfName(name: string): string {
  if (name.toLowerCase().endsWith(".pdf")) return name;
  return name.replace(/\.html$/i, ".pdf").replace(/(?<!\.pdf)$/, ".pdf");
}
