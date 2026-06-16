/**
 * Component tests for QuestionReviewList.
 *
 * Verifies the empty-state behavior and the structure of the rendered
 * ordered list (one <li> per question, each containing a QuestionReviewCard
 * that surfaces the question's order number).
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ResultsQuestion } from "@/domain/types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock apiClient so the component's transitive imports don't blow up in
// isolation (QuestionReviewCard may touch the API for things like flagged
// state, even if these particular tests don't exercise those paths).
vi.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

// ── Render helper ─────────────────────────────────────────────────────────────

async function renderList(
  questions: ResultsQuestion[],
  filterLabel?: string,
) {
  const { QuestionReviewList } = await import("./QuestionReviewList");
  return render(
    <QuestionReviewList questions={questions} filterLabel={filterLabel} />,
  );
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal ResultsQuestion. We don't need explanations for these
 * tests — we only verify the list structure and the question number rendered
 * by QuestionReviewCard in its header.
 */
function makeQuestion(id: number, order: number): ResultsQuestion {
  return {
    id,
    order,
    questionType: "single",
    questionText: `Question text for #${order}`,
    options: {
      A: "Option A",
      B: "Option B",
      C: "Option C",
      D: "Option D",
    },
    correctAnswer: "A",
    yourAnswer: ["A"],
    gaveUp: false,
    outcome: "correct",
    flagged: false,
    explanations: {},
  };
}

const Q1: ResultsQuestion = makeQuestion(101, 1);
const Q2: ResultsQuestion = makeQuestion(202, 2);
const Q3: ResultsQuestion = makeQuestion(303, 3);

// ── Test suite ────────────────────────────────────────────────────────────────

describe("<QuestionReviewList>", () => {
  // ── Empty state ────────────────────────────────────────────────────────────
  it("renders an empty-state message using the filterLabel verbatim when there are no questions", async () => {
    await renderList([], "Incorrect");

    // The component renders a <div> with the text:
    //   No questions match the "<filterLabel>" filter.
    // Note: the component uses typographic curly quotes (&ldquo; / &rdquo;),
    // i.e. U+201C / U+201D — not straight ASCII quotes.
    const empty = screen.getByText(/No questions match the “Incorrect” filter\./);
    expect(empty).toBeTruthy();

    // And the default "current" wording must NOT be present.
    expect(screen.queryByText(/current/)).toBeNull();
  });

  it("renders the empty-state message with the default 'current' wording when filterLabel is omitted", async () => {
    await renderList([]);

    // The message should contain both "No questions match" and the
    // default filter label "current". Curly quotes again.
    const empty = screen.getByText(/No questions match the “current” filter\./);
    expect(empty).toBeTruthy();
    expect(empty.textContent ?? "").toContain("No questions match");
    expect(empty.textContent ?? "").toContain("current");
  });

  // ── List rendering ────────────────────────────────────────────────────────
  it("renders an <ol aria-label=\"Question review list\"> when questions are present", async () => {
    await renderList([Q1]);

    // getByLabelText works for elements that have an aria-label attribute,
    // including ordered lists.
    const list = screen.getByLabelText("Question review list");
    expect(list).toBeTruthy();
    // The element returned for an aria-label is the <ol> itself.
    expect(list.tagName.toLowerCase()).toBe("ol");
  });

  it("renders one <li> per question inside the ordered list", async () => {
    await renderList([Q1, Q2, Q3]);

    const list = screen.getByLabelText("Question review list");
    // Count only the <li> DIRECT children of the <ol>. Each child <li>
    // also wraps a QuestionReviewCard, which itself contains a <ul> with
    // 4 nested <li>s — so we must filter to direct children to count
    // the questions (and not the options).
    const directItems = Array.from(list.querySelectorAll(":scope > li"));
    expect(directItems).toHaveLength(3);
  });

  it("renders the question number from `question.order` (as 'Q<n>') inside each <li>", async () => {
    await renderList([Q1, Q2, Q3]);

    const list = screen.getByLabelText("Question review list");
    const directItems = Array.from(list.querySelectorAll(":scope > li"));
    expect(directItems).toHaveLength(3);

    // QuestionReviewCard renders the order number as "Q<order>" in the
    // header (e.g. "Q1", "Q2", "Q3"). Each direct <li> wraps a card, so
    // we scope the lookup to that <li> to confirm the right number
    // shows up in the right slot.
    expect(within(directItems[0] as HTMLElement).getByText("Q1")).toBeTruthy();
    expect(within(directItems[1] as HTMLElement).getByText("Q2")).toBeTruthy();
    expect(within(directItems[2] as HTMLElement).getByText("Q3")).toBeTruthy();
  });

  // ── Key shape ─────────────────────────────────────────────────────────────
  // The list uses `key={`${q.id}-${q.order}`}` for each <li>. React keys are
  // not directly observable in the DOM, but we can sanity-check the mapping
  // by confirming that the rendered <li> count matches the input length
  // exactly (so duplicate keys would be exposed as missing/extra nodes).
  it("renders exactly one <li> per input question (key `${id}-${order}` mapping is total)", async () => {
    // Use a small but distinct set so an off-by-one or duplicate-key bug
    // would be obvious in the resulting listitem count.
    const questions = [makeQuestion(1, 1), makeQuestion(2, 2), makeQuestion(3, 3), makeQuestion(4, 4)];
    await renderList(questions);

    const list = screen.getByLabelText("Question review list");
    const directItems = Array.from(list.querySelectorAll(":scope > li"));
    expect(directItems).toHaveLength(questions.length);
  });
});
