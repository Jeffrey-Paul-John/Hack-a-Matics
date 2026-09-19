import { describe, it, expect } from 'vitest'
import { toCsv, escapeCsvCell } from './csv'

describe('escapeCsvCell', () => {
  it('handles null and undefined by returning an empty string', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })

  it('preserves numeric cells without formula injection prefix', () => {
    expect(escapeCsvCell(42)).toBe('42')
    expect(escapeCsvCell(12.34)).toBe('12.34')
    expect(escapeCsvCell(-15.6)).toBe('-15.6')
    expect(escapeCsvCell(0)).toBe('0')
  })

  it('guards against formula injection on string values starting with =, +, -, @', () => {
    expect(escapeCsvCell('=SUM(A1:B5)')).toBe("'=SUM(A1:B5)")
    expect(escapeCsvCell('+100%')).toBe("'+100%")
    expect(escapeCsvCell('-25% Staff')).toBe("'-25% Staff")
    expect(escapeCsvCell('@admin')).toBe("'@admin")
  })

  it('escapes fields containing commas, quotes, and newlines per RFC 4180', () => {
    expect(escapeCsvCell('Hello, World')).toBe('"Hello, World"')
    expect(escapeCsvCell('He said "Hello"')).toBe('"He said ""Hello"""')
    expect(escapeCsvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"')
    expect(escapeCsvCell("Line 1\r\nLine 2")).toBe('"Line 1\r\nLine 2"')
  })

  it('escapes formula injection strings that also contain commas or quotes', () => {
    expect(escapeCsvCell('=cmd|"/C calc"!A0')).toBe('"\'=cmd|""/C calc""!A0"')
  })
})

describe('toCsv', () => {
  it('starts with UTF-8 BOM', () => {
    const csv = toCsv([], ['col1', 'col2'])
    expect(csv.startsWith('\uFEFF')).toBe(true)
  })

  it('generates proper header and data rows with RFC 4180 escaping and nulls', () => {
    interface TestRow {
      id: string
      name: string
      count: number
      score: number | null
      notes?: string
    }

    const rows: TestRow[] = [
      { id: '1', name: 'Alice, Dr.', count: 5, score: 98.6, notes: 'Good condition' },
      { id: '2', name: 'Bob "The Nurse"', count: 2, score: null, notes: '=1+1' },
      { id: '3', name: 'Charlie', count: -4, score: 72.0, notes: 'Multi\nLine' },
    ]

    const columns = [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Staff Name' },
      { key: 'count', header: 'Count' },
      { key: 'score', header: 'Score' },
      { key: 'notes', header: 'Notes' },
    ]

    const csv = toCsv(rows, columns)
    const contentWithoutBom = csv.slice(1)
    const lines = contentWithoutBom.split('\r\n')

    expect(lines[0]).toBe('ID,Staff Name,Count,Score,Notes')
    expect(lines[1]).toBe('1,"Alice, Dr.",5,98.6,Good condition')
    expect(lines[2]).toBe('2,"Bob ""The Nurse""",2,,\'=1+1')
    expect(lines[3]).toBe('3,Charlie,-4,72,"Multi\nLine"')
  })

  it('supports custom format functions for columns', () => {
    const rows = [{ value: 0.23456 }]
    const columns = [
      {
        key: 'value',
        header: 'Ratio',
        format: (v: unknown) => `${(Number(v) * 100).toFixed(1)}%`,
      },
    ]

    const csv = toCsv(rows, columns)
    const contentWithoutBom = csv.slice(1)
    const lines = contentWithoutBom.split('\r\n')

    expect(lines[0]).toBe('Ratio')
    expect(lines[1]).toBe('23.5%')
  })
})
