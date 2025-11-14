import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "../core/context.js";
import { askLLM } from "../core/llm.js";

export type ReviewResult = {
  summary: string;
  findings: {
    id: string;
    severity: "info" | "low" | "medium" | "high";
    area: string;
    text: string;
  }[];
  rawMarkdown?: string;
};

async function safeRead(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function runReviewer(
  engine: EngineContext,
  opts: { dryRun?: boolean; debug?: boolean },
  config: {
    name: string;
    systemPrompt: string;
    meta: Record<string, unknown>;
    context: Record<string, unknown>;
  },
): Promise<ReviewResult> {
  const { dryRun = false, debug = false } = opts;

  const userPrompt = [
    `You are performing a ${config.name} review.`,
    "",
    "<CONTEXT JSON>",
    JSON.stringify(config.context, null, 2),
    "</CONTEXT JSON>",
  ].join("\n");

  if (debug) {
    console.log(
      `[redox][debug] ${config.name} system prompt`,
      config.systemPrompt,
    );
    console.log(`[redox][debug] ${config.name} user prompt`, userPrompt);
  }

  if (dryRun) {
    return {
      summary: `Dry-run: ${config.name} review planned but not executed.`,
      findings: [],
    };
  }

  const res = await askLLM(userPrompt, {
    model:
      process.env.REDOX_MODEL_REVIEW ??
      process.env.REDOX_MODEL_WRITER ??
      "chatgpt-5.1",
    agent: `${config.name}-review`,
    stage: "review",
    meta: { root: engine.root, ...config.meta },
  });
  const anyR: any = res as any;
  const text =
    anyR.output_text ??
    anyR.output?.[0]?.content?.[0]?.text ??
    JSON.stringify(anyR, null, 2);

  const summaryLine =
    text.split("\n").find((l: string) => l.trim().length > 0) ?? "";

  return {
    summary: summaryLine.slice(0, 512),
    findings: [],
    rawMarkdown: text,
  };
}

type ReviewerConfig = {
  name: string;
  buildContext: (engine: EngineContext) => Promise<{
    context: Record<string, unknown>;
    meta: Record<string, unknown>;
  }>;
  systemPrompt: string;
};

async function runNamedReviewer(
  engine: EngineContext,
  opts: { dryRun?: boolean; debug?: boolean } = {},
  config: ReviewerConfig,
): Promise<ReviewResult> {
  const { context, meta } = await config.buildContext(engine);
  return runReviewer(engine, opts, {
    name: config.name,
    systemPrompt: config.systemPrompt,
    meta,
    context,
  });
}

export async function architectReview(
  engine: EngineContext,
  opts: { dryRun?: boolean; debug?: boolean } = {},
): Promise<ReviewResult> {
  const config: ReviewerConfig = {
    name: "architect",
    async buildContext(engineCtx) {
      const docsDir = engineCtx.docsDir;
      const evidenceDir = engineCtx.evidenceDir;

      const archPath = path.join(docsDir, "Architecture Guide.md");
      const overviewPath = path.join(docsDir, "Overview.md");
      const apiMapPath = path.join(evidenceDir, "api-map.json");
      const coveragePath = path.join(evidenceDir, "coverage-matrix.json");

      const architectureMd = await safeRead(archPath);
      const overviewMd = await safeRead(overviewPath);
      const apiMap = (await fs.pathExists(apiMapPath))
        ? await fs.readJson(apiMapPath)
        : null;
      const coverage = (await fs.pathExists(coveragePath))
        ? await fs.readJson(coveragePath)
        : null;

      return {
        context: {
          root: engineCtx.root,
          docsDir,
          evidenceDir,
          hasArchitectureDoc: !!architectureMd,
          hasOverviewDoc: !!overviewMd,
          architectureMd,
          overviewMd,
          apiMap,
          coverage,
        },
        meta: { archPath, overviewPath, apiMapPath, coveragePath },
      };
    },
    systemPrompt: [
      "You are a principal software architect performing an architecture review.",
      "Use the provided docs and machine artifacts (API map, coverage matrix) to identify strengths and risks.",
      "Focus on boundaries, modularity, coupling, cohesion, integration surfaces, and observability.",
      "Structure your output as Markdown with sections: Summary, Strengths, Risks, Recommendations.",
    ].join(" "),
  };

  return runNamedReviewer(engine, opts, config);
}

export async function qaReview(
  engine: EngineContext,
  opts: { dryRun?: boolean; debug?: boolean } = {},
): Promise<ReviewResult> {
  const config: ReviewerConfig = {
    name: "qa",
    async buildContext(engineCtx) {
      const docsDir = engineCtx.docsDir;
      const evidenceDir = engineCtx.evidenceDir;

      const testStrategyPath = path.join(docsDir, "Test Strategy.md");
      const fpReportPath = path.join(docsDir, "Function Point Report.md");
      const coveragePath = path.join(evidenceDir, "coverage-matrix.json");

      const testStrategyMd = await safeRead(testStrategyPath);
      const fpReportMd = await safeRead(fpReportPath);
      const coverage = (await fs.pathExists(coveragePath))
        ? await fs.readJson(coveragePath)
        : null;

      return {
        context: {
          root: engineCtx.root,
          docsDir,
          evidenceDir,
          hasTestStrategy: !!testStrategyMd,
          hasFpReport: !!fpReportMd,
          testStrategyMd,
          fpReportMd,
          coverage,
        },
        meta: { testStrategyPath, fpReportPath, coveragePath },
      };
    },
    systemPrompt: [
      "You are a QA lead reviewing test strategy and coverage.",
      "Use the provided docs and coverage matrix to identify gaps in testing and automation.",
      "Structure your output as Markdown with sections: Summary, Coverage, Risks, Recommendations.",
    ].join(" "),
  };

  return runNamedReviewer(engine, opts, config);
}

export async function opsReview(
  engine: EngineContext,
  opts: { dryRun?: boolean; debug?: boolean } = {},
): Promise<ReviewResult> {
  const config: ReviewerConfig = {
    name: "ops",
    async buildContext(engineCtx) {
      const docsDir = engineCtx.docsDir;

      const ciPath = path.join(docsDir, "Build, CI & Deploy Guide.md");
      const architecturePath = path.join(docsDir, "Architecture Guide.md");

      const ciMd = await safeRead(ciPath);
      const architectureMd = await safeRead(architecturePath);

      return {
        context: {
          root: engineCtx.root,
          docsDir,
          hasCiGuide: !!ciMd,
          hasArchitectureDoc: !!architectureMd,
          ciMd,
          architectureMd,
        },
        meta: { ciPath, architecturePath },
      };
    },
    systemPrompt: [
      "You are an SRE/DevOps engineer reviewing CI/CD and operational readiness.",
      "Focus on deploy process, rollback, observability, disaster recovery, and runbooks implied by the docs.",
      "Structure your output as Markdown with sections: Summary, Strengths, Risks, Recommendations.",
    ].join(" "),
  };

  return runNamedReviewer(engine, opts, config);
}

export async function securityReview(
  engine: EngineContext,
  opts: { dryRun?: boolean; debug?: boolean } = {},
): Promise<ReviewResult> {
  const config: ReviewerConfig = {
    name: "security",
    async buildContext(engineCtx) {
      const docsDir = engineCtx.docsDir;
      const evidenceDir = engineCtx.evidenceDir;

      const archPath = path.join(docsDir, "Architecture Guide.md");
      const apiMapPath = path.join(evidenceDir, "api-map.json");
      const rbacPath = path.join(evidenceDir, "rbac.json");
      const lgpdPath = path.join(evidenceDir, "lgpd-map.json");

      const architectureMd = await safeRead(archPath);
      const apiMap = (await fs.pathExists(apiMapPath))
        ? await fs.readJson(apiMapPath)
        : null;
      const rbac = (await fs.pathExists(rbacPath))
        ? await fs.readJson(rbacPath)
        : null;
      const lgpd = (await fs.pathExists(lgpdPath))
        ? await fs.readJson(lgpdPath)
        : null;

      return {
        context: {
          root: engineCtx.root,
          docsDir,
          evidenceDir,
          hasArchitectureDoc: !!architectureMd,
          architectureMd,
          apiMap,
          rbac,
          lgpd,
        },
        meta: { archPath, apiMapPath, rbacPath, lgpdPath },
      };
    },
    systemPrompt: [
      "You are a security architect reviewing API, RBAC, and data protection.",
      "Use the API map, RBAC matrix, and LGPD map (if present) to identify authZ/authN risks and data protection gaps.",
      "Structure your output as Markdown with sections: Summary, Strengths, Risks, Recommendations.",
    ].join(" "),
  };

  return runNamedReviewer(engine, opts, config);
}

export async function docsReview(
  engine: EngineContext,
  opts: { dryRun?: boolean; debug?: boolean } = {},
): Promise<ReviewResult> {
  const config: ReviewerConfig = {
    name: "docs",
    async buildContext(engineCtx) {
      const docsDir = engineCtx.docsDir;

      const overviewPath = path.join(docsDir, "Overview.md");
      const userGuidePath = path.join(docsDir, "User Guide.md");
      const useCasesPath = path.join(docsDir, "Use Cases.md");

      const overviewMd = await safeRead(overviewPath);
      const userGuideMd = await safeRead(userGuidePath);
      const useCasesMd = await safeRead(useCasesPath);

      return {
        context: {
          root: engineCtx.root,
          docsDir,
          hasOverview: !!overviewMd,
          hasUserGuide: !!userGuideMd,
          hasUseCases: !!useCasesMd,
          overviewMd,
          userGuideMd,
          useCasesMd,
        },
        meta: { overviewPath, userGuidePath, useCasesPath },
      };
    },
    systemPrompt: [
      "You are a senior technical writer reviewing documentation quality and coherence.",
      "Focus on clarity, completeness, structure, and cross-linking between Overview, User Guide, and Use Cases.",
      "Structure your output as Markdown with sections: Summary, Strengths, Gaps, Recommendations.",
    ].join(" "),
  };

  return runNamedReviewer(engine, opts, config);
}
