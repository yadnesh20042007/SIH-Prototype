import React from 'react';
import { createDiscriminationRow, type DiscriminationRowState } from './types';

interface DiscriminationSectionProps {
  rows: DiscriminationRowState[];
  onChange: (rows: DiscriminationRowState[]) => void;
  nextId?: () => string;
}

export function DiscriminationSection({
  rows,
  onChange,
  nextId,
}: DiscriminationSectionProps) {
  const handleUpdate = (id: string, field: keyof DiscriminationRowState, value: string) => {
    const updated = rows.map((r) => (r.id === id ? { ...r, [field]: value } : r));
    onChange(updated);
  };

  const handleAdd = () => {
    onChange([
      ...rows,
      createDiscriminationRow(nextId ? nextId() : undefined, ''),
    ]);
  };

  const handleRemove = (id: string) => {
    onChange(rows.filter((r) => r.id !== id));
  };

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[#101828]">Discrimination</h3>
        <p className="mt-1 text-xs text-[#667085]">
          For digital indications, tested at Min, 0.5 Max, and Max. Apply additional load of 1.4d. (R76-1 3.8.2.2)
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-[#344054]">
          <thead className="bg-[#F9FAFB] text-xs font-medium text-[#475467]">
            <tr>
              <th className="px-4 py-3 border-b border-[#EAECF0]">Test Load (kg)</th>
              <th className="px-4 py-3 border-b border-[#EAECF0]">Indication Before 1.4d (kg)</th>
              <th className="px-4 py-3 border-b border-[#EAECF0]">Indication After 1.4d (kg)</th>
              <th className="px-4 py-3 border-b border-[#EAECF0]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAECF0]">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={row.testLoad}
                    onChange={(e) => handleUpdate(row.id, 'testLoad', e.target.value)}
                    className="w-24 rounded-lg border border-[#D0D5DD] px-3 py-2 focus:border-[#4E5BA6] focus:outline-none focus:ring-4 focus:ring-[#4E5BA6]/10"
                    placeholder="e.g. 10.0"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={row.indicationBefore}
                    onChange={(e) => handleUpdate(row.id, 'indicationBefore', e.target.value)}
                    className="w-28 rounded-lg border border-[#D0D5DD] px-3 py-2 focus:border-[#4E5BA6] focus:outline-none focus:ring-4 focus:ring-[#4E5BA6]/10"
                    placeholder="e.g. 10.0"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={row.indicationAfter}
                    onChange={(e) => handleUpdate(row.id, 'indicationAfter', e.target.value)}
                    className="w-28 rounded-lg border border-[#D0D5DD] px-3 py-2 focus:border-[#4E5BA6] focus:outline-none focus:ring-4 focus:ring-[#4E5BA6]/10"
                    placeholder="e.g. 10.01"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleRemove(row.id)}
                    className="text-[#667085] hover:text-[#D92D20] disabled:opacity-50"
                    disabled={rows.length === 1}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={handleAdd}
          className="text-sm font-semibold text-[#4E5BA6] hover:text-[#3f4a8a]"
        >
          + Add point
        </button>
      </div>
    </div>
  );
}
