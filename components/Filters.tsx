"use client";

import { useState, useRef, useEffect } from "react";
import { FilterValues, Filters as FiltersType } from "@/lib/analytics";

interface FiltersProps {
  filterValues: FilterValues;
  filters: FiltersType;
  onFiltersChange: (filters: FiltersType) => void;
}

interface DropdownMultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

function DropdownMultiSelect({ label, options, selected, onChange }: DropdownMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const handleSelectAll = () => {
    onChange([...options]);
  };

  const handleClear = () => {
    onChange([]);
  };

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  if (options.length === 0) return null;

  const buttonText = selected.length === 0
    ? "All"
    : selected.length === 1
    ? selected[0].length > 20 ? selected[0].substring(0, 20) + "..." : selected[0]
    : `${selected.length} selected`;

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>

      {/* Dropdown Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg bg-white hover:bg-slate-50 transition-colors ${
          selected.length > 0 ? "border-blue-300 bg-blue-50" : "border-slate-200"
        }`}
      >
        <span className={selected.length > 0 ? "text-blue-700" : "text-slate-600"}>
          {buttonText}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg">
          {/* Search */}
          {options.length > 5 && (
            <div className="p-2 border-b border-slate-100">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>
          )}

          {/* Select All / Clear */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Clear
            </button>
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">No matches</div>
            ) : (
              filteredOptions.map((option) => (
                <label
                  key={option}
                  className="flex items-center px-3 py-2 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => handleToggle(option)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-slate-700 truncate" title={option}>
                    {option}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}

      {/* Selected Pills */}
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selected.slice(0, 2).map((s) => (
            <span
              key={s}
              className="inline-flex items-center px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full"
            >
              {s.length > 12 ? s.substring(0, 12) + "..." : s}
              <button
                type="button"
                onClick={() => handleToggle(s)}
                className="ml-1 text-blue-600 hover:text-blue-800"
              >
                ×
              </button>
            </span>
          ))}
          {selected.length > 2 && (
            <span className="text-xs text-slate-500 py-0.5">+{selected.length - 2} more</span>
          )}
        </div>
      )}
    </div>
  );
}

export function Filters({ filterValues, filters, onFiltersChange }: FiltersProps) {
  const updateFilter = (key: keyof FiltersType, value: string[]) => {
    onFiltersChange({
      ...filters,
      [key]: value.length > 0 ? value : undefined,
    });
  };

  const hasActiveFilters = Object.values(filters).some(
    (v) => v && v.length > 0
  );

  const clearAllFilters = () => {
    onFiltersChange({});
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Filters</h3>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Clear all filters
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <DropdownMultiSelect
          label="Product Name"
          options={filterValues.productNames}
          selected={filters.productNames || []}
          onChange={(v) => updateFilter("productNames", v)}
        />
        <DropdownMultiSelect
          label="SKU"
          options={filterValues.skus}
          selected={filters.skus || []}
          onChange={(v) => updateFilter("skus", v)}
        />
        <DropdownMultiSelect
          label="Serial Number"
          options={filterValues.serialNumbers}
          selected={filters.serialNumbers || []}
          onChange={(v) => updateFilter("serialNumbers", v)}
        />
        <DropdownMultiSelect
          label="Reason"
          options={filterValues.reasons}
          selected={filters.reasons || []}
          onChange={(v) => updateFilter("reasons", v)}
        />
        <DropdownMultiSelect
          label="Sub-Reason"
          options={filterValues.subReasons}
          selected={filters.subReasons || []}
          onChange={(v) => updateFilter("subReasons", v)}
        />
        <DropdownMultiSelect
          label="Purchase Channel"
          options={filterValues.purchaseChannels}
          selected={filters.purchaseChannels || []}
          onChange={(v) => updateFilter("purchaseChannels", v)}
        />
      </div>
    </div>
  );
}
