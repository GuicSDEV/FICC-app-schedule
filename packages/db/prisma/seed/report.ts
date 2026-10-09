type Align = "left" | "right";

/** Prints a plain-text table to stdout. */
export function printTable(
  title: string,
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
  align: readonly Align[] = [],
): void {
  const cells = rows.map((row) => row.map(String));
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...cells.map((row) => (row[column] ?? "").length)),
  );
  const format = (values: readonly string[]) =>
    values
      .map((value, column) =>
        align[column] === "right" ? value.padStart(widths[column]!) : value.padEnd(widths[column]!),
      )
      .join("  ")
      .trimEnd();

  console.log(`\n${title}`);
  console.log(format(headers));
  console.log(widths.map((width) => "─".repeat(width)).join("  "));
  for (const row of cells) console.log(format(row));
}
