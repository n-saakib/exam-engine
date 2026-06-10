import { cn } from "@/lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
}

/** A surface container with the standard card radius + border (04 §6). */
export function Card({ as: Tag = "div", className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-card border border-border bg-surface p-4 text-fg shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
