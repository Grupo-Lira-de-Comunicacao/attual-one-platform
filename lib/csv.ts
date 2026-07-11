export const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
export const csvRow = (cells: (string | number)[]) => cells.map(csvCell).join(";");
export interface CsvSection { title: string; headers: string[]; rows: (string | number)[][]; }
export const buildCsv = (sections: CsvSection[]) => {
  const lines: string[] = [];
  sections.forEach((s, i) => { if (i > 0) lines.push(""); lines.push(s.title); lines.push(csvRow(s.headers)); s.rows.forEach(r => lines.push(csvRow(r))); });
  return lines.join("\n");
};
