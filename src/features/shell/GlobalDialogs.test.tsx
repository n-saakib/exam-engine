/**
 * <GlobalDialogs> tests. Verifies the confirm(...) Promise semantics:
 *   1. Resolves true on confirm, false on cancel.
 *   2. Unmounting the provider while the dialog is open resolves the
 *      pending promise to false (no leaked promises).
 */

import React, { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
// `useState` is referenced in ConfirmProbe below.

import { GlobalDialogsProvider, useGlobalDialogs } from "./GlobalDialogs";

/**
 * Helper component: exposes a `confirm()` call we can trigger and
 * surfaces the resolved value on screen so we can assert it.
 */
function ConfirmProbe({ options }: { options: { title: string } }) {
  const { confirm } = useGlobalDialogs();
  const [resolved, setResolved] = useState<boolean | null>(null);

  // Trigger a confirm on mount; await via .then so React renders the result.
  React.useEffect(() => {
    let cancelled = false;
    void confirm(options).then((r) => {
      if (!cancelled) setResolved(r);
    });
    return () => {
      cancelled = true;
    };
  }, [confirm, options]);

  return (
    <div>
      <span data-testid="resolved">{resolved === null ? "pending" : String(resolved)}</span>
    </div>
  );
}

describe("<GlobalDialogs> — confirm() Promise semantics", () => {
  it("resolves to true when the user clicks the confirm button", async () => {
    render(
      <GlobalDialogsProvider>
        <ConfirmProbe options={{ title: "Confirm test" }} />
      </GlobalDialogsProvider>,
    );

    // The confirm dialog should appear with our title.
    expect(await screen.findByText("Confirm test")).toBeInTheDocument();

    // Click the default "Confirm" button.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    });

    expect(screen.getByTestId("resolved")).toHaveTextContent("true");
  });

  it("resolves to false when the user clicks the cancel button", async () => {
    render(
      <GlobalDialogsProvider>
        <ConfirmProbe options={{ title: "Cancel test" }} />
      </GlobalDialogsProvider>,
    );

    expect(await screen.findByText("Cancel test")).toBeInTheDocument();

    // Click the default "Cancel" button.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    });

    expect(screen.getByTestId("resolved")).toHaveTextContent("false");
  });
});

describe("<GlobalDialogs> — unmount safety", () => {
  it("does not leak the pending promise when the provider unmounts", async () => {
    // Capture the promise so we can observe its resolution.
    let captured: Promise<boolean> | null = null;

    function Probe() {
      const { confirm } = useGlobalDialogs();
      captured = confirm({ title: "Will unmount" });
      return null;
    }

    // Render the provider, then unmount the entire tree while the dialog
    // is open.
    const { unmount } = render(
      <GlobalDialogsProvider>
        <Probe />
      </GlobalDialogsProvider>,
    );

    // Dialog should be open.
    expect(await screen.findByText("Will unmount")).toBeInTheDocument();

    // Unmount the entire tree while the dialog is open.
    await act(async () => {
      unmount();
    });

    // The captured promise must resolve to false (cancel semantics) rather
    // than hang forever, so consumers can always await it without leaks.
    expect(captured).not.toBeNull();
    const value = await captured!;
    expect(value).toBe(false);
  });
});
