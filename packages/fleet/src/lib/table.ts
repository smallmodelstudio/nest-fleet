/** Renders rows as a simple padded table, one string per line. No dependency, no color. */
export function renderTable(headers: string[], rows: string[][]): string[] {
  const widths = headers.map((header, col) => Math.max(header.length, ...rows.map((row) => (row[col] ?? '').length)));

  const renderRow = (cells: string[]): string => cells.map((cell, col) => cell.padEnd(widths[col] ?? 0)).join('  ');

  return [renderRow(headers), renderRow(widths.map((width) => '-'.repeat(width))), ...rows.map(renderRow)];
}
