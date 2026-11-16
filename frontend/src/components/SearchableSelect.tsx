import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;          // e.g. "Ramesh Kumar" or "101 - Ramesh Kumar"
  code?: string | number; // e.g. "101" or 101
  subLabel?: string;      // e.g. "COW | 9876543210"
  searchTerms?: string;   // e.g. extra searchable keywords
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  id?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Search or select...',
  required = false,
  disabled = false,
  clearable = false,
  className = '',
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Find currently selected option
  const selectedOption = useMemo(() => {
    return options.find(opt => String(opt.value) === String(value));
  }, [options, value]);

  // Filter options based on code primary search and label/subLabel secondary match
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;

    const query = searchQuery.trim().toLowerCase();

    return options
      .map(opt => {
        const codeStr = opt.code !== undefined && opt.code !== null ? String(opt.code).toLowerCase() : '';
        const labelStr = (opt.label || '').toLowerCase();
        const subLabelStr = (opt.subLabel || '').toLowerCase();
        const extraStr = (opt.searchTerms || '').toLowerCase();

        let score = -1;

        // Exact code match gets top priority
        if (codeStr === query) {
          score = 100;
        } else if (codeStr.startsWith(query)) {
          score = 80;
        } else if (codeStr.includes(query)) {
          score = 60;
        } else if (labelStr.includes(query)) {
          score = 40;
        } else if (subLabelStr.includes(query) || extraStr.includes(query)) {
          score = 20;
        }

        return { opt, score };
      })
      .filter(item => item.score > -1)
      .sort((a, b) => b.score - a.score)
      .map(item => item.opt);
  }, [options, searchQuery]);

  // Reset highlighted index when filtered options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation inside list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex(prev => (prev + 1) % Math.max(1, filteredOptions.length));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % Math.max(1, filteredOptions.length));
      }
    } else if (e.key === 'Enter') {
      if (isOpen && filteredOptions[highlightedIndex]) {
        e.preventDefault();
        selectOption(filteredOptions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const selectOption = (opt: SelectOption) => {
    onChange(String(opt.value));
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`} onKeyDown={handleKeyDown}>
      {/* Hidden input for HTML5 required form validation */}
      <input
        type="text"
        id={id}
        value={value !== undefined && value !== null ? String(value) : ''}
        required={required}
        readOnly
        className="sr-only opacity-0 w-0 h-0 absolute pointer-events-none"
        tabIndex={-1}
        onInvalid={() => {
          // If required field is empty on form submit, open dropdown and focus input
          setIsOpen(true);
          inputRef.current?.focus();
        }}
      />

      {/* Control Box */}
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            if (!isOpen) setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className={`w-full light-input rounded-lg text-xs py-2 px-3 flex items-center justify-between cursor-pointer border transition-colors ${
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'bg-white hover:border-gray-400'
        } ${isOpen ? 'ring-2 ring-blue-500/20 border-blue-500' : 'border-gray-300'}`}
      >
        <div className="flex items-center gap-2 truncate pr-2">
          {selectedOption ? (
            <div className="truncate flex items-center gap-1.5">
              {selectedOption.code !== undefined && selectedOption.code !== null && (
                <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[11px]">
                  #{selectedOption.code}
                </span>
              )}
              <span className="font-medium text-gray-800 truncate">{selectedOption.label}</span>
              {selectedOption.subLabel && (
                <span className="text-[10px] text-gray-500 truncate">({selectedOption.subLabel})</span>
              )}
            </div>
          ) : (
            <span className="text-gray-400 truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-gray-400">
          {clearable && selectedOption && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 hover:text-red-500 rounded hover:bg-gray-100 transition cursor-pointer"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-600' : ''}`} />
        </div>
      </div>

      {/* Floating Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100">
          {/* Search Bar Input */}
          <div className="p-2 border-b border-gray-100 bg-gray-50/80 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-1" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Type code or name to filter..."
              className="w-full bg-transparent text-xs outline-none text-gray-800 placeholder-gray-400"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-gray-400 hover:text-gray-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div ref={listRef} className="max-h-56 overflow-y-auto py-1 divide-y divide-gray-50">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                const isHighlighted = idx === highlightedIndex;

                return (
                  <div
                    key={String(opt.value)}
                    onClick={() => selectOption(opt)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`px-3 py-2 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      isHighlighted ? 'bg-blue-50/80 text-blue-900' : 'hover:bg-gray-50 text-gray-700'
                    } ${isSelected ? 'font-semibold text-blue-700 bg-blue-50/40' : ''}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {opt.code !== undefined && opt.code !== null && (
                        <span className="font-mono font-bold text-blue-700 bg-blue-100/70 text-blue-900 px-1.5 py-0.5 rounded text-[10px] shrink-0 border border-blue-200">
                          #{opt.code}
                        </span>
                      )}
                      <div className="flex flex-col truncate">
                        <span className="truncate">{opt.label}</span>
                        {opt.subLabel && (
                          <span className="text-[10px] text-gray-400 truncate">{opt.subLabel}</span>
                        )}
                      </div>
                    </div>

                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 ml-2" />}
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-gray-400 italic">
                No matching results found for "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
