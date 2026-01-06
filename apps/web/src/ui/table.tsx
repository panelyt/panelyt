import * as React from "react";

import { cn } from "@/lib/cn";

type TableContextValue = {
  dense: boolean;
  stickyHeader: boolean;
};

const TableContext = React.createContext<TableContextValue | null>(null);

function useTableContext() {
  const context = React.useContext(TableContext);
  return context ?? { dense: false, stickyHeader: false };
}

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  dense?: boolean;
  stickyHeader?: boolean;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, dense = false, stickyHeader = false, ...props }, ref) => (
    <TableContext.Provider value={{ dense, stickyHeader }}>
      <div className="w-full overflow-x-auto rounded-panel border border-border/70">
        <table
          ref={ref}
          className={cn("w-full text-left text-sm text-primary", className)}
          {...props}
        />
      </div>
    </TableContext.Provider>
  ),
);

Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("bg-surface-1", className)} {...props} />
));

TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("divide-y divide-border/60", className)} {...props} />
));

TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn("hover:bg-surface-2/60", className)} {...props} />
  ),
);

TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => {
  const { dense, stickyHeader } = useTableContext();
  return (
    <th
      ref={ref}
      className={cn(
        "text-xs font-semibold uppercase tracking-wide text-secondary",
        dense ? "px-3 py-2" : "px-4 py-3",
        stickyHeader ? "sticky top-0 z-10 bg-surface-1" : null,
        className,
      )}
      {...props}
    />
  );
});

TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => {
  const { dense } = useTableContext();
  return (
    <td ref={ref} className={cn(dense ? "px-3 py-2" : "px-4 py-3", className)} {...props} />
  );
});

TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-3 text-sm text-secondary", className)} {...props} />
));

TableCaption.displayName = "TableCaption";

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
};
export type { TableProps };
