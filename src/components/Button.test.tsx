import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";

describe("base primitives render", () => {
  it("renders a Button with its label and handles clicks", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Start exam</Button>);
    const btn = screen.getByRole("button", { name: "Start exam" });
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies the danger variant classes", () => {
    render(<Button variant="danger">Discard</Button>);
    expect(screen.getByRole("button", { name: "Discard" }).className).toContain(
      "bg-danger",
    );
  });

  it("renders a Card with children", () => {
    render(
      <Card>
        <p>card body</p>
      </Card>,
    );
    expect(screen.getByText("card body")).toBeInTheDocument();
  });

  it("renders an EmptyState with a title and description", () => {
    render(<EmptyState title="Nothing here" description="No sessions yet" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("No sessions yet")).toBeInTheDocument();
  });
});
