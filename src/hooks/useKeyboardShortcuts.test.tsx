/**
 * useKeyboardShortcuts (F4-T26) — verifies the seam maps keys to handlers and
 * ignores keystrokes while typing in an editable field.
 */

import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { useKeyboardShortcuts, type ExamShortcutHandlers } from "./useKeyboardShortcuts";

function Harness({ handlers, enabled = true }: { handlers: ExamShortcutHandlers; enabled?: boolean }) {
  useKeyboardShortcuts(handlers, enabled);
  return (
    <div>
      <input data-testid="field" />
    </div>
  );
}

describe("useKeyboardShortcuts", () => {
  it("maps number/letter/action keys to handlers", () => {
    const h = {
      onSelectIndex: vi.fn(),
      onFlag: vi.fn(),
      onGiveUp: vi.fn(),
      onNext: vi.fn(),
      onPrev: vi.fn(),
      onAdvance: vi.fn(),
    } satisfies ExamShortcutHandlers;
    render(<Harness handlers={h} />);

    fireEvent.keyDown(window, { key: "2" });
    expect(h.onSelectIndex).toHaveBeenCalledWith(1);

    fireEvent.keyDown(window, { key: "c" });
    expect(h.onSelectIndex).toHaveBeenCalledWith(2);

    fireEvent.keyDown(window, { key: "f" });
    expect(h.onFlag).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "g" });
    expect(h.onGiveUp).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "n" });
    expect(h.onNext).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "p" });
    expect(h.onPrev).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Enter" });
    expect(h.onAdvance).toHaveBeenCalled();
  });

  it("ignores keystrokes while focus is in an editable field", () => {
    const onSelectIndex = vi.fn();
    const { getByTestId } = render(<Harness handlers={{ onSelectIndex }} />);
    const field = getByTestId("field");
    field.focus();
    fireEvent.keyDown(field, { key: "1" });
    expect(onSelectIndex).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    const onFlag = vi.fn();
    render(<Harness handlers={{ onFlag }} enabled={false} />);
    fireEvent.keyDown(window, { key: "f" });
    expect(onFlag).not.toHaveBeenCalled();
  });
});
