/**
 * Component tests for <DomainSelector> (F2 acceptance criteria).
 *
 * Uses a deep fixture tree (≥5 levels) to verify:
 *   - Dropdowns appear progressively based on selections.
 *   - Titles/labels come from JSON (not hardcoded).
 *   - Changing a parent resets children.
 *   - Start is disabled until a leaf with remaining sets is selected.
 *
 * Mock strategy:
 *   - @/lib/apiClient: mocked so no real fetches happen.
 *   - @/hooks/useExamPaths: mocked to return fixture data.
 *   - @/hooks/useSettings: mocked to return empty last_selected_path.
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/Toast";
import type { ExamPathsResponse } from "@/domain/types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock next/navigation so useRouter doesn't throw "invariant expected app router to be mounted".
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(args: { code: string; message: string; status: number }) {
      super(args.message);
      this.code = args.code;
      this.status = args.status;
    }
  },
}));

// Mock useExamPaths so we control the tree.
vi.mock("@/hooks/useExamPaths");
// Mock useSettings so we control last_selected_path.
vi.mock("@/hooks/useSettings");

// ── Fixture data ──────────────────────────────────────────────────────────────

/**
 * A 5-level fixture tree (root → cloud → aws/azure → cert → difficulty → leaf).
 * Includes an Azure/DevOps branch to prove zero-code extensibility.
 */
const FIXTURE_TREE: ExamPathsResponse["tree"] = {
  version: 1,
  label: "Choose a domain",
  cloud: {
    title: "Cloud Exams",
    icon: "cloud",
    label: "Choose cloud provider",
    aws: {
      title: "Amazon Web Services",
      label: "Choose certification",
      saa: {
        title: "AWS SAA",
        label: "Choose difficulty",
        easy: { title: "Easy", quesPath: "Exams/Cloud/AWS/SAA/Easy" },
        medium: { title: "Medium", quesPath: "Exams/Cloud/AWS/SAA/Medium" },
      },
    },
    azure: {
      title: "Microsoft Azure",
      label: "Choose certification",
      az900: {
        title: "AZ-900 Fundamentals",
        label: "Choose difficulty",
        easy: { title: "Easy", quesPath: "Exams/Cloud/Azure/AZ-900/Easy" },
      },
    },
  },
  devops: {
    title: "DevOps",
    icon: "devops",
    label: "Choose track",
    k8s: {
      title: "Kubernetes",
      label: "Choose topic",
      core: {
        title: "Core Concepts",
        label: "Choose difficulty",
        easy: { title: "Easy", quesPath: "Exams/DevOps/k8s/easy" },
      },
    },
  },
};

const FIXTURE_LEAVES: ExamPathsResponse["leaves"] = [
  { quesPath: "Exams/Cloud/AWS/SAA/Easy",       domainLabel: "Cloud Exams / Amazon Web Services / AWS SAA / Easy",         icon: "cloud", safe: true, totalSets: 3, completedSets: 1, remainingSets: 2, exhausted: false, inProgressCount: 0 },
  { quesPath: "Exams/Cloud/AWS/SAA/Medium",     domainLabel: "Cloud Exams / Amazon Web Services / AWS SAA / Medium",       icon: "cloud", safe: true, totalSets: 2, completedSets: 0, remainingSets: 2, exhausted: false, inProgressCount: 0 },
  { quesPath: "Exams/Cloud/Azure/AZ-900/Easy",  domainLabel: "Cloud Exams / Microsoft Azure / AZ-900 Fundamentals / Easy", icon: "cloud", safe: true, totalSets: 1, completedSets: 0, remainingSets: 1, exhausted: false, inProgressCount: 0 },
  { quesPath: "Exams/DevOps/k8s/easy",          domainLabel: "DevOps / Kubernetes / Core Concepts / Easy",                 icon: "devops", safe: true, totalSets: 0, completedSets: 0, remainingSets: 0, exhausted: false, inProgressCount: 0 },
];

const FIXTURE_RESPONSE: ExamPathsResponse = {
  tree: FIXTURE_TREE,
  leaves: FIXTURE_LEAVES,
};

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  return Wrapper;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  const { useExamPaths } = await import("@/hooks/useExamPaths");
  const { useSettings, useUpdateSettings } = await import("@/hooks/useSettings");

  vi.mocked(useExamPaths).mockReturnValue({
    data: FIXTURE_RESPONSE,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useExamPaths>);

  vi.mocked(useSettings).mockReturnValue({
    data: {
      exams_root: "./Exams",
      source_mode: "filesystem" as const,
      timer_enabled: true,
      timer_default_minutes: null,
      show_count_before_start: true,
      shuffle_questions: false,
      shuffle_options: false,
      theme: "system" as const,
      last_selected_path: [],
      schema_version_seen: 0,
    },
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useSettings>);

  vi.mocked(useUpdateSettings).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateSettings>);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("<DomainSelector> — progressive dropdowns from JSON", () => {
  it("shows level-0 dropdown with titles from JSON", async () => {
    const { DomainSelector } = await import("./DomainSelector");
    render(<DomainSelector />, { wrapper: makeWrapper() });

    // Level 0 should be visible immediately.
    expect(screen.getByTestId("level-0")).toBeInTheDocument();

    // Options come from the fixture tree (not hardcoded).
    const select = screen.getByTestId("level-0").querySelector("select")!;
    expect(select).toBeTruthy();
    const optionTexts = Array.from(select.options).map((o) => o.text);
    expect(optionTexts).toContain("Cloud Exams");
    expect(optionTexts).toContain("DevOps");
  });

  it("level-0 label comes from root.label in JSON", async () => {
    const { DomainSelector } = await import("./DomainSelector");
    render(<DomainSelector />, { wrapper: makeWrapper() });
    // The label appears as both a <label> element and a disabled <option> — use getAllBy.
    const matches = screen.getAllByText("Choose a domain");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("selecting level-0 reveals level-1", async () => {
    const { DomainSelector } = await import("./DomainSelector");
    render(<DomainSelector />, { wrapper: makeWrapper() });

    // Initially only level-0.
    expect(screen.queryByTestId("level-1")).not.toBeInTheDocument();

    // Select "cloud" (key="cloud").
    const l0Select = screen.getByTestId("level-0").querySelector("select")!;
    await act(async () => {
      fireEvent.change(l0Select, { target: { value: "cloud" } });
    });

    // Level-1 should now appear.
    expect(screen.getByTestId("level-1")).toBeInTheDocument();

    // Level-1 options are from the cloud child in the fixture.
    const l1Select = screen.getByTestId("level-1").querySelector("select")!;
    const l1Options = Array.from(l1Select.options).map((o) => o.text);
    expect(l1Options).toContain("Amazon Web Services");
    expect(l1Options).toContain("Microsoft Azure");
  });

  it("selecting through to a leaf shows the leaf panel", async () => {
    const { DomainSelector } = await import("./DomainSelector");
    render(<DomainSelector />, { wrapper: makeWrapper() });

    // cloud
    const l0Select = screen.getByTestId("level-0").querySelector("select")!;
    await act(async () => { fireEvent.change(l0Select, { target: { value: "cloud" } }); });

    // aws
    const l1Select = screen.getByTestId("level-1").querySelector("select")!;
    await act(async () => { fireEvent.change(l1Select, { target: { value: "aws" } }); });

    // saa
    const l2Select = screen.getByTestId("level-2").querySelector("select")!;
    await act(async () => { fireEvent.change(l2Select, { target: { value: "saa" } }); });

    // easy
    const l3Select = screen.getByTestId("level-3").querySelector("select")!;
    await act(async () => { fireEvent.change(l3Select, { target: { value: "easy" } }); });

    // Leaf panel should now appear.
    expect(screen.getByTestId("leaf-panel")).toBeInTheDocument();
  });

  it("changing a parent level resets deeper levels", async () => {
    const { DomainSelector } = await import("./DomainSelector");
    render(<DomainSelector />, { wrapper: makeWrapper() });

    // Navigate to cloud > aws.
    const l0Select = screen.getByTestId("level-0").querySelector("select")!;
    await act(async () => { fireEvent.change(l0Select, { target: { value: "cloud" } }); });

    const l1Select = screen.getByTestId("level-1").querySelector("select")!;
    await act(async () => { fireEvent.change(l1Select, { target: { value: "aws" } }); });

    // level-2 should exist.
    expect(screen.getByTestId("level-2")).toBeInTheDocument();

    // Now change level-1 to azure — level-2 should reset to azure's children.
    await act(async () => { fireEvent.change(l1Select, { target: { value: "azure" } }); });

    // level-2 still exists but options are azure's children.
    const l2Select = screen.getByTestId("level-2").querySelector("select")!;
    const l2Options = Array.from(l2Select.options).map((o) => o.text);
    expect(l2Options).toContain("AZ-900 Fundamentals");
    expect(l2Options).not.toContain("AWS SAA");

    // level-3 should not exist (azure > az900 not yet selected).
    expect(screen.queryByTestId("level-3")).not.toBeInTheDocument();
  });
});

describe("<DomainSelector> — Start Exam button", () => {
  it("Start Exam is disabled until a leaf with remaining sets is selected", async () => {
    const { DomainSelector } = await import("./DomainSelector");
    render(<DomainSelector />, { wrapper: makeWrapper() });

    // No Start button at all initially (no leaf selected).
    expect(screen.queryByRole("button", { name: /start exam/i })).not.toBeInTheDocument();

    // Navigate to a leaf with remainingSets > 0.
    const l0Select = screen.getByTestId("level-0").querySelector("select")!;
    await act(async () => { fireEvent.change(l0Select, { target: { value: "cloud" } }); });
    const l1Select = screen.getByTestId("level-1").querySelector("select")!;
    await act(async () => { fireEvent.change(l1Select, { target: { value: "aws" } }); });
    const l2Select = screen.getByTestId("level-2").querySelector("select")!;
    await act(async () => { fireEvent.change(l2Select, { target: { value: "saa" } }); });
    const l3Select = screen.getByTestId("level-3").querySelector("select")!;
    await act(async () => { fireEvent.change(l3Select, { target: { value: "easy" } }); });

    // Start Exam button should now be enabled (remainingSets = 2).
    const startBtn = screen.getByRole("button", { name: /start exam/i });
    expect(startBtn).not.toBeDisabled();
  });

  it("Start Exam is disabled at a leaf with remainingSets = 0", async () => {
    const { DomainSelector } = await import("./DomainSelector");
    render(<DomainSelector />, { wrapper: makeWrapper() });

    // Navigate to devops > k8s > core > easy (totalSets=0, remainingSets=0).
    const l0Select = screen.getByTestId("level-0").querySelector("select")!;
    await act(async () => { fireEvent.change(l0Select, { target: { value: "devops" } }); });
    const l1Select = screen.getByTestId("level-1").querySelector("select")!;
    await act(async () => { fireEvent.change(l1Select, { target: { value: "k8s" } }); });
    const l2Select = screen.getByTestId("level-2").querySelector("select")!;
    await act(async () => { fireEvent.change(l2Select, { target: { value: "core" } }); });
    const l3Select = screen.getByTestId("level-3").querySelector("select")!;
    await act(async () => { fireEvent.change(l3Select, { target: { value: "easy" } }); });

    // Start button should exist but be disabled.
    const startBtn = screen.getByRole("button", { name: /start exam|all sets done/i });
    expect(startBtn).toBeDisabled();
  });

  it("Start Exam is gated when an in-progress (resume) session exists for the same path", async () => {
    // Re-mock useExamPaths with a leaf that has inProgressCount = 1.
    const { useExamPaths } = await import("@/hooks/useExamPaths");
    vi.mocked(useExamPaths).mockReturnValue({
      data: {
        ...FIXTURE_RESPONSE,
        leaves: FIXTURE_LEAVES.map((l) =>
          l.quesPath === "Exams/Cloud/AWS/SAA/Easy"
            ? { ...l, inProgressCount: 1 }
            : l,
        ),
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useExamPaths>);

    const { DomainSelector } = await import("./DomainSelector");
    render(<DomainSelector />, { wrapper: makeWrapper() });

    // Navigate to cloud > aws > saa > easy.
    const l0Select = screen.getByTestId("level-0").querySelector("select")!;
    await act(async () => { fireEvent.change(l0Select, { target: { value: "cloud" } }); });
    const l1Select = screen.getByTestId("level-1").querySelector("select")!;
    await act(async () => { fireEvent.change(l1Select, { target: { value: "aws" } }); });
    const l2Select = screen.getByTestId("level-2").querySelector("select")!;
    await act(async () => { fireEvent.change(l2Select, { target: { value: "saa" } }); });
    const l3Select = screen.getByTestId("level-3").querySelector("select")!;
    await act(async () => { fireEvent.change(l3Select, { target: { value: "easy" } }); });

    // The Start button should be disabled and labelled "Continue in Resume".
    const startBtn = screen.getByRole("button", { name: /continue in resume/i });
    expect(startBtn).toBeDisabled();

    // Helper text should explain why.
    expect(
      screen.getByText(/you have a paused exam for this path/i),
    ).toBeInTheDocument();

    // Leaf summary should surface the in-progress chip.
    expect(screen.getByText(/1 paused exam/i)).toBeInTheDocument();
  });
});

describe("<DomainSelector> — error state (EXAM_PATHS_INVALID)", () => {
  it("shows an error message when useExamPaths returns an error", async () => {
    const { useExamPaths } = await import("@/hooks/useExamPaths");

    vi.mocked(useExamPaths).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: Object.assign(new Error("exam-paths.json failed validation"), { code: "EXAM_PATHS_INVALID" }),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useExamPaths>);

    const { DomainSelector } = await import("./DomainSelector");
    render(<DomainSelector />, { wrapper: makeWrapper() });

    expect(screen.getByText(/cannot load exam paths/i)).toBeInTheDocument();
    const pathRefs = screen.getAllByText(/exam-paths\.json/i);
    expect(pathRefs.length).toBeGreaterThanOrEqual(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Debounce-timer cleanup: if the component unmounts before the debounce
// fires, the deferred PATCH must NOT run (no leaked mutation).
// ────────────────────────────────────────────────────────────────────────────
describe("<DomainSelector> — debounce cleanup on unmount", () => {
  it("does not call updateSettings after unmount when the debounce window has not elapsed", async () => {
    vi.useFakeTimers();

    const { useUpdateSettings } = await import("@/hooks/useSettings");
    const mockMutate = vi.fn();
    vi.mocked(useUpdateSettings).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateSettings>);

    const { DomainSelector } = await import("./DomainSelector");
    const { unmount } = render(<DomainSelector />, { wrapper: makeWrapper() });

    // The user selects a value in level-0, scheduling a 600ms debounce.
    const l0Select = screen.getByTestId("level-0").querySelector("select")!;
    await act(async () => {
      fireEvent.change(l0Select, { target: { value: "cloud" } });
    });

    // Advance a tick but NOT past the 600ms debounce; then unmount.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    unmount();

    // Now jump well past the debounce window. If the cleanup is missing,
    // the orphaned setTimeout will fire and call mutate.
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockMutate).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
