/**
 * Component tests for F8 Settings UI:
 *   - SourceSettings: path validation feedback
 *   - ExamDefaultsSettings: toggles persist and reflect on reload
 *   - DataManagement: reset confirmations required (no confirm = no action)
 *   - CatalogDiagnostics: renders items from API
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/Toast";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";
import type { Settings } from "@/domain/types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
}));

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();
vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = {
  exams_root: "/home/user/Exams",
  source_mode: "filesystem",
  timer_enabled: true,
  timer_default_minutes: 20,
  show_count_before_start: true,
  shuffle_questions: false,
  shuffle_options: false,
  progressive_reveal: true,
  theme: "system",
  last_selected_path: [],
  schema_version_seen: 0,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

interface WrapperProps {
  children: React.ReactNode;
  client?: QueryClient;
}

function Wrapper({ children, client }: WrapperProps) {
  const qc = client ?? makeQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <GlobalDialogsProvider>
        <ToastProvider>{children}</ToastProvider>
      </GlobalDialogsProvider>
    </QueryClientProvider>
  );
}

// ── Tests: SourceSettings ─────────────────────────────────────────────────────

describe("SourceSettings", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
    vi.clearAllMocks();
    mockGet.mockResolvedValue(DEFAULT_SETTINGS);
    mockPatch.mockResolvedValue(DEFAULT_SETTINGS);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("shows the current exams_root path in the input", async () => {
    const { SourceSettings } = await import("./SourceSettings");
    queryClient.setQueryData(["settings"], DEFAULT_SETTINGS);

    render(
      <Wrapper client={queryClient}>
        <SourceSettings />
      </Wrapper>,
    );

    const input = screen.getByLabelText<HTMLInputElement>("Exams root path");
    expect(input.value).toBe("/home/user/Exams");
  });

  it("shows a validation error from the server on save failure", async () => {
    const { SourceSettings } = await import("./SourceSettings");
    queryClient.setQueryData(["settings"], DEFAULT_SETTINGS);

    // Simulate a PATCH failure (invalid path)
    mockPatch.mockRejectedValue(
      Object.assign(new Error("exams_root must be an existing directory"), {
        code: "VALIDATION_ERROR",
        status: 400,
      }),
    );

    render(
      <Wrapper client={queryClient}>
        <SourceSettings />
      </Wrapper>,
    );

    const input = screen.getByLabelText<HTMLInputElement>("Exams root path");
    fireEvent.change(input, { target: { value: "/bad/path" } });

    const saveBtn = screen.getByRole("button", { name: /save/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    await waitFor(() => {
      // Error message appears
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });

  it("Save button is disabled when path has not changed", async () => {
    const { SourceSettings } = await import("./SourceSettings");
    queryClient.setQueryData(["settings"], DEFAULT_SETTINGS);

    render(
      <Wrapper client={queryClient}>
        <SourceSettings />
      </Wrapper>,
    );

    const saveBtn = screen.getByRole("button", { name: /save/i });
    expect(saveBtn).toBeDisabled();
  });
});

// ── Tests: ExamDefaultsSettings ───────────────────────────────────────────────

describe("ExamDefaultsSettings", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
    vi.clearAllMocks();
    mockGet.mockResolvedValue(DEFAULT_SETTINGS);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("renders all default toggle states correctly", async () => {
    const { ExamDefaultsSettings } = await import("./ExamDefaultsSettings");
    queryClient.setQueryData(["settings"], DEFAULT_SETTINGS);

    render(
      <Wrapper client={queryClient}>
        <ExamDefaultsSettings />
      </Wrapper>,
    );

    // timer_enabled = true
    const timerToggle = screen.getByRole("switch", { name: /enable timer/i });
    expect(timerToggle).toHaveAttribute("aria-checked", "true");

    // shuffle_questions = false
    const shuffleToggle = screen.getByRole("switch", { name: /shuffle question/i });
    expect(shuffleToggle).toHaveAttribute("aria-checked", "false");
  });

  it("calls PATCH with the toggled key when a toggle is clicked", async () => {
    const { ExamDefaultsSettings } = await import("./ExamDefaultsSettings");
    queryClient.setQueryData(["settings"], DEFAULT_SETTINGS);
    mockPatch.mockResolvedValue({ ...DEFAULT_SETTINGS, shuffle_questions: true });

    render(
      <Wrapper client={queryClient}>
        <ExamDefaultsSettings />
      </Wrapper>,
    );

    const shuffleToggle = screen.getByRole("switch", { name: /shuffle question/i });
    await act(async () => {
      fireEvent.click(shuffleToggle);
    });

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        "/settings",
        expect.objectContaining({ json: expect.objectContaining({ shuffle_questions: true }) }),
      );
    });
  });
});

// ── Tests: DataManagement ─────────────────────────────────────────────────────

describe("DataManagement", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ tree: {}, leaves: [] });
    mockPost.mockResolvedValue({ cleared: { sessions: 0, completion: 0 } });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("renders export buttons", async () => {
    const { DataManagement } = await import("./DataManagement");

    render(
      <Wrapper client={queryClient}>
        <DataManagement />
      </Wrapper>,
    );

    expect(
      screen.getByRole("button", { name: /export exam history as json/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /export exam history as csv/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /export full data/i }),
    ).toBeTruthy();
  });

  it("full reset button is present and labelled", async () => {
    const { DataManagement } = await import("./DataManagement");

    render(
      <Wrapper client={queryClient}>
        <DataManagement />
      </Wrapper>,
    );

    expect(
      screen.getByRole("button", { name: /delete all exam history/i }),
    ).toBeTruthy();
  });

  it("factory reset button is present and labelled", async () => {
    const { DataManagement } = await import("./DataManagement");

    render(
      <Wrapper client={queryClient}>
        <DataManagement />
      </Wrapper>,
    );

    expect(
      screen.getByRole("button", { name: /factory reset.*delete all data/i }),
    ).toBeTruthy();
  });

  it("does NOT call reset API when the user cancels the confirmation dialog", async () => {
    // With GlobalDialogsProvider, clicking reset opens a confirm dialog.
    // If the user cancels, no POST should be made.
    const { DataManagement } = await import("./DataManagement");

    render(
      <Wrapper client={queryClient}>
        <DataManagement />
      </Wrapper>,
    );

    const fullResetBtn = screen.getByRole("button", {
      name: /delete all exam history/i,
    });

    // Click the button to open the confirm dialog, then cancel
    await act(async () => {
      fireEvent.click(fullResetBtn);
    });

    // A cancel button should appear in the dialog
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    // POST should NOT have been called
    expect(mockPost).not.toHaveBeenCalled();
  });
});

// ── Tests: CatalogDiagnostics ─────────────────────────────────────────────────

describe("CatalogDiagnostics", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("renders 'No issues found' when diagnostics is empty", async () => {
    const { CatalogDiagnostics } = await import("./CatalogDiagnostics");
    mockGet.mockResolvedValue({ items: [], total: 0 });

    render(
      <Wrapper client={queryClient}>
        <CatalogDiagnostics />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/no issues found/i)).toBeTruthy();
    });
  });

  it("renders diagnostic items from the API", async () => {
    const { CatalogDiagnostics } = await import("./CatalogDiagnostics");
    mockGet.mockResolvedValue({
      items: [
        {
          filePath: "/Exams/bad-file.json",
          status: "error",
          messages: ["Missing required field: setId"],
        },
      ],
      total: 1,
    });

    render(
      <Wrapper client={queryClient}>
        <CatalogDiagnostics />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("/Exams/bad-file.json")).toBeTruthy();
      expect(screen.getByText(/Missing required field: setId/i)).toBeTruthy();
    });
  });

  it("shows Rescan button", async () => {
    const { CatalogDiagnostics } = await import("./CatalogDiagnostics");
    mockGet.mockResolvedValue({ items: [], total: 0 });

    render(
      <Wrapper client={queryClient}>
        <CatalogDiagnostics />
      </Wrapper>,
    );

    expect(screen.getByRole("button", { name: /rescan/i })).toBeTruthy();
  });
});
