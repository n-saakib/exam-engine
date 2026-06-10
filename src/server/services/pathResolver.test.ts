import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Unit tests for PathResolver (F2-T1, F2-T3, F2-T4).
 *
 * Pattern: write a fixture exam-paths.json to a temp file, point
 * EXAM_PATHS_FILE + EXAMS_ROOT at it, reset the config cache so the module
 * picks up the new env, then import (or re-import via resetContainer) the
 * service and call it.
 */

let tmpDir: string;
let examPathsFile: string;
let examsRoot: string;

// Reset env + config cache before each test.
beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "certprep-pathresolver-"));
  examPathsFile = path.join(tmpDir, "exam-paths.json");
  examsRoot = path.join(tmpDir, "Exams");
  fs.mkdirSync(examsRoot, { recursive: true });

  process.env.EXAM_PATHS_FILE = examPathsFile;
  process.env.EXAMS_ROOT = examsRoot;

  const { resetConfigCache } = await import("@/server/config");
  resetConfigCache();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.EXAM_PATHS_FILE;
  delete process.env.EXAMS_ROOT;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function writeTree(tree: object) {
  fs.writeFileSync(examPathsFile, JSON.stringify(tree, null, 2));
}

/** A minimal valid tree with one leaf. */
const MINIMAL_TREE = {
  version: 1,
  label: "Choose a domain",
  cloud: {
    title: "Cloud",
    label: "Choose provider",
    aws: {
      title: "AWS",
      label: "Choose cert",
      saa: {
        title: "SAA",
        label: "Choose difficulty",
        easy: { title: "Easy", quesPath: "Exams/Cloud/AWS/SAA/Easy" },
      },
    },
  },
};

/** Deep 5-level tree for arbitrary-depth and extensibility tests. */
const DEEP_TREE = {
  version: 1,
  label: "Choose a domain",
  cloud: {
    title: "Cloud Certificate Exams",
    icon: "cloud",
    label: "Choose the cloud provider",
    aws: {
      title: "Amazon Web Services (AWS)",
      label: "Choose a certification",
      saa: {
        title: "AWS Solutions Architect Associate",
        label: "Choose difficulty level",
        easy: { title: "Easy", quesPath: "Exams/Cloud/AWS/SAA/Easy" },
        medium: { title: "Medium", quesPath: "Exams/Cloud/AWS/SAA/Medium" },
        hard: { title: "Hard", quesPath: "Exams/Cloud/AWS/SAA/Hard" },
        mock: { title: "Mock Exam", quesPath: "Exams/Cloud/AWS/SAA/Mock" },
      },
      // Azure/DevOps branch — proves zero-code extensibility (DoD).
    },
    azure: {
      title: "Microsoft Azure",
      label: "Choose a certification",
      az900: {
        title: "Azure Fundamentals (AZ-900)",
        label: "Choose difficulty",
        easy: { title: "Easy", quesPath: "Exams/Cloud/Azure/AZ-900/Easy" },
        medium: { title: "Medium", quesPath: "Exams/Cloud/Azure/AZ-900/Medium" },
      },
    },
  },
  devops: {
    title: "DevOps & SRE",
    icon: "devops",
    label: "Choose track",
    kubernetes: {
      title: "Kubernetes (CKA)",
      label: "Choose topic",
      core: {
        title: "Core Concepts",
        label: "Choose difficulty",
        easy: { title: "Easy", quesPath: "Exams/DevOps/Kubernetes/CKA/easy" },
      },
    },
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PathResolver — valid tree", () => {
  it("flattens leaves with correct domainLabel", async () => {
    // Create the leaf directories so resolveUnderRoot is happy.
    fs.mkdirSync(path.join(examsRoot, "Cloud", "AWS", "SAA", "Easy"), { recursive: true });

    writeTree(MINIMAL_TREE);
    const { createPathResolver } = await import("@/server/services/pathResolver");
    const pr = createPathResolver();

    const { tree, leaves } = pr.loadAll();

    // Tree root should have the root label.
    expect(tree.label).toBe("Choose a domain");

    // One leaf.
    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.quesPath).toBe("Exams/Cloud/AWS/SAA/Easy");
    expect(leaves[0]!.domainLabel).toBe("Cloud / AWS / SAA / Easy");
  });

  it("handles arbitrary depth (≥5 levels) with Azure/DevOps branch", async () => {
    // Create leaf dirs.
    for (const p of [
      "Cloud/AWS/SAA/Easy",
      "Cloud/AWS/SAA/Medium",
      "Cloud/AWS/SAA/Hard",
      "Cloud/AWS/SAA/Mock",
      "Cloud/Azure/AZ-900/Easy",
      "Cloud/Azure/AZ-900/Medium",
      "DevOps/Kubernetes/CKA/easy",
    ]) {
      fs.mkdirSync(path.join(examsRoot, p), { recursive: true });
    }

    writeTree(DEEP_TREE);
    const { createPathResolver } = await import("@/server/services/pathResolver");
    const pr = createPathResolver();
    const { leaves } = pr.loadAll();

    // AWS SAA leaves.
    const awsLeaves = leaves.filter((l) => l.quesPath.includes("AWS/SAA"));
    expect(awsLeaves).toHaveLength(4);
    expect(awsLeaves.map((l) => l.domainLabel)).toContain(
      "Cloud Certificate Exams / Amazon Web Services (AWS) / AWS Solutions Architect Associate / Easy",
    );

    // Azure branch — proves zero-code extensibility.
    const azureLeaves = leaves.filter((l) => l.quesPath.includes("Azure"));
    expect(azureLeaves).toHaveLength(2);
    expect(azureLeaves[0]!.domainLabel).toContain("Microsoft Azure");

    // DevOps branch.
    const devopsLeaves = leaves.filter((l) => l.quesPath.includes("DevOps"));
    expect(devopsLeaves).toHaveLength(1);
    expect(devopsLeaves[0]!.domainLabel).toContain("DevOps & SRE");

    // Icons are carried.
    const cloudLeaf = leaves.find((l) => l.quesPath.includes("Cloud/AWS/SAA/Easy"));
    expect(cloudLeaf?.icon).toBe("cloud");
  });
});

describe("PathResolver — missing label/title → EXAM_PATHS_INVALID", () => {
  it("throws EXAM_PATHS_INVALID when root label is missing", async () => {
    writeTree({ cloud: { title: "Cloud", label: "x", saa: { title: "SAA", quesPath: "Exams/x" } } });

    const { createPathResolver } = await import("@/server/services/pathResolver");
    const { AppError } = await import("@/server/http/errors");
    const pr = createPathResolver();
    expect(() => pr.loadAll()).toThrow(AppError);
    try { pr.loadAll(); } catch (e) {
      expect((e as InstanceType<typeof AppError>).code).toBe("EXAM_PATHS_INVALID");
    }
  });

  it("throws EXAM_PATHS_INVALID when a non-root node is missing title", async () => {
    // Child node has no `title`.
    writeTree({
      label: "Choose",
      cloud: {
        // no `title` on cloud
        label: "Choose provider",
        aws: { title: "AWS", quesPath: "Exams/x" },
      },
    });

    const { createPathResolver } = await import("@/server/services/pathResolver");
    const { AppError } = await import("@/server/http/errors");
    const pr = createPathResolver();
    expect(() => pr.loadAll()).toThrow(AppError);
    try { pr.loadAll(); } catch (e) {
      expect((e as InstanceType<typeof AppError>).code).toBe("EXAM_PATHS_INVALID");
    }
  });

  it("throws EXAM_PATHS_INVALID when a non-leaf node is missing label", async () => {
    writeTree({
      label: "Choose",
      cloud: {
        title: "Cloud",
        // no `label` on cloud
        aws: { title: "AWS", quesPath: "Exams/x" },
      },
    });

    const { createPathResolver } = await import("@/server/services/pathResolver");
    const { AppError } = await import("@/server/http/errors");
    const pr = createPathResolver();
    expect(() => pr.loadAll()).toThrow(AppError);
    try { pr.loadAll(); } catch (e) {
      expect((e as InstanceType<typeof AppError>).code).toBe("EXAM_PATHS_INVALID");
    }
  });

  it("throws EXAM_PATHS_INVALID when file is unreadable", async () => {
    // Don't write the file — examPathsFile doesn't exist.
    const { createPathResolver } = await import("@/server/services/pathResolver");
    const { AppError } = await import("@/server/http/errors");
    const pr = createPathResolver();
    expect(() => pr.loadAll()).toThrow(AppError);
    try { pr.loadAll(); } catch (e) {
      expect((e as InstanceType<typeof AppError>).code).toBe("EXAM_PATHS_INVALID");
    }
  });

  it("throws EXAM_PATHS_INVALID when file is malformed JSON", async () => {
    fs.writeFileSync(examPathsFile, "{ this is not json }");
    const { createPathResolver } = await import("@/server/services/pathResolver");
    const { AppError } = await import("@/server/http/errors");
    const pr = createPathResolver();
    expect(() => pr.loadAll()).toThrow(AppError);
    try { pr.loadAll(); } catch (e) {
      expect((e as InstanceType<typeof AppError>).code).toBe("EXAM_PATHS_INVALID");
    }
  });
});

describe("PathResolver — dangling quesPath flagged (not thrown)", () => {
  it("marks leaf safe:false when quesPath escapes the exams root, does not crash", async () => {
    writeTree({
      version: 1,
      label: "Choose",
      cloud: {
        title: "Cloud",
        label: "Choose provider",
        bad: {
          title: "Dangling",
          quesPath: "../../etc/passwd", // traversal attempt
        },
      },
    });

    const { createPathResolver } = await import("@/server/services/pathResolver");
    const pr = createPathResolver();

    // Should NOT throw — dangling path is a warning only.
    let leaves: import("@/server/services/pathResolver").ResolvedLeaf[] = [];
    expect(() => {
      const result = pr.loadAll();
      leaves = result.leaves;
    }).not.toThrow();

    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.safe).toBe(false);
    expect(leaves[0]!.quesPath).toBe("../../etc/passwd");
  });

  it("marks leaf safe:true for a valid path that exists", async () => {
    const leafDir = path.join(examsRoot, "Cloud", "AWS", "SAA", "Easy");
    fs.mkdirSync(leafDir, { recursive: true });

    writeTree(MINIMAL_TREE);
    const { createPathResolver } = await import("@/server/services/pathResolver");
    const pr = createPathResolver();
    const { leaves } = pr.loadAll();

    expect(leaves[0]!.safe).toBe(true);
  });
});

describe("PathResolver — unknown version is forward-compat (no crash)", () => {
  it("parses a tree with version: 99 without crashing", async () => {
    fs.mkdirSync(path.join(examsRoot, "Cloud", "AWS", "SAA", "Easy"), { recursive: true });
    writeTree({ ...MINIMAL_TREE, version: 99 });

    const { createPathResolver } = await import("@/server/services/pathResolver");
    const pr = createPathResolver();
    expect(() => pr.loadAll()).not.toThrow();
  });
});
