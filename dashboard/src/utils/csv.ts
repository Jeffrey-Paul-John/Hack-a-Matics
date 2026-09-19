export interface CsvColumn<T = Record<string, unknown>> {
  key: keyof T | string
  header: string
  format?: (value: unknown, row: T) => string | number | boolean | null | undefined
}

/**
 * Escapes a single cell according to RFC 4180 and guards against CSV formula injection.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  // Preserve numeric cells without alteration
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return String(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE'
  }

  let str = String(value)

  // Guard against CSV formula injection:
  // Prefix any string starting with =, +, -, or @ with a single quote
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`
  }

  // RFC 4180 escaping: quote if field contains commas, double quotes, or newlines
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

/**
 * Converts an array of row objects into a CSV string with a UTF-8 BOM.
 */
export function toCsv<T extends Record<string, any>>(
  rows: T[],
  columns: (keyof T | string | CsvColumn<T>)[]
): string {
  const parsedColumns: CsvColumn<T>[] = columns.map(col => {
    if (typeof col === 'object' && col !== null && 'header' in col) {
      return col as CsvColumn<T>
    }
    const keyStr = String(col)
    return {
      key: keyStr,
      header: keyStr,
    }
  })

  // Format header row
  const headerRow = parsedColumns.map(col => escapeCsvCell(col.header)).join(',')

  // Format data rows
  const dataRows = rows.map(row => {
    return parsedColumns
      .map(col => {
        const rawVal = col.format
          ? col.format(row[col.key as keyof T], row)
          : row[col.key as keyof T]
        return escapeCsvCell(rawVal)
      })
      .join(',')
  })

  // Prepend UTF-8 BOM (\uFEFF) and use standard \r\n line breaks
  return '\uFEFF' + [headerRow, ...dataRows].join('\r\n')
}
