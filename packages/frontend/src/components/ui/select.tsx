import * as React from "react";
import { cn } from "../../lib/utils";

/* ─── Select context ────────────────────────────────────────────── */

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext(): SelectContextValue {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error("Select compound components must be used within <Select>");
  return ctx;
}

/* ─── Root ──────────────────────────────────────────────────────── */

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}

function Select({ value, onValueChange, children }: SelectProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

/* ─── Trigger ───────────────────────────────────────────────────── */

interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = useSelectContext();

    return (
      <button
        ref={ref}
        type="button"
        role="combobox"
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        onClick={() => setOpen((prev) => !prev)}
        {...props}
      >
        {children}
        <svg
          width="15"
          height="15"
          viewBox="0 0 15 15"
          fill="none"
          className="ml-2 h-4 w-4 shrink-0 opacity-50"
        >
          <path
            d="M4.93179 5.43179C4.75605 5.60753 4.75605 5.89245 4.93179 6.06819C5.10753 6.24392 5.39245 6.24392 5.56819 6.06819L7.49999 4.13638L9.43179 6.06819C9.60753 6.24392 9.89245 6.24392 10.0682 6.06819C10.2439 5.89245 10.2439 5.60753 10.0682 5.43179L7.81819 3.18179C7.64245 3.00605 7.35753 3.00605 7.18179 3.18179L4.93179 5.43179ZM10.0682 9.56819C10.2439 9.39245 10.2439 9.10753 10.0682 8.93179C9.89245 8.75606 9.60753 8.75606 9.43179 8.93179L7.49999 10.8636L5.56819 8.93179C5.39245 8.75606 5.10753 8.75606 4.93179 8.93179C4.75605 9.10753 4.75605 9.39245 4.93179 9.56819L7.18179 11.8182C7.35753 11.9939 7.64245 11.9939 7.81819 11.8182L10.0682 9.56819Z"
            fill="currentColor"
          />
        </svg>
      </button>
    );
  },
);
SelectTrigger.displayName = "SelectTrigger";

/* ─── Value display ─────────────────────────────────────────────── */

function SelectValue({ placeholder }: { placeholder?: string }): React.JSX.Element {
  const { value } = useSelectContext();
  return <span className="truncate">{value || placeholder || ""}</span>;
}

/* ─── Content (dropdown) ────────────────────────────────────────── */

interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const SelectContent = React.forwardRef<HTMLDivElement, SelectContentProps>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = useSelectContext();

    // Close on outside click
    const containerRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
      if (!open) return;
      const handleClick = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      // Delay to avoid closing immediately from the trigger click
      const timer = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("mousedown", handleClick);
      };
    }, [open, setOpen]);

    if (!open) return null;

    return (
      <div
        ref={containerRef}
        className={cn(
          "absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      >
        <div ref={ref}>{children}</div>
      </div>
    );
  },
);
SelectContent.displayName = "SelectContent";

/* ─── Item ──────────────────────────────────────────────────────── */

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  children: React.ReactNode;
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ value, className, children, ...props }, ref) => {
    const { value: selected, onValueChange, setOpen } = useSelectContext();
    const isActive = selected === value;

    return (
      <div
        ref={ref}
        role="option"
        aria-selected={isActive}
        className={cn(
          "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
          isActive && "bg-accent text-accent-foreground",
          className,
        )}
        onClick={() => {
          onValueChange(value);
          setOpen(false);
        }}
        {...props}
      >
        {children}
        {isActive && (
          <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path
                d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3354 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.5553 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z"
                fill="currentColor"
              />
            </svg>
          </span>
        )}
      </div>
    );
  },
);
SelectItem.displayName = "SelectItem";

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
