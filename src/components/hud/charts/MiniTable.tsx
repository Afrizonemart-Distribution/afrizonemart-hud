export function MiniTable({
  columns,
  rows,
}: {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | number>>;
}) {
  if (rows.length === 0) {
    return <p className="font-mono text-[10px] text-amber/30">No data in this window.</p>;
  }

  return (
    <table className="w-full font-mono text-[10px]">
      <thead>
        <tr className="text-danger/40">
          {columns.map((c) => (
            <th key={c.key} className="pb-1 text-left font-normal uppercase tracking-widest">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-danger/10 text-amber/70">
            {columns.map((c) => (
              <td key={c.key} className="max-w-[120px] truncate py-1">
                {r[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
