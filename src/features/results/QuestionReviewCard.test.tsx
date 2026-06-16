/**
 * Component tests for QuestionReviewCard.
 *
 * Critical: these tests guard the bug fix where the component now renders
 * options in the SHUFFLED order from `question.optionOrder` instead of always
 * falling back to `Object.keys(question.options).sort()` (alphabetical).
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ResultsQuestion } from "@/domain/types";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock apiClient so the component's transitive imports don't blow up in
// isolation (and so future code in this component that touches the API works
// out of the box).
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

async function renderCard(question: ResultsQuestion) {
  const { QuestionReviewCard } = await import("./QuestionReviewCard");
  return render(<QuestionReviewCard question={question} />);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A simple "correct" question with explanations on every option. */
const CORRECT_QUESTION: ResultsQuestion = {
  id: 101,
  order: 1,
  questionType: "single",
  questionText: "What does IAM stand for?",
  options: {
    A: "Internet Access Management",
    B: "Identity and Access Management",
    C: "Integrated Account Manager",
    D: "Internal Auth Module",
  },
  correctAnswer: "B",
  yourAnswer: ["B"],
  outcome: "correct",
  flagged: false,
  explanations: {
    A: { description: "Wrong", reason: "Not the right expansion" },
    B: { description: "Right", reason: "IAM = Identity and Access Management" },
    C: { description: "Wrong", reason: "Made up" },
    D: { description: "Wrong", reason: "Made up" },
  },
  Tips: "IAM = Identity and Access Management",
};

/** An incorrect question (user picked A, correct is C) and flagged. */
const INCORRECT_FLAGGED_QUESTION: ResultsQuestion = {
  id: 102,
  order: 2,
  questionType: "single",
  questionText: "Which EC2 type is cheapest?",
  options: {
    A: "On-Demand",
    B: "Reserved",
    C: "Spot",
    D: "Dedicated",
  },
  correctAnswer: "C",
  yourAnswer: ["A"],
  outcome: "incorrect",
  flagged: true,
  explanations: {
    A: { description: "On-Demand", reason: "More expensive than Spot" },
    B: { description: "Reserved", reason: "Cheaper than On-Demand but not cheapest" },
    C: { description: "Spot", reason: "Spot instances are cheapest" },
    D: { description: "Dedicated", reason: "Most expensive" },
  },
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe("<QuestionReviewCard>", () => {
  it("renders the question text, order number, and outcome badge for a correct outcome", async () => {
    await renderCard(CORRECT_QUESTION);

    // Article with aria-label "Question 1"
    const article = screen.getByLabelText("Question 1");
    expect(article).toBeTruthy();

    // Q-number prefix
    expect(within(article).getByText("Q1")).toBeTruthy();

    // Question text
    expect(within(article).getByText("What does IAM stand for?")).toBeTruthy();

    // Outcome badge
    expect(within(article).getByText("Correct")).toBeTruthy();
  });

  // ── BUG GUARD ──────────────────────────────────────────────────────────────
  // The fix: when `optionOrder` is set, options must render in that order
  // (the order the user saw during the exam) — NOT in alphabetical order.
  it("[BUG GUARD] renders options in the order from `optionOrder` when present", async () => {
    const shuffled: ResultsQuestion = {
      ...CORRECT_QUESTION,
      // Natural key order would be A,B,C,D (sorted); we shuffle to C,A,B,D
      // so alphabetical [A, B, C, D] cannot accidentally match.
      optionOrder: ["C", "A", "B", "D"],
    };

    await renderCard(shuffled);

    const list = screen.getByLabelText("Answer options");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);

    // Each <li> contains the letter prefix followed by the option text.
    // We assert by the unique option text per key.
    const texts = items.map((li) => li.textContent ?? "");

    expect(texts[0]).toContain("C.");
    expect(texts[0]).toContain("Integrated Account Manager");

    expect(texts[1]).toContain("A.");
    expect(texts[1]).toContain("Internet Access Management");

    expect(texts[2]).toContain("B.");
    expect(texts[2]).toContain("Identity and Access Management");

    expect(texts[3]).toContain("D.");
    expect(texts[3]).toContain("Internal Auth Module");
  });

  it("falls back to alphabetical (Object.keys().sort()) order when `optionOrder` is absent", async () => {
    // No optionOrder on this question.
    const { optionOrder: _omitted, ...noOptionOrder } = CORRECT_QUESTION;
    void _omitted;

    await renderCard(noOptionOrder);

    const list = screen.getByLabelText("Answer options");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);

    const texts = items.map((li) => li.textContent ?? "");
    expect(texts[0]).toContain("A.");
    expect(texts[0]).toContain("Internet Access Management");
    expect(texts[1]).toContain("B.");
    expect(texts[1]).toContain("Identity and Access Management");
    expect(texts[2]).toContain("C.");
    expect(texts[2]).toContain("Integrated Account Manager");
    expect(texts[3]).toContain("D.");
    expect(texts[3]).toContain("Internal Auth Module");
  });

  it("falls back to alphabetical order when `optionOrder` is an empty array", async () => {
    const emptyOrder: ResultsQuestion = { ...CORRECT_QUESTION, optionOrder: [] };
    await renderCard(emptyOrder);

    const list = screen.getByLabelText("Answer options");
    const items = within(list).getAllByRole("listitem");
    const texts = items.map((li) => li.textContent ?? "");

    // Empty array → falsy length → fallback to sorted natural keys.
    expect(texts[0]).toContain("A.");
    expect(texts[1]).toContain("B.");
    expect(texts[2]).toContain("C.");
    expect(texts[3]).toContain("D.");
  });

  // ── Outcome badge per outcome ───────────────────────────────────────────────
  it("renders the outcome badge with the correct label for each outcome", async () => {
    const outcomes: Array<{
      outcome: ResultsQuestion["outcome"];
      label: string;
      // The component applies bg-*/text-* classes from OUTCOME_STYLES.
      // We assert on the tailwind class to confirm the right style is applied.
      expectedClass: string;
    }> = [
      { outcome: "correct", label: "Correct", expectedClass: "text-correct" },
      { outcome: "incorrect", label: "Incorrect", expectedClass: "text-incorrect" },
      { outcome: "revealed", label: "Revealed", expectedClass: "text-revealed" },
      { outcome: "unanswered", label: "Unanswered", expectedClass: "text-muted" },
    ];

    for (const { outcome, label, expectedClass } of outcomes) {
      const q: ResultsQuestion = {
        ...CORRECT_QUESTION,
        id: 1000 + outcomes.indexOf({ outcome, label, expectedClass } as never),
        order: 10 + outcomes.indexOf({ outcome, label, expectedClass } as never),
        outcome,
        yourAnswer: outcome === "unanswered" ? [] : ["B"],
      };

      const { unmount } = await renderCard(q);
      const badge = screen.getByText(label);
      expect(badge, `outcome=${outcome} should render "${label}"`).toBeTruthy();
      expect(
        badge.className.includes(expectedClass),
        `outcome=${outcome} badge should include class "${expectedClass}" (got "${badge.className}")`,
      ).toBe(true);
      unmount();
    }
  });

  // ── Your answer / Correct answer summary ───────────────────────────────────
  it("renders the 'Your answer:' and 'Correct answer:' summary with the correct values", async () => {
    await renderCard(INCORRECT_FLAGGED_QUESTION);

    // The "Your answer:" label and value.
    const article = screen.getByLabelText("Question 2");
    expect(within(article).getByText(/Your answer:/)).toBeTruthy();
    // For the incorrect question, yourAnswer = ["A"] so the strong is "A".
    const yourAnswerStrong = within(article).getByText("A");
    expect(yourAnswerStrong).toBeTruthy();

    // The "Correct answer:" label and value.
    expect(within(article).getByText(/Correct answer:/)).toBeTruthy();
    expect(within(article).getByText("C")).toBeTruthy();
  });

  it("renders an em-dash for 'Your answer' when the user did not answer", async () => {
    const unanswered: ResultsQuestion = {
      ...CORRECT_QUESTION,
      outcome: "unanswered",
      yourAnswer: [],
    };
    await renderCard(unanswered);

    const article = screen.getByLabelText("Question 1");
    expect(within(article).getByText(/Your answer:/)).toBeTruthy();
    // The "value" portion of the unanswered answer is the em-dash.
    expect(within(article).getByText("—")).toBeTruthy();
  });

  it("joins a multi-answer array with ', ' in the summary", async () => {
    const multi: ResultsQuestion = {
      ...CORRECT_QUESTION,
      questionType: "multi",
      correctAnswer: ["A", "C"],
      yourAnswer: ["A", "C"],
      outcome: "correct",
    };
    await renderCard(multi);

    // The summary row contains "A, C" twice (once for "Your answer:",
    // once for "Correct answer:"). Use container.querySelector to scope
    // by the parent <span> so we don't trip over substring matches
    // against the article itself.
    const article = screen.getByLabelText("Question 1");
    const summarySpans = article.querySelectorAll("span");
    let yourAnswerValue: Element | null = null;
    let correctAnswerValue: Element | null = null;
    for (const span of Array.from(summarySpans)) {
      // The label text "Your answer:" / "Correct answer:" is a child text
      // node, not a child element, so use textContent for the prefix check.
      const text = span.textContent ?? "";
      if (text.startsWith("Your answer:") && text.includes("A, C")) {
        yourAnswerValue = span.querySelector("strong");
      } else if (text.startsWith("Correct answer:") && text.includes("A, C")) {
        correctAnswerValue = span.querySelector("strong");
      }
    }
    expect(yourAnswerValue?.textContent).toBe("A, C");
    expect(correctAnswerValue?.textContent).toBe("A, C");
  });

  // ── Show explanations toggle ───────────────────────────────────────────────
  it("toggles the explanations panel when 'Show explanations' is clicked", async () => {
    await renderCard(CORRECT_QUESTION);

    // Initially the button is present and the panel is not.
    const toggle = screen.getByRole("button", { name: /show explanations/i });
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    // The explanation panel id is `explanations-{id}-{order}` and should
    // NOT be in the document before clicking.
    const panelId = "explanations-101-1";
    expect(document.getElementById(panelId)).toBeNull();

    // Click to open.
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /hide explanations/i })).toBeTruthy();
    const opened = document.getElementById(panelId);
    expect(opened).toBeTruthy();

    // The reason text for option B (the correct one) is visible now.
    // The same string also appears in the Tips section, so we scope to the
    // explanation row for option B (the first row in the panel since the
    // CORRECT_QUESTION fixture's optionOrder puts B first).
    const optionBRow = within(opened!).getByText("B.", { exact: true }).closest("div");
    expect(optionBRow).toBeTruthy();
    expect(within(optionBRow!).getByText("IAM = Identity and Access Management")).toBeTruthy();

    // Click again to close.
    fireEvent.click(screen.getByRole("button", { name: /hide explanations/i }));
    expect(document.getElementById(panelId)).toBeNull();
  });

  it("does not render the 'Show explanations' button when there are no explanations", async () => {
    const noExplanations: ResultsQuestion = {
      ...CORRECT_QUESTION,
      explanations: {},
    };
    await renderCard(noExplanations);

    expect(screen.queryByRole("button", { name: /show explanations/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /hide explanations/i })).toBeNull();
  });

  // ── Flagged indicator ──────────────────────────────────────────────────────
  it("renders the purple flag dot for a flagged question", async () => {
    await renderCard(INCORRECT_FLAGGED_QUESTION);

    // The component renders <span aria-label="Flagged" ... />.
    const flag = screen.getByLabelText("Flagged");
    expect(flag).toBeTruthy();
    // Sanity: should also carry the flagged background class.
    expect(flag.className).toContain("bg-flagged");
  });

  it("does not render a flag dot for an unflagged question", async () => {
    await renderCard(CORRECT_QUESTION);
    expect(screen.queryByLabelText("Flagged")).toBeNull();
  });

  // ── Per-option indicators ──────────────────────────────────────────────────
  it("renders a ✓ indicator for correct options", async () => {
    await renderCard(CORRECT_QUESTION);

    // Option B is correct, and the user selected it, so the indicator is
    // labeled "Correct answer, selected" by the component. Use an attribute
    // selector to avoid substring-match collisions with the "Correct answer"
    // fallback label used elsewhere.
    const selected = document.querySelector('[aria-label="Correct answer, selected"]');
    expect(selected).toBeTruthy();
    expect(selected?.textContent).toBe("✓");

    // The plain "Correct answer" label should NOT appear here (B was
    // selected, so the component uses the "selected" variant for it; no
    // other option is correct-but-unselected).
    expect(
      document.querySelector('[aria-label="Correct answer"]'),
    ).toBeNull();
  });

  it("renders a ✗ indicator for a wrong user selection", async () => {
    await renderCard(INCORRECT_FLAGGED_QUESTION);

    // User picked A, correct is C.
    // - Option A: user selected, not correct → "Your incorrect selection"
    // - Option C: correct, not selected → "Correct answer" (no "selected" suffix)
    // - Option B/D: no indicator
    const wrong = document.querySelector('[aria-label="Your incorrect selection"]');
    expect(wrong).toBeTruthy();
    expect(wrong?.textContent).toBe("✗");

    const correctUnselected = document.querySelector('[aria-label="Correct answer"]');
    expect(correctUnselected).toBeTruthy();
    expect(correctUnselected?.textContent).toBe("✓");

    // Make sure the selected-correct variant is NOT present here.
    expect(
      document.querySelector('[aria-label="Correct answer, selected"]'),
    ).toBeNull();
  });

  it("does not render any indicator for unselected, non-correct options", async () => {
    await renderCard(INCORRECT_FLAGGED_QUESTION);

    // Two indicators expected total: "Your incorrect selection" (A) and
    // "Correct answer" (C). Options B and D should not have indicators.
    expect(screen.getAllByLabelText(/^(Correct answer|Your incorrect selection)/)).toHaveLength(2);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("[legacy] supports correctAnswer as a single string (ADR-13 pre-unification shim)", async () => {
    // ADR-13 unified correctAnswer to string[]; the component still accepts
    // a plain string for older session snapshots. Make sure the summary
    // shows just "C" (no trailing ", " or other array-join artifacts).
    const legacy: ResultsQuestion = {
      ...INCORRECT_FLAGGED_QUESTION,
      // Single string, not an array.
      correctAnswer: "C",
    };

    await renderCard(legacy);

    const article = screen.getByLabelText("Question 2");

    // "Correct answer:" summary shows just "C" — not "C, " or "C, undefined".
    expect(within(article).getByText(/Correct answer:/)).toBeTruthy();
    const summarySpans = article.querySelectorAll("span");
    let correctAnswerValue: Element | null = null;
    for (const span of Array.from(summarySpans)) {
      const text = span.textContent ?? "";
      if (text.startsWith("Correct answer:") && text.includes("C")) {
        correctAnswerValue = span.querySelector("strong");
      }
    }
    expect(correctAnswerValue?.textContent).toBe("C");
    // Belt-and-suspenders: no trailing comma or other artifact.
    expect(correctAnswerValue?.textContent).not.toMatch(/,\s*$/);
  });

  it("[legacy] marks the correct option in the explanations panel when correctAnswer is a string", async () => {
    const legacy: ResultsQuestion = {
      ...INCORRECT_FLAGGED_QUESTION,
      correctAnswer: "C",
    };

    await renderCard(legacy);
    fireEvent.click(screen.getByRole("button", { name: /show explanations/i }));

    const panelId = "explanations-102-2";
    const panel = document.getElementById(panelId);
    expect(panel).toBeTruthy();

    // Option C's description ("Spot") should be marked correct (text-correct
    // class). Scope to the row that starts with "C." to avoid matching
    // option A or B descriptions that may share substrings.
    const optionCRow = within(panel!).getByText("C.", { exact: true }).closest("div");
    expect(optionCRow).toBeTruthy();
    const optionCDescription = within(optionCRow!).getByText("Spot");
    expect(optionCDescription.className).toContain("text-correct");
  });

  it("[legacy] correctly evaluates isCorrect for a string correctAnswer", async () => {
    // Fixture: user picked C, correct is "C" (string), outcome "correct".
    const legacy: ResultsQuestion = {
      ...INCORRECT_FLAGGED_QUESTION,
      correctAnswer: "C",
      yourAnswer: ["C"],
      outcome: "correct",
    };

    await renderCard(legacy);

    const article = screen.getByLabelText("Question 2");

    // The badge text is "Correct" (the outcome drives the label).
    expect(within(article).getByText("Correct")).toBeTruthy();

    // The "Correct answer, selected" indicator should appear on option C,
    // confirming isCorrect fired for the string shim.
    const selected = within(article).queryByLabelText("Correct answer, selected");
    expect(selected).toBeTruthy();
    expect(selected?.textContent).toBe("✓");
  });

  it("renders the 'Revealed' outcome with the revealed-style badge and border", async () => {
    const revealed: ResultsQuestion = {
      ...CORRECT_QUESTION,
      outcome: "revealed",
      // 'revealed' is its own outcome (e.g. exam-mode where answers are
      // shown after submission regardless of correctness).
      yourAnswer: ["A"],
    };

    await renderCard(revealed);

    const article = screen.getByLabelText("Question 1");

    // Badge text.
    const badge = within(article).getByText("Revealed");
    expect(badge).toBeTruthy();

    // Badge class — should have text-revealed, not text-correct or
    // text-incorrect. The component uses `bg-revealed/10 text-revealed`.
    expect(badge.className).toContain("text-revealed");
    expect(badge.className).not.toContain("text-correct");
    expect(badge.className).not.toContain("text-incorrect");

    // The wrapper article carries the border-revealed/40 class.
    expect(article.className).toContain("border-revealed/40");
    expect(article.className).not.toContain("border-correct/40");
    expect(article.className).not.toContain("border-incorrect/40");
  });

  it("renders the 'Unanswered' outcome with the muted-style badge and em-dash for 'Your answer'", async () => {
    const unanswered: ResultsQuestion = {
      ...CORRECT_QUESTION,
      outcome: "unanswered",
      yourAnswer: [],
    };

    await renderCard(unanswered);

    const article = screen.getByLabelText("Question 1");

    // Badge text.
    const badge = within(article).getByText("Unanswered");
    expect(badge).toBeTruthy();
    // Unanswered uses bg-surface text-muted per OUTCOME_STYLES.
    expect(badge.className).toContain("text-muted");

    // "Your answer:" summary should show the em-dash placeholder.
    expect(within(article).getByText(/Your answer:/)).toBeTruthy();
    expect(within(article).getByText("—")).toBeTruthy();
  });

  it("renders each option's text verbatim in the option list", async () => {
    const custom: ResultsQuestion = {
      ...CORRECT_QUESTION,
      options: {
        A: "First text",
        B: "Second text",
        C: "Third text",
      },
      // Three options only — strip the D entry from explanations too so the
      // explanations panel doesn't render a phantom row.
      explanations: {
        A: { description: "A desc", reason: "A reason" },
        B: { description: "B desc", reason: "B reason" },
        C: { description: "C desc", reason: "C reason" },
      },
      // Force the optionOrder to a known order to make substring assertions
      // unambiguous (texts are unique already, but order-of-appearance in
      // the DOM is a useful extra signal).
      optionOrder: ["A", "B", "C"],
    };

    await renderCard(custom);

    const list = screen.getByLabelText("Answer options");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);

    const texts = items.map((li) => li.textContent ?? "");
    expect(texts[0]).toContain("First text");
    expect(texts[1]).toContain("Second text");
    expect(texts[2]).toContain("Third text");

    // All three option texts appear somewhere in the rendered output.
    expect(screen.getByText("First text")).toBeTruthy();
    expect(screen.getByText("Second text")).toBeTruthy();
    expect(screen.getByText("Third text")).toBeTruthy();
  });

  it("handles a singleton correctAnswer array ['A'] in the 'Correct answer:' summary", async () => {
    const singleton: ResultsQuestion = {
      ...CORRECT_QUESTION,
      correctAnswer: ["A"],
      yourAnswer: ["A"],
      outcome: "correct",
    };

    await renderCard(singleton);

    const article = screen.getByLabelText("Question 1");
    expect(within(article).getByText(/Correct answer:/)).toBeTruthy();

    // The "Correct answer:" summary value should be just "A" — not "A, " or
    // ["A"] or anything weird from the array-join path.
    const summarySpans = article.querySelectorAll("span");
    let correctAnswerValue: Element | null = null;
    for (const span of Array.from(summarySpans)) {
      const text = span.textContent ?? "";
      if (text.startsWith("Correct answer:") && text.includes("A")) {
        correctAnswerValue = span.querySelector("strong");
      }
    }
    expect(correctAnswerValue?.textContent).toBe("A");
  });
});
