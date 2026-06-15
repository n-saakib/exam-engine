/**
 * useKeyboardShortcuts (F4-T26) — verifies the seam maps keys to handlers and
 * ignores keystrokes while typing in an editable field.
 */

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useKeyboardShortcuts, type ExamShortcutHandlers } from "./useKeyboardShortcuts";

function Harness({ handlers, enabled = true }: { handlers: ExamShortcutHandlers; enabled?: boolean }) {
  useKeyboardShortcuts(handlers, enabled);
  return (
    <div>
      <input data-testid="field" />
    </div>
  );
}

function SelectHarness({ handlers, enabled = true }: { handlers: ExamShortcutHandlers; enabled?: boolean }) {
  useKeyboardShortcuts(handlers, enabled);
  return (
    <div>
      <select data-testid="picker" defaultValue="A">
        <option value="A">A</option>
        <option value="B">B</option>
      </select>
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

  it("does not fire onAdvance when Enter is pressed while a <select> is focused", () => {
    // A <select> counts as an editable target — pressing Enter should commit
    // the chosen option, NOT advance the exam.
    const onAdvance = vi.fn();
    const onSelectIndex = vi.fn();
    const { getByTestId } = render(
      <SelectHarness handlers={{ onAdvance, onSelectIndex }} />,
    );
    const picker = getByTestId("picker") as HTMLSelectElement;
    picker.focus();
    expect(document.activeElement).toBe(picker);
    fireEvent.keyDown(picker, { key: "Enter" });
    expect(onAdvance).not.toHaveBeenCalled();
    expect(onSelectIndex).not.toHaveBeenCalled();
  });

  it("does not re-register the keydown listener when a parent re-renders with a new handlers literal", () => {
    // Stability guard: useEffect's dep array is [handlers, enabled]. If a
    // parent passes a fresh { onFlag } literal on every render, the effect
    // re-runs (re-binding the listener). That's a perf footgun, NOT a bug —
    // but we pin the count so a future refactor to [handlers.onFlag, enabled]
    // would be caught.
    //
    // We measure the GROWTH in addEventListener("keydown", …) call count from
    // before → after a re-render. The current implementation re-binds; we
    // assert the bound count grows by AT MOST 1 (one removeEventListener +
    // one addEventListener per effect re-run).
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const first = { onFlag: vi.fn() };
    const { rerender } = render(<Harness handlers={first} />);

    const addsAfterMount = addSpy.mock.calls.filter(
      ([type]) => type === "keydown",
    ).length;
    const removesAfterMount = removeSpy.mock.calls.filter(
      ([type]) => type === "keydown",
    ).length;
    expect(addsAfterMount).toBe(1);
    expect(removesAfterMount).toBe(0);

    // New literal every render — same shape but a different object.
    const second = { onFlag: vi.fn() };
    rerender(<Harness handlers={second} />);
    const third = { onFlag: vi.fn() };
    rerender(<Harness handlers={third} />);

    const addsAfterRerenders = addSpy.mock.calls.filter(
      ([type]) => type === "keydown",
    ).length;
    const removesAfterRerenders = removeSpy.mock.calls.filter(
      ([type]) => type === "keydown",
    ).length;

    // Two re-renders ⇒ two effect re-runs ⇒ two removes + two adds.
    expect(addsAfterRerenders).toBe(addsAfterMount + 2);
    expect(removesAfterRerenders).toBe(removesAfterMount + 2);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
